# AI Assistant — Implementation & Conversational Flow

> Covers the technical implementation of the LLM-powered assistant and its conversational invoice creation workflow.
> Note: For architecture decisions and future stack (Claude API, GraphRAG, Neo4j), see `llm-assistant-architecture-decisions.md`.

---

## Overview

The AI Assistant lets users create invoices, customers, and products using natural language. It extracts entities from user input, resolves them against the existing database, and either pre-fills forms or guides users through a step-by-step conversational flow.

---

## Features Implemented

### 1. Entity Extraction & Recognition
- Extracts customer details (name, address, phone) and product details (description, quantity, price) from plain text
- Regex pattern matching for prices, quantities, emails, phones, addresses, names
- Uses exact database field names (`customer_name`, `lineitem_qty`, etc.)

### 2. Smart Entity Resolution
- **Customer Matching**: Fuzzy matching against existing customers by name and phone (80%+ confidence threshold for auto-use)
- **Product Matching**: Similarity matching for existing products by description
- **Confidence Scoring**: Returns match confidence levels
- **Creation Guidance**: Suggests creating new entities when no match found

### 3. LLM Assistant Widget (`components/LLMAssistant.jsx`)
- Entity-aware processing — detects invoice creation requests with embedded data
- Multi-step conversational flow with interactive buttons
- Fallback handling if entity extraction fails
- Comprehensive console logging for debugging

### 4. Auto-Population System
- Automatically pre-fills invoice form with extracted data
- Shows AI-populated badge with animated styling
- Maintains existing validation rules
- User can modify any auto-populated field

### 5. Conversational Guided Workflow
- Step-by-step guidance through entity resolution
- Interactive buttons (Use This Customer / Create New / Create Invoice Now)
- Confirmation dialog with full invoice summary before creation
- Return navigation after entity creation (user comes back to assistant)

### 6. Field Naming Consistency
- All frontend code uses exact database field names
- Fixed `line_items_qty` → `lineitem_qty` inconsistency
- Backward compatible with legacy API responses

---

## Conversational Flow Examples

### Example 1: Customer Not Found, Product Found

**User input:** `"Create invoice for John Smith at 123 Main St, phone 5551234567, for 5 laptops at $800 each"`

**Flow:**
```
🤖 "I found customer and product details. Let me walk you through this step by step..."

🤖 "Customer 'John Smith' (5551234567) doesn't exist yet. Here's what I extracted:
   • Name: John Smith  • Phone: 5551234567  • Address: 123 Main St
   I'll take you to create this customer with the details prefilled."
   [👉 Create Customer: John Smith]

→ (User creates customer, returns)

🤖 "✅ Found product 'Dell Laptop' @ $800.00 — Qty: 5 — Line Total: $4,000.00"

🤖 "🎉 Ready to create invoice:
   👤 John Smith | 📦 5x Dell Laptop @ $800 = $4,000 | 💰 Total: $4,000"
   [🚀 Create Invoice Now]  [📝 Review/Edit Details]
```

---

### Example 2: Similar Customer Found (Fuzzy Match)

**User input:** `"Create invoice for John R Smith for 3 custom widgets at $150 each"`

**Flow:**
```
🤖 "🤔 I found a similar customer. Is this the same person?
   • Name: John Robert Smith  • Phone: (555) 123-4567"
   [✅ Use This Customer]  [➕ Create New Customer]

→ (User clicks Use This Customer)

🤖 "📦 Product 'custom widgets' doesn't exist yet.
   Description: custom widgets | Price: $150 | Qty: 3"
   [👉 Create Product: custom widgets]

→ (User creates product, returns)

🤖 "🎉 Ready: 3x custom widgets @ $150 = $450 | Total: $450"
   [🚀 Create Invoice Now]
```

---

### Example 3: Multiple Products, Mixed Resolution

**User input:** `"Create invoice for ABC Corp for 2 servers at $2000 each and 5 keyboards at $50 each"`

**Flow:**
```
🤖 "✅ Found ABC Corporation in system."

🤖 "✅ Found Dell PowerEdge Server @ $2000 — Qty: 2 — Total: $4,000"

🤖 "🤔 Similar product found: Wireless Keyboard @ $45 (you asked for $50)"
   [✅ Use This Product]  [➕ Create New Product]

🤖 "🎉 Ready:
   • 2x Dell PowerEdge Server = $4,000
   • 5x Wireless Keyboard = $225
   💰 Total: $4,225"
   [🚀 Create Invoice Now]
```

---

## Technical Implementation

### Core Files

| File | Purpose |
|------|---------|
| `services/EntityExtractor.js` | Regex-based entity extraction (price, qty, email, phone, name, address) |
| `services/entityResolver.js` | Fuzzy matching against existing DB customers/products |
| `services/conversationalCreation.js` | Multi-step conversational flow state management |
| `components/LLMAssistant.jsx` | Main chat widget UI + processing pipeline |
| `hooks/useLLMNavigation.js` | React Router navigation with pre-fill data passing |
| `pages/InvoicePage.jsx` | LLM data detection + form auto-population |

### Conversation State
```javascript
const [conversationState, setConversationState] = useState({
  isActive: false,
  step: null,  // 'customer_resolution' | 'product_resolution' | 'final_confirmation'
  extractedEntities: null,
  resolvedCustomer: null,
  resolvedProducts: [],
  currentProductIndex: 0,
  awaitingUserChoice: false
});
```

### Progressive Flow Steps
1. **Entity Extraction** — parse customer + product details from text
2. **Customer Resolution** — find / confirm / create customer
3. **Product Resolution** — process each product individually
4. **Final Confirmation** — show complete invoice summary
5. **Invoice Creation** — navigate to form or create directly

### Database Field Names (exact match required)
```
Customer:  customer_id, customer_name, customer_address, customer_phone, customer_email
Product:   product_id, product_description, product_price
LineItem:  lineitem_qty, lineitem_total
Invoice:   customer_id, date_issued, invoice_terms, invoice_due_date, invoice_total
```

---

## Example Queries That Work

```
"Create invoice for John Smith at 123 Main St, phone 5551234567, for 5 laptops at $800 each"
"New invoice for ABC Corp phone 5551111111 for 3 monitors $300 each and 2 keyboards $50"
"Bill customer Sarah Johnson for 10 widgets at $25 per unit"
```

---

## Testing

Test cases in `utils/aiInvoiceTestExamples.js`:
- Basic invoice creation (single customer + product)
- Multiple products with different quantities/prices
- Edge cases (special characters, decimal pricing, long descriptions)
- Partial information (missing address, phone-only)
- Negative tests (queries that should fall back to regular navigation)

Run in browser console:
```javascript
import { runAIInvoiceTests } from './utils/aiInvoiceTestExamples';
runAIInvoiceTests(extractInvoiceEntities);
```

---

## Security & Validation
- Input validated against existing schemas before form population
- Parameterized queries through existing API (no SQL injection risk)
- React's built-in XSS sanitization for user inputs
- Graceful fallbacks for all failure scenarios

---

## Known Limitations & Future Direction

> The current implementation uses regex + fuzzy matching + browser ML models (DistilBERT ONNX).
> The decided future direction is to replace this with the **Claude API** for more reliable extraction.
> See `llm-assistant-architecture-decisions.md` for the full migration plan.

Current limitations:
- Regex patterns may miss unusual input formats
- DistilBERT ONNX model requires 50–100MB browser download
- Entity extraction accuracy limited vs a proper LLM
- Adding new action types requires model retraining
