# Video 1 — From English Sentence to Structured Action
**Title:** "I added AI to my app. The responses were useless. Here's what I did."
**Duration:** ~1 min | **Tone:** Real engineer, problem-first, technical but human

---

## Script

---

**[0:00–0:10] — HOOK**
*Screen: Chat widget open on the invoice app*

> "I added an AI chat to my invoice app. It worked. Claude responded. Problem was — the response was just... text. And text is useless to a running app."

---

**[0:10–0:25] — THE PROBLEM**
*Screen: Show a plain text AI response like "Sure! I'll create an invoice for John..." — useless string, app does nothing*

> "You can't call `navigate('/invoice')` from a sentence. You can't pre-fill a React form from prose. The AI is talking — but the app has no idea what to do with it."

---

**[0:25–0:45] — THE OUTPUT (tease the solution)**
*Screen: Type in chat — "Create an invoice for John, 3 laptops at $999"*
*Screen: Flip to the Network tab / terminal — show the raw API response:*

```json
{
  "action": "create_invoice_with_data",
  "extracted_data": {
    "customer_name": "John",
    "line_items": [
      { "product_description": "Laptop", "lineitem_qty": 3, "product_price": 999 }
    ]
  }
}
```

> "Instead of text — I get this. Structured JSON. The action my app needs to execute, and every field already extracted. Now watch."

*Screen: Invoice form opens — fields pre-filled, blue banner appears: "Pre-filled from your request"*

> "One sentence. Full invoice. Zero manual entry."

---

**[0:45–1:00] — TEASER + CTA**
*Screen: Zoom out to show the chat widget + pre-filled form side by side*

> "The trick is in how you talk to the model — not what you ask it to do. That's a separate video. Code is linked below."

`#ClaudeAI #PromptEngineering #React #FastAPI #BuildInPublic`

---

## Screen Recording Checklist
- Network tab open in DevTools (or FastAPI logs in terminal) — to show the raw JSON response
- Chat widget visible and floating
- Invoice form ready to receive pre-fill
- Use a customer name already in the DB so the form fully resolves (e.g. "Acme Corp")
- Record at 1920x1080, browser at 110% zoom
