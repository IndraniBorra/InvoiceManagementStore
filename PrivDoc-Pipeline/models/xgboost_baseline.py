"""
xgboost_baseline.py  —  Stage 4 (Baseline) of the PrivDoc-Pipeline
Trains an XGBoost classifier on the original (non-private) invoice dataset
to predict late payment (is_late label). Establishes the utility benchmark.

Usage:
    from models.xgboost_baseline import train_baseline
    metrics = train_baseline()

Or run directly:
    python models/xgboost_baseline.py
"""

import json
import pathlib

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, roc_auc_score, f1_score
from sklearn.preprocessing import LabelEncoder

RESULTS_DIR = pathlib.Path("results")
DATA_PATH   = pathlib.Path("data/generated_invoices.csv")
SEED        = 42

# Features used for training
FEATURE_COLS = [
    "amount_due",
    "payment_due_days",
    "num_line_items",
    "invoice_month",
    "subtotal",
    "tax_rate",
    "vendor_category",   # categorical — label-encoded
]
LABEL_COL = "is_late"


def _prepare_features(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    """
    Encode features and return (X, y) numpy arrays.
    vendor_category is label-encoded; all others are numeric.
    """
    data = df[FEATURE_COLS + [LABEL_COL]].copy()

    le = LabelEncoder()
    data["vendor_category"] = le.fit_transform(data["vendor_category"].astype(str))

    X = data[FEATURE_COLS].values.astype(float)
    y = data[LABEL_COL].values.astype(int)
    return X, y


def train_baseline(
    data_path: str | pathlib.Path = DATA_PATH,
    results_dir: str | pathlib.Path = RESULTS_DIR,
    seed: int = SEED,
    test_size: float = 0.2,
) -> dict:
    """
    Train XGBoost on the original (non-private) dataset.

    Args:
        data_path:   Path to generated_invoices.csv.
        results_dir: Directory to save model + metrics.
        seed:        Random seed.
        test_size:   Fraction of data held out for testing.

    Returns:
        Dict with accuracy, auc_roc, f1, train_size, test_size keys.
    """
    results_dir = pathlib.Path(results_dir)
    results_dir.mkdir(exist_ok=True)

    df = pd.read_csv(data_path)
    X, y = _prepare_features(df)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=seed, stratify=y
    )

    model = xgb.XGBClassifier(
        n_estimators=100,
        max_depth=4,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        use_label_encoder=False,
        eval_metric="logloss",
        random_state=seed,
        verbosity=0,
    )
    model.fit(X_train, y_train)

    y_pred  = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1]

    metrics = {
        "model":      "baseline",
        "epsilon":    None,
        "accuracy":   round(float(accuracy_score(y_test, y_pred)), 4),
        "auc_roc":    round(float(roc_auc_score(y_test, y_proba)), 4),
        "f1":         round(float(f1_score(y_test, y_pred)), 4),
        "train_size": int(len(X_train)),
        "test_size":  int(len(X_test)),
    }

    # Save metrics
    metrics_path = results_dir / "baseline_metrics.json"
    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=2)

    # Save model
    model_path = results_dir / "baseline_model.json"
    model.save_model(str(model_path))

    # Also return train/test indices for MIA attack (shadow model stage)
    metrics["_model"]   = model
    metrics["_X_train"] = X_train
    metrics["_X_test"]  = X_test
    metrics["_y_train"] = y_train
    metrics["_y_test"]  = y_test

    print(
        f"  [Baseline]  accuracy={metrics['accuracy']:.4f}  "
        f"auc_roc={metrics['auc_roc']:.4f}  f1={metrics['f1']:.4f}"
    )
    return metrics


if __name__ == "__main__":
    print("Training XGBoost baseline model...")
    m = train_baseline()
    print(f"\nResults saved to results/baseline_metrics.json")
    print(f"  Accuracy : {m['accuracy']}")
    print(f"  AUC-ROC  : {m['auc_roc']}")
    print(f"  F1 Score : {m['f1']}")
