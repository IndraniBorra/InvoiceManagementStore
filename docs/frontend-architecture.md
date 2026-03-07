# Frontend Architecture

> React component structure, routing, data flow patterns, and API integration for the Invoice Management System.

---

## Tech Stack

- **React 19.1.0** — functional components + hooks
- **React Router 7.6.3** — client-side navigation
- **Axios 1.10.0** — API communication
- **Context API** — centralized state management
- **@xenova/transformers 2.17.2** — browser-based ML (being replaced by Claude API — see `llm-assistant-architecture-decisions.md`)

---

## Routing Structure

```
/invoice            → InvoicePage        (create mode)
/edit-invoice/:id   → InvoicePage        (edit mode)
/invoices           → AllInvoicesPage    (invoice list)
/invoice/:id        → SingleInvoicePage  (view / print)
/reports            → ReportsPage        (analytics dashboard)
/customer           → CustomerPage       (customer management)
/product            → ProductPage        (product catalog)
```

---

## Key Pages

### InvoicePage (`components/InvoicePage.jsx`)
- Primary invoice create/edit form
- Uses `CustomerSearch` and `ProductSearch` components
- Handles validation, API calls, and form state
- Detects and applies LLM pre-fill data from `location.state`
- Supports both create and edit modes via URL params

### AllInvoicesPage (`components/AllInvoicesPage.jsx`)
- Table listing all invoices
- Basic CRUD actions (View, Edit)
- Direct API calls via `apiClient.get('/invoices')`

### SingleInvoicePage (`components/SingleInvoicePage.jsx`)
- Professional invoice display
- PDF export via `html2pdf.js`
- Print-optimized styling

### ReportsPage (`pages/ReportsPage.jsx`)
- Analytics dashboard with multiple report types
- Revenue summary, aging, overdue, customer analytics
- Advanced filtering, pagination, export (CSV, Excel, PDF)

---

## Invoice Data Structure

```javascript
{
  customer_id: null,
  customer_name: '',
  customer_address: '',
  customer_phone: '',
  date_issued: '',
  invoice_terms: 'Due end of the month',
  invoice_due_date: '',
  invoice_status: 'draft',
  invoice_total: 0,
  line_items: [{
    product_id: null,
    product_description: '',
    line_items_qty: 1,
    product_price: 0,
    line_items_total: 0
  }]
}
```

---

## Component Structure

### Search System (`components/ui/search/`)
- `AutoComplete` — generic autocomplete base component
- `CustomerSearch` — pre-configured for customer lookup
- `ProductSearch` — product search with presets
- `SearchPresets` — configuration system for search variants

### Form Components (`components/ui/`)
- `Input` — standardized input with validation
- `Select` — dropdown component
- `Button` — multiple variants and sizes
- `ErrorBoundary` — error handling wrapper

### Table Components
- `LineItemsTable` — invoice line items with real-time calculations
  ```javascript
  // Props:
  { lineItems, onAddItem, onUpdateItem, onRemoveItem, errors, disabled }
  ```
- `AllInvoicesReport` — advanced filtering, pagination, status badges, export

---

## State Management

### InvoiceContext (`context/InvoiceContext.jsx`)
- Centralized invoice state with reducer pattern
- Form validation logic
- API integration methods
- Auto-calculations (totals, due dates)

### Custom Hooks (`hooks/`)
- `useCustomers.js` — customer data fetch and management
- `useProducts.js` — product catalog operations
- `useApi.js` — generic API operations with loading/error states
- `useLLMNavigation.js` — LLM-driven navigation with pre-fill data passing

---

## API Integration

### Service Layer (`services/api.js`)
```javascript
// Axios instance with interceptors
apiClient.get/post/put/delete()

// Service classes
invoiceService  = new ApiService('/invoice')
customerService = new ApiService('/customers')
productService  = new ApiService('/products')
reportApi       = new ReportApiService('/reports')
```

### API Endpoints Used
```
GET/POST  /invoice          CRUD operations
GET       /invoice/:id      Single invoice
GET       /invoices         All invoices list
GET/POST  /customers        Customer management
GET/POST  /products         Product catalog
GET       /reports/*        Various reports
```

---

## Data Flow Patterns

### Form Handling
1. Component state manages form data
2. Validation on submit and field change
3. API calls through service layer
4. Success/error handling with user feedback
5. React Router navigation after successful operations

### Search Pattern
1. AutoComplete fetches data on mount
2. Client-side filtering for performance
3. Callback-based selection handling
4. Integration with parent form state

### LLM Pre-fill Pattern
1. LLM assistant processes natural language query
2. Extracted data passed via `navigate(route, { state: { llmData } })`
3. Target page reads `location.state` on mount
4. Form fields populated from `llmData`
5. AI-populated badge shown to user

---

## Notes for LLM Integration

The frontend is well-prepared for the Claude API migration:
1. Use existing `services/api.js` — consistent patterns already in place
2. Follow established data structures — components expect specific object shapes
3. Leverage `InvoiceContext` for centralized state
4. UI components are props-driven and flexible
5. Existing error handling and validation patterns should be reused
