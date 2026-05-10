"""
xgboost_private.py  —  Stage 4 (Private) of the PrivDoc-Pipeline
Trains XGBoost classifiers on Laplace-anonymized datasets (one per epsilon).
Compares utility vs baseline to show the privacy-utility tradeoff.

Usage:
    from models.xgboost_private import train_private_models
    results = train_private_models()

Or run directly:
    python models/xgboost_private.py
"""

import json
import pathlib

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, roc_auc_score, f1_score
from sklearn.preprocessing import LabelEncoder

# Reuse feature config from baseline
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
from models.xgboost_baseline import FEATURE_COLS, LABEL_COL, SEED, _prepare_features

RESULTS_DIR = pathlib.Path("results")
DATA_DIR    = pathlib.Path("data")
EPSILONS    = [0.1, 0.5, 1.0, 5.0]


# ---------------------------------------------------------------------------
# Output Perturbation DP Wrapper
# ---------------------------------------------------------------------------

class NoisyXGBoostWrapper:
    """
    Output perturbation DP wrapper for XGBoost.

    Adds Laplace noise to predict_proba() at inference time.
    This directly defends against MIA (Attack 3): the attacker sees noisy
    confidence scores and cannot reliably distinguish training members from
    non-members.

    Theoretical basis:
        L1 sensitivity of a probability vector = 2.0
        (changing one training record can shift each class probability by at most 1)
        Noise scale = sensitivity / epsilon = 2 / epsilon
    """

    sensitivity: float = 2.0

    def __init__(self, model: xgb.XGBClassifier, epsilon: float, seed: int = 42) -> None:
        self.model   = model
        self.epsilon = epsilon
        self._rng    = np.random.RandomState(seed)

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """Noisy probabilities — used by MIA audit and shadow models."""
        proba    = self.model.predict_proba(X)
        noise    = self._rng.laplace(0, self.sensitivity / self.epsilon, size=proba.shape)
        noisy    = np.clip(proba + noise, 0, 1)
        row_sums = noisy.sum(axis=1, keepdims=True).clip(min=1e-9)
        return noisy / row_sums

    def predict_proba_clean(self, X: np.ndarray) -> np.ndarray:
        """Clean probabilities — used for accuracy/AUC utility metrics (no noise)."""
        return self.model.predict_proba(X)

    def predict(self, X: np.ndarray) -> np.ndarray:
        return (self.predict_proba(X)[:, 1] >= 0.5).astype(int)


def train_private_model(
    epsilon: float,
    data_dir: str | pathlib.Path = DATA_DIR,
    results_dir: str | pathlib.Path = RESULTS_DIR,
    seed: int = SEED,
    test_size: float = 0.2,
) -> dict:
    """
    Train XGBoost on the Laplace-anonymized dataset for a given epsilon.

    Args:
        epsilon:     Privacy budget used for the anonymized dataset.
        data_dir:    Directory containing anonymized_invoices_eps{epsilon}.csv.
        results_dir: Directory to save model + metrics.
        seed:        Random seed.
        test_size:   Fraction of data held out for testing.

    Returns:
        Dict with accuracy, auc_roc, f1, epsilon, train_size, test_size.
    """
    results_dir = pathlib.Path(results_dir)
    results_dir.mkdir(exist_ok=True)

    data_path = pathlib.Path(data_dir) / f"anonymized_invoices_eps{epsilon}.csv"
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
        "model":      "private",
        "epsilon":    epsilon,
        "accuracy":   round(float(accuracy_score(y_test, y_pred)), 4),
        "auc_roc":    round(float(roc_auc_score(y_test, y_proba)), 4),
        "f1":         round(float(f1_score(y_test, y_pred)), 4),
        "train_size": int(len(X_train)),
        "test_size":  int(len(X_test)),
    }

    # Save metrics
    metrics_path = results_dir / f"private_metrics_eps{epsilon}.json"
    clean_metrics = {k: v for k, v in metrics.items() if not k.startswith("_")}
    with open(metrics_path, "w") as f:
        json.dump(clean_metrics, f, indent=2)

    # Save model
    model_path = results_dir / f"private_model_eps{epsilon}.json"
    model.save_model(str(model_path))

    # Attach objects for MIA stage (not serialized)
    metrics["_model"]   = model
    metrics["_X_train"] = X_train
    metrics["_X_test"]  = X_test
    metrics["_y_train"] = y_train
    metrics["_y_test"]  = y_test

    print(
        f"  [ε={epsilon:<4}]  accuracy={metrics['accuracy']:.4f}  "
        f"auc_roc={metrics['auc_roc']:.4f}  f1={metrics['f1']:.4f}"
    )
    return metrics


