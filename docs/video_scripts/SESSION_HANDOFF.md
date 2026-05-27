# Session Handoff — LinkedIn Video Series

## What We're Doing
Building a LinkedIn video content series to showcase the Invoice Management System project for job hunting. Each video is ~1 minute. Problem-first, technically oriented, real-person tone.

## Project
Full-stack Invoice Management System:
- React frontend + FastAPI backend + AWS Lambda (container image)
- Claude AI assistant (Haiku model, tool use, 22 actions)
- Double-entry accounting, SARIMA + XGBoost ML forecasting
- Plaid bank integration, AP PDF invoice processing
- PrivDoc differential privacy pipeline (CS 6349 project)

Key files:
- `backend/routes/assistant.py` — Claude API integration, tool definitions
- `backend/routes/forecasting_routes.py` — SARIMA + XGBoost
- `backend/routes/accounting_routes.py` — double-entry journal entries
- `backend/routes/ap_routes.py` — PDF invoice processing pipeline
- `frontend/invoicemanagement-app/src/components/LLMAssistant.jsx` — chat widget
- `frontend/invoicemanagement-app/src/pages/InvoicePage.jsx` — invoice form with AI pre-fill

## Content Plan
Full 21-video plan is in: `docs/linkedin_video_plan.md`
- Topic Area 1: How plain English becomes computer actions (Videos 1–3)
- Topic Area 2: Claude API in this project (Videos 4–6)
- Topic Area 3: ML model training & forecasting (Videos 7–9)
- Topic Area 4: Accounting powering the app (Videos 10–12)
- Topic Area 5: All app features walkthrough (Videos 13–18)
- Topic Area 6: Cloud & infrastructure (Videos 19–21)

## Progress So Far
- Video 1 script: DONE → `docs/video_scripts/video_01.md`

## Video 1 — VERIFIED & READY TO RECORD
**File:** `docs/video_scripts/video_01.md`
**Title:** "I added AI to my app. The responses were useless. Here's what I did."

**Confirmed screen flow (tested against source code):**
1. Purple floating chat widget (bottom-right, fixed, 400x600px, glassmorphism)
2. User types: "Create an invoice for Acme Corp, 3 laptops at $999" → hits Enter
3. Widget shows: loading dots → "Found: Acme Corp" → "Found: Laptop x3 = $2997" → "Opening invoice form..."
4. Page auto-navigates to `/invoice`
5. Form opens ALREADY pre-filled (not blank then fill)
6. Blue banner appears: "🤖 Pre-filled from your request — review and click Create Invoice when ready."
7. Show Network tab with raw JSON response:
   ```json
   { "action": "create_invoice_with_data", "extracted_data": { "customer_name": "Acme Corp", "line_items": [...] } }
   ```

**Recording checklist:**
- Use "Acme Corp" as customer (already in DB)
- Open Network tab in DevTools BEFORE typing (to capture the API response)
- Browser at 110% zoom, 1920x1080
- Run backend locally: `cd backend && python -m uvicorn main:app --reload`
- Run frontend locally: `cd frontend/invoicemanagement-app && npm start`

**LinkedIn post caption (ready to copy-paste):**
```
Built an AI assistant into my invoice app.
First attempt: Claude replied in plain text.
The app did nothing with it.

Here's the output once I fixed it — and why it matters.

Stack: React · FastAPI · Claude API (Haiku)
Full project: [GitHub link]

#ClaudeAI #PromptEngineering #FastAPI #BuildInPublic
```

## Next Video to Script
**Video 2 — "The System Prompt: 19-Step Decision Tree"**
Concept: How you teach an AI model your app's logic
- Show `backend/routes/assistant.py` system prompt (85 lines, 19 priority rules)
- Why max_tokens=256 (tool use only, no prose)
- Why tool_choice: "auto"
- This is the "how" teased at the end of Video 1

## Format for Each New Video Script
1. Problem hook (0:00–0:10)
2. The problem shown on screen (0:10–0:25)
3. The output / solution reveal (0:25–0:45)
4. Teaser for next video + CTA (0:45–1:00)
5. Screen recording checklist
6. LinkedIn post caption

Each video gets its own file: `docs/video_scripts/video_0N.md`
