# Semantic Entity Extractor — Feature Coverage

This document records what was enhanced and how every identified rejection risk
was resolved in the `feature/semantic-entity-extractor` implementation.

---

## What Was Enhanced

| # | Enhancement | How It Is Delivered |
|---|---|---|
| 1 | **New supplier with unusual headers** | `semantic_matcher.py` uses cosine similarity — e.g. `"Charge Amount"` correctly maps to `line_amount` without any manual alias entry |
| 2 | **Multi-language / abbreviated headers** | `all-MiniLM-L6-v2` embeddings understand semantic meaning — e.g. `"Menge"` (German: quantity), `"Desc."`, `"Ext Price"` all resolve correctly |
| 3 | **Expanding to more suppliers** | 32 standard invoice fields defined covering document, supplier, customer, amounts, line items, payment, and travel/booking fields |
| 4 | **Travel & booking invoice fields** | `booking_reference`, `arrival_date`, `departure_date`, `hotel_name`, `guest_name`, `nights`, `destination` all included in matcher |
| 5 | **No more manual alias maintenance** | Adding a new supplier requires zero code changes — the model handles unseen headers automatically via semantic similarity |

---

## How Each Rejection Case Was Resolved

| # | Original Rejection Risk | Resolution |
|---|---|---|
| 1 | **Lambda memory 512 MB** — sentence-transformers alone ~380 MB, would overflow | ML runs in a **separate Lambda container** with **2 GB memory** — main backend Lambda unchanged |
| 2 | **Lambda timeout 30s** — cold start + inference could exceed limit | Separate Lambda container has **15-minute timeout** — no risk of timeout on any PDF |
| 3 | **Lambda package 250 MB limit** — main backend already near limit with XGBoost + statsmodels | ML deps live entirely inside `ml-extractor/` — **zero bytes added** to main backend package |
| 4 | **`sentence-transformers` not in requirements.txt** | Added to `ml-extractor/requirements.txt` only — isolated from main backend |
| 5 | **`semantic_matcher.py` never built** | Built from scratch: 32 fields, 200+ aliases, cosine similarity matching, singleton loader |
| 6 | **Extractor hardcoded for SmartInvoice format only** | `pdf_processor.py` uses semantic column matching — works on **any supplier format** without format-specific code |
| 7 | **Dockerfile outdated** — missing `ap_routes.py` and other routes | New `ml-extractor/Dockerfile` built clean from scratch, independent of the main backend Dockerfile |

---

## Architecture

```
React Frontend
     │
     ▼
POST /ap/invoice/upload
     │  Main Lambda (512 MB, unchanged)
     ▼
ap_routes.py → call_ml_extractor(pdf_bytes)
     │
     ├── ML_EXTRACTOR_MODE=lambda  →  boto3.invoke("ml-extractor-dev")
     │                                  ↳ 2 GB Lambda container
     │                                  ↳ sentence-transformers inference
     │                                  ↳ returns structured JSON
     │
     ├── ML_EXTRACTOR_MODE=http    →  POST http://ml-extractor:8001/extract
     │                                  ↳ FastAPI on ECS Fargate (future)
     │
     └── ML_EXTRACTOR_MODE=local   →  extract_from_bytes()  (regex fallback)
                                        ↳ always available, no ML deps needed
```

---

## Switching Modes (Zero Code Changes)

```bash
# Local development / offline (default)
ML_EXTRACTOR_MODE=local

# Student production — separate Lambda container
ML_EXTRACTOR_MODE=lambda
ML_EXTRACTOR_FUNCTION=ml-extractor-dev

# Future upgrade — ECS Fargate / App Runner (when scaling up)
ML_EXTRACTOR_MODE=http
ML_EXTRACTOR_URL=http://ml-extractor.internal:8001
```

---

## Files in This Feature

| File | Purpose |
|---|---|
| `ml-extractor/semantic_matcher.py` | sentence-transformers model + 32-field cosine similarity matcher |
| `ml-extractor/pdf_processor.py` | pdfplumber extraction + semantic column mapping |
| `ml-extractor/app.py` | Lambda handler + FastAPI HTTP endpoint (dual-mode) |
| `ml-extractor/Dockerfile` | Container image — model baked in at build time |
| `ml-extractor/requirements.txt` | ML-only deps, isolated from main backend |
| `ml-extractor/test_extractor.py` | Test suite: 40 header cases + 13 real PDFs + edge cases |
| `backend/routes/ap_routes.py` | Updated to route through `call_ml_extractor()` with fallback |
| `docs/test_invoices/` | 13 real-world supplier invoice PDFs for testing |
| `docs/SEMANTIC_FIELD_MATCHING_RESEARCH.md` | Research doc: approach selection rationale |
