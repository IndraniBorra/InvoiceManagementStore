"""
run_all.py  —  Full PrivDoc-Pipeline Orchestration
CS 6349 Network Security — UT Dallas

Runs the complete privacy-preserving ML pipeline end-to-end:

  Step 1: Generate synthetic labeled invoice dataset (800 records)
  Step 2: OCR extract + NER redact all PDF invoices in docs/test_invoices/
  Step 3: Apply Laplace DP for ε ∈ {0.1, 0.5, 1.0, 5.0}
  Step 4: Train baseline XGBoost + 4 private XGBoost models
  Step 5: Run shadow model MIA audit on all 5 models
  Step 6: Print final results table

Usage (from PrivDoc-Pipeline/ directory):
    python experiments/run_all.py
    python experiments/run_all.py --skip-ocr    # skip PDF processing
    python experiments/run_all.py --skip-data   # skip data generation (use existing CSV)
"""

import sys
import json
import time
import argparse
import pathlib
import pandas as pd

# Add project root to path
ROOT = pathlib.Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

RESULTS_DIR  = ROOT / "results"
DATA_DIR     = ROOT / "data"
PDF_DIR      = ROOT.parent / "docs" / "test_invoices"
EPSILONS     = [0.1, 0.5, 1.0, 5.0]
N_SHADOWS    = 10


def header(title: str) -> None:
    bar = "=" * 65
    print(f"\n{bar}")
    print(f"  {title}")
    print(bar)


def step(n: int, desc: str) -> None:
    print(f"\n[Step {n}] {desc}")
    print("-" * 50)


# ---------------------------------------------------------------------------
# Step 1: Data generation
# ---------------------------------------------------------------------------
def run_step1(skip: bool = False) -> None:
    step(1, "Generating synthetic invoice dataset")
    csv_path = DATA_DIR / "generated_invoices.csv"
    if skip and csv_path.exists():
        print(f"  Skipping — {csv_path.name} already exists ({csv_path.stat().st_size // 1024} KB)")
        return
    from data.data_generator import generate
    df = generate()
    df.to_csv(csv_path, index=False)
    late_pct = df["is_late"].mean() * 100
    print(f"  Generated {len(df)} records  |  late rate: {late_pct:.1f}%  |  saved to {csv_path.name}")


# ---------------------------------------------------------------------------
# Step 2: OCR + NER redaction
# ---------------------------------------------------------------------------
def run_step2(skip: bool = False) -> None:
    step(2, "OCR extraction + NER redaction of PDF invoices")
    if skip:
        print("  Skipping OCR/NER step (--skip-ocr flag set)")
        return
    if not PDF_DIR.exists():
        print(f"  WARNING: PDF directory not found at {PDF_DIR} — skipping")
        return

    from pipeline.ocr_extractor import extract_batch
    from pipeline.ner_redactor import redact_batch

    t0 = time.time()
    extracted = extract_batch(str(PDF_DIR))
    redacted  = redact_batch(extracted)
    elapsed   = time.time() - t0

    ok  = sum(1 for r in redacted if "error" not in r)
    err = len(redacted) - ok
    total_entities = sum(len(r.get("entities_found", [])) for r in redacted)

    print(f"  PDFs processed : {ok}/{len(redacted)}  ({err} errors)  in {elapsed:.1f}s")
    print(f"  Entities redacted: {total_entities} total")

    # Show a sample
    for r in redacted[:3]:
        n = len(r.get("entities_found", []))
        print(f"    {r['source_file']:45s}  {n} entities")
    if len(redacted) > 3:
        print(f"    ... and {len(redacted) - 3} more")


# ---------------------------------------------------------------------------
# Step 3: Differential privacy anonymization
# ---------------------------------------------------------------------------
def run_step3() -> None:
    step(3, f"Laplace DP anonymization  (ε ∈ {EPSILONS})")
    from pipeline.dp_anonymizer import run_all_epsilons
    run_all_epsilons(
        input_csv=str(DATA_DIR / "generated_invoices.csv"),
        output_dir=str(DATA_DIR),
        epsilons=EPSILONS,
    )


# ---------------------------------------------------------------------------
# Step 4: Train XGBoost models
# ---------------------------------------------------------------------------
def run_step4() -> dict:
    step(4, "Training XGBoost models (baseline + 4 private)")
    from models.xgboost_baseline import train_baseline
    from models.xgboost_private import train_private_models

    print("  Training baseline model...")
    baseline_metrics = train_baseline()

    print("  Training private models...")
    private_metrics = train_private_models(epsilons=EPSILONS)

    return {"baseline": baseline_metrics, "private": private_metrics}


