"""
data_generator.py
Generates 800 synthetic labeled invoice records for the PrivDoc-Pipeline ML training dataset.
Stage 4 input: XGBoost late-payment classifier.

Usage:
    cd PrivDoc-Pipeline
    python data/data_generator.py
"""

import datetime
import numpy as np
import pandas as pd

np.random.seed(42)

# ---------------------------------------------------------------------------
# Vocabulary for vendor name construction
# ---------------------------------------------------------------------------
ADJECTIVES = [
    "Acme", "Global", "Summit", "Swift", "Apex", "Delta", "Prime",
    "Elite", "Alpha", "Pacific", "Metro", "Pioneer", "Bright", "Nexus",
    "Vanguard", "Sterling", "Pinnacle", "Horizon", "Beacon", "Titan",
]
NOUNS = [
    "Supplies", "Tech", "Freight", "Consulting", "Solutions", "Systems",
    "Cloud", "Data", "Energy", "Legal", "Medical", "Marketing", "Parts",
    "Logistics", "Security", "Capital", "Partners", "Ventures", "Labs", "Works",
]
SUFFIXES = ["Inc", "LLC", "Corp", "Group", "Co"]
CATEGORIES = ["Technology", "Manufacturing", "Services", "Retail", "Healthcare"]
US_STATES = ["TX", "CA", "NY", "FL", "IL", "OH", "GA", "WA", "CO", "AZ"]
STREET_NAMES = [
    "Commerce Blvd", "Industrial Dr", "Tech Park Way", "Market St",
    "Enterprise Ave", "Business Pkwy", "Corporate Ln", "Innovation Rd",
    "Trade Center Dr", "Venture Blvd",
]
CITIES = [
    "Dallas", "Houston", "Austin", "Los Angeles", "San Francisco",
    "New York", "Miami", "Chicago", "Atlanta", "Seattle",
]
TAX_RATES = [6.25, 7.0, 7.5, 8.0, 8.25, 8.5, 9.0]
PAYMENT_DUE_DAYS_OPTIONS = [15, 30, 45, 60]

# ---------------------------------------------------------------------------
# Build vendor lookup (100 vendors, deterministic with seed=42)
# ---------------------------------------------------------------------------
NUM_VENDORS = 100


def _build_vendors() -> dict:
    """Return dict mapping vendor_id -> {name, address, email, tax_id, category}."""
    vendors = {}
    used_names = set()

    # Generate all adjective+noun combos, shuffle deterministically
    combos = [(adj, noun) for adj in ADJECTIVES for noun in NOUNS]
    idx = np.random.permutation(len(combos))[:NUM_VENDORS]

    for i in range(NUM_VENDORS):
        vid = f"V{i + 1:03d}"
        adj, noun = combos[idx[i]]
        suffix = SUFFIXES[np.random.randint(len(SUFFIXES))]
        name = f"{adj} {noun} {suffix}"
        # Guarantee uniqueness (fallback: append number)
        if name in used_names:
            name = f"{adj} {noun} {i + 1} {suffix}"
        used_names.add(name)

        # Address
        street_num = np.random.randint(100, 9999)
        street = STREET_NAMES[np.random.randint(len(STREET_NAMES))]
        city = CITIES[np.random.randint(len(CITIES))]
        state = US_STATES[np.random.randint(len(US_STATES))]
        zip_code = f"{np.random.randint(10000, 99999)}"
        address = f"{street_num} {street}, {city}, {state} {zip_code}"

        # Email derived from vendor name
        slug = name.lower().replace(" ", "-").replace(".", "")
        domain_parts = slug.split("-")
        domain = f"{domain_parts[0]}-{domain_parts[1]}.com" if len(domain_parts) >= 2 else f"{slug}.com"
        email = f"billing@{domain}"

        # Tax ID: XX-1234567
        letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        tax_prefix = letters[np.random.randint(26)] + letters[np.random.randint(26)]
        tax_number = f"{np.random.randint(1000000, 9999999)}"
        tax_id = f"{tax_prefix}-{tax_number}"

        category = CATEGORIES[np.random.randint(len(CATEGORIES))]

        vendors[vid] = {
            "vendor_name": name,
            "vendor_address": address,
            "vendor_email": email,
            "tax_id": tax_id,
            "vendor_category": category,
        }
    return vendors


# ---------------------------------------------------------------------------
# Generate invoice dates (800 records)
# ---------------------------------------------------------------------------
NUM_RECORDS = 800
DATE_START = datetime.date(2022, 1, 1)
DATE_END = datetime.date(2024, 12, 31)
DATE_START_ORD = DATE_START.toordinal()
DATE_END_ORD = DATE_END.toordinal()


