"""
AP Invoice extraction service.
Extracts structured invoice data from PDFs using pdfplumber + regex.
Patterns tuned to match SmartInvoice AR invoice format.
"""

import re
from datetime import datetime, date
from io import BytesIO
from typing import Optional

try:
    import pdfplumber
    PDFPLUMBER_AVAILABLE = True
except ImportError:
    PDFPLUMBER_AVAILABLE = False


# ── Regex patterns tuned for SmartInvoice format ──────────────────────────────

INVOICE_PATTERNS = {
    # Matches: "# INV-2025-0841" or "# GFC-INV-2025-1193"
    "invoice_number": [
        r"#\s+([A-Z0-9][A-Z0-9\-]+)",
        r"Invoice\s*#?\s*:?\s*((?:INV|GFC|TF)[A-Z0-9\-]+)",
        r"Invoice\s+Number\s*:?\s*([A-Z0-9\-]+)",
        r"INV[#\-]?\s*([A-Z0-9\-]+)",
    ],
    # Matches: "Invoice Date: 01/15/2025"
    "invoice_date": [
        r"Invoice\s+Date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        r"Invoice\s+Date\s*:?\s*(\d{4}-\d{2}-\d{2})",
        r"Date\s+Issued\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        r"Date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
    ],
    # Matches: "Due Date: 02/14/2025"
    "due_date": [
        r"Due\s+Date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        r"Due\s+Date\s*:?\s*(\d{4}-\d{2}-\d{2})",
        r"Payment\s+Due\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        r"Pay\s+By\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
    ],
    # Matches: "Balance Due $4,428.50" or "Total: $4,428.50"
    "total_amount": [
        r"Balance\s+Due\s*:?\s*\$?\s*([\d,]+\.\d{2})",
        r"Total\s*:\s*\$?\s*([\d,]+\.\d{2})",
        r"Amount\s+Due\s*:?\s*\$?\s*([\d,]+\.\d{2})",
        r"Grand\s+Total\s*:?\s*\$?\s*([\d,]+\.\d{2})",
        r"TOTAL\s+DUE\s*:?\s*\$?\s*([\d,]+\.\d{2})",
    ],
    "currency": [
        r"Currency\s*:?\s*([A-Z]{3})",
        r"\b(USD|EUR|GBP|CAD|AUD|INR)\b",
    ],
}

# Email pattern used to find vendor email in the header block
EMAIL_RE = re.compile(r"\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b")

DATE_FORMATS = [
    "%m/%d/%Y", "%d/%m/%Y", "%Y-%m-%d",
    "%m-%d-%Y", "%d-%m-%Y",
    "%m/%d/%y", "%d/%m/%y",
    "%B %d, %Y", "%b %d, %Y",
]

# Column aliases for line item table header matching
COLUMN_ALIASES = {
    "description": ["description", "item", "service", "details", "product", "particulars", "desc"],
    "quantity":    ["quantity", "qty", "units", "count", "no.", "nos", "pcs"],
    "unit_price":  ["unit price", "unit cost", "rate", "price", "cost", "unit", "each"],
    "line_total":  ["amount", "total", "line total", "line amount", "subtotal", "ext price", "extended"],
}


def _normalize_date(date_str: str) -> Optional[date]:
    """Parse a date string and return a date object (not a string)."""
    if not date_str:
        return None
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(date_str.strip(), fmt).date()
        except ValueError:
            continue
    return None


def _extract_amount(s: str) -> Optional[float]:
    if not s:
        return None
    cleaned = re.sub(r"[^\d.]", "", str(s))
    try:
        return float(cleaned) if cleaned else None
    except ValueError:
        return None


def _match_column(header: str) -> Optional[str]:
    h = header.lower().strip()
    for field, aliases in COLUMN_ALIASES.items():
        if any(alias in h or h in alias for alias in aliases):
            return field
    return None


def _extract_vendor_header(text: str) -> dict:
    """
    Extract vendor name, address, and email from the top of the PDF.

    In SmartInvoice format the header layout (left column) is:
        Vendor Name
        Street Address
        City, State ZIP
        vendor@email.com
    pdfplumber sometimes merges both header columns onto one line, so we
    strip trailing 'INVOICE' / '# INV-...' artifacts.
    """
    result = {"vendor_name": None, "vendor_address": None, "vendor_email": None}
    lines_collected = []

    stop_labels = re.compile(
        r"Invoice\s+Date|Due\s+Date|Balance|Terms|Bill\s+To|Subtotal|Total", re.IGNORECASE
    )

    for line in text.splitlines():
        raw = line.strip()
        if not raw:
            continue
        if stop_labels.search(raw):
            break
        # Clean pdfplumber column-merging artefacts
        raw = re.sub(r"\s+INVOICE\s*$", "", raw, flags=re.IGNORECASE)
        raw = re.sub(r"\s+#\s+[A-Z0-9\-]+\s*$", "", raw)   # strip "# INV-..."
        raw = raw.strip()
        if not raw or len(raw) < 2:
            continue
        # Skip pure-label lines like "INVOICE", "#", "Page"
        if re.match(r"^(INVOICE|#|Page\s+\d|Date\b)", raw, re.IGNORECASE):
            continue
        lines_collected.append(raw)
        if len(lines_collected) >= 5:
            break

    if not lines_collected:
        return result

    # First non-numeric line → vendor name
    for i, ln in enumerate(lines_collected):
        if not re.match(r"^\d", ln):
            result["vendor_name"] = ln[:100]
            remaining = lines_collected[i + 1:]
            break
    else:
        remaining = []

    # Remaining lines: look for email, treat others as address
    addr_parts = []
    for ln in remaining:
        m = EMAIL_RE.search(ln)
        if m and not result["vendor_email"]:
            result["vendor_email"] = m.group(1)
        else:
            addr_parts.append(ln)

    # Also scan the full text block for an email if not found in header lines
    if not result["vendor_email"]:
        for line in text.splitlines()[:15]:
            m = EMAIL_RE.search(line.strip())
            if m and "induborra09" not in m.group(1):  # skip bill-to email
                result["vendor_email"] = m.group(1)
                break

    if addr_parts:
        result["vendor_address"] = ", ".join(addr_parts)[:200]

    return result