# ---------------------------------------------------------------------------
# Step 5: MIA audit
# ---------------------------------------------------------------------------
def run_step5() -> list[dict]:
    step(5, f"Shadow model MIA audit  ({N_SHADOWS} shadow models)")
    from attack.attack_classifier import run_mia_audit
    return run_mia_audit(results_dir=RESULTS_DIR, n_shadows=N_SHADOWS)


# ---------------------------------------------------------------------------
# Step 6: Print results table
# ---------------------------------------------------------------------------
def print_results(mia_results: list[dict]) -> None:
    header("Final Results — Privacy vs Utility Tradeoff")

    col_w = [22, 8, 10, 10, 8, 12]
    headers = ["Model", "ε", "Accuracy", "AUC-ROC", "F1", "MIA Atk AUC"]
    sep = "-" * 72

    def row_str(vals):
        return "  ".join(str(v).ljust(w) for v, w in zip(vals, col_w))

    print(row_str(headers))
    print(sep)

    for r in mia_results:
        eps_str = str(r["epsilon"])
        print(row_str([
            r["model"],
            eps_str,
            f"{r['accuracy']:.4f}",
            f"{r['auc_roc']:.4f}",
            f"{r['f1']:.4f}",
            f"{r['mia_attack_auc']:.4f}",
        ]))

    print(sep)
    print("""
  Interpretation:
    MIA Attack AUC ≈ 0.50  →  DP is working (attacker at random-guess level)
    MIA Attack AUC >> 0.50 →  model leaks membership information

  Defense stack:
    Attack 1 (Data Breach)         → NER redaction in Step 2
    Attack 2 (Re-identification)   → Laplace DP in Step 3
    Attack 3 (Membership Inference)→ Empirically audited in Step 5
""")


# ---------------------------------------------------------------------------
# Experiment 4: Output Perturbation DP (MIA defense only, no input DP)
# ---------------------------------------------------------------------------
def run_exp4() -> list[dict]:
    step(4, "Experiment 4 — Output Perturbation DP  (MIA defense)")
    from models.xgboost_private import train_output_perturbed_model
    from attack.attack_classifier import run_mia_audit_single
    from models.xgboost_baseline import _prepare_features

    df_orig = pd.read_csv(DATA_DIR / "generated_invoices.csv")
    X_orig, y_orig = _prepare_features(df_orig)

    results = []
    for eps in sorted(EPSILONS, reverse=True):
        m = train_output_perturbed_model(eps, data_dir=DATA_DIR, results_dir=RESULTS_DIR)
        audit = run_mia_audit_single(
            target_model=m["_model"],
            X_train=m["_X_train"],
            X_test=m["_X_test"],
            X_shadow=X_orig,
            y_shadow=y_orig,
            epsilon=eps,
            n_shadows=N_SHADOWS,
        )
        print(f"    ε={eps}  MIA AUC={audit['mia_attack_auc']:.4f}  "
              f"conf_gap={audit['confidence_gap']:.4f}")
        results.append({
            "model": "output_dp", "epsilon": eps,
            "accuracy": m["accuracy"], "auc_roc": m["auc_roc"], "f1": m["f1"],
            **audit,
        })
    return results


# ---------------------------------------------------------------------------
# Experiment 5: Combined Defense (Input DP + Output DP)
# ---------------------------------------------------------------------------
def run_exp5() -> list[dict]:
    step(5, "Experiment 5 — Combined Defense  (Input DP + Output DP)")
    from models.xgboost_private import NoisyXGBoostWrapper, train_private_model
    from attack.attack_classifier import run_mia_audit_single
    from models.xgboost_baseline import _prepare_features
    from sklearn.metrics import accuracy_score, roc_auc_score, f1_score
    import xgboost as xgb

    results = []
    for eps in sorted(EPSILONS, reverse=True):
        # Load DP-anonymized data (input-level DP already applied in Step 3)
        df_anon = pd.read_csv(DATA_DIR / f"anonymized_invoices_eps{eps}.csv")
        X_anon, y_anon = _prepare_features(df_anon)

        from sklearn.model_selection import train_test_split
        X_train, X_test, y_train, y_test = train_test_split(
            X_anon, y_anon, test_size=0.2, random_state=42, stratify=y_anon
        )

        # Train XGBoost on input-DP data
        base_model = xgb.XGBClassifier(
            n_estimators=100, max_depth=4, learning_rate=0.1,
            subsample=0.8, colsample_bytree=0.8,
            use_label_encoder=False, eval_metric="logloss",
            random_state=42, verbosity=0,
        )
        base_model.fit(X_train, y_train)

        # Wrap with output-DP noise
        wrapped = NoisyXGBoostWrapper(base_model, epsilon=eps, seed=42)

        # Utility: use clean outputs for fair comparison
        y_pred  = (wrapped.predict_proba_clean(X_test)[:, 1] >= 0.5).astype(int)
        y_proba = wrapped.predict_proba_clean(X_test)[:, 1]

        acc    = round(float(accuracy_score(y_test, y_pred)), 4)
        auc    = round(float(roc_auc_score(y_test, y_proba)), 4)
        f1     = round(float(f1_score(y_test, y_pred)), 4)

        # MIA audit: shadow models also see input-DP + output-DP
        audit = run_mia_audit_single(
            target_model=wrapped,
            X_train=X_train,
            X_test=X_test,
            X_shadow=X_anon,
            y_shadow=y_anon,
            epsilon=eps,
            n_shadows=N_SHADOWS,
        )
        print(f"  [combined ε={eps:<4}]  accuracy={acc:.4f}  auc_roc={auc:.4f}  "
              f"MIA AUC={audit['mia_attack_auc']:.4f}  conf_gap={audit['confidence_gap']:.4f}")
        results.append({
            "model": "combined", "epsilon": eps,
            "accuracy": acc, "auc_roc": auc, "f1": f1,
            **audit,
        })
    return results


