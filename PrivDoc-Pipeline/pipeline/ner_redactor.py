"""
ner_redactor.py  —  Stages 2 & 3A of the PrivDoc-Pipeline
Detects PII entities in extracted invoice text (spaCy NER + regex) and
replaces them with placeholder tokens.

Defends against:
  - Attack 1: Data breach (OCR plaintext exposure)
  - Attack 2: Re-identification via categorical field fingerprinting

Redaction map:
  ORG         → [VENDOR_ORG]
  PERSON      → [PERSON]
  GPE / LOC   → [ADDRESS]
  DATE        → [DATE]
  Email       → [EMAIL]      (regex)
  Phone       → [PHONE]      (regex)
  Tax ID      → [TAX_ID]     (regex: XX-1234567 or 12-1234567)

Numerical fields (amount_due, subtotal, tax_amount) are left untouched here;
they are handled by Laplace noise in Stage 3B (dp_anonymizer.py).

Usage:
    from pipeline.ner_redactor import redact_text, redact_invoice, redact_batch
"""

import re
import copy

import spacy

# ---------------------------------------------------------------------------
# Load spaCy model once at module level
# ---------------------------------------------------------------------------
try:
    _NLP = spacy.load("en_core_web_sm")
except OSError:
    raise RuntimeError(
        "spaCy model 'en_core_web_sm' not found. "
        "Install with: python -m spacy download en_core_web_sm"
    )

# ---------------------------------------------------------------------------
# Redaction map: spaCy entity label → placeholder token
# ---------------------------------------------------------------------------
_ENTITY_TOKEN_MAP = {
    "ORG":    "[VENDOR_ORG]",
    "PERSON": "[PERSON]",
    "GPE":    "[ADDRESS]",
    "LOC":    "[ADDRESS]",
    "DATE":   "[DATE]",
}

# Regex-based patterns (applied before spaCy to catch structured PII)
_RE_EMAIL   = re.compile(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}')
_RE_PHONE   = re.compile(r'\b(?:\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}\b')
_RE_TAX_ID  = re.compile(r'\b([A-Z]{2}-\d{7}|\d{2}-\d{7})\b')

# Numerical-looking fields we deliberately do NOT redact here (left for DP stage)
_NUMERIC_LABELS = {"CARDINAL", "MONEY", "PERCENT", "QUANTITY"}


# ---------------------------------------------------------------------------
# Regex pre-pass: replace structured PII before spaCy processes the text
# ---------------------------------------------------------------------------

def _regex_redact(text: str) -> tuple[str, list[dict]]:
    """
    Replace email, phone, and tax ID patterns with tokens.
    Returns (modified_text, list of entity dicts).
    """
    entities: list[dict] = []

    def _replace(pattern: re.Pattern, token: str, label: str, t: str) -> str:
        def sub(m: re.Match) -> str:
            entities.append({
                "text":        m.group(0),
                "label":       label,
                "start":       m.start(),
                "end":         m.end(),
                "replacement": token,
            })
            return token
        return pattern.sub(sub, t)

    text = _replace(_RE_EMAIL,  "[EMAIL]",  "EMAIL",  text)
    text = _replace(_RE_PHONE,  "[PHONE]",  "PHONE",  text)
    text = _replace(_RE_TAX_ID, "[TAX_ID]", "TAX_ID", text)
    return text, entities


# ---------------------------------------------------------------------------
# spaCy NER pass
# ---------------------------------------------------------------------------

def _ner_redact(text: str) -> tuple[str, list[dict]]:
    """
    Run spaCy NER on text and replace mapped entity types with tokens.
    Works by rebuilding the string from right to left to preserve offsets.
    Returns (redacted_text, list of entity dicts).
    """
    doc = _NLP(text)
    entities: list[dict] = []

    # Collect entities that should be redacted, in reverse order
    ents_to_redact = []
    for ent in doc.ents:
        if ent.label_ in _ENTITY_TOKEN_MAP:
            token = _ENTITY_TOKEN_MAP[ent.label_]
            ents_to_redact.append((ent.start_char, ent.end_char, ent.text, ent.label_, token))

    # Replace from end to start to keep offsets valid
    result = text
    for start, end, ent_text, label, token in sorted(ents_to_redact, key=lambda x: x[0], reverse=True):
        result = result[:start] + token + result[end:]
        entities.append({
            "text":        ent_text,
            "label":       label,
            "start":       start,
            "end":         end,
            "replacement": token,
        })

    # Re-sort entities by original start position for readability
    entities.sort(key=lambda e: e["start"])
    return result, entities


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def redact_text(text: str) -> tuple[str, list[dict]]:
    """
    Redact PII from a plain text string.

    Applies regex pre-pass (email, phone, tax ID) then spaCy NER.

    Args:
        text: Raw invoice text (e.g., output of pdfplumber).

    Returns:
        (redacted_text, entities) where entities is a list of dicts:
            {text, label, start, end, replacement}
    """
    # Regex pass first (avoids spaCy misclassifying emails / tax IDs)
    text_after_regex, regex_entities = _regex_redact(text)
    # NER pass on regex-cleaned text
    redacted, ner_entities = _ner_redact(text_after_regex)
    return redacted, regex_entities + ner_entities


def redact_invoice(extracted: dict) -> dict:
    """
    Apply NER redaction to an extracted invoice dict (from ocr_extractor).

    Adds three keys to the result:
        redacted_text   — full raw_text with PII replaced by tokens
        redacted_fields — dict of field-level replacements (string fields only)
        entities_found  — flat list of all detected/redacted entities

    Numerical fields (subtotal, tax_amount, amount_due, tax_rate) are
    deliberately left as-is for Stage 3B (Laplace DP).

    Args:
        extracted: Dict returned by ocr_extractor.extract_invoice().

    Returns:
        New dict (deep copy) with redaction results added.
    """
    result = copy.deepcopy(extracted)

    raw_text = extracted.get("raw_text", "")
    redacted_text, entities = redact_text(raw_text)
    result["redacted_text"] = redacted_text
    result["entities_found"] = entities

    # Field-level redaction for string fields
    fields = extracted.get("fields", {})
    numeric_keys = {"subtotal", "tax_rate", "tax_amount", "amount_due", "line_items"}
    redacted_fields: dict = {}

    for key, value in fields.items():
        if key in numeric_keys or value is None:
            redacted_fields[key] = value  # pass through unchanged
            continue
        if isinstance(value, str):
            redacted_val, _ = redact_text(value)
            redacted_fields[key] = redacted_val
        else:
            redacted_fields[key] = value

    result["redacted_fields"] = redacted_fields
    return result


def redact_batch(extracted_list: list[dict]) -> list[dict]:
    """
    Apply redaction to a list of extracted invoice dicts.

    Args:
        extracted_list: Output of ocr_extractor.extract_batch().

    Returns:
        List of redacted invoice dicts.
    """
    return [redact_invoice(e) for e in extracted_list]


if __name__ == "__main__":
    import sys
    import json

    sample = sys.argv[1] if len(sys.argv) > 1 else (
        "Invoice from Acme Supplies Inc\n"
        "Bill To: SmartInvoiceInc, 100 Commerce Blvd, Dallas, TX 75201\n"
        "Contact: John Smith  john.smith@acme.com  (214) 555-0199\n"
        "Tax ID: AC-1234567\n"
        "Invoice Date: 03/15/2025   Net 30\n"
        "Amount Due: $4,871.25"
    )

    redacted, entities = redact_text(sample)
    print("=== Redacted Text ===")
    print(redacted)
    print("\n=== Entities Found ===")
    print(json.dumps(entities, indent=2))
