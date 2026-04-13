"""
PDF invoice extractor using pdfplumber + semantic field matching.
Handles any supplier format by matching column headers semantically
instead of relying on hardcoded alias lists.
"""

import re
from datetime import datetime, date
from io import BytesIO
from typing import Optional

import pdfplumber

from semantic_matcher import get_matcher

# ── Regex patterns for invoice header fields ───────────────────────────────────

INVOICE_PATTERNS: dict[str, list[str]] = {
    "invoice_number": [
        r"Invoice\s*(?:No\.?|Number|n[oº°]\.?|#|ID)\s*:?\s*([A-Z0-9][A-Z0-9\-\/\._]{2,24})",
        r"Bill\s+No\.?\s*:?\s*([A-Z0-9][A-Z0-9\-\/\._]{2,24})",
        r"(?:Document|Doc)\.?\s*(?:No\.?|Number|#)\s*:?\s*([A-Z0-9][A-Z0-9\-\/\._]{2,24})",
        r"#\s+([A-Z]{2,}[#\-\/][A-Z0-9][A-Z0-9\-\/\.]{2,22})",
        r"Reference\s+(\d{7,})",
        r"Invoice\s+(\d{7,})",
        r"\b([A-Z]{2,6}[#\-\/][A-Z0-9]{1,4}[#\-\/][A-Z0-9][A-Z0-9\-\/]{1,18})\b",
        r"\b([A-Z]{2,6}[-\/]\d{3,10})\b",
    ],
    "invoice_date": [
        r"Invoice\s+Date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        r"Invoice\s+Date\s*:?\s*(\d{4}-\d{2}-\d{2})",
        r"Invoice\s+Date\s*:?\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})",
        r"Date\s+Issued\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        r"Date\s+Issued\s*:?\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})",
        r"(?:Bill|Issue)\s+Date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        r"Date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
    ],
    "due_date": [
        r"Due\s+Date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        r"Due\s+Date\s*:?\s*(\d{4}-\d{2}-\d{2})",
        r"Due\s+Date\s*:?\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})",
        r"Payment\s+Due\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        r"Pay\s+By\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
    ],
    "total_amount": [
        r"Balance\s+Due\s*:?\s*\$?\s*([\d,]+\.\d{2})",
        r"Total\s+Due\s*:?\s*\$?\s*([\d,]+\.\d{2})",
        r"Amount\s+Due\s*:?\s*\$?\s*([\d,]+\.\d{2})",
        r"Grand\s+Total\s*:?\s*\$?\s*([\d,]+\.\d{2})",
        r"TOTAL\s+DUE\s*:?\s*\$?\s*([\d,]+\.\d{2})",
        r"Total\s*:\s*\$?\s*([\d,]+\.\d{2})",
        r"Net\s+Payable\s*:?\s*\$?\s*([\d,]+\.\d{2})",
    ],
    "currency": [
        r"Currency\s*:?\s*([A-Z]{3})",
        r"\b(USD|EUR|GBP|CAD|AUD|INR|SGD|AED)\b",
    ],
}

DATE_FORMATS = [
    "%m/%d/%Y", "%d/%m/%Y", "%Y-%m-%d",
    "%m-%d-%Y", "%d-%m-%Y",
    "%m/%d/%y", "%d/%m/%y",
    "%B %d, %Y", "%b %d, %Y",
    "%d %b %Y", "%d %B %Y",
]

EMAIL_RE = re.compile(r"\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b")

# Explicit vendor label patterns — checked before layout heuristic
VENDOR_LABEL_RE = re.compile(
    r"^(?:From|Vendor|Supplier|Company|Billed\s+[Bb]y|Issued\s+[Bb]y|Sender)\s*:?\s*([^\n\r]{2,80})$",
    re.IGNORECASE | re.MULTILINE,
)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _normalize_date(date_str: str) -> Optional[date]:
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


