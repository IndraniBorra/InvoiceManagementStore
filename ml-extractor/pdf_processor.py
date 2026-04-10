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
        r"#\s+([A-Z0-9][A-Z0-9\-]+)",
        r"Invoice\s*#?\s*:?\s*((?:INV|GFC|TF|AOF|DVB|MCR|PMG|PLA|SGI|SWC|TPD|GLC|CH)[A-Z0-9\-]+)",
        r"Invoice\s+No\.?\s*:?\s*([A-Z0-9\-]+)",
        r"Invoice\s+Number\s*:?\s*([A-Z0-9\-]+)",
        r"(?:Invoice|Bill|Document)\s*#\s*([A-Z0-9\-]+)",
    ],
    "invoice_date": [
        r"Invoice\s+Date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        r"Invoice\s+Date\s*:?\s*(\d{4}-\d{2}-\d{2})",
        r"Date\s+Issued\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        r"(?:Bill|Issue)\s+Date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        r"Date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
    ],
    "due_date": [
        r"Due\s+Date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        r"Due\s+Date\s*:?\s*(\d{4}-\d{2}-\d{2})",
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
    "%d %B %Y", "%d %b %Y",
]

EMAIL_RE = re.compile(r"\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b")


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


def _extract_vendor_header(text: str) -> dict:
    result = {"vendor_name": None, "vendor_address": None, "vendor_email": None}
    lines_collected = []

    stop_labels = re.compile(
        r"Invoice\s+Date|Due\s+Date|Balance|Terms|Bill\s+To|Subtotal|Total|Payment", re.IGNORECASE
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
        if re.match(r"^(INVOICE|#|Page\s+\d|Date\b)", raw, re.IGNORECASE):
            continue
        lines_collected.append(raw)
        if len(lines_collected) >= 5:
            break

    if not lines_collected:
        return result

    for i, ln in enumerate(lines_collected):
        if not re.match(r"^\d", ln):
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
        "invoice_number": None,
        "invoice_date":   None,
        "due_date":       None,
        "vendor_name":    None,
        "vendor_email":   None,
        "vendor_address": None,
        "total_amount":   None,
        "currency":       "USD",
        "line_items":     [],
        "confidence":     0.0,
        "extractor":      "semantic",
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

        # Vendor header
        vendor_info = _extract_vendor_header(all_text)
        result.update(vendor_info)

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

        # Line items: semantic table matching first, text fallback second
        items = _extract_line_items_from_tables(all_tables)
        if not items:
            items = _extract_line_items_from_text(all_text)
            if items:
                result["extractor"] = "regex_fallback"
        result["line_items"] = items

        # Confidence: ratio of key fields successfully extracted
        found = sum(
            1 for k in ("invoice_number", "invoice_date", "due_date", "total_amount", "vendor_name")
            if result[k] is not None
        )
        result["confidence"] = round(found / 5, 2)

    except Exception as e:
        result["error"] = str(e)
        result["confidence"] = 0.0

    return result
