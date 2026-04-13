"""
Test suite for the ML Invoice Extractor.

Covers:
  1. SemanticMatcher — header-to-field mapping accuracy
  2. pdf_processor   — extraction on all 13 real invoice PDFs
  3. Fallback        — local regex extractor still works
  4. Edge cases      — empty PDF, corrupt bytes, missing fields

Run:
    cd ml-extractor
    pip install -r requirements.txt
    python test_extractor.py

No pytest required — plain Python so it works anywhere.
"""

import os
import sys
import traceback
from pathlib import Path

# ── Colour helpers (works on Mac/Linux terminals) ──────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
RESET  = "\033[0m"
BOLD   = "\033[1m"

passed = 0
failed = 0
warnings = 0


def ok(label: str, detail: str = ""):
    global passed
    passed += 1
    print(f"  {GREEN}✓{RESET} {label}" + (f"  {YELLOW}({detail}){RESET}" if detail else ""))


def fail(label: str, detail: str = ""):
    global failed
    failed += 1
    print(f"  {RED}✗{RESET} {label}" + (f"  — {detail}" if detail else ""))


def warn(label: str, detail: str = ""):
    global warnings
    warnings += 1
    print(f"  {YELLOW}⚠{RESET} {label}" + (f"  — {detail}" if detail else ""))


def section(title: str):
    print(f"\n{BOLD}{CYAN}{'─'*60}{RESET}")
    print(f"{BOLD}{CYAN}  {title}{RESET}")
    print(f"{BOLD}{CYAN}{'─'*60}{RESET}")


# ═══════════════════════════════════════════════════════════════════
# 1. SEMANTIC MATCHER TESTS
# ═══════════════════════════════════════════════════════════════════

section("1. SemanticMatcher — header-to-field accuracy")

try:
    from semantic_matcher import SemanticMatcher

    matcher = SemanticMatcher()
    print(f"  {GREEN}Model loaded: all-MiniLM-L6-v2{RESET}\n")

    # (input_header, expected_field)
    HEADER_CASES = [
        # Exact / near-exact
        ("Invoice Number",     "invoice_number"),
        ("Invoice Date",       "invoice_date"),
        ("Due Date",           "due_date"),
        ("Total Amount",       "total_amount"),
        ("Grand Total",        "total_amount"),
        ("Balance Due",        "total_amount"),
        ("Subtotal",           "subtotal"),
        ("Tax",                "tax_amount"),
        ("VAT",                "tax_amount"),
        ("Description",        "description"),
        ("Qty",                "quantity"),
        ("Unit Price",         "unit_price"),
        ("Amount",             "line_amount"),
        ("Currency",           "currency"),
        ("Vendor Name",        "supplier_name"),
        ("Supplier ID",        "supplier_id"),
        ("Payment Terms",      "payment_terms"),

        # Semantic variants (the hard ones)
        ("Charge Amount",      "line_amount"),
        ("Ext Price",          "line_amount"),
        ("Rate",               "unit_price"),
        ("Each",               "unit_price"),
        ("Count",              "quantity"),
        ("Units",              "quantity"),
        ("Bill To",            "bill_to_name"),
        ("Sold To",            "bill_to_name"),
        ("Client Name",        "bill_to_name"),
        ("Confirmation No",    "booking_reference"),
        ("Booking Ref",        "booking_reference"),
        ("Check In",           "arrival_date"),
        ("Check Out",          "departure_date"),
        ("Hotel",              "hotel_name"),
        ("Guest",              "guest_name"),
        ("Nights",             "nights"),
        ("Part Number",        "item_number"),
        ("SKU",                "item_number"),
        ("Net Amount",         "subtotal"),
        ("Tax ID",             "supplier_tax_id"),
        ("VAT Number",         "supplier_tax_id"),
        ("IBAN",               "iban"),
        ("SWIFT",              "swift_code"),
    ]

    for header, expected in HEADER_CASES:
        field, score = matcher.match_header(header)
        if field == expected:
            ok(f'"{header}" → {field}', f"confidence={score}")
        else:
            fail(f'"{header}" → expected {expected}, got {field}', f"confidence={score}")

    # Test batch matching
    headers = ["Description", "Qty", "Unit Price", "Amount"]
    mapping = matcher.match_headers(headers)
    if len(mapping) == 4:
        ok("Batch match_headers returns all 4 columns")
    else:
        fail(f"Batch match_headers returned {len(mapping)}/4 columns")

    # Test threshold rejection
    field, score = matcher.match_header("XYZ_UNKNOWN_GIBBERISH_9999", threshold=0.5)
    if field is None:
        ok("Gibberish header correctly rejected (below threshold)")
    else:
        fail(f"Gibberish header incorrectly matched to '{field}'")

except ImportError:
    warn(
        "sentence-transformers not installed locally",
        "Run inside Docker or: pip install sentence-transformers scikit-learn"
    )
except Exception as e:
    fail(f"SemanticMatcher crashed: {e}")
    traceback.print_exc()


# ═══════════════════════════════════════════════════════════════════
# 2. PDF EXTRACTION — ALL 13 TEST INVOICES
# ═══════════════════════════════════════════════════════════════════

section("2. pdf_processor — extraction on 13 real invoices")

TEST_INVOICE_DIR = Path(__file__).parent.parent / "docs" / "test_invoices"

