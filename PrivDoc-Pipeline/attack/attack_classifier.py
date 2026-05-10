"""
attack_classifier.py  —  Stage 5 of the PrivDoc-Pipeline (Part B)
Trains a per-model logistic regression attack classifier on shadow model outputs
to perform membership inference against both baseline and DP-protected models.

Key design (Option A — correct shadow MIA):
  Each target model gets its OWN shadow dataset trained on the SAME data
  distribution that the target model was trained on:
    - Baseline   → shadow models trained on original generated_invoices.csv
    - Private ε=X → shadow models trained on anonymized_invoices_epsX.csv

  This is a fair attack: the attacker knows the data distribution (including DP
  noise level) and adapts their shadow models accordingly.

Expected result:
  - Baseline: highest MIA AUC (model memorizes original data cleanly)
  - ε=5.0: slightly lower (small noise, minimal disruption)
  - ε=1.0: lower still
  - ε=0.5: lower
  - ε=0.1: lowest, closest to 0.5 (extreme noise makes all confidences ≈ 0.5)

Interpretation:
  MIA AUC ≈ 0.5  → DP is working (attacker at random-guess level)
  MIA AUC >> 0.5 → model leaks membership information

Usage:
    from attack.attack_classifier import run_mia_audit
    results = run_mia_audit()
"""

import sys
import json
import pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score
from sklearn.metrics import roc_auc_score
from sklearn.preprocessing import StandardScaler

from attack.shadow_models import build_shadow_dataset
from models.xgboost_baseline import _prepare_features, train_baseline, SEED
from models.xgboost_private import train_private_model, NoisyXGBoostWrapper

RESULTS_DIR = pathlib.Path("results")
DATA_DIR    = pathlib.Path("data")
EPSILONS    = [0.1, 0.5, 1.0, 5.0]
N_SHADOWS   = 10
FEAT_COLS   = ["conf_class0", "conf_class1", "max_conf"]


def _confidence_gap(model, X_train: np.ndarray, X_test: np.ndarray) -> float:
    """
    Mean confidence gap: average P(is_late=1) for training members
    minus average P(is_late=1) for test non-members.

    A large positive gap means the model is more confident on its own
    training data → leaks membership. DP output noise should flatten this
    toward 0 as epsilon decreases.
    """
    m_conf  = model.predict_proba(X_train)[:, 1].mean()
    nm_conf = model.predict_proba(X_test)[:, 1].mean()
    return round(float(m_conf - nm_conf), 4)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _train_attack_classifier(shadow_df: pd.DataFrame, seed: int = SEED) -> tuple:
    """
    Train a logistic regression attack classifier on shadow model outputs.

    Args:
        shadow_df: DataFrame from build_shadow_dataset() — contains
                   conf_class0, conf_class1, max_conf, is_member columns.
        seed:      Random seed.

    Returns:
        (fitted LogisticRegression, fitted StandardScaler)
    """
    X_atk = shadow_df[FEAT_COLS].values
    y_atk = shadow_df["is_member"].values

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_atk)

    clf = LogisticRegression(max_iter=1000, random_state=seed)
    clf.fit(X_scaled, y_atk)
    return clf, scaler


def _get_model_feats(model: xgb.XGBClassifier, X: np.ndarray) -> np.ndarray:
    """Get attack features [conf_class0, conf_class1, max_conf] for a set of records."""
    proba = model.predict_proba(X)
    max_conf = proba.max(axis=1, keepdims=True)
    return np.hstack([proba, max_conf])


def _evaluate_attack(
    target_model: xgb.XGBClassifier,
    X_train: np.ndarray,
    X_test: np.ndarray,
    attack_clf: LogisticRegression,
    scaler: StandardScaler,
) -> float:
    """
    Evaluate MIA attack AUC against a target model.

    Collects confidence scores from the target model on its own training
    records (members) and held-out test records (non-members), then uses
    the pre-trained attack classifier to predict membership.

    Returns:
        AUC-ROC of the attack (0.5 = random, 1.0 = perfect).
    """
    X_members    = _get_model_feats(target_model, X_train)
    X_nonmembers = _get_model_feats(target_model, X_test)

    X_combined = np.vstack([X_members, X_nonmembers])
    y_combined = np.array([1] * len(X_members) + [0] * len(X_nonmembers))

    X_scaled     = scaler.transform(X_combined)
    attack_proba = attack_clf.predict_proba(X_scaled)[:, 1]

    return float(roc_auc_score(y_combined, attack_proba))


