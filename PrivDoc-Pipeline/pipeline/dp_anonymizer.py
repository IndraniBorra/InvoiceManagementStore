"""
dp_anonymizer.py  —  Stage 3B of the PrivDoc-Pipeline
Applies the Laplace mechanism (differential privacy) to numerical invoice fields.

Defends against Attack 2: re-identification via exact numerical fingerprinting.
Without DP, an attacker who knows amount_due=$4,871.25 can uniquely identify
a record in the training set. Laplace noise destroys this exact match.

Laplace mechanism:
    noisy_value = original_value + Laplace(0, sensitivity / epsilon)
    sensitivity = max plausible range of the field

Fields anonymized:
    amount_due         sensitivity = 50000  (max invoice value)
    payment_due_days   sensitivity = 45     (max - min = 60 - 15)
    num_line_items     sensitivity = 19     (max - min = 20 - 1)
    invoice_date       sensitivity = 365    (days in a year, month-level perturbation)

Epsilon values: {0.1, 0.5, 1.0, 5.0}  (lower = more privacy, more noise)

Output: data/anonymized_invoices_eps{epsilon}.csv for each epsilon

Usage:
    from pipeline.dp_anonymizer import anonymize_dataset, anonymize_record
    import pandas as pd

    df = pd.read_csv("data/generated_invoices.csv")
    anon_df = anonymize_dataset(df, epsilon=1.0)
    anon_df.to_csv("data/anonymized_invoices_eps1.0.csv", index=False)
"""

import datetime
import pathlib

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Field sensitivity definitions
# ---------------------------------------------------------------------------
# Sensitivity = the maximum amount a single record can change a field value.
# For unbounded fields we use a domain-knowledge upper bound.
FIELD_SENSITIVITY: dict[str, float] = {
    "amount_due":        50_000.0,   # $500 – $50,000 range
    "payment_due_days":  45.0,       # choices: 15, 30, 45, 60  →  max delta = 45
    "num_line_items":    19.0,       # range: 1–20  →  max delta = 19
    "invoice_date":      365.0,      # perturb as day-of-year; sensitivity = 1 year
}

EPSILONS = [0.1, 0.5, 1.0, 5.0]


# ---------------------------------------------------------------------------
# Core Laplace mechanism
# ---------------------------------------------------------------------------

def _laplace_noise(sensitivity: float, epsilon: float, size: int = 1) -> np.ndarray:
    """Draw `size` samples from Laplace(0, sensitivity/epsilon)."""
    scale = sensitivity / epsilon
    return np.random.laplace(loc=0.0, scale=scale, size=size)


# ---------------------------------------------------------------------------
# Per-field anonymization helpers
# ---------------------------------------------------------------------------

def _anonymize_amount(value: float, epsilon: float) -> float:
    """Add Laplace noise to amount_due. Clamp to [1.0, ∞) — amounts can't be negative."""
    noise = float(_laplace_noise(FIELD_SENSITIVITY["amount_due"], epsilon)[0])
    return max(1.0, round(value + noise, 2))


def _anonymize_payment_due_days(value: int, epsilon: float) -> int:
    """Add Laplace noise to payment_due_days. Clamp to [1, 90]."""
    noise = float(_laplace_noise(FIELD_SENSITIVITY["payment_due_days"], epsilon)[0])
    return int(np.clip(round(value + noise), 1, 90))


def _anonymize_num_line_items(value: int, epsilon: float) -> int:
    """Add Laplace noise to num_line_items. Clamp to [1, 50]."""
    noise = float(_laplace_noise(FIELD_SENSITIVITY["num_line_items"], epsilon)[0])
    return int(np.clip(round(value + noise), 1, 50))


