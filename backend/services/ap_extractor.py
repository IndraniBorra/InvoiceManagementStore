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
    # Bug fix: removed greedy r"#\s+([A-Z0-9][A-Z0-9\-]+)" — was capturing
    # garbage like "oice" by matching the # inside "Invoice #" itself.
    # Remaining patterns are specific enough to not false-match.
    "invoice_number": [
        # ── Labeled patterns (highest confidence) ─────────────────────────────
        # "Invoice No:", "Invoice Number:", "Invoice #:", "Invoice ID:", "Bill No."
        r"Invoice\s*(?:No\.?|Number|n[oº°]\.?|#|ID)\s*:?\s*([A-Z0-9][A-Z0-9\-\/\._]{2,24})",
        r"Bill\s+No\.?\s*:?\s*([A-Z0-9][A-Z0-9\-\/\._]{2,24})",
        r"(?:Document|Doc)\.?\s*(?:No\.?|Number|#)\s*:?\s*([A-Z0-9][A-Z0-9\-\/\._]{2,24})",
        # ── Hash-prefix style: "# TCO-2026-0039" from SmartInvoice layout ────
        # Requires ≥2 uppercase letters + mandatory separator — avoids "#oice" garbage
        r"#\s+([A-Z]{2,}[#\-\/][A-Z0-9][A-Z0-9\-\/\.]{2,22})",
        # ── Numeric-only reference (STIVA travel agency long IDs) ─────────────
        r"Reference\s+(\d{7,})",
        r"Invoice\s+(\d{7,})",
        # ── Generic alphanumeric with mandatory separator (no prefix list needed)
        # Matches: TCO-2026-0039 / SC-INV-2026-0031 / INV-CH-2026-0101 / PF-001
        # Separator is MANDATORY to avoid matching plain words; minimum 4 chars total
        r"\b([A-Z]{2,6}[#\-\/][A-Z0-9]{1,4}[#\-\/][A-Z0-9][A-Z0-9\-\/]{1,18})\b",
        # ── Simple PREFIX-NUMBER (two-part): e.g. PF-001, QT-2025, REF-00123 ─
        r"\b([A-Z]{2,6}[-\/]\d{3,10})\b",
    ],
    # Matches: "Invoice Date: 01/15/2025" or "Invoice Date : 30 Jan 2023"
    "invoice_date": [
        r"Invoice\s+Date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        r"Invoice\s+Date\s*:?\s*(\d{4}-\d{2}-\d{2})",
        r"Invoice\s+Date\s*:?\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})",
        r"Date\s+Issued\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        r"Date\s+Issued\s*:?\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})",
        r"Date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
    ],
    # Matches: "Due Date: 02/14/2025" or "Due Date : 01 Mar 2023"
    "due_date": [
        r"Due\s+Date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        r"Due\s+Date\s*:?\s*(\d{4}-\d{2}-\d{2})",
        r"Due\s+Date\s*:?\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})",
        r"Payment\s+Due\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        r"Pay\s+By\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
    ],
    # Bug fix: added generic total pattern without requiring $ sign
    # covers invoices that show amounts as "50,426.00" without currency prefix
    "total_amount": [
        r"Balance\s+Due\s*:?\s*[\$€£]?\s*([\d,]+\.\d{2})",
        r"Amount\s+Due\s*:?\s*[\$€£]?\s*([\d,]+\.\d{2})",
        r"Grand\s+Total\s*:?\s*[\$€£]?\s*([\d,]+\.\d{2})",
        r"TOTAL\s+DUE\s*:?\s*[\$€£]?\s*([\d,]+\.\d{2})",
        r"Total\s+Amount\s*:?\s*[\$€£]?\s*([\d,]+\.\d{2})",
        r"Total\s*:\s*[\$€£]?\s*([\d,]+\.\d{2})",
    ],
    "currency": [
        r"Currency\s*:?\s*([A-Z]{3})",
        r"\b(USD|EUR|GBP|CAD|AUD|INR)\b",
    ],
}

# Email pattern used to find vendor email in the header block
EMAIL_RE = re.compile(r"\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b")

# Explicit vendor label patterns — checked before layout heuristic
VENDOR_LABEL_RE = re.compile(
    r"^(?:From|Vendor|Supplier|Company|Billed\s+[Bb]y|Issued\s+[Bb]y|Sender)\s*:?\s*([^\n\r]{2,80})$",
    re.IGNORECASE | re.MULTILINE,
)

DATE_FORMATS = [
    "%m/%d/%Y", "%d/%m/%Y", "%Y-%m-%d",
    "%m-%d-%Y", "%d-%m-%Y",
    "%m/%d/%y", "%d/%m/%y",
    "%B %d, %Y", "%b %d, %Y",
    "%d %b %Y", "%d %B %Y",
]