# ---------------------------------------------------------------------------
# Generate figures
# ---------------------------------------------------------------------------
def generate_figures(
    input_dp_results: list[dict],
    output_dp_results: list[dict],
    combined_results: list[dict],
    baseline: dict,
) -> None:
    step(6, "Generating result figures")
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("  matplotlib not installed — skipping figures. Run: pip install matplotlib")
        return

    eps_labels = ["0.1", "0.5", "1.0", "5.0", "∞"]
    eps_x      = [0.1, 0.5, 1.0, 5.0, 6.0]  # ∞ plotted at x=6.0

    def _vals(results: list[dict], key: str) -> list[float]:
        """Extract values sorted by epsilon ascending, then append baseline."""
        sorted_r = sorted(
            [r for r in results if isinstance(r["epsilon"], (int, float))],
            key=lambda r: r["epsilon"],
        )
        return [r[key] for r in sorted_r] + [baseline[key]]

    # ── Figure 1: Privacy Budget vs Utility (F1) ──────────────────────────
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.plot(eps_x, _vals(input_dp_results,  "f1"), "o-", label="Input DP",    color="steelblue")
    ax.plot(eps_x, _vals(output_dp_results, "f1"), "s-", label="Output DP",   color="darkorange")
    ax.plot(eps_x, _vals(combined_results,  "f1"), "^-", label="Combined",    color="green")
    ax.axhline(baseline["f1"], linestyle="--", color="gray", alpha=0.7, label="Baseline (no DP)")
    ax.set_xticks(eps_x); ax.set_xticklabels(eps_labels)
    ax.set_xlabel("Privacy Budget ε"); ax.set_ylabel("F1 Score")
    ax.set_title("Privacy Budget vs Model Utility")
    ax.legend(); ax.grid(alpha=0.3)
    plt.tight_layout()
    plt.savefig(RESULTS_DIR / "privacy_utility_curve.png", dpi=150)
    plt.close()
    print("  Saved privacy_utility_curve.png")

    # ── Figure 2: Privacy Budget vs MIA Attack AUC (KEY figure) ──────────
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.plot(eps_x, _vals(input_dp_results,  "mia_attack_auc"), "o-",
            label="Input DP (goes UP — finding!)", color="steelblue")
    ax.plot(eps_x, _vals(output_dp_results, "mia_attack_auc"), "s-",
            label="Output DP (monotonic ↓)",      color="darkorange")
    ax.plot(eps_x, _vals(combined_results,  "mia_attack_auc"), "^-",
            label="Combined (lowest)",             color="green")
    ax.axhline(0.5, linestyle="--", color="red", alpha=0.8, label="Random guessing (0.5)")
    ax.set_xticks(eps_x); ax.set_xticklabels(eps_labels)
    ax.set_xlabel("Privacy Budget ε"); ax.set_ylabel("MIA Attack AUC")
    ax.set_title("Privacy Budget vs MIA Attack Success")
    ax.legend(); ax.grid(alpha=0.3)
    plt.tight_layout()
    plt.savefig(RESULTS_DIR / "attack_vs_epsilon.png", dpi=150)
    plt.close()
    print("  Saved attack_vs_epsilon.png")

    # ── Figure 3: Defense Comparison at ε=0.5 ────────────────────────────
    def _at_eps(results: list[dict], eps: float, key: str) -> float:
        return next(r[key] for r in results if r["epsilon"] == eps)

    eps_target = 0.5
    groups     = ["Baseline", "Input DP", "Output DP", "Combined"]
    f1_vals    = [
        baseline["f1"],
        _at_eps(input_dp_results,  eps_target, "f1"),
        _at_eps(output_dp_results, eps_target, "f1"),
        _at_eps(combined_results,  eps_target, "f1"),
    ]
    mia_vals   = [
        baseline.get("mia_attack_auc", 0.5762),
        _at_eps(input_dp_results,  eps_target, "mia_attack_auc"),
        _at_eps(output_dp_results, eps_target, "mia_attack_auc"),
        _at_eps(combined_results,  eps_target, "mia_attack_auc"),
    ]

    x   = range(len(groups))
    w   = 0.35
    fig, ax = plt.subplots(figsize=(9, 5))
    ax.bar([i - w/2 for i in x], f1_vals,  w, label="F1 Score",      color="steelblue", alpha=0.85)
    ax.bar([i + w/2 for i in x], mia_vals, w, label="MIA Attack AUC", color="tomato",    alpha=0.85)
    ax.axhline(0.5, linestyle="--", color="red", alpha=0.6, label="Random guessing (0.5)")
    ax.set_xticks(list(x)); ax.set_xticklabels(groups)
    ax.set_ylabel("Score"); ax.set_ylim(0, 0.85)
    ax.set_title(f"Defense Comparison at ε={eps_target}")
    ax.legend(); ax.grid(axis="y", alpha=0.3)
    plt.tight_layout()
    plt.savefig(RESULTS_DIR / "combined_defense.png", dpi=150)
    plt.close()
    print("  Saved combined_defense.png")