def _generate_invoice_numbers(invoice_dates: list) -> list:
    """Assign INV-YYYY-NNNN sequentially within each year, sorted by date."""
    # pair (date, original_index) → sort → assign number
    indexed = sorted(enumerate(invoice_dates), key=lambda x: x[1])
    year_counters: dict[int, int] = {}
    result = [""] * len(invoice_dates)
    for orig_idx, d in indexed:
        yr = d.year
        year_counters[yr] = year_counters.get(yr, 0) + 1
        result[orig_idx] = f"INV-{yr}-{year_counters[yr]:04d}"
    return result


# ---------------------------------------------------------------------------
# Main generation
# ---------------------------------------------------------------------------
def generate() -> pd.DataFrame:
    vendors = _build_vendors()
    vendor_ids = list(vendors.keys())  # V001–V100

    rows = []
    invoice_dates_raw = [
        datetime.date.fromordinal(np.random.randint(DATE_START_ORD, DATE_END_ORD + 1))
        for _ in range(NUM_RECORDS)
    ]
    invoice_numbers = _generate_invoice_numbers(invoice_dates_raw)

    for i in range(NUM_RECORDS):
        invoice_date = invoice_dates_raw[i]

        # Vendor (consistent per vendor_id)
        vid = vendor_ids[np.random.randint(NUM_VENDORS)]
        vinfo = vendors[vid]

        # Payment terms
        payment_due_days = int(np.random.choice(PAYMENT_DUE_DAYS_OPTIONS))
        net_terms = f"Net {payment_due_days}"
        due_date = invoice_date + datetime.timedelta(days=payment_due_days)

        # Financials
        num_line_items = int(np.random.randint(1, 21))
        subtotal = round(float(np.random.uniform(500, 50000)), 2)
        tax_rate = float(np.random.choice(TAX_RATES))
        tax_amount = round(subtotal * tax_rate / 100, 2)
        amount_due = round(subtotal + tax_amount, 2)

        # Payment outcome — probability of late payment driven by real features
        # so that XGBoost can actually learn a meaningful classifier.
        base_prob = 0.20
        # Tight deadlines → harder to pay on time
        if payment_due_days == 15:
            base_prob += 0.20
        elif payment_due_days == 30:
            base_prob += 0.10
        # Large invoices → finance approval delays
        if amount_due > 40_000:
            base_prob += 0.15
        elif amount_due > 25_000:
            base_prob += 0.08
        # More line items → more processing time
        if num_line_items > 15:
            base_prob += 0.08
        elif num_line_items > 10:
            base_prob += 0.04
        # Vendor category risk profiles
        category = vinfo["vendor_category"]
        cat_risk = {
            "Healthcare":     0.10,
            "Manufacturing":  0.06,
            "Retail":         0.02,
            "Services":       0.00,
            "Technology":    -0.05,
        }
        base_prob += cat_risk.get(category, 0.0)
        # Seasonal effect — Q4 year-end crunch
        if invoice_date.month in (11, 12):
            base_prob += 0.08
        # Clamp to [0.05, 0.90]
        late_prob = float(np.clip(base_prob, 0.05, 0.90))

        is_late_flag = np.random.random() < late_prob
        if is_late_flag:
            late_days = int(np.random.randint(1, 46))
            payment_received_date = due_date + datetime.timedelta(days=late_days)
        else:
            payment_received_date = due_date

        is_late = 1 if payment_received_date > due_date else 0

        rows.append({
            # Invoice identity
            "invoice_number": invoice_numbers[i],
            "invoice_date": invoice_date.strftime("%Y-%m-%d"),
            "invoice_month": invoice_date.month,
            "due_date": due_date.strftime("%Y-%m-%d"),
            "net_terms": net_terms,
            "payment_due_days": payment_due_days,
            "currency": "USD",
            # Vendor
            "vendor_id": vid,
            "vendor_name": vinfo["vendor_name"],
            "vendor_address": vinfo["vendor_address"],
            "vendor_email": vinfo["vendor_email"],
            "tax_id": vinfo["tax_id"],
            "vendor_category": vinfo["vendor_category"],
            # Buyer (constant)
            "buyer_company": "SmartInvoiceInc",
            "buyer_address": "100 Commerce Blvd, Dallas, TX 75201",
            # Financials
            "num_line_items": num_line_items,
            "subtotal": subtotal,
            "tax_rate": tax_rate,
            "tax_amount": tax_amount,
            "amount_due": amount_due,
            # Outcome
            "payment_received_date": payment_received_date.strftime("%Y-%m-%d"),
            "is_late": is_late,
        })

    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    df = generate()

    output_path = "data/generated_invoices.csv"
    df.to_csv(output_path, index=False)

    late_count = int(df["is_late"].sum())
    total = len(df)
    print(f"Total records: {total}")
    print(f"Late invoices: {late_count}")
    print(f"Late percentage: {late_count / total * 100:.1f}%")
    print(f"Saved to {output_path}")