# Column aliases for line item table header matching
COLUMN_ALIASES = {
    "description": ["description", "item", "service", "details", "product", "particulars", "desc"],
    "quantity":    ["quantity", "qty", "units", "count", "no.", "nos", "pcs", "hours", "hrs"],
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

    Priority:
    1. Explicit vendor label ("From:", "Vendor:", "Billed by:", etc.) in first 25 lines
    2. Layout heuristic: first non-numeric line block at top of page

    pdfplumber sometimes merges both header columns onto one line, so we
    strip trailing 'INVOICE' / '# INV-...' artifacts.
    """
    result = {"vendor_name": None, "vendor_address": None, "vendor_email": None}

    # Strategy 1: look for an explicit vendor label in the first 25 lines
    top_text = "\n".join(text.splitlines()[:25])
    m = VENDOR_LABEL_RE.search(top_text)
    if m:
        candidate = m.group(1).strip()
        # Strip trailing invoice number artifacts
        candidate = re.sub(r"\s+#\s+[A-Z0-9\-]+\s*$", "", candidate)
        candidate = re.sub(r"\s+INVOICE\s*$", "", candidate, flags=re.IGNORECASE).strip()
        # Reject pure numeric values — those are account/vendor IDs, not names
        if candidate and len(candidate) >= 2 and not re.match(r"^\d+$", candidate):
            result["vendor_name"] = candidate[:100]

    lines_collected = []

    # stop_labels: lines that signal end of vendor header block
    # "Sender"/"Recipient" catch STIVA two-column layout header
    # "Invoice\s+\d" catches "Invoice 7092603004665" page headers
    # NOTE: "Balance Due" in Zoho format appears BEFORE vendor name — do not stop
    # on "Balance" alone. Only stop if the line has a dollar amount (real total line).
    stop_labels = re.compile(
        r"Invoice\s+Date|Invoice\s+No|Invoice\s+#|Invoice\s+\d"
        r"|Due\s+Date|Balance\s+Due\s*[\$€£\d]|Terms|Bill\s+To|Subtotal|Total\s*[\$€£\d]"
        r"|^Recipient\b|Header\s+Info|Reference\s+\d",
        re.IGNORECASE,
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
        # Skip pure-label lines: "INVOICE", "#", "Page", standalone "Balance Due",
        # standalone "Amount Due", and pure currency amount lines like "$10,080.00"
        if re.match(r"^(INVOICE|#|Page\s+\d|Date\b|Balance\s+Due\s*$|Amount\s+Due\s*$|\$[\d,])", raw, re.IGNORECASE):
            continue
        lines_collected.append(raw)
        if len(lines_collected) >= 5:
            break

    if not lines_collected:
        return result

    # First non-numeric line → vendor name (only if label strategy didn't find it)
    remaining = []
    for i, ln in enumerate(lines_collected):
        if not re.match(r"^\d", ln):
            if not result["vendor_name"]:
                result["vendor_name"] = ln[:100]
            remaining = lines_collected[i + 1:]
            break

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
    Parse line items from text. Tries two formats:

    SmartInvoice format (generated invoices):
        1 Office Paper A4 (Box of 500) 20 pcs $45.00 $900.00

    STIVA travel-agency format:
        SWV000B0 439YI0ZLTY STAY /AD/DBEB/TI 1.000 days Unit Price 102.470 102.470
    """
    items = []

    # SmartInvoice: index + description + qty pcs + $rate + $amount
    smartinvoice = re.compile(
        r"^\d+\s+(.+?)\s+(\d+)\s+pcs\s+\$([\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})\s*$",
        re.MULTILINE,
    )
    for m in smartinvoice.finditer(text):
        items.append({
            "description": m.group(1).strip(),
            "quantity":    float(m.group(2)),
            "unit_price":  _extract_amount(m.group(3)),
            "line_total":  _extract_amount(m.group(4)),
        })
    if items:
        return items

    # STIVA travel format: supplier_ref client_ref description qty days Unit Price rate total
    stiva = re.compile(
        r"^\S+\s+\S+\s+"                          # supplier ref + client ref
        r"(STAY\s+\S+)\s+"                         # description (e.g. STAY /AD/DBEB/TI)
        r"([\d.]+)\s+days\s+Unit Price\s+"         # quantity in days
        r"([\d.]+)\s+([\d.]+)",                    # unit price + line total
        re.MULTILINE,
    )
    for m in stiva.finditer(text):
        items.append({
            "description": m.group(1).strip(),
            "quantity":    float(m.group(2)),
            "unit_price":  float(m.group(3)),
            "line_total":  float(m.group(4)),
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

    # Bug fix: pdfplumber sometimes merges the grand total row value into every
    # line item's line_total column, producing identical values on all rows.
    # Detect this: if all line_totals are identical and > any unit_price, clear them.
    if len(items) > 1:
        totals = [i.get("line_total") for i in items if i.get("line_total") is not None]
        if totals and len(set(totals)) == 1:
            max_unit = max((i.get("unit_price") or 0) for i in items)
            if totals[0] > max_unit * 1.5:
                for i in items:
                    i.pop("line_total", None)

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
        "invoice_number":  None,
        "invoice_date":    None,
        "due_date":        None,
        "vendor_name":     None,
        "vendor_email":    None,
        "vendor_address":  None,
        "total_amount":    None,
        "currency":        "USD",
        "bill_to_name":    None,
        "bill_to_address": None,
        "payment_terms":   None,
        "subtotal":        None,
        "tax_amount":      None,
        "po_number":       None,
        "line_items":      [],
        "confidence":      0.0,
        "field_confidence": {},
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

        # Bug fix: if total_amount still not found, sum line_totals as fallback
        if not result["total_amount"] and items:
            s = sum(i.get("line_total") or 0 for i in items)
            if s > 0:
                result["total_amount"] = round(s, 2)

        # Additional fields: bill_to, payment_terms, subtotal, tax, PO number
        EXTRA_PATTERNS = {
            # Bill To: match same-line value, but reject if it looks like a merged
            # column artifact containing invoice date/terms labels
            "bill_to_name":  [
                # Same-line value (reject merged-column artifacts)
                r"Bill\s+To\s*:?\s*((?!.*(?:Invoice\s+Date|Due\s+Date|Terms?\s*:|Balance|\$[\d,]))[^\n\r]{2,80})",
                # Next-line value: when Bill To: header shares line with Invoice Date etc.
                r"Bill\s+To\s*[^\n]*\n([A-Za-z][^\n\r]{1,79})",
            ],
            "payment_terms": [r"(?:Payment\s+)?Terms\s*:?\s*([A-Za-z0-9][A-Za-z0-9 \-\/]{1,38})"],
            "subtotal":      [r"Subtotal\s*:?\s*[\$€£]?\s*([\d,]+\.\d{2})"],
            "tax_amount":    [r"(?:Tax|VAT|GST|HST)\s*:?\s*[\$€£]?\s*([\d,]+\.\d{2})"],
            "po_number":     [r"P\.?O\.?\s*(?:Number|#|No\.?)\s*:?\s*([A-Z0-9\-]{3,})"],
        }
        for field, patterns in EXTRA_PATTERNS.items():
            for pattern in patterns:
                m = re.search(pattern, all_text, re.IGNORECASE)
                if m:
                    raw = m.group(1).strip()
                    if field in ("subtotal", "tax_amount"):
                        result[field] = _extract_amount(raw)
                    else:
                        result[field] = raw
                    break

        # Clean up bill_to_name: strip merged-column artifacts like "SmartInvoiceInc Terms: Net 30"
        if result["bill_to_name"]:
            cleaned = re.split(
                r'\s{2,}|\s+(?=(?:Terms?|Invoice\s+Date|Due\s+Date|Balance|PO\s*#|Net\s+\d)\s*:)',
                result["bill_to_name"], maxsplit=1, flags=re.IGNORECASE
            )[0].strip()
            if cleaned:
                result["bill_to_name"] = cleaned

        # bill_to_address: lines following the extracted name, cleaned of merged-column artefacts
        if result["bill_to_name"]:
            block_m = re.search(
                re.escape(result["bill_to_name"]) + r"[^\n]*\n((?:[^\n]+\n){1,5})",
                all_text, re.IGNORECASE
            )
            if block_m:
                addr_lines = []
                for ln in block_m.group(1).splitlines():
                    # Trim right-column keywords merged by pdfplumber (single-space separated)
                    left = re.split(
                        r'\s+(?=(?:Terms?|Due\s+Date|Invoice\s+Date|Balance|Net\s+\d)\s*:)',
                        ln, maxsplit=1, flags=re.IGNORECASE
                    )[0].strip()
                    # Also split on 2+ spaces (cleaner two-column layout)
                    left = re.split(r'\s{2,}', left)[0].strip()
                    # Stop at line-item table headers or empty
                    if not left or re.search(r'(?:^#\s+Desc|^Description\b)', left, re.IGNORECASE):
                        break
                    addr_lines.append(left)
                if addr_lines:
                    result["bill_to_address"] = ", ".join(addr_lines)[:200]

        # Per-field confidence dict (1.0 = extracted, 0.0 = missing)
        CONFIDENCE_FIELDS = ["invoice_number", "invoice_date", "due_date", "vendor_name",
                             "total_amount", "bill_to_name", "payment_terms", "subtotal"]
        result["field_confidence"] = {
            k: 1.0 if result.get(k) is not None else 0.0
            for k in CONFIDENCE_FIELDS
        }

        # Overall confidence score (core 5 fields)
        found = sum(1 for k in ("invoice_number", "invoice_date", "due_date", "total_amount", "vendor_name")
                    if result[k] is not None)
        result["confidence"] = round(found / 5, 2)

    except Exception as e:
        result["error"] = str(e)
        result["confidence"] = 0.0

    return result