def _run_single_audit(
    label: str,
    X_data: np.ndarray,
    y_data: np.ndarray,
    target_model: xgb.XGBClassifier,
    X_train: np.ndarray,
    X_test: np.ndarray,
    n_shadows: int,
    seed: int,
) -> tuple[float, float]:
    """
    Build shadow dataset from X_data/y_data (same distribution as target model),
    train attack classifier, and evaluate against target_model.

    Returns:
        (shadow_cv_auc, mia_attack_auc)
    """
    # Shadow dataset uses the same data distribution as the target model
    shadow_df = build_shadow_dataset(X_data, y_data, n_shadows=n_shadows, seed=seed)

    attack_clf, scaler = _train_attack_classifier(shadow_df, seed=seed)

    # Cross-val AUC of the attack classifier on shadow data (sanity check)
    X_atk    = scaler.transform(shadow_df[FEAT_COLS].values)
    y_atk    = shadow_df["is_member"].values
    cv_aucs  = cross_val_score(attack_clf, X_atk, y_atk, cv=5, scoring="roc_auc")
    shadow_cv = float(cv_aucs.mean())

    # Evaluate against the target model
    mia_auc = _evaluate_attack(target_model, X_train, X_test, attack_clf, scaler)

    print(f"    shadow clf CV-AUC: {shadow_cv:.4f}  →  MIA attack AUC: {mia_auc:.4f}")
    return shadow_cv, mia_auc


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_mia_audit_single(
    target_model,
    X_train: np.ndarray,
    X_test: np.ndarray,
    X_shadow: np.ndarray,
    y_shadow: np.ndarray,
    epsilon: float | None = None,
    n_shadows: int = N_SHADOWS,
    seed: int = SEED,
) -> dict:
    """
    Run MIA audit for a single target model.

    Builds a shadow dataset from X_shadow/y_shadow (same distribution as
    the target model). If epsilon is provided, shadow models are wrapped with
    NoisyXGBoostWrapper at the same epsilon — so the attack classifier learns
    what noisy-member vs noisy-non-member confidence looks like under that DP level.

    Args:
        target_model: Trained model to attack (XGBoost or NoisyXGBoostWrapper).
        X_train:      Features the target model was trained on (members).
        X_test:       Features held out from target model training (non-members).
        X_shadow:     Features for building shadow datasets (same distribution as target).
        y_shadow:     Labels for shadow data.
        epsilon:      If provided, wrap shadow models at this ε (output perturbation).
        n_shadows:    Number of shadow models.
        seed:         Random seed.

    Returns:
        Dict with mia_attack_auc, confidence_gap, shadow_cv_auc.
    """
    shadow_df = build_shadow_dataset(
        X_shadow, y_shadow,
        n_shadows=n_shadows,
        seed=seed,
        epsilon=epsilon,
    )
    attack_clf, scaler = _train_attack_classifier(shadow_df, seed=seed)

    X_atk   = scaler.transform(shadow_df[FEAT_COLS].values)
    y_atk   = shadow_df["is_member"].values
    cv_aucs = cross_val_score(attack_clf, X_atk, y_atk, cv=5, scoring="roc_auc")

    mia_auc = _evaluate_attack(target_model, X_train, X_test, attack_clf, scaler)
    gap     = _confidence_gap(target_model, X_train, X_test)

    return {
        "mia_attack_auc": round(mia_auc, 4),
        "confidence_gap": gap,
        "shadow_cv_auc":  round(float(cv_aucs.mean()), 4),
    }