def _extract_headers_semantically(text: str) -> dict:
    """
    Extract invoice header fields by finding all label:value pairs in the PDF
    text and running each label through the semantic matcher.

    Language-agnostic: works for any language because matching is done via
    sentence-transformers embeddings, not keyword lists.

    Returns a partial dict — only fields that scored above threshold are set.
    """
    matcher = get_matcher()
    result: dict = {}

    TARGET_FIELDS = {
        "invoice_number", "invoice_date", "due_date",
        "total_amount", "currency", "supplier_name",
        "supplier_email", "payment_terms",
    }

    # Two patterns:
    # 1. Standard  "Label: value"  (colon separator)
    # 2. STIVA-style "Label  value" (2+ spaces, no colon) e.g. "Reference  7092603004665"
    pair_re = re.compile(
        r"([^\n\r:]{2,50}):\s*([^\n\r]{1,150})"          # colon-separated
        r"|^([A-Za-z][A-Za-z\s]{1,30})\s{2,}([^\n\r]{1,100})\s*$",  # space-separated
        re.MULTILINE,
    )

    for m in pair_re.finditer(text):
        # group(1)/group(2) = colon pattern; group(3)/group(4) = space pattern
        label = (m.group(1) or m.group(3) or "").strip()
        value = (m.group(2) or m.group(4) or "").strip()
        if not label or not value:
            continue

        field, score = matcher.match_header(label, threshold=0.55)
        if not field or field not in TARGET_FIELDS:
            continue
        if field in result:
            continue  # first match wins

        if field == "invoice_number":
            # Value must look like an invoice ID (alphanumeric, not a sentence)
            candidate = re.split(r"\s{2,}", value)[0].strip()
            if candidate and len(candidate) <= 40:
                result["invoice_number"] = candidate

        elif field in ("invoice_date", "due_date"):
            # Extract first date-like token from value (numeric or text-month)
            date_token = re.search(
                r"\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}"
                r"|\d{4}-\d{2}-\d{2}"
                r"|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}",
                value
            )
            if date_token:
                parsed = _normalize_date(date_token.group())
                if parsed:
                    result[field] = parsed

        elif field == "total_amount":
            amount = _extract_amount(re.sub(r"[^\d.,]", "", value))
            if amount and amount > 0:
                result["total_amount"] = amount

        elif field == "currency":
            ccy = re.search(r"\b([A-Z]{3})\b", value)
            if ccy:
                result["currency"] = ccy.group(1)

        elif field == "supplier_name":
            result["vendor_name"] = value[:100]

        elif field == "supplier_email":
            email = EMAIL_RE.search(value)
            if email:
                result["vendor_email"] = email.group(1)

    return result


def _extract_vendor_header(text: str) -> dict:
    result = {"vendor_name": None, "vendor_address": None, "vendor_email": None}

    # Strategy 1: explicit vendor label ("From:", "Vendor:", "Billed by:", etc.)
    top_text = "\n".join(text.splitlines()[:25])
    m = VENDOR_LABEL_RE.search(top_text)
    if m:
        candidate = m.group(1).strip()
        candidate = re.sub(r"\s+#\s+[A-Z0-9\-]+\s*$", "", candidate)
        candidate = re.sub(r"\s+INVOICE\s*$", "", candidate, flags=re.IGNORECASE).strip()
        # Reject pure numeric values — those are account/vendor IDs, not names
        if candidate and len(candidate) >= 2 and not re.match(r"^\d+$", candidate):
            result["vendor_name"] = candidate[:100]

    lines_collected = []

    stop_labels = re.compile(
        r"Invoice\s+Date|Invoice\s+No|Invoice\s+#|Invoice\s+\d"
        r"|Due\s+Date|Balance\s+Due\s*[\$€£\d]|Terms|Bill\s+To|Subtotal|Total\s*[\$€£\d]"
        r"|^Recipient\b|Header\s+Info|Reference\s+\d",
        re.IGNORECASE
    )

    for line in text.splitlines():
        raw = line.strip()
        if not raw:
            continue
        if stop_labels.search(raw):
            break
        raw = re.sub(r"\s+INVOICE\s*$", "", raw, flags=re.IGNORECASE)
        raw = re.sub(r"\s+#\s+[A-Z0-9\-]+\s*$", "", raw)
        raw = raw.strip()
        if not raw or len(raw) < 2:
            continue
        if re.match(r"^(INVOICE|#|Page\s+\d|Date\b|Balance\s+Due\s*$|Amount\s+Due\s*$|\$[\d,])", raw, re.IGNORECASE):
            continue
        lines_collected.append(raw)
        if len(lines_collected) >= 5:
            break

    if not lines_collected:
        return result

    remaining = []
    for i, ln in enumerate(lines_collected):
        if not re.match(r"^\d", ln):
            if not result["vendor_name"]:
                result["vendor_name"] = ln[:100]
            remaining = lines_collected[i + 1:]
            break
    else:
        remaining = []

    addr_parts = []
    for ln in remaining:
        m = EMAIL_RE.search(ln)
        if m and not result["vendor_email"]:
            result["vendor_email"] = m.group(1)
        else:
            addr_parts.append(ln)

    if not result["vendor_email"]:
        for line in text.splitlines()[:15]:
            m = EMAIL_RE.search(line.strip())
            if m:
                result["vendor_email"] = m.group(1)
                break

    if addr_parts:
        result["vendor_address"] = ", ".join(addr_parts)[:200]

    return result