def _anonymize_invoice_date(date_str: str, epsilon: float) -> str:
    """
    Perturb invoice_date by adding Laplace noise (in days).
    Clamp to [2021-01-01, 2025-12-31] to stay within realistic range.
    Returns YYYY-MM-DD string.
    """
    date = datetime.date.fromisoformat(date_str)
    noise_days = int(round(float(_laplace_noise(FIELD_SENSITIVITY["invoice_date"], epsilon)[0])))
    perturbed = date + datetime.timedelta(days=noise_days)
    # Clamp to valid range
    lo = datetime.date(2021, 1, 1)
    hi = datetime.date(2025, 12, 31)
    perturbed = max(lo, min(hi, perturbed))
    return perturbed.strftime("%Y-%m-%d")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def anonymize_record(record: dict, epsilon: float) -> dict:
    """
    Apply Laplace DP noise to the numerical fields of a single invoice record.

    Non-numerical fields (vendor info, text labels, categorical fields) are
    copied unchanged. The `is_late` label is recomputed from the perturbed
    dates to maintain consistency.

    Args:
        record:  A dict representing one row of generated_invoices.csv.
        epsilon: Privacy budget (lower = more noise = more privacy).

    Returns:
        New dict with anonymized numerical fields.
    """
    r = dict(record)

    # Perturb invoice_date first
    original_invoice_date = r["invoice_date"]
    r["invoice_date"] = _anonymize_invoice_date(original_invoice_date, epsilon)

    # Perturb payment_due_days
    r["payment_due_days"] = _anonymize_payment_due_days(int(r["payment_due_days"]), epsilon)

    # Recompute dependent date fields consistently
    invoice_date = datetime.date.fromisoformat(r["invoice_date"])
    due_date = invoice_date + datetime.timedelta(days=r["payment_due_days"])
    r["due_date"] = due_date.strftime("%Y-%m-%d")
    r["net_terms"] = f"Net {r['payment_due_days']}"
    r["invoice_month"] = invoice_date.month

    # Recompute payment_received_date to preserve is_late semantics
    # Keep the original late/on-time outcome but shift dates
    original_is_late = int(r["is_late"])
    if original_is_late:
        # Keep the same lateness offset (original payment_received_date - original due_date)
        orig_due = (
            datetime.date.fromisoformat(original_invoice_date)
            + datetime.timedelta(days=int(record["payment_due_days"]))
        )
        orig_received = datetime.date.fromisoformat(str(r["payment_received_date"]))
        late_days = max(1, (orig_received - orig_due).days)
        r["payment_received_date"] = (due_date + datetime.timedelta(days=late_days)).strftime("%Y-%m-%d")
    else:
        r["payment_received_date"] = due_date.strftime("%Y-%m-%d")

    r["is_late"] = original_is_late  # preserve original label

    # Perturb financial fields
    r["amount_due"] = _anonymize_amount(float(r["amount_due"]), epsilon)
    r["num_line_items"] = _anonymize_num_line_items(int(r["num_line_items"]), epsilon)

    # Metadata
    r["epsilon"] = epsilon

    return r


def anonymize_dataset(df: pd.DataFrame, epsilon: float, seed: int = 42) -> pd.DataFrame:
    """
    Apply Laplace DP to all records in a DataFrame.

    Args:
        df:      DataFrame from generated_invoices.csv.
        epsilon: Privacy budget.
        seed:    Random seed for reproducibility.

    Returns:
        New DataFrame with anonymized numerical fields + 'epsilon' column.
    """
    np.random.seed(seed)
    records = df.to_dict(orient="records")
    anonymized = [anonymize_record(r, epsilon) for r in records]
    return pd.DataFrame(anonymized)


def run_all_epsilons(
    input_csv: str = "data/generated_invoices.csv",
    output_dir: str = "data",
    epsilons: list[float] | None = None,
    seed: int = 42,
) -> dict[float, pd.DataFrame]:
    """
    Generate anonymized datasets for all epsilon values.

    Args:
        input_csv:  Path to the original generated_invoices.csv.
        output_dir: Directory to write anonymized CSVs.
        epsilons:   List of epsilon values (default: [0.1, 0.5, 1.0, 5.0]).
        seed:       Base random seed.

    Returns:
        Dict mapping epsilon → anonymized DataFrame.
    """
    if epsilons is None:
        epsilons = EPSILONS

    df = pd.read_csv(input_csv)
    output_dir = pathlib.Path(output_dir)
    results: dict[float, pd.DataFrame] = {}

    for eps in epsilons:
        # Use different seed per epsilon so noise is independent
        eps_seed = seed + int(eps * 100)
        anon_df = anonymize_dataset(df, epsilon=eps, seed=eps_seed)

        out_path = output_dir / f"anonymized_invoices_eps{eps}.csv"
        anon_df.to_csv(out_path, index=False)

        late_rate = anon_df["is_late"].mean()
        amt_mean_orig = df["amount_due"].mean()
        amt_mean_anon = anon_df["amount_due"].mean()
        noise_scale = FIELD_SENSITIVITY["amount_due"] / eps

        print(
            f"  ε={eps:<5}  noise_scale=${noise_scale:>10,.0f}  "
            f"amount_due_mean: ${amt_mean_orig:>8,.2f} → ${amt_mean_anon:>8,.2f}  "
            f"late_rate={late_rate:.3f}  → {out_path.name}"
        )
        results[eps] = anon_df

    return results


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("Applying Laplace differential privacy to generated_invoices.csv")
    print(f"Epsilon values: {EPSILONS}\n")
    results = run_all_epsilons()
    print(f"\nDone. {len(results)} anonymized datasets written to data/")