def run_mia_audit(
    results_dir: str | pathlib.Path = RESULTS_DIR,
    data_dir: str | pathlib.Path = DATA_DIR,
    n_shadows: int = N_SHADOWS,
    seed: int = SEED,
) -> list[dict]:
    """
    Run the full per-model MIA audit (Option A: adapted shadow datasets).

    For each target model (baseline + 4 private):
      1. Load the SAME data distribution used to train the target model
      2. Build N shadow models on that distribution
      3. Train an attack classifier on the shadow outputs
      4. Evaluate attack AUC against the target model

    Args:
        results_dir: Directory to save mia_results.json.
        data_dir:    Directory containing generated/anonymized CSVs.
        n_shadows:   Number of shadow models per target model.
        seed:        Base random seed.

    Returns:
        List of result dicts: {model, epsilon, accuracy, auc_roc, f1,
                                mia_attack_auc, shadow_cv_auc}
    """
    results_dir = pathlib.Path(results_dir)
    data_dir    = pathlib.Path(data_dir)
    results_dir.mkdir(exist_ok=True)

    audit_results = []

    # --- Baseline ---
    print("\n[MIA] ── Baseline (ε=∞, no DP) ──")
    print(f"    Training {n_shadows} shadow models on original data...")
    baseline = train_baseline(seed=seed)

    df_orig = pd.read_csv(data_dir / "generated_invoices.csv")
    X_orig, y_orig = _prepare_features(df_orig)

    shadow_cv, mia_auc = _run_single_audit(
        label="baseline",
        X_data=X_orig,
        y_data=y_orig,
        target_model=baseline["_model"],
        X_train=baseline["_X_train"],
        X_test=baseline["_X_test"],
        n_shadows=n_shadows,
        seed=seed,
    )
    audit_results.append({
        "model":          "baseline",
        "epsilon":        "∞",
        "accuracy":       baseline["accuracy"],
        "auc_roc":        baseline["auc_roc"],
        "f1":             baseline["f1"],
        "mia_attack_auc": round(mia_auc, 4),
        "shadow_cv_auc":  round(shadow_cv, 4),
    })

    # --- Private models: each gets its own shadow dataset ---
    for eps in sorted(EPSILONS, reverse=True):
        print(f"\n[MIA] ── Private model (ε={eps}) ──")
        print(f"    Training {n_shadows} shadow models on anonymized_invoices_eps{eps}.csv...")

        private = train_private_model(eps, data_dir=data_dir, seed=seed)

        # Load the DP-anonymized data for this epsilon
        df_anon = pd.read_csv(data_dir / f"anonymized_invoices_eps{eps}.csv")
        X_anon, y_anon = _prepare_features(df_anon)

        shadow_cv, mia_auc = _run_single_audit(
            label=f"private_eps{eps}",
            X_data=X_anon,
            y_data=y_anon,
            target_model=private["_model"],
            X_train=private["_X_train"],
            X_test=private["_X_test"],
            n_shadows=n_shadows,
            seed=seed + int(eps * 10),   # different seed per epsilon
        )
        audit_results.append({
            "model":          "private",
            "epsilon":        eps,
            "accuracy":       private["accuracy"],
            "auc_roc":        private["auc_roc"],
            "f1":             private["f1"],
            "mia_attack_auc": round(mia_auc, 4),
            "shadow_cv_auc":  round(shadow_cv, 4),
        })

    # Save
    out_path = results_dir / "mia_results.json"
    with open(out_path, "w") as f:
        json.dump(audit_results, f, indent=2)
    print(f"\n[MIA] Results saved to {out_path}")

    return audit_results


if __name__ == "__main__":
    print("=" * 65)
    print("Membership Inference Attack Audit — PrivDoc-Pipeline")
    print("Option A: Per-model adapted shadow datasets")
    print("=" * 65)
    results = run_mia_audit()

    print("\n" + "=" * 65)
    print(f"{'Model':<20} {'ε':<8} {'Accuracy':<10} {'AUC-ROC':<10} {'F1':<8} {'MIA AUC':<10}")
    print("-" * 65)
    for r in results:
        print(
            f"{r['model']:<20} {str(r['epsilon']):<8} {r['accuracy']:<10.4f} "
            f"{r['auc_roc']:<10.4f} {r['f1']:<8.4f} {r['mia_attack_auc']:<10.4f}"
        )
    print("=" * 65)
    print("\nInterpretation:")
    print("  MIA AUC ≈ 0.5 → DP is working (attacker cannot distinguish train from test)")
    print("  MIA AUC >> 0.5 → model leaks membership information")
