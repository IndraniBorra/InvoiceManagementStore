"""
Semantic field matcher using sentence-transformers (all-MiniLM-L6-v2).
Maps arbitrary invoice column headers to 32 standard invoice fields
via cosine similarity on embeddings.
"""

import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

# 32 standard invoice fields with known aliases.
# The more aliases per field, the better the semantic coverage.
STANDARD_FIELDS: dict[str, list[str]] = {
    # Document
    "invoice_number":      ["invoice number", "invoice no", "invoice #", "inv no", "inv #", "bill number", "document number", "doc no", "reference number"],
    "invoice_date":        ["invoice date", "date issued", "bill date", "date", "issue date", "billing date"],
    "due_date":            ["due date", "payment due", "pay by", "payment date", "due by", "expiry date"],
    "currency":            ["currency", "currency code", "ccy"],

    # Supplier / Sender
    "supplier_name":       ["supplier name", "vendor name", "from", "seller", "company name", "billed from", "service provider"],
    "supplier_id":         ["supplier id", "vendor id", "supplier code", "vendor code", "account number", "account no"],
    "supplier_address":    ["supplier address", "vendor address", "from address", "seller address", "remit to"],
    "supplier_tax_id":     ["tax id", "vat number", "gst number", "ein", "tax registration", "vat reg no", "abn"],

    # Customer / Recipient
    "bill_to_name":        ["bill to", "customer name", "client name", "sold to", "billed to", "ship to name", "recipient"],
    "bill_to_address":     ["bill to address", "billing address", "customer address", "ship to address"],
    "customer_id":         ["customer id", "client id", "customer code", "account id"],

    # Amounts
    "total_amount":        ["total amount", "total", "grand total", "amount due", "balance due", "invoice total", "net payable"],
    "tax_amount":          ["tax", "vat", "gst", "tax amount", "sales tax", "tax total", "hst"],
    "subtotal":            ["subtotal", "sub total", "net amount", "before tax", "taxable amount"],
    "line_amount":         ["line amount", "line total", "extended price", "ext price", "amount", "ext amount"],
    "unit_price":          ["unit price", "rate", "price", "cost", "unit cost", "each", "price per unit"],
    "discount":            ["discount", "deduction", "rebate", "discount amount", "reduction"],

    # Line Items
    "description":         ["description", "item", "service", "details", "product", "particulars", "desc", "item description", "service description"],
    "quantity":            ["quantity", "qty", "units", "count", "pcs", "nos", "number of units"],
    "item_number":         ["item number", "item no", "part number", "part no", "sku", "product code", "item code"],
    "uom":                 ["uom", "unit of measure", "unit", "measure", "unit type"],

    # Payment
    "payment_terms":       ["payment terms", "terms", "net days", "credit terms"],
    "payment_method":      ["payment method", "payment mode", "pay via", "method of payment"],
    "bank_account":        ["bank account", "account number", "bank details"],
    "iban":                ["iban", "international bank account number"],
    "swift_code":          ["swift", "bic", "swift code", "bic code"],

    # Travel / Booking
    "booking_reference":   ["booking reference", "booking number", "reservation number", "confirmation number", "booking ref", "ref no"],
    "arrival_date":        ["arrival date", "check in", "check-in", "arrival", "checkin date"],
    "departure_date":      ["departure date", "check out", "check-out", "departure", "checkout date"],
    "nights":              ["nights", "number of nights", "duration", "length of stay"],
    "hotel_name":          ["hotel name", "property", "accommodation", "hotel", "resort"],
    "guest_name":          ["guest name", "guest", "passenger", "traveler", "guest / passenger"],
    "destination":         ["destination", "location", "city", "property location", "place"],
}

# Singleton — loaded once per Lambda container lifecycle
_matcher_instance: "SemanticMatcher | None" = None


def get_matcher() -> "SemanticMatcher":
    global _matcher_instance
    if _matcher_instance is None:
        _matcher_instance = SemanticMatcher()
    return _matcher_instance


class SemanticMatcher:
    def __init__(self):
        self.model = SentenceTransformer("all-MiniLM-L6-v2")
        self._build_embeddings()

    def _build_embeddings(self):
        """Pre-compute embeddings for all field aliases at startup."""
        self._field_embeddings: dict[str, np.ndarray] = {}
        for field, aliases in STANDARD_FIELDS.items():
            self._field_embeddings[field] = self.model.encode(aliases, show_progress_bar=False)

    def match_header(self, header: str, threshold: float = 0.50) -> tuple[str | None, float]:
        """
        Match a single column header to the best standard field.

        Returns (field_name, confidence) or (None, score) if below threshold.
        """
        header_vec = self.model.encode([header.lower().strip()], show_progress_bar=False)

        best_field: str | None = None
        best_score: float = 0.0

        for field, alias_vecs in self._field_embeddings.items():
            sims = cosine_similarity(header_vec, alias_vecs)[0]
            score = float(np.max(sims))
            if score > best_score:
                best_score = score
                best_field = field

        if best_score >= threshold:
            return best_field, round(best_score, 3)
        return None, round(best_score, 3)

    def match_headers(self, headers: list[str], threshold: float = 0.50) -> dict[int, dict]:
        """
        Match a list of column headers (by index) to standard fields.

        Returns { col_index: { "field": str, "confidence": float } }
        """
        result: dict[int, dict] = {}
        for i, header in enumerate(headers):
            if not header or not str(header).strip():
                continue
            field, score = self.match_header(str(header), threshold)
            if field:
                result[i] = {"field": field, "confidence": score}
        return result
