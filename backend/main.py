import os
from fastapi import FastAPI
from mangum import Mangum
from database import create_db_and_tables
from fastapi.middleware.cors import CORSMiddleware
from routes.invoice_routes import router as invoice_router
from routes.customer_routes import router as customer_router
from routes.product_routes import router as product_router
from routes.health import router as health_router
from routes.report_routes import router as report_router

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

# Security Configuration
MAX_REQUEST_SIZE = int(os.getenv("MAX_REQUEST_SIZE", 10 * 1024 * 1024))  # 10MB default
DEFAULT_RATE_LIMIT = int(os.getenv("DEFAULT_RATE_LIMIT", 100))  # 100 requests/minute
CREATE_RATE_LIMIT = int(os.getenv("CREATE_RATE_LIMIT", 20))    # 20 create requests/minute
DEBUG_MODE = os.getenv("DEBUG_MODE", "false").lower() == "true"  # Debug mode for error handling
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()  # Logging level

# CORS configuration - use environment variables for flexibility and security
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS", 
    "http://localhost:3000,http://127.0.0.1:3000"
).split(",")

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

# Lambda handler for serverless deployment
handler = Mangum(app)