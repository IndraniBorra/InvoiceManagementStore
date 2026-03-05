# LLM Assistant — Architecture Research & Decisions

> Reference document capturing all approaches explored, what was ruled out, and the final decided stack.
> Date: 2026-03-04

---

## What the LLM Assistant Is Trying to Do

Let users operate the invoice app using plain English instead of clicking menus.

**Examples:**
- "Show me invoice #45" → navigates to `/invoice/45`
- "Create a customer named John at john@acme.com" → opens customer form pre-filled
- "Which customers are at risk of going overdue?" → AI analyzes data, returns insight

**Current goal:** Navigation + form pre-fill
**Upcoming goals:** Revenue forecasting, at-risk customer detection, product relationship analysis

---

## Approaches Explored

### ❌ Approach 1 — Keep Current Browser Model Pipeline
**Stack:** DistilBERT ONNX + DistilGPT-2 + Regex, via `@xenova/transformers` in browser

**Ruled out because:**
- 50–100MB model download on every app load = bad UX
- 12-class classifier is rigid — new actions need retraining + redeployment
- DistilGPT-2 produces unreliable structured output
- Cannot handle analytical queries (forecasting, at-risk scoring)
- All ML logic in frontend = bloated bundle, hard to iterate on

---

### ✅ Approach 2 — Claude API (adopted as reasoning brain)
**Stack:** `POST /assistant/query` FastAPI route → Claude Haiku (tool_use) → structured JSON action → frontend navigates

**Why adopted:**
- Best NLU + entity extraction — no regex needed
- `tool_use` gives guaranteed structured JSON output
- ~$0.00025/query with Haiku (effectively free for internal tooling)
- Handles ambiguous queries, edge cases, and complex analytical reasoning
- Adding new actions = update tool schema only, no retraining

**Limitation as standalone:**
- Claude alone can't store state or run ML models
- For forecasting features, needs a data layer (Knowledge Graph) + tool layer (MCP Fusion)

---

### ❌ Approach 3 — MCP Fusion + SLM (ruled out as standalone)
**Stack:** Qwen 2.5 7B or Phi-3.5 Mini via Ollama + MCP Fusion TypeScript server

**Why not standalone:**
- SLMs struggle with complex reasoning (at-risk scoring, multi-hop queries)
- Requires GPU hardware to run well
- Adds Node.js service alongside existing Python FastAPI — two backends
- Less accurate than Claude for entity extraction edge cases

**MCP Fusion IS adopted in Phase 2** as the tool orchestration layer.
- Apache 2.0, free, TypeScript
- Action Consolidation: groups all app actions behind 1 MCP tool — reduces SLM/LLM tool-selection hallucination by 10x
- Works with Claude, GPT, Gemini, or any MCP-compatible LLM

---

### ✅ Approach 4 — Knowledge Graph + GraphRAG (deferred to Phase 2)
**Stack:** Neo4j (graph DB) + GraphRAG pattern (LLM queries graph, reasons over results)

**Ruled out for Phase 1 because:**
- Overkill for navigation + form pre-fill
- Adds infrastructure complexity before it's needed

**Essential for Phase 2 because:**
- Revenue forecasting per customer/product → graph + time-series over invoice nodes
- At-risk customer detection → traverse payment history relationships
- Product relationship analysis → co-purchase pattern queries

**What GraphRAG means here:**
Claude queries Neo4j → gets structured relationship data → reasons over it → returns natural language insight.
This is NOT hallucination — Claude grounds answers in real graph data.

```
User: "Which customers are at risk of going overdue?"
  → Claude calls graph_query tool
  → Neo4j returns payment history per customer
  → Claude analyzes: "3 customers flagged: Acme Corp (87% risk)..."
```

---

## Final Decided Architecture

### Phase 1 — NOW (Replace Browser Models)

```
React Frontend (LLMAssistant.jsx)
        ↓  POST /assistant/query  { query: "..." }
FastAPI Backend  →  Claude Haiku API (tool_use)
        ↓  { action, route, extractedData }
Frontend executes navigation via useLLMNavigation.js
```