def _extract_line_items_from_text(text: str) -> list:
    """
    Parse line items directly from text for the SmartInvoice format where
    pdfplumber collapses table columns into a single cell per row.

    Expected row format (produced by generate.py):
        1 Office Paper A4 (Box of 500) 20 pcs $45.00 $900.00
    """
    items = []
    # Match: <index> <description> <qty> pcs $<rate> $<amount>
    pattern = re.compile(
        r"^\d+\s+"                       # row index
        r"(.+?)\s+"                      # description (non-greedy)
        r"(\d+)\s+pcs\s+"               # qty
        r"\$([\d,]+\.\d{2})\s+"         # rate
        r"\$([\d,]+\.\d{2})\s*$",       # amount
        re.MULTILINE,
    )
    for m in pattern.finditer(text):
        items.append({
            "description": m.group(1).strip(),
            "quantity":    float(m.group(2)),
            "unit_price":  _extract_amount(m.group(3)),
            "line_total":  _extract_amount(m.group(4)),
        })
    return items


def _extract_line_items_from_tables(tables: list) -> list:
    items = []
    for table in tables:
        if not table or len(table) < 2:
            continue

        header_row_idx = None
        col_map = {}
        for row_idx, row in enumerate(table[:4]):
            if not row:
                continue
            mapping = {}
            for col_idx, cell in enumerate(row):
                if cell:
                    field = _match_column(str(cell))
                    if field and field not in mapping.values():
                        mapping[col_idx] = field
            if len(mapping) >= 2:
                header_row_idx = row_idx
                col_map = mapping
                break

        if header_row_idx is None or not col_map:
            continue

        for row in table[header_row_idx + 1:]:
            if not row or not any(row):
                continue
            row_text = " ".join(str(c) for c in row if c)
            if re.search(r"\b(total|grand total|subtotal|balance due|balance)\b", row_text, re.IGNORECASE):
                continue

            item = {}
            for col_idx, field in col_map.items():
                if col_idx < len(row) and row[col_idx]:
                    raw = str(row[col_idx]).strip()
                    if field in ("quantity", "unit_price", "line_total"):
                        item[field] = _extract_amount(raw)
                    else:
                        item[field] = raw

            if item.get("description") or item.get("line_total"):
                items.append(item)

    return items


def extract_from_bytes(pdf_bytes: bytes) -> dict:
    """
    Extract invoice fields from PDF bytes.

    Returns a dict with keys:
        invoice_number, invoice_date (date obj), due_date (date obj),
        vendor_name, total_amount, currency,
        line_items: list of {description, quantity, unit_price, line_total},
        confidence: float (0.0 – 1.0)
    """
    if not PDFPLUMBER_AVAILABLE:
        return {"error": "pdfplumber not installed", "confidence": 0.0, "line_items": []}

    result = {
        "invoice_number": None,
        "invoice_date": None,
        "due_date": None,
        "vendor_name": None,
        "vendor_email": None,
        "vendor_address": None,
        "total_amount": None,
        "currency": "USD",
        "line_items": [],
        "confidence": 0.0,
    }

    try:
        with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
            all_text = ""
            all_tables = []

            for page in pdf.pages:
                text = page.extract_text() or ""
                all_text += text + "\n"
                tables = page.extract_tables() or []
                for t in tables:
                    if t and len(t) > 1:
                        all_tables.append(t)

        # Vendor header: name, email, address
        vendor_info = _extract_vendor_header(all_text)
        result["vendor_name"]    = vendor_info["vendor_name"]
        result["vendor_email"]   = vendor_info["vendor_email"]
        result["vendor_address"] = vendor_info["vendor_address"]

        # Header fields via regex
        for field, patterns in INVOICE_PATTERNS.items():
            for pattern in patterns:
                m = re.search(pattern, all_text, re.IGNORECASE)
                if m:
                    raw = m.group(1).strip()
                    if field == "invoice_number":
                        result["invoice_number"] = raw
                    elif field == "invoice_date":
                        result["invoice_date"] = _normalize_date(raw)
                    elif field == "due_date":
                        result["due_date"] = _normalize_date(raw)
                    elif field == "total_amount":
                        result["total_amount"] = _extract_amount(raw)
                    elif field == "currency":
                        result["currency"] = raw.upper()
                    break

        # Line items: try structured tables first, fall back to text parsing
        items = _extract_line_items_from_tables(all_tables)
        if not items:
            items = _extract_line_items_from_text(all_text)
        result["line_items"] = items

        # Confidence score
        found = sum(1 for k in ("invoice_number", "invoice_date", "due_date", "total_amount", "vendor_name")
                    if result[k] is not None)
        result["confidence"] = round(found / 5, 2)

    except Exception as e:
        result["error"] = str(e)
        result["confidence"] = 0.0

    return result
