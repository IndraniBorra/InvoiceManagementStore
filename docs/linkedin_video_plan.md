# LinkedIn Video Plan — Semantic Invoice Extraction (3 min)

## The Hook (What You're Showing)
You built an AI that reads invoices from **any vendor, any format, any language** —
and maps their fields to a standard schema automatically using semantic embeddings.
No hardcoding. No config files per vendor. Zero retraining needed.

---

## Video Structure (3 min)

### Segment 1 — The Problem (0:00–0:35)
**What to say:**
> "Most invoice processing tools break the moment a new vendor shows up with a slightly
> different format. Column called 'Qty' instead of 'Quantity'? It fails.
> Header in Spanish? It fails. Different date format? It fails.
> We solved this differently."

**What to show on screen:**
- Side-by-side of two invoices with different headers (use the Spanish hotel invoice vs your English one)
- Highlight how headers differ: "Todo incluido" vs "All Inclusive Package", "Cant/Qty" vs "Quantity"

---

### Segment 2 — How It Works (0:35–1:45)
**What to say:**
> "Instead of hardcoding field names, we use a sentence transformer model —
> all-MiniLM-L6-v2 — to embed both the invoice headers and our 32 standard field names
> into vector space. Then we find the closest match using cosine similarity.
> It doesn't care what the column is called — it understands what it *means*."

**What to show on screen:**

1. Open `ml-extractor/semantic_matcher.py`
   - Show the `STANDARD_FIELDS` dict (32 fields with aliases)
   - Zoom into `match_header()` — the core 15 lines that do the work

2. Drop into a quick terminal demo:
```bash
cd ml-extractor
python -c "
from semantic_matcher import SemanticMatcher
m = SemanticMatcher()
tests = ['Cant/Qty', 'Todo incluido', 'Fecha', 'Balance Due', 'Nº de Bono', 'Pay By']
for h in tests:
    field, score = m.match_header(h)
    print(f'{h:25} → {field:20} ({score:.0%} confidence)')
"
```
   - Show output mapping foreign/weird headers to standard fields with confidence scores

---

### Segment 3 — End-to-End Demo (1:45–2:30)
**What to say:**
> "This feeds into the AP module. Drop in a PDF invoice — from any vendor —
> and the system extracts vendor name, invoice number, dates, line items,
> total amount, and gives you a confidence score. No config. No templates."

**What to show on screen:**

1. Go to the AP Dashboard in the browser (`http://localhost:3000/ap`)
2. Upload the Spanish hotel PDF (`sample_invoice.pdf`)
3. Show the extracted result: vendor name, invoice #, total, line items, confidence score
4. Upload the English invoice you just generated (`azure_grand_hotel_INV-2026-0042.pdf`)
5. Show that it extracts correctly too — different format, same result

---

### Segment 4 — The Payoff (2:30–3:00)
**What to say:**
> "What used to take a developer a week to configure per supplier — static column maps,
> YAML files, manual testing — now works out of the box for any invoice format.
> The model runs locally, no API calls, no cost per document.
> And the confidence score tells you exactly when to flag something for human review."

**What to show on screen:**
- Pull up `backend/services/ap_extractor.py`, scroll to the `confidence` calculation (line 324)
- Show the formula: 5 key fields found = 100% confidence
- End on the AP Dashboard with both invoices processed side by side

---

## Screen Recording Setup

| Setting | Recommendation |
|---|---|
| Resolution | 1920×1080 (16:9) |
| Zoom level | Browser at 110%, VS Code font size 16+ |
| Terminal font | Large — audience watches on phones |
| Recording tool | QuickTime (Mac) → export as MP4 |
| Captions | Add via LinkedIn's built-in auto-caption after upload |

**Prep before recording:**
- [ ] Backend running: `cd backend && python -m uvicorn main:app --reload`
- [ ] Frontend running: `cd frontend/invoicemanagement-app && npm start`
- [ ] Both invoice PDFs ready in `docs/test_invoices/`
- [ ] Terminal open in `ml-extractor/` with venv activated
- [ ] VS Code open on `semantic_matcher.py` with the key lines visible

---

## Caption / Post Copy

```
Built an AI that reads invoices from ANY vendor without configuration.

Most AP automation tools break the moment a new supplier sends a differently formatted invoice.
Ours doesn't.

Using sentence-transformers (all-MiniLM-L6-v2), we map arbitrary invoice headers
to 32 standard fields via cosine similarity — no training data, no templates, no YAML configs.

"Cant/Qty" → quantity (91%)
"Todo incluido" → description (87%)
"Balance Due" → total_amount (96%)

Drop in a PDF. Get structured data. Confidence score included.

Built with: FastAPI · React · pdfplumber · sentence-transformers · SQLite

#AI #MachineLearning #FinTech #InvoiceAutomation #NLP #Python #React
```

---

## Key Technical Points to Mention (Choose 1–2)

- Model is a singleton — loaded once per Lambda container, not per request
- Threshold is configurable (default 0.50) — tune precision vs recall
- Falls back from table extraction → text regex if PDF has no structured tables
- Works on scanned invoices too if OCR is layered in