**Files changing:**
| File | Change |
|------|--------|
| `backend/routes/assistant.py` | NEW — Claude tool_use endpoint |
| `backend/requirements.txt` | Add `anthropic` |
| `backend/api.py` | Register assistant route |
| `frontend/src/components/LLMAssistant.jsx` | Replace entire inference pipeline with one `axios.post` |
| `frontend/package.json` | Remove `@xenova/transformers` |

**Files staying:**
| File | Reason |
|------|--------|
| `frontend/src/hooks/useLLMNavigation.js` | Navigation logic still valid |
| `backend/routes/report_routes.py` | Unchanged |
| `frontend/src/services/EntityExtractor.js` | Retire — Claude handles extraction |

**Models to remove:**
- `frontend/public/models/` — entire directory (no longer needed)

---

### Phase 2 — NEXT (Forecasting + GraphRAG)

```
React Frontend
        ↓
Claude API (Haiku: navigation | Sonnet: analytics)
        ↓  tool calls
MCP Fusion Server (TypeScript)
  ├── navigate_app     → React Router
  ├── graph_query      → Neo4j
  ├── forecast_query   → FastAPI /reports/forecast
  └── at_risk_score    → FastAPI /reports/at-risk
        ↓                      ↓
     Neo4j                 FastAPI
  (graph store)         (CRUD + ML/stats)
```

**New infrastructure:**
- Neo4j (local Docker or Neo4j Aura free tier)
- MCP Fusion server (small TypeScript service, runs alongside FastAPI)
- FastAPI routes: `GET /reports/forecast`, `GET /reports/at-risk`
- Data sync: PostgreSQL → Neo4j on invoice create/update

**Graph schema:**
```
(Customer)-[:HAS_INVOICE]->(Invoice)-[:CONTAINS]->(LineItem)-[:FOR_PRODUCT]->(Product)
(Invoice)-[:HAS_STATUS]->(Status)
(Customer)-[:PAYMENT_PATTERN]->(PaymentScore)
```

---

## Summary Table

| Approach | Phase | Decision | Reason |
|----------|-------|----------|--------|
| Browser DistilBERT ONNX | - | ❌ Remove | Slow load, rigid, unreliable |
| Browser DistilGPT-2 | - | ❌ Remove | Poor structured output |
| Regex EntityExtractor | - | ❌ Retire | Claude handles this better |
| Claude API (Haiku) | 1 | ✅ Use | Best NLU, cheap, instant |
| Claude API (Sonnet) | 2 | ✅ Use | Complex reasoning for analytics |
| MCP Fusion Server | 2 | ✅ Use | Tool orchestration layer |
| SLM via Ollama | - | ❌ Skip | GPU dependency, weaker reasoning |
| Neo4j Knowledge Graph | 2 | ✅ Use | Required for GraphRAG |
| GraphRAG pattern | 2 | ✅ Use | Grounds Claude in real data |
| FastAPI (existing) | 1+2 | ✅ Keep | CRUD + new ML routes |
| useLLMNavigation.js | 1+2 | ✅ Keep | Navigation logic is fine |

---

## Phase 1 Implementation Steps

1. Add `anthropic` to `backend/requirements.txt`
2. Create `backend/routes/assistant.py` with Claude `tool_use` endpoint
3. Register route in `backend/api.py`
4. Simplify `LLMAssistant.jsx` — replace `determineAPIAction()` + model loading with one `axios.post('/assistant/query')`
5. Remove browser model loading code entirely
6. Remove `@xenova/transformers` from `frontend/package.json`
7. Test queries: `"show invoice #5"`, `"create customer named John at john@acme.com"`, `"show overdue invoices"`

---

## Backlog Mapping (from `docs/report-backlog.md`)

> Cross-referencing the full feature backlog against the architecture to know what needs what.

### Features unlocked by Phase 1 (Claude API assistant) — no extra backend work
The LLM assistant can navigate to any existing report page via natural language once Phase 1 ships:
- "Show me revenue trends" → `/reports`
- "Show overdue invoices" → `/reports?view=overdue`
- "Open customer report for Acme Corp" → `/reports/customer/:id`

---

### Features that need only FastAPI (SQL) — no Graph/ML needed
These are pure aggregations, can be built independently of Neo4j. Quick wins:

| Backlog Feature | Backlog Phase | What it needs |
|---|---|---|
| Daily/Monthly/Yearly Revenue Trends | Phase 2 | SQL `GROUP BY date` |
| Monthly Revenue Trends (12-month chart) | Phase 2 | SQL aggregation |
| Payment Velocity Report | Phase 2 | `AVG(date_paid - date_issued)` |
| Collection Rate Analysis | Phase 2 | `COUNT(paid) / COUNT(all)` |
| Cash Flow Forecast | Phase 2 | Sum of expected payments by due date |
| Customer Lifetime Value | Phase 3 | `SUM(revenue) per customer` |
| New vs Returning Customers | Phase 3 | First invoice date check |
| Product Revenue Contribution | Phase 4 | `SUM per product / total` |
| Year-over-Year / Month-over-Month Growth | Phase 5 | SQL date math |
| Advanced Filtering + Custom Date Ranges | Phase 7 | FastAPI query params |
| Excel Export Templates | Phase 7 | `openpyxl` library in FastAPI |

**Build these before Neo4j. No infrastructure changes needed.**

---

### Features that genuinely need the Knowledge Graph (Neo4j)
SQL alone can't handle these — they require relationship traversal across entities:

| Backlog Feature | Backlog Phase | Why Graph is needed |
|---|---|---|
| **Customer Churn Prediction** | Phase 3 | Payment pattern history across time — graph traversal |
| **Customer Payment Behavior Scoring** | Phase 3 | Multi-hop: customer → invoices → payment timings |
| **High-Risk Customer Dashboard** | Phase 3 | Aggregate risk score from payment relationships |
| **Credit Risk Assessment** | Phase 3 | Payment history scoring across invoice graph |
| **Product Bundle Analysis** | Phase 4 | Co-occurrence: products appearing together in invoices |
| **Revenue Forecasting** | Phase 2/5 | Seasonal patterns over customer-product-time graph |
| **Cyclical Pattern Recognition** | Phase 5 | Time-series edges on the graph |
| **Trend Forecasting** | Phase 5 | Future predictions from graph history |

---

### Features that need Claude Sonnet + GraphRAG (the full stack)
Truly intelligent features — natural language answers grounded in real graph data, not hallucinations:

| Backlog Feature | Backlog Phase | What Claude does |
|---|---|---|
| **Customer Churn Prediction** | Phase 3 | "Acme Corp missed 3 of last 5 payments — 78% churn risk" |
| **Monthly Business Review** | Phase 6 | Auto-generates executive summary from graph data |
| **Scenario Planning / What-if** | Phase 6 | "If you switch to Net 15 terms, projected cash flow is..." |
| **Price Optimization Suggestions** | Phase 4 | Reasons over product performance + demand patterns |
| **Predictive Analytics** | Phase 6 | ML-backed predictions explained in plain language |
| **Performance Alert System** | Phase 6 | "Revenue dropped 18% — here are the likely causes" |

---

## Final Approach — Full Roadmap

```
NOW          → Phase 1: Claude Haiku API replaces browser models
               Quick win: assistant works instantly, no model loading

NEXT (1-2mo) → Simple SQL report routes in FastAPI
               Daily trends, payment velocity, CLV, YoY growth
               No new infrastructure needed

AFTER THAT   → Phase 2: Neo4j + MCP Fusion + Claude Sonnet
               Forecasting, at-risk scoring, product bundles
               GraphRAG for intelligent natural language insights

FUTURE       → Executive dashboard, scenario planning, mobile
               (Backlog Phases 6–8)
```

### Technology per layer — final answer

| Layer | Technology | When |
|---|---|---|
| NLU + reasoning | Claude Haiku (navigation) / Sonnet (analytics) | Phase 1 onwards |
| Tool orchestration | MCP Fusion (TypeScript) | Phase 2 onwards |
| Graph data store | Neo4j | Phase 2 onwards |
| Analytics / ML | FastAPI Python routes | Phase 1.5 (SQL) → Phase 2 (ML) |
| Frontend navigation | React + useLLMNavigation.js (keep as-is) | Now |
| CRUD backend | FastAPI (keep as-is) | Now |
| Browser ML models | ❌ Removed entirely | — |
