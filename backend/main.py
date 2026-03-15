import os
import certifi
from dotenv import load_dotenv
load_dotenv()

# Fix SSL certificate verification on macOS (Python doesn't use system keychain)
os.environ.setdefault("SSL_CERT_FILE", certifi.where())
os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())
from fastapi import FastAPI
from mangum import Mangum
from database import create_db_and_tables
from fastapi.middleware.cors import CORSMiddleware
from routes.invoice_routes import router as invoice_router
from routes.customer_routes import router as customer_router
from routes.product_routes import router as product_router
from routes.health import router as health_router
from routes.report_routes import router as report_router
from routes.assistant import router as assistant_router
from routes.ap_routes import router as ap_router
from routes.accounting_routes import router as accounting_router
from routes.forecasting_routes import router as forecasting_router
from routes.plaid_routes import router as plaid_router
from routes.category_rules_routes import router as category_rules_router

# Import security middleware
from middleware.validation import InputValidationMiddleware, SecurityHeadersMiddleware
from middleware.rate_limiting import RateLimitMiddleware, IPWhitelistMiddleware
from middleware.error_handling import GlobalErrorHandlerMiddleware, RequestLoggingMiddleware



app = FastAPI(
    title="Invoice Management System API",
    description="Enterprise-grade invoice management system with comprehensive security and performance features",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

@app.on_event("startup")
def on_startup():
    """Create database tables on application startup for data persistence."""
    create_db_and_tables()
    _seed_chart_of_accounts()
    _seed_company()
    _seed_category_rules()


def _seed_company():
    """Seed SmartInvoiceInc as the default company if none exists."""
    from sqlmodel import Session, select
    from models import Company
    from database import engine

    with Session(engine) as session:
        if not session.exec(select(Company)).first():
            session.add(Company(name="SmartInvoiceInc", fiscal_year_start=1))
            session.commit()


def _seed_category_rules():
    """Seed common expense categorization rules if none exist."""
    from sqlmodel import Session, select
    from models import CategoryRule
    from database import engine

    DEFAULT_RULES = [
        # (name, match_type, match_value, debit, credit, label, priority)
        ("AWS / Cloud",        "contains", "aws",          "5000", "1000", "Software & Cloud",  10),
        ("Uber / Lyft",        "contains", "uber",         "5000", "1000", "Travel",             20),
        ("Lyft",               "contains", "lyft",         "5000", "1000", "Travel",             21),
        ("Payroll",            "contains", "payroll",      "5000", "1000", "Payroll",            30),
        ("Rent",               "contains", "rent",         "5000", "1000", "Rent",               40),
        ("Utilities",          "contains", "utility",      "5000", "1000", "Utilities",          50),
        ("Electric / Power",   "contains", "electric",     "5000", "1000", "Utilities",          51),
        ("SaaS Subscription",  "contains", "subscription", "5000", "1000", "Subscriptions",      60),
        ("Customer Payment",   "contains", "payment received", "1000", "1100", "Customer Payment", 5),
        ("Starbucks",          "contains", "starbucks",    "5000", "1000", "Meals & Coffee",     70),
        ("McDonald's",         "contains", "mcdonald",     "5000", "1000", "Meals & Coffee",     71),
    ]

    with Session(engine) as session:
        existing = session.exec(select(CategoryRule)).first()
        if existing:
            return
        for name, match_type, match_value, debit, credit, label, priority in DEFAULT_RULES:
            session.add(CategoryRule(
                name=name, match_type=match_type, match_value=match_value,
                debit_account=debit, credit_account=credit,
                category_label=label, priority=priority,
            ))
        session.commit()


def _seed_chart_of_accounts():
    """Seed default chart of accounts if not already present."""
    from sqlmodel import Session, select
    from models import ChartOfAccount
    from database import engine

    DEFAULT_ACCOUNTS = [
        ("1000", "Cash",                  "asset",     "debit",  "Physical and bank cash"),
        ("1100", "Accounts Receivable",   "asset",     "debit",  "Money owed by customers"),
        ("2000", "Accounts Payable",      "liability", "credit", "Money owed to vendors"),
        ("3000", "Owner's Equity",        "equity",    "credit", "Owner investment and retained earnings"),
        ("4000", "Revenue",               "revenue",   "credit", "Income from sales"),
        ("5000", "Cost of Goods Sold",    "expense",   "debit",  "Direct costs of products/services sold"),
    ]

    with Session(engine) as session:
        for code, name, acct_type, normal_bal, desc in DEFAULT_ACCOUNTS:
            exists = session.exec(select(ChartOfAccount).where(ChartOfAccount.code == code)).first()
            if not exists:
                session.add(ChartOfAccount(
                    code=code, name=name, account_type=acct_type,
                    normal_balance=normal_bal, description=desc
                ))
        session.commit()

# Security Configuration
MAX_REQUEST_SIZE = int(os.getenv("MAX_REQUEST_SIZE", 10 * 1024 * 1024))  # 10MB default
DEFAULT_RATE_LIMIT = int(os.getenv("DEFAULT_RATE_LIMIT", 100))  # 100 requests/minute
CREATE_RATE_LIMIT = int(os.getenv("CREATE_RATE_LIMIT", 20))    # 20 create requests/minute
DEBUG_MODE = os.getenv("DEBUG_MODE", "false").lower() == "true"  # Debug mode for error handling
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()  # Logging level

# CORS configuration — env var takes priority; falls back to localhost for local dev
_origins_env = os.getenv("ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS = (
    [o.strip() for o in _origins_env.split(",") if o.strip()]
    or ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3002"]
)

# Allowed methods - restrict to only what's needed
ALLOWED_METHODS = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]

