# Semantic Field Matching for Invoice Processing

## Research Summary

This document summarizes the research and implementation of semantic field matching for dynamic invoice processing, enabling automatic detection of invoice fields across multiple suppliers and formats (Excel and PDF).

---

## Problem Statement

The existing invoice processor was hardcoded for a single supplier (Hotelbeds) with:
- Static column positions defined in YAML configuration
- Fixed header row locations
- No support for varying invoice formats
- Manual configuration required for each new supplier

**Goal:** Create a dynamic, ML-powered approach that can automatically detect and extract invoice fields from any supplier format.

---

## Research: ML Approaches Evaluated

### 1. Scikit-Learn (Traditional ML)

**Evaluated for:** Supplier classification, header row detection, column type classification

| Approach | Pros | Cons |
|----------|------|------|
| RandomForest Classifier | Handles mixed features, interpretable | Requires training data |
| Naive Bayes | Fast for text classification | Less accurate for complex patterns |
| SVM | Good accuracy with tuning | Slow training, needs feature engineering |

**Conclusion:** Requires labeled training data (50-100+ invoices per supplier). Too heavyweight for the problem.

### 2. Pre-trained Invoice Models

**Evaluated models:**

| Model | Type | Size | Best For |
|-------|------|------|----------|
| [Donut](https://huggingface.co/naver-clova-ix/donut-base) | OCR-free Vision | ~800MB | Scanned PDF images |
| [LayoutLMv3](https://huggingface.co/microsoft/layoutlmv3-base) | OCR + Layout | ~500MB | Structured documents with coordinates |
| [dmr-invoice-extractor](https://huggingface.co/rhovhannisyan/dmr-invoice-extractor) | Donut-based | ~800MB | Ready-to-use invoice extraction |
| [Qwen2.5-VL](https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct) | Vision-LLM | ~15GB | Flexible extraction with prompting |

**Conclusion:** These models are designed for image/PDF understanding. Our input is primarily Excel (already structured), making these overkill.

### 3. Sentence-Transformers (Selected Approach)

**Model:** `all-MiniLM-L6-v2`

| Aspect | Details |
|--------|---------|
| Size | ~80MB |
| Speed | ~0.01s per comparison |
| Approach | Semantic similarity via embeddings |
| Training | None required - uses pre-trained embeddings |

**Why it works:**
- Excel files already have structured data (no OCR needed)
- Problem is **semantic matching**: "Vendor ID" ↔ "Supplier Code" ↔ "Account #"
- Pre-trained embeddings understand these relationships
- Lightweight enough for Lambda deployment

---

## Implementation: Semantic Field Matcher

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Invoice Processing Pipeline                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Input (Excel/PDF)                                                  │
│       │                                                              │
│       ▼                                                              │
│   ┌──────────────────────┐                                          │
│   │ Extract Headers/Text │                                          │
│   └──────────────────────┘                                          │
│       │                                                              │
│       ▼                                                              │
│   ┌──────────────────────┐     ┌─────────────────────────────────┐ │
│   │ Semantic Matcher     │────▶│ Standard Invoice Field Database │ │
│   │ (sentence-transformers)    │ (32 field definitions)          │ │
│   └──────────────────────┘     └─────────────────────────────────┘ │
│       │                                                              │
│       ▼                                                              │
│   ┌──────────────────────┐                                          │
│   │ Field Mapping with   │                                          │
│   │ Confidence Scores    │                                          │
│   └──────────────────────┘                                          │
│       │                                                              │
│       ▼                                                              │
│   ┌──────────────────────┐                                          │
│   │ SAP BTP DOX JSON     │                                          │
│   └──────────────────────┘                                          │
└─────────────────────────────────────────────────────────────────────┘
```

### Standard Invoice Fields (32 total)

#### Document Fields
- `invoice_number`, `invoice_date`, `due_date`, `currency`

#### Supplier/Sender Fields
- `supplier_name`, `supplier_id`, `supplier_address`, `supplier_tax_id`

#### Customer/Recipient Fields
- `bill_to_name`, `bill_to_address`, `ship_to_name`, `ship_to_address`, `customer_id`

#### Amount Fields
- `total_amount`, `tax_amount`, `subtotal`, `line_amount`, `unit_price`, `discount`

#### Line Item Fields
- `line_description`, `quantity`, `item_number`, `sku`, `uom`

#### Travel/Booking Fields
- `booking_reference`, `your_reference`, `confirmation_number`
- `arrival_date`, `departure_date`, `nights`
- `destination`, `hotel_name`, `guest_name`, `room_type`, `room_rate`, `status`

#### Payment Fields
- `payment_terms`, `payment_method`, `bank_account`, `iban`, `swift_code`

### Semantic Matching Process

1. **Embed field aliases** using sentence-transformers
2. **Embed input headers** from the invoice
3. **Compute cosine similarity** between input and all aliases
4. **Select best match** above confidence threshold (0.5)
5. **Return mapping** with confidence scores

```python
# Example matching
Input: "Vendor ID"     → supplier_id    (1.00 confidence)
Input: "Check Out"     → departure_date (1.00 confidence)
Input: "Balance"       → total_amount   (0.78 confidence)
Input: "Booking Number"→ booking_reference (1.00 confidence)
```

---

## Implementation: PDF Processing

### Libraries Evaluated

| Library | Speed | Size | Strengths |
|---------|-------|------|-----------|
| pdfplumber | 0.10s | ~5MB | Tables, structured layouts |
| pymupdf4llm | 0.12s | ~15MB | Markdown output, LLM-ready |
| pypdf | 0.02s | ~2MB | Basic text extraction |
| pytesseract + pdf2image | 3-6s/page | ~150MB | Scanned PDFs (OCR) |

**Selected:** `pdfplumber` for digital PDFs (no OCR needed)

### PDF Extraction Approach

1. **Text Extraction** - Regex patterns for header fields:
   - Invoice number, date, due date
   - Supplier ID, name
   - Total amount, tax, currency

2. **Table Extraction** - Semantic matching on table headers:
   - Scan for header row (not always first row)
   - Match columns using semantic similarity
   - Extract data rows

3. **Text-based Line Items** - For invoices like STIVA:
   - Custom regex patterns for structured text
   - Extract: reference, quantity, price, dates, guest name

---

## Test Results

### Excel Invoices

| Invoice | Supplier | Header Row | Columns Matched | Confidence |
|---------|----------|------------|-----------------|------------|
| HOTELBEDS_HB120125.xlsx | Hotelbeds Group | 9 | 15/15 | 98% |
| Getaway_By_Southwest.xlsx | Getaways by Southwest | 8 | 8/8 | 97% |

### PDF Invoices

| Invoice | Supplier | Header Fields | Line Items | Notes |
|---------|----------|---------------|------------|-------|
| stiva.pdf | STIVA | 6 | 4 | Text-based extraction |
| attraction-world.pdf | Attraction World | 6 | 1 | Table-based extraction |

### Cross-Format Field Mapping

```
Field               Hotelbeds    Getaway    STIVA PDF    Attraction PDF
─────────────────────────────────────────────────────────────────────────
invoice_number      Col 3        -          ✓ (regex)    ✓ (regex)
invoice_date        Col 4        -          ✓ (regex)    ✓ (regex)
supplier_id         Col 2        -          ✓ (regex)    ✓ (regex)
arrival_date        Col 6        Col 3      ✓ (text)     ✓ (table)
departure_date      Col 7        Col 2      ✓ (text)     ✓ (table)
hotel_name          Col 12       Col 1      -            ✓ (table)
guest_name          -            Col 4      ✓ (text)     ✓ (table)
total_amount        Col 14       Col 8      ✓ (regex)    ✓ (regex)
booking_reference   Col 10       Col 6      -            ✓ (table)
```

---

## NER Pipeline vs Semantic Matching

| Aspect | NER Pipeline | Semantic Matching |
|--------|--------------|-------------------|
| **Input** | Raw text | Column headers |
| **Output** | Classified entities (ORG, DATE, MONEY) | Field mappings with confidence |
| **Model Size** | ~500MB-1GB | ~80MB |
| **Training** | Pre-trained + fine-tuning | None required |
| **Best For** | Unstructured text, scanned documents | Structured data (Excel, tables) |
| **Speed** | Slower (scans all text) | Fast (vector comparison) |

**Conclusion:** For structured invoice data (Excel/PDF tables), semantic matching is more appropriate and efficient than NER.

---

## Lambda Deployment Considerations

| Component | Package Size | Cold Start Impact |
|-----------|--------------|-------------------|
| Base Lambda | ~10MB | <1s |
| + pdfplumber | +5MB | +0.5s |
| + sentence-transformers | +150MB | +3s |
| **Total** | ~165MB | ~4s |

### Recommendations

1. **Use Lambda Layers** for ML dependencies
2. **Lazy load models** to reduce cold start for simple invoices
3. **Consider separate ML service** for high-volume processing
4. **Container deployment** if package exceeds 250MB limit

---

## Files Created

| File | Purpose | Lines |
|------|---------|-------|
| `src/semantic_matcher.py` | Semantic field matching with 32 field definitions | ~450 |
| `src/pdf_processor.py` | PDF invoice extraction with pdfplumber | ~400 |
| `src/test_semantic_matcher.py` | Test script for semantic matching | ~150 |
| `src/requirements-ml.txt` | ML dependencies (sentence-transformers) | ~5 |
| `src/requirements-pdf.txt` | PDF dependencies (pdfplumber) | ~5 |

---

## Future Enhancements

1. **OCR Support** - Add pytesseract for scanned PDFs
2. **Confidence Calibration** - Tune thresholds per supplier
3. **Field Validation** - Validate extracted values (date formats, amounts)
4. **Supplier Auto-Detection** - Expand known supplier patterns
5. **Feedback Loop** - Learn from corrections to improve matching

---

## References

- [Sentence-Transformers Documentation](https://www.sbert.net/)
- [pdfplumber GitHub](https://github.com/jsvine/pdfplumber)
- [Donut Invoice Extractor](https://huggingface.co/rhovhannisyan/dmr-invoice-extractor)
- [LayoutLM Overview](https://medium.com/@tam.tamanna18/understanding-layoutlm-85c83aa55c01)
- [Document AI on HuggingFace](https://huggingface.co/blog/document-ai)
- [7 Python PDF Extractors Tested (2025)](https://dev.to/onlyoneaman/i-tested-7-python-pdf-extractors-so-you-dont-have-to-2025-edition-akm)