def train_output_perturbed_model(
    epsilon: float,
    data_dir: str | pathlib.Path = DATA_DIR,
    results_dir: str | pathlib.Path = RESULTS_DIR,
    seed: int = SEED,
    test_size: float = 0.2,
) -> dict:
    """
    Train XGBoost on ORIGINAL clean data, then wrap with NoisyXGBoostWrapper.

    Defends Attack 3 (MIA) via output perturbation only — no input DP.
    Utility metrics use predict_proba_clean() for a fair comparison.

    Args:
        epsilon:     Privacy budget for output noise.
        data_dir:    Directory containing generated_invoices.csv.
        results_dir: Directory to save metrics.
        seed:        Random seed.
        test_size:   Fraction held out for testing.

    Returns:
        Dict with accuracy, auc_roc, f1, epsilon, _model (NoisyXGBoostWrapper),
        _X_train, _X_test, _y_train, _y_test.
    """
    results_dir = pathlib.Path(results_dir)
    results_dir.mkdir(exist_ok=True)

    df = pd.read_csv(pathlib.Path(data_dir) / "generated_invoices.csv")
    X, y = _prepare_features(df)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=seed, stratify=y
    )

    base_model = xgb.XGBClassifier(
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
    base_model.fit(X_train, y_train)

    wrapped = NoisyXGBoostWrapper(base_model, epsilon=epsilon, seed=seed)

    # Utility evaluation uses CLEAN outputs (no noise) for fair comparison
    y_pred  = (wrapped.predict_proba_clean(X_test)[:, 1] >= 0.5).astype(int)
    y_proba = wrapped.predict_proba_clean(X_test)[:, 1]

    metrics = {
        "model":      "output_dp",
        "epsilon":    epsilon,
        "accuracy":   round(float(accuracy_score(y_test, y_pred)), 4),
        "auc_roc":    round(float(roc_auc_score(y_test, y_proba)), 4),
        "f1":         round(float(f1_score(y_test, y_pred)), 4),
        "train_size": int(len(X_train)),
        "test_size":  int(len(X_test)),
    }

    out_path = results_dir / f"output_dp_metrics_eps{epsilon}.json"
    with open(out_path, "w") as f:
        json.dump({k: v for k, v in metrics.items() if not k.startswith("_")}, f, indent=2)

    metrics["_model"]   = wrapped
    metrics["_X_train"] = X_train
    metrics["_X_test"]  = X_test
    metrics["_y_train"] = y_train
    metrics["_y_test"]  = y_test

    print(
        f"  [out-DP ε={epsilon:<4}]  accuracy={metrics['accuracy']:.4f}  "
        f"auc_roc={metrics['auc_roc']:.4f}  f1={metrics['f1']:.4f}"
    )
    return metrics


def train_private_models(
    epsilons: list[float] = EPSILONS,
    data_dir: str | pathlib.Path = DATA_DIR,
    results_dir: str | pathlib.Path = RESULTS_DIR,
    seed: int = SEED,
) -> dict[float, dict]:
    """
    Train private XGBoost models for all epsilon values.

    Returns:
        Dict mapping epsilon → metrics dict (includes _model, _X_train, etc.)
    """
    return {
        eps: train_private_model(eps, data_dir=data_dir, results_dir=results_dir, seed=seed)
        for eps in epsilons
    }


if __name__ == "__main__":
    print("Training private XGBoost models (one per epsilon)...\n")
    results = train_private_models()
    print(f"\nAll models saved to results/")

    # Load baseline for comparison
    baseline_path = RESULTS_DIR / "baseline_metrics.json"
    if baseline_path.exists():
        with open(baseline_path) as f:
            baseline = json.load(f)
        print(f"\n  [Baseline]  accuracy={baseline['accuracy']}  auc_roc={baseline['auc_roc']}")
        for eps, m in sorted(results.items()):
            acc_delta = m["accuracy"] - baseline["accuracy"]
            print(
                f"  [ε={eps:<4}]  accuracy={m['accuracy']}  "
                f"auc_roc={m['auc_roc']}  Δacc={acc_delta:+.4f}"
            )
