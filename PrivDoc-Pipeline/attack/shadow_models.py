"""
shadow_models.py  —  Stage 5 of the PrivDoc-Pipeline (Part A)
Trains N shadow XGBoost models to generate labeled (confidence, is_member) data
for the membership inference attack classifier.

How shadow model MIA works:
  1. Split dataset into N disjoint (train, out) pairs — each pair trains one shadow model.
  2. For each shadow model: record the model's prediction confidence for every record.
     - Records in that model's training set → labeled is_member=1
     - Records NOT in that model's training set → labeled is_member=0
  3. Stack all (confidence_vector, is_member) pairs → training data for the attack classifier.

The attack classifier then learns: "high confidence on a record = that record was likely in training".
Against a DP-protected model, confidence scores are flattened by noise → attack can't distinguish.

Usage:
    from attack.shadow_models import build_shadow_dataset
    shadow_df = build_shadow_dataset(X, y, n_shadows=10)
"""

import sys
import pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import train_test_split
from models.xgboost_private import NoisyXGBoostWrapper

SEED = 42


def _train_shadow_model(
    X_shadow_train: np.ndarray,
    y_shadow_train: np.ndarray,
    seed: int,
) -> xgb.XGBClassifier:
    """Train a single shadow XGBoost model."""
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
    model.fit(X_shadow_train, y_shadow_train)
    return model


def build_shadow_dataset(
    X: np.ndarray,
    y: np.ndarray,
    n_shadows: int = 10,
    shadow_train_frac: float = 0.50,
    seed: int = SEED,
    epsilon: float | None = None,
) -> pd.DataFrame:
    """
    Train N shadow models and collect (confidence, is_member) labeled pairs.

    Each shadow model is trained on a random 50% subset of the data.
    The remaining 50% are "non-members" for that shadow model.
    Confidence scores from predict_proba are recorded for both sets.

    Args:
        X:                 Feature matrix (all records).
        y:                 Label vector (all records).
        n_shadows:         Number of shadow models to train.
        shadow_train_frac: Fraction of data used as each shadow model's training set.
        seed:              Base random seed.

    Returns:
        DataFrame with columns:
            conf_class0   — P(is_late=0) from the shadow model
            conf_class1   — P(is_late=1) from the shadow model
            max_conf      — max(conf_class0, conf_class1) = confidence of prediction
            predicted_label — argmax of confidence
            true_label    — actual is_late value
            is_member     — 1 if record was in this shadow model's training set

    Note: if epsilon is provided, each shadow model is wrapped with
    NoisyXGBoostWrapper at that epsilon before collecting confidence scores.
    This ensures shadow models simulate the same output noise as the target model.
    """
    records = []
    n = len(X)

    for i in range(n_shadows):
        rng = np.random.RandomState(seed + i)
        indices = np.arange(n)
        rng.shuffle(indices)

        split = int(n * shadow_train_frac)
        train_idx = indices[:split]
        out_idx   = indices[split:]

        X_train = X[train_idx]
        y_train = y[train_idx]
        model_seed = seed + i * 7
        raw_model  = _train_shadow_model(X_train, y_train, seed=model_seed)

        # Optionally wrap with output perturbation (same ε as target model)
        model = (
            NoisyXGBoostWrapper(raw_model, epsilon=epsilon, seed=model_seed)
            if epsilon is not None
            else raw_model
        )

        # Collect confidences for BOTH member and non-member records
        for idx_set, is_member in [(train_idx, 1), (out_idx, 0)]:
            proba = model.predict_proba(X[idx_set])  # shape (n, 2)
            preds = model.predict(X[idx_set])
            for j, orig_idx in enumerate(idx_set):
                records.append({
                    "conf_class0":     float(proba[j, 0]),
                    "conf_class1":     float(proba[j, 1]),
                    "max_conf":        float(proba[j].max()),
                    "predicted_label": int(preds[j]),
                    "true_label":      int(y[orig_idx]),
                    "is_member":       is_member,
                })

    return pd.DataFrame(records)


if __name__ == "__main__":
    import json
    from models.xgboost_baseline import _prepare_features

    df = pd.read_csv("data/generated_invoices.csv")
    X, y = _prepare_features(df)

    print(f"Building shadow dataset with 10 shadow models on {len(X)} records...")
    shadow_df = build_shadow_dataset(X, y, n_shadows=10)
    print(f"Shadow dataset: {len(shadow_df)} rows")
    print(f"Member rate: {shadow_df.is_member.mean():.3f}")
    print(shadow_df.head())
