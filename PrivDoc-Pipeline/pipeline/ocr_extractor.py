"""
ocr_extractor.py  —  Stage 1 of the PrivDoc-Pipeline
Extracts structured fields from PDF invoices.

Primary method : pdfplumber  (works for text-based PDFs — all test_invoices/ PDFs)
Fallback method: pytesseract (for scanned/image-only PDFs)

Usage:
    from pipeline.ocr_extractor import extract_invoice, extract_batch

    result  = extract_invoice("../docs/test_invoices/acme_supplies_INV-2025-0841.pdf")
    results = extract_batch("../docs/test_invoices")
"""

import os
import re
import pathlib

import pdfplumber

# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------
_RE_INVOICE_NUM = re.compile(
    r'\b([A-Z]{2,}[-\u2013][A-Z0-9]+[-\u2013]\d{4}[-\u2013]\d+'
    r'|INV[-\u2013]\d{4}[-\u2013]\d+'
    r'|[A-Z]{2,}\d{4}[-\u2013]\d+)\b'
)
_RE_DATE_MDY = re.compile(
    r'\b(0?[1-9]|1[0-2])/(0?[1-9]|[12]\d|3[01])/(20\d{2})\b'
)
_RE_DATE_YMD = re.compile(
    r'\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b'
)
_RE_AMOUNT = re.compile(r'\$\s?([\d,]+\.?\d{0,2})')
_RE_TAX_ID = re.compile(r'\b([A-Z]{2}-\d{7}|\d{2}-\d{7})\b')
_RE_NET_TERMS = re.compile(
    r'\b(Net\s+(?:15|30|45|60)|Due on Receipt|Due End of (?:Month|Next Month))\b',
    re.IGNORECASE,
)
_RE_TAX_RATE = re.compile(r'(\d{1,2}(?:\.\d{1,2})?\s*%)')
_RE_LINE_ITEM = re.compile(
    r'([A-Za-z][\w\s,&/()\-]{2,40}?)\s{2,}(\d+)\s{2,}\$?\s*([\d,]+\.\d{2})\s{2,}\$?\s*([\d,]+\.\d{2})'
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_amount(s: str) -> str | None:
    if s is None:
        return None
    return s.replace(",", "").strip()


def _first_date(text: str) -> str | None:
    m = _RE_DATE_YMD.search(text)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = _RE_DATE_MDY.search(text)
    if m:
        return f"{m.group(3)}-{int(m.group(1)):02d}-{int(m.group(2)):02d}"
    return None


def _labeled_amount(text: str, label_pattern: str) -> str | None:
    pat = re.compile(label_pattern + r'[:\s]+\$?\s*([\d,]+\.?\d{0,2})', re.IGNORECASE)
    m = pat.search(text)
    return _parse_amount(m.group(1)) if m else None


def _extract_fields(raw_text: str) -> dict:
    """Parse known invoice fields from raw OCR text."""
    lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]

    # Invoice number
    invoice_number = None
    m = _RE_INVOICE_NUM.search(raw_text)
    if m:
        invoice_number = m.group(1)

    # Invoice date (first date in document)
    invoice_date = _first_date(raw_text)

    # Vendor name — first substantive line (≥4 chars, not a generic label)
    vendor_name = None
    skip = re.compile(r'^(Invoice|Bill|Date|To:|From:|Page|#)$', re.I)
    for ln in lines[:10]:
        if len(ln) >= 4 and not skip.match(ln):
            vendor_name = ln
            break

    # Vendor address — line with US state + ZIP
    vendor_address = None
    addr_re = re.compile(r'\b[A-Z]{2}\s+\d{5}\b')
    for ln in lines:
        if addr_re.search(ln):
            vendor_address = ln
            break

    # Tax ID
    tax_id = None
    m = _RE_TAX_ID.search(raw_text)
    if m:
        tax_id = m.group(1)

    # Buyer — "Bill To" section
    buyer_company = None
    buyer_address = None
    for i, ln in enumerate(lines):
        if re.match(r'bill\s*to', ln, re.I):
            buyer_company = lines[i + 1] if i + 1 < len(lines) else None
            buyer_address = lines[i + 2] if i + 2 < len(lines) else None
            break

    # Net terms
    net_terms = None
    m = _RE_NET_TERMS.search(raw_text)
    if m:
        net_terms = m.group(1)

    # Amounts
    amount_due = _labeled_amount(raw_text, r'(?:Amount\s+Due|Total\s+Due|Balance\s+Due|Total\s+Amount)')
    subtotal   = _labeled_amount(raw_text, r'(?:Sub[\s\-]?total|Net\s+Amount)')
    tax_amount = _labeled_amount(raw_text, r'(?:Tax|VAT|Sales\s+Tax)')

    # Tax rate
    tax_rate = None
    m = _RE_TAX_RATE.search(raw_text)
    if m:
        tax_rate = m.group(1).strip()

    # Fallback: largest $ amount as amount_due
    if not amount_due:
        all_amounts = _RE_AMOUNT.findall(raw_text)
        if all_amounts:
            parsed = [float(a.replace(",", "")) for a in all_amounts]
            amount_due = f"{max(parsed):.2f}"

    # Line items (best-effort regex on aligned table rows)
    line_items = []
    for m in _RE_LINE_ITEM.finditer(raw_text):
        try:
            line_items.append({
                "description": m.group(1).strip(),
                "qty":         int(m.group(2)),
                "unit_price":  float(m.group(3).replace(",", "")),
                "total":       float(m.group(4).replace(",", "")),
            })
        except (ValueError, IndexError):
            pass

    return {
        "invoice_number": invoice_number,
        "invoice_date":   invoice_date,
        "vendor_name":    vendor_name,
        "vendor_address": vendor_address,
        "vendor_tax_id":  tax_id,
        "buyer_company":  buyer_company,
        "buyer_address":  buyer_address,
        "net_terms":      net_terms,
        "subtotal":       subtotal,
        "tax_rate":       tax_rate,
        "tax_amount":     tax_amount,
        "amount_due":     amount_due,
        "line_items":     line_items,
    }