# Allowed headers - restrict to common headers + security headers
ALLOWED_HEADERS = [
    "Accept",
    "Accept-Language",
    "Content-Language",
    "Content-Type",
    "Authorization",
    "X-Request-ID",
    "X-Correlation-ID"
]

# Add middleware stack (order matters - first added = last executed)
# 1. Global Error Handler (outermost - catches all exceptions)
app.add_middleware(GlobalErrorHandlerMiddleware, debug_mode=DEBUG_MODE)

# 2. Request Logging (logs all requests and responses)
app.add_middleware(RequestLoggingMiddleware, log_level=LOG_LEVEL)

# 3. Security Headers (adds security headers to all responses)
app.add_middleware(SecurityHeadersMiddleware)

# 4. CORS (must be before other middleware that might modify requests)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=ALLOWED_METHODS,
    allow_headers=ALLOWED_HEADERS,
    max_age=600,  # Cache preflight requests for 10 minutes
)

# 5. IP Whitelist (optional - skip rate limiting for trusted IPs)
WHITELISTED_IPS = os.getenv("WHITELISTED_IPS", "").split(",") if os.getenv("WHITELISTED_IPS") else []
if WHITELISTED_IPS:
    app.add_middleware(IPWhitelistMiddleware, whitelisted_ips=WHITELISTED_IPS)

# 6. Rate Limiting (protect against abuse)
app.add_middleware(
    RateLimitMiddleware,
    default_requests_per_minute=DEFAULT_RATE_LIMIT,
    create_requests_per_minute=CREATE_RATE_LIMIT
)

# 7. Input Validation (innermost - validates requests before processing)
app.add_middleware(InputValidationMiddleware, max_request_size=MAX_REQUEST_SIZE)

# Include API routers
app.include_router(invoice_router)
app.include_router(customer_router)
app.include_router(product_router)
app.include_router(health_router)
app.include_router(report_router)
app.include_router(assistant_router)
app.include_router(ap_router)
app.include_router(accounting_router)
app.include_router(forecasting_router)
app.include_router(plaid_router)
app.include_router(category_rules_router)

# Lambda handler for serverless deployment
handler = Mangum(app)
