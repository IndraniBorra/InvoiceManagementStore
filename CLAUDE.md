# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Invoice Management System (IMS) with a React frontend and FastAPI backend deployed on AWS using the Serverless Framework. The system has evolved beyond basic invoice management to include accounts payable, double-entry accounting, financial forecasting, bank integrations, and AI-powered automation.

## Architecture

### Backend (`/backend/`)
- **FastAPI** application (`main.py`) with **SQLModel** for database operations
- **SQLite** (`database.db`) for local development; **PostgreSQL** for production
- **AWS Lambda** deployment via Serverless Framework using **Mangum** adapter
- **Pydantic** models for request/response validation
- Modular route structure in `/routes/` directory
- Security middleware stack in `/middleware/` (rate limiting, input validation, error handling, security headers)

### Frontend (`/frontend/invoicemanagement-app/`)
- **React** application (Create React App)
- **React Router** for navigation
- **Axios** for API communication
- Component-based architecture with separate CSS files
- Pages in `src/pages/`: Dashboard, Invoice, Reports, APDashboard, APInvoiceList, APInvoiceDetail, APVendors, AccountingPage, ForecastingPage

### Key Models
- **Invoice**: Main invoice entity with line items and customer relationships
- **LineItem**: Individual invoice line items with product references
- **Customer**: Customer information and invoice history
- **Product**: Product catalog with descriptions and pricing
- **Company / BankAccount**: Company profile and Plaid-linked bank accounts
- **ChartOfAccount**: GL account codes (1000 Cash, 1100 AR, 2000 AP, 3000 Equity, 4000 Revenue, 5000 COGS)
- **JournalEntry**: Double-entry bookkeeping records
- **CategoryRule**: Expense auto-categorization rules with match types (contains, starts_with, exact, regex)
- **APInvoice**: Accounts payable invoices from vendors

## Development Commands

### Frontend Development
```bash
cd frontend/invoicemanagement-app
npm install          # Install dependencies
npm start            # Start development server (http://localhost:3000)
npm test             # Run test runner
npm run build        # Build for production
```

### Backend Development
```bash
cd backend
pip install -r requirements.txt          # Install Python dependencies
python -m uvicorn main:app --reload      # Run FastAPI dev server (port 8000)
```

> **Note:** The FastAPI app instance is in `main.py`, not `api.py`. Always use `main:app`.

### Backend Deployment
```bash
cd backend
aws configure       # Configure AWS credentials (never commit credentials)
serverless deploy   # Deploy to AWS Lambda
```

## API Configuration

- Frontend connects to `http://localhost:8000` for local development (see `frontend/invoicemanagement-app/src/api.js`)
- Interactive API docs available at `http://localhost:8000/docs` (Swagger UI)
- Alternative docs at `http://localhost:8000/redoc`

## Database

- SQLite (`database.db`) for local development; PostgreSQL for production
- Models defined in `models.py` with SQLModel
- On startup, `main.py` auto-seeds: Chart of Accounts, default Company (SmartInvoiceInc), and default CategoryRules

## Route Structure

### Frontend Pages
- `/` - Dashboard
- `/invoices` - All invoices listing
- `/invoice` - Invoice creation
- `/invoice/:id` - Single invoice view
- `/customer` - Customer management
- `/product` - Product catalog management
- `/reports` - Financial reports
- `/ap` - Accounts Payable dashboard
- `/ap/invoices` - AP invoice list
- `/ap/vendors` - Vendor management
- `/accounting` - Double-entry accounting / journal entries
- `/forecasting` - Financial forecasting & insights

### Backend API Routers (`/routes/`)
- `invoice_routes.py` - Invoice CRUD
- `customer_routes.py` - Customer management
- `product_routes.py` - Product catalog
- `health.py` - Health check endpoints
- `report_routes.py` - Financial reports
- `assistant.py` - AI assistant
- `ap_routes.py` - Accounts payable
- `accounting_routes.py` - Journal entries, COA, trial balance
- `forecasting_routes.py` - SARIMA + XGBoost forecasting, late payment risk
- `plaid_routes.py` - Plaid bank integration
- `category_rules_routes.py` - Expense categorization rules

## Security Middleware Stack

Applied in `main.py` (order matters):
1. `GlobalErrorHandlerMiddleware` — catches all unhandled exceptions
2. `RequestLoggingMiddleware` — logs all requests/responses
3. `SecurityHeadersMiddleware` — adds security headers
4. `CORSMiddleware` — restricts origins to localhost (dev) or `ALLOWED_ORIGINS` env var
5. `IPWhitelistMiddleware` — optional trusted IP bypass (via `WHITELISTED_IPS` env var)
6. `RateLimitMiddleware` — 100 req/min default, 20 req/min for create endpoints
7. `InputValidationMiddleware` — validates request size (10MB default)

## Test Data Generation

```bash
cd backend
python scripts/seed_data.py        # 1000 invoices, 20 customers, 50 products
python scripts/seed_accounting.py  # Backfills journal entries from existing invoices
python scripts/seed_ap_data.py     # Generates AP invoice sample data
```

Sample bank statements for testing bank upload:
- `backend/scripts/sample_bank_statement.csv`
- `backend/scripts/sample_bank_statement_feb.csv`

## Lambda Deployment Notes

- Lambda has a 250MB unzipped package limit
- Heavy ML dependencies (`xgboost`, `statsmodels`, `scikit-learn`) and AI libs (`anthropic`) accumulate fast — monitor `requirements.txt` size
- `.venv` (585MB locally) is never deployed — only `requirements.txt` dependencies are packaged

## Troubleshooting

When encountering issues, check `TROUBLESHOOTING.md` for solutions to common problems including:
- Import and module path issues
- Date range logic errors
- Database constraint violations
- Business logic sequencing problems

## Important Notes

- AWS credentials should never be committed — use `aws configure` locally
- The system supports both draft and finalized invoice statuses with full timestamp tracking
- Default company "SmartInvoiceInc" is seeded automatically on first startup
- Plaid access tokens are stored in the `BankAccount` model — treat as secrets