def _extract_with_pdfplumber(pdf_path: str) -> tuple[str, str]:
    text_parts = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                text_parts.append(t)
    return "\n".join(text_parts), "pdfplumber"


def _extract_with_pytesseract(pdf_path: str) -> tuple[str, str]:
    try:
        from pdf2image import convert_from_path
        import pytesseract
        images = convert_from_path(pdf_path, dpi=300)
        texts = [pytesseract.image_to_string(img) for img in images]
        return "\n".join(texts), "pytesseract"
    except ImportError as exc:
        raise RuntimeError(
            "pytesseract fallback requires pdf2image and pytesseract. "
            "Install: pip install pytesseract pdf2image"
        ) from exc


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_invoice(pdf_path: str) -> dict:
    """
    Extract structured fields from a PDF invoice.

    Args:
        pdf_path: Path to a .pdf file.

    Returns:
        JSON-serializable dict:
            source_file, raw_text, fields (dict of extracted values),
            extraction_method ("pdfplumber" or "pytesseract")
    """
    pdf_path = str(pdf_path)
    source_file = os.path.basename(pdf_path)

    raw_text, method = _extract_with_pdfplumber(pdf_path)
    if not raw_text.strip():
        raw_text, method = _extract_with_pytesseract(pdf_path)

    return {
        "source_file":        source_file,
        "raw_text":           raw_text,
        "fields":             _extract_fields(raw_text),
        "extraction_method":  method,
    }


def extract_batch(pdf_dir: str, recursive: bool = False) -> list[dict]:
    """
    Process all PDF files in a directory.

    Args:
        pdf_dir:   Directory containing .pdf files.
        recursive: Also recurse into subdirectories.

    Returns:
        List of extracted invoice dicts. Failed files include an 'error' key.
    """
    pdf_dir = pathlib.Path(pdf_dir)
    pattern = "**/*.pdf" if recursive else "*.pdf"
    results = []
    for pdf_path in sorted(pdf_dir.glob(pattern)):
        try:
            results.append(extract_invoice(str(pdf_path)))
        except Exception as exc:
            results.append({
                "source_file":       pdf_path.name,
                "error":             str(exc),
                "raw_text":          "",
                "fields":            {},
                "extraction_method": "failed",
            })
    return results


if __name__ == "__main__":
    import sys
    import json

    if len(sys.argv) < 2:
        print("Usage: python ocr_extractor.py <path/to/invoice.pdf>")
        sys.exit(1)

    result = extract_invoice(sys.argv[1])
    display = {k: v for k, v in result.items() if k != "raw_text"}
    print(json.dumps(display, indent=2))