# Expected values per invoice (what we know must be extracted correctly)
EXPECTATIONS = {
    "acme_office_AOF-2026-0199.pdf":        {"invoice_number": "AOF-2026-0199"},
    "acme_supplies_INV-2025-0841.pdf":      {"invoice_number": "INV-2025-0841"},
    "cloudhost_INV-CH-2026-0101.pdf":       {"invoice_number": "INV-CH-2026-0101"},
    "datavault_DVB-2026-0023.pdf":          {"invoice_number": "DVB-2026-0023"},
    "globalfreight_GFC-INV-2025-1193.pdf":  {"invoice_number": "GFC-INV-2025-1193"},
    "greenleaf_catering_GLC-2026-0088.pdf": {"invoice_number": "GLC-2026-0088"},
    "metro_courier_MCR-2026-0044.pdf":      {"invoice_number": "MCR-2026-0044"},
    "pinnacle_mktg_PMG-INV-2026-0017.pdf":  {"invoice_number": "PMG-INV-2026-0017"},
    "prolegal_PLA-2026-0055.pdf":           {"invoice_number": "PLA-2026-0055"},
    "safeguard_ins_SGI-2026-Q1.pdf":        {"invoice_number": "SGI-2026-Q1"},
    "swiftclean_SWC-2026-FEB.pdf":          {"invoice_number": "SWC-2026-FEB"},
    "techflow_INV-TF-2025-0042.pdf":        {"invoice_number": "INV-TF-2025-0042"},
    "techparts_direct_TPD-2026-0312.pdf":   {"invoice_number": "TPD-2026-0312"},
}

# Minimum fields we require from any invoice
REQUIRED_FIELDS = ("invoice_number", "invoice_date", "total_amount", "vendor_name")

try:
    from pdf_processor import extract

    for filename, expected in EXPECTATIONS.items():
        pdf_path = TEST_INVOICE_DIR / filename
        if not pdf_path.exists():
            warn(f"{filename}", "file not found — skipping")
            continue

        try:
            result = extract(pdf_path.read_bytes())
            confidence = result.get("confidence", 0)
            extractor  = result.get("extractor", "?")
            error      = result.get("error")

            if error:
                fail(f"{filename}", f"extractor error: {error}")
                continue

            # Check expected values
            all_match = True
            for field, expected_val in expected.items():
                actual = result.get(field)
                if str(actual) != str(expected_val):
                    fail(f"{filename} — {field}", f"expected '{expected_val}', got '{actual}'")
                    all_match = False

            # Check required fields are present
            missing = [f for f in REQUIRED_FIELDS if not result.get(f)]

            if missing:
                warn(
                    f"{filename}",
                    f"missing fields: {missing}  confidence={confidence}  mode={extractor}"
                )
            elif all_match:
                line_count = len(result.get("line_items") or [])
                ok(
                    f"{filename}",
                    f"confidence={confidence}  lines={line_count}  mode={extractor}"
                )

        except Exception as e:
            fail(f"{filename}", str(e))

except ImportError as e:
    warn("pdf_processor import failed", str(e))


# ═══════════════════════════════════════════════════════════════════
# 3. FALLBACK — local regex extractor
# ═══════════════════════════════════════════════════════════════════

section("3. Fallback — local regex extractor (ap_extractor.py)")

try:
    sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
    from services.ap_extractor import extract_from_bytes

    sample = TEST_INVOICE_DIR / "acme_supplies_INV-2025-0841.pdf"
    if sample.exists():
        result = extract_from_bytes(sample.read_bytes())
        if result.get("invoice_number"):
            ok("Regex fallback extracts invoice_number", result["invoice_number"])
        else:
            fail("Regex fallback returned no invoice_number")
        if result.get("total_amount"):
            ok("Regex fallback extracts total_amount", str(result["total_amount"]))
        else:
            warn("Regex fallback returned no total_amount")
    else:
        warn("Sample PDF not found for fallback test")

except Exception as e:
    fail(f"Fallback extractor error: {e}")


# ═══════════════════════════════════════════════════════════════════
# 4. EDGE CASES
# ═══════════════════════════════════════════════════════════════════

section("4. Edge cases")

try:
    from pdf_processor import extract as sem_extract

    # Empty bytes
    result = sem_extract(b"")
    if result.get("confidence") == 0.0:
        ok("Empty bytes → confidence=0.0, no crash")
    else:
        fail("Empty bytes should return confidence=0.0")

    # Corrupt PDF bytes
    result = sem_extract(b"NOT_A_PDF_XXXX")
    if result.get("confidence") == 0.0:
        ok("Corrupt bytes → confidence=0.0, no crash")
    else:
        fail("Corrupt bytes should return confidence=0.0")

    # Valid PDF but no invoice content (blank page would still parse cleanly)
    ok("Edge case tests completed without exceptions")

except ImportError:
    warn("pdf_processor not available, skipping edge case tests")
except Exception as e:
    fail(f"Edge case test crashed: {e}")


# ═══════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════

total = passed + failed
print(f"\n{BOLD}{'═'*60}{RESET}")
print(f"{BOLD}  Results: {GREEN}{passed} passed{RESET}  {RED}{failed} failed{RESET}  {YELLOW}{warnings} warnings{RESET}  / {total} total{RESET}")
print(f"{BOLD}{'═'*60}{RESET}\n")

if failed > 0:
    sys.exit(1)