def _extract_line_items_from_text(text: str) -> list:
    """Fallback: regex-based line item parsing for known text formats."""
    items = []
    pattern = re.compile(
        r"^\d+\s+(.+?)\s+(\d+)\s+pcs\s+\$([\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})\s*$",
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
    """
    Semantic column matching on table headers.
    Works for any supplier format — no hardcoded aliases.
    """
    matcher = get_matcher()
    items = []

    for table in tables:
        if not table or len(table) < 2:
            continue

        col_map: dict[int, str] = {}
        header_row_idx: Optional[int] = None

        # Scan first 4 rows for a header row
        for row_idx, row in enumerate(table[:4]):
            if not row:
                continue
            headers = [str(c).strip() if c else "" for c in row]
            matched = matcher.match_headers(headers, threshold=0.45)

            # Need at least description + one numeric field to count as header
            fields_found = {v["field"] for v in matched.values()}
            has_desc = "description" in fields_found
            has_numeric = fields_found & {"quantity", "unit_price", "line_amount", "line_total"}

            if has_desc or (len(matched) >= 2 and has_numeric):
                header_row_idx = row_idx
                col_map = {idx: info["field"] for idx, info in matched.items()}
                break

        if header_row_idx is None or not col_map:
            continue

        for row in table[header_row_idx + 1:]:
            if not row or not any(row):
                continue
            row_text = " ".join(str(c) for c in row if c)
            if re.search(r"\b(total|grand total|subtotal|balance due|balance)\b", row_text, re.IGNORECASE):
                continue

            item: dict = {}
            for col_idx, field in col_map.items():
                if col_idx < len(row) and row[col_idx]:
                    raw = str(row[col_idx]).strip()
                    if field in ("quantity", "unit_price", "line_amount", "line_total"):
                        item[field] = _extract_amount(raw)
                    else:
                        item[field] = raw

            # Normalise line_amount → line_total
            if "line_amount" in item and "line_total" not in item:
                item["line_total"] = item.pop("line_amount")

            if item.get("description") or item.get("line_total"):
                items.append(item)

    return items


# ── Main entry point ───────────────────────────────────────────────────────────

def extract(pdf_bytes: bytes) -> dict:
    """
    Extract invoice fields from raw PDF bytes using semantic field matching.

    Returns a dict with:
        invoice_number, invoice_date (date), due_date (date),
        vendor_name, vendor_email, vendor_address,
        total_amount, currency,
        line_items: list[dict],
        confidence: float (0.0 – 1.0),
        extractor: "semantic" | "regex_fallback"
    """
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
        "extractor":       "semantic",
    }

    try:
        with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
            all_text = ""
            all_tables = []

            for page in pdf.pages:
                text = page.extract_text() or ""
                all_text += text + "\n"
                for t in (page.extract_tables() or []):
                    if t and len(t) > 1:
                        all_tables.append(t)

        # Vendor header (name, email, address from top block)
        vendor_info = _extract_vendor_header(all_text)
        result.update(vendor_info)

        # Primary: semantic label:value matching (language-agnostic)
        semantic_fields = _extract_headers_semantically(all_text)
        for k, v in semantic_fields.items():
            if v is not None:
                result[k] = v

        # Fallback: regex patterns for any fields semantic matching missed
        for field, patterns in INVOICE_PATTERNS.items():
            if result.get(field):
                continue  # already found semantically
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

        # Line items: semantic table matching first, text fallback second
        items = _extract_line_items_from_tables(all_tables)
        if not items:
            items = _extract_line_items_from_text(all_text)
            if items:
                result["extractor"] = "regex_fallback"

        # Fix duplicated line_total from pdfplumber merging grand total into rows
        if len(items) > 1:
            totals = [i.get("line_total") for i in items if i.get("line_total") is not None]
            if totals and len(set(totals)) == 1:
                max_unit = max((i.get("unit_price") or 0) for i in items)
                if totals[0] > max_unit * 1.5:
                    for i in items:
                        i.pop("line_total", None)

        result["line_items"] = items

        # Sum fallback if total_amount still not found
        if not result["total_amount"] and items:
            s = sum(i.get("line_total") or 0 for i in items)
            if s > 0:
                result["total_amount"] = round(s, 2)

        # Additional fields: bill_to, payment_terms, subtotal, tax, PO number
        EXTRA_PATTERNS = {
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
            if result.get(field):
                continue
            for pattern in patterns:
                m = re.search(pattern, all_text, re.IGNORECASE)
                if m:
                    raw = m.group(1).strip()
                    if field in ("subtotal", "tax_amount"):
                        result[field] = _extract_amount(raw)
                    else:
                        result[field] = raw
                    break

        # Clean up bill_to_name: strip merged-column artifacts
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
                    left = re.split(
                        r'\s+(?=(?:Terms?|Due\s+Date|Invoice\s+Date|Balance|Net\s+\d)\s*:)',
                        ln, maxsplit=1, flags=re.IGNORECASE
                    )[0].strip()
                    left = re.split(r'\s{2,}', left)[0].strip()
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
        found = sum(
            1 for k in ("invoice_number", "invoice_date", "due_date", "total_amount", "vendor_name")
            if result[k] is not None
        )
        result["confidence"] = round(found / 5, 2)

    except Exception as e:
        result["error"] = str(e)
        result["confidence"] = 0.0

    return result