# ---------------------------------------------------------------------------
# Save structured mia_results.json
# ---------------------------------------------------------------------------
def save_structured_results(
    input_dp_results:  list[dict],
    output_dp_results: list[dict],
    combined_results:  list[dict],
    baseline: dict,
) -> None:
    baseline_row = {
        "model": "baseline", "epsilon": "∞",
        "accuracy": baseline["accuracy"], "auc_roc": baseline["auc_roc"],
        "f1": baseline["f1"],
        "mia_attack_auc": baseline.get("mia_attack_auc", None),
        "confidence_gap": baseline.get("confidence_gap", None),
    }
    def _sort_eps(rows):
        return sorted([r for r in rows if isinstance(r["epsilon"], (int, float))],
                      key=lambda r: r["epsilon"])

    structured = {
        "input_dp":  [baseline_row] + _sort_eps(input_dp_results),
        "output_dp": [baseline_row] + _sort_eps(output_dp_results),
        "combined":  [baseline_row] + _sort_eps(combined_results),
    }
    out_path = RESULTS_DIR / "mia_results.json"
    with open(out_path, "w") as f:
        json.dump(structured, f, indent=2, default=str)
    print(f"\n  Structured results saved to {out_path.name}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(description="PrivDoc-Pipeline — full run")
    parser.add_argument("--skip-data", action="store_true", help="Skip data generation if CSV exists")
    parser.add_argument("--skip-ocr",  action="store_true", help="Skip OCR/NER step")
    args = parser.parse_args()

    RESULTS_DIR.mkdir(exist_ok=True)

    header("PrivDoc-Pipeline  |  CS 6349 Network Security  |  UT Dallas")
    total_start = time.time()

    run_step1(skip=args.skip_data)
    run_step2(skip=args.skip_ocr)
    run_step3()
    step4_results = run_step4()
    input_dp_results = run_step5()
    print_results(input_dp_results)

    # New experiments
    output_dp_results = run_exp4()
    combined_results  = run_exp5()

    # Save structured JSON + figures
    baseline = step4_results["baseline"]
    # Attach MIA result to baseline for figure use
    baseline_mia = next((r for r in input_dp_results if r["model"] == "baseline"), {})
    baseline["mia_attack_auc"] = baseline_mia.get("mia_attack_auc")
    baseline["confidence_gap"] = baseline_mia.get("confidence_gap")

    save_structured_results(input_dp_results, output_dp_results, combined_results, baseline)
    generate_figures(input_dp_results, output_dp_results, combined_results, baseline)

    # Final summary table
    header("Experiment Summary — MIA Attack AUC by Defense Strategy")
    print(f"{'ε':<8} {'Input DP':<14} {'Output DP':<14} {'Combined':<14}")
    print("-" * 52)
    eps_sorted = sorted(EPSILONS)
    def _mia(results, eps):
        r = next((r for r in results if r["epsilon"] == eps), {})
        return f"{r.get('mia_attack_auc', 'N/A'):.4f}"
    for eps in eps_sorted:
        print(f"{eps:<8} {_mia(input_dp_results,eps):<14} {_mia(output_dp_results,eps):<14} {_mia(combined_results,eps):<14}")
    print(f"{'∞ (base)':<8} {baseline['mia_attack_auc']:<14} {'—':<14} {'—':<14}")
    print("\n  Finding: Input DP increases MIA AUC at intermediate ε (re-identification defense only)")
    print("  Fix:     Output DP + Combined drive MIA AUC monotonically toward 0.5")

    elapsed = time.time() - total_start
    print(f"\n  Total runtime: {elapsed:.1f}s")


if __name__ == "__main__":
    main()
