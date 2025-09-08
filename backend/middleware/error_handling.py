"""
Global Error Handling Middleware for Invoice Management System

Provides centralized error handling, logging, and standardized error responses
across the entire application.
"""

import uuid
import json
import traceback
from typing import Dict, Any, Optional
from datetime import datetime
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy.exc import IntegrityError, OperationalError, StatementError
from pydantic import ValidationError


class GlobalErrorHandlerMiddleware(BaseHTTPMiddleware):
    """
    Global error handling middleware that catches and processes all exceptions.
    
    Features:
    - Standardized error response format
    - Request ID generation for tracing
    - Comprehensive error logging
    - Different error modes for development vs production
    - SQL and validation error handling
    """
    
    def __init__(self, app, debug_mode: bool = False):
        super().__init__(app)
        self.debug_mode = debug_mode

    async def dispatch(self, request: Request, call_next):
        """
        Main error handling dispatcher.
        """
        # Generate unique request ID for tracing
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        
        try:
            response = await call_next(request)
            
            # Add request ID to successful responses
            response.headers["X-Request-ID"] = request_id
            
            return response
            
        except HTTPException as e:
            # Handle FastAPI HTTP exceptions
            return self._handle_http_exception(e, request, request_id)
            
        except ValidationError as e:
            # Handle Pydantic validation errors
            return self._handle_validation_error(e, request, request_id)
            
        except IntegrityError as e:
            # Handle database integrity constraints
            return self._handle_integrity_error(e, request, request_id)
            
        except OperationalError as e:
            # Handle database operational errors
            return self._handle_operational_error(e, request, request_id)
            
        except StatementError as e:
            # Handle SQL statement errors
            return self._handle_statement_error(e, request, request_id)
            
        except Exception as e:
            # Handle all other unexpected exceptions
            return self._handle_generic_exception(e, request, request_id)

    def _handle_http_exception(self, exc: HTTPException, request: Request, request_id: str) -> JSONResponse:
        """
        Handle FastAPI HTTP exceptions with standardized format.
        """
        error_response = {
            "error": {
                "code": self._get_error_code_from_status(exc.status_code),
                "message": exc.detail if isinstance(exc.detail, str) else str(exc.detail),
                "status_code": exc.status_code,
                "request_id": request_id,
                "timestamp": self._get_timestamp(),
                "path": str(request.url.path)
            }
        }
        
        # Log the error
        self._log_error(
            error_type="HTTPException",
            status_code=exc.status_code,
            message=str(exc.detail),
            request=request,
            request_id=request_id
        )
        
        return JSONResponse(
            status_code=exc.status_code,
            content=error_response,
            headers={"X-Request-ID": request_id}
        )

    def _handle_validation_error(self, exc: ValidationError, request: Request, request_id: str) -> JSONResponse:
        """
        Handle Pydantic validation errors.
        """
        validation_errors = []
        for error in exc.errors():
            field_path = ".".join(str(loc) for loc in error["loc"])
            validation_errors.append({
                "field": field_path,
                "message": error["msg"],
                "type": error["type"],
                "input": error.get("input")
            })
        
        error_response = {
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Request validation failed",
                "status_code": 422,
                "request_id": request_id,
                "timestamp": self._get_timestamp(),
                "path": str(request.url.path),
                "details": {
                    "validation_errors": validation_errors
                }
            }
        }
        
        self._log_error(
            error_type="ValidationError",
            status_code=422,
            message=f"Validation failed: {len(validation_errors)} errors",
            request=request,
            request_id=request_id,
            extra_data={"validation_errors": validation_errors}
        )
        
        return JSONResponse(
            status_code=422,
            content=error_response,
            headers={"X-Request-ID": request_id}
        )

    def _handle_integrity_error(self, exc: IntegrityError, request: Request, request_id: str) -> JSONResponse:
        """
        Handle database integrity constraint violations.
        """
        error_message = "Database constraint violation"
        error_code = "INTEGRITY_ERROR"
        
        # Parse common integrity error types
        error_str = str(exc.orig) if exc.orig else str(exc)
        
        if "UNIQUE constraint failed" in error_str:
            error_code = "DUPLICATE_RECORD"
            error_message = "A record with this information already exists"
        elif "FOREIGN KEY constraint failed" in error_str:
            error_code = "FOREIGN_KEY_ERROR"
            error_message = "Referenced record does not exist"
        elif "NOT NULL constraint failed" in error_str:
            error_code = "MISSING_REQUIRED_FIELD"
            error_message = "Required field is missing"
        
        error_response = {
            "error": {
                "code": error_code,
                "message": error_message,
                "status_code": 400,
                "request_id": request_id,
                "timestamp": self._get_timestamp(),
                "path": str(request.url.path),
                "details": {
                    "database_error": error_str if self.debug_mode else "Database constraint violation"
                }
            }
        }
        
        self._log_error(
            error_type="IntegrityError",
            status_code=400,
            message=error_message,
            request=request,
            request_id=request_id,
            extra_data={"database_error": error_str}
        )
        
        return JSONResponse(
            status_code=400,
            content=error_response,
            headers={"X-Request-ID": request_id}
        )

    def _handle_operational_error(self, exc: OperationalError, request: Request, request_id: str) -> JSONResponse:
        """
        Handle database operational errors (connection issues, etc.).
        """
        error_response = {
            "error": {
                "code": "DATABASE_ERROR",
                "message": "Database operation failed",
                "status_code": 503,
                "request_id": request_id,
                "timestamp": self._get_timestamp(),
                "path": str(request.url.path),
                "details": {
                    "database_error": str(exc.orig) if self.debug_mode and exc.orig else "Service temporarily unavailable"
                }
            }
        }
        
        self._log_error(
            error_type="OperationalError",
            status_code=503,
            message="Database operational error",
            request=request,
            request_id=request_id,
            extra_data={"database_error": str(exc)}
        )
        
        return JSONResponse(
            status_code=503,
            content=error_response,
            headers={"X-Request-ID": request_id}
        )

    def _handle_statement_error(self, exc: StatementError, request: Request, request_id: str) -> JSONResponse:
        """
        Handle SQL statement errors.
        """
        error_response = {
            "error": {
                "code": "SQL_ERROR",
                "message": "Database query failed",
                "status_code": 400,
                "request_id": request_id,
                "timestamp": self._get_timestamp(),
                "path": str(request.url.path),
                "details": {
                    "sql_error": str(exc.orig) if self.debug_mode and exc.orig else "Invalid query parameters"
                }
            }
        }
        
        self._log_error(
            error_type="StatementError",
            status_code=400,
            message="SQL statement error",
            request=request,
            request_id=request_id,
            extra_data={"sql_error": str(exc)}
        )
        
        return JSONResponse(
            status_code=400,
            content=error_response,
            headers={"X-Request-ID": request_id}
        )

    def _handle_generic_exception(self, exc: Exception, request: Request, request_id: str) -> JSONResponse:
        """
        Handle all other unexpected exceptions.
        """
        error_response = {
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected error occurred",
                "status_code": 500,
                "request_id": request_id,
                "timestamp": self._get_timestamp(),
                "path": str(request.url.path),
                "details": {
                    "error_type": type(exc).__name__,
                    "error_message": str(exc) if self.debug_mode else "Internal server error"
                }
            }
        }
        
        self._log_error(
            error_type=type(exc).__name__,
            status_code=500,
            message=str(exc),
            request=request,
            request_id=request_id,
            extra_data={"traceback": traceback.format_exc()} if self.debug_mode else None
        )
        
        return JSONResponse(
            status_code=500,
            content=error_response,
            headers={"X-Request-ID": request_id}
        )

    def _get_error_code_from_status(self, status_code: int) -> str:
        """
        Map HTTP status codes to error codes.
        """
        status_code_mapping = {
            400: "BAD_REQUEST",
            401: "UNAUTHORIZED",
            403: "FORBIDDEN",
            404: "NOT_FOUND",
            405: "METHOD_NOT_ALLOWED",
            409: "CONFLICT",
            413: "REQUEST_TOO_LARGE",
            415: "UNSUPPORTED_MEDIA_TYPE",
            422: "VALIDATION_ERROR",
            429: "RATE_LIMIT_EXCEEDED",
            500: "INTERNAL_SERVER_ERROR",
            502: "BAD_GATEWAY",
            503: "SERVICE_UNAVAILABLE",
            504: "GATEWAY_TIMEOUT"
        }
        return status_code_mapping.get(status_code, "UNKNOWN_ERROR")

    def _log_error(
        self, 
        error_type: str, 
        status_code: int, 
        message: str, 
        request: Request, 
        request_id: str,
        extra_data: Optional[Dict[str, Any]] = None
    ):
        """
        Log error with comprehensive context information.
        """
        log_data = {
            "timestamp": self._get_timestamp(),
            "request_id": request_id,
            "error_type": error_type,
            "status_code": status_code,
            "message": message,
            "request": {
                "method": request.method,
                "url": str(request.url),
                "path": request.url.path,
                "query_params": dict(request.query_params),
                "headers": dict(request.headers),
                "client": {
                    "host": request.client.host if request.client else None,
                    "port": request.client.port if request.client else None
                }
            }
        }
        
        if extra_data:
            log_data["extra_data"] = extra_data
        
        # In a production environment, you would use a proper logging framework
        # like structlog, loguru, or Python's logging module
        print(f"ERROR: {json.dumps(log_data, indent=2, default=str)}")

    def _get_timestamp(self) -> str:
        """
        Get current timestamp in ISO format.
        """
        return datetime.utcnow().isoformat() + "Z"


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware to log all incoming requests for monitoring and debugging.
    """
    
    def __init__(self, app, log_level: str = "INFO"):
        super().__init__(app)
        self.log_level = log_level

    async def dispatch(self, request: Request, call_next):
        """
        Log request and response information.
        """
        start_time = datetime.utcnow()
        request_id = getattr(request.state, 'request_id', str(uuid.uuid4()))
        
        # Log incoming request
        if self.log_level in ["DEBUG", "INFO"]:
            request_log = {
                "timestamp": start_time.isoformat() + "Z",
                "request_id": request_id,
                "type": "REQUEST",
                "method": request.method,
                "url": str(request.url),
                "path": request.url.path,
                "client_ip": request.client.host if request.client else None,
                "user_agent": request.headers.get("user-agent"),
                "content_type": request.headers.get("content-type")
            }
            print(f"REQUEST: {json.dumps(request_log, default=str)}")
        
        # Process request
        response = await call_next(request)
        
        # Log response
        end_time = datetime.utcnow()
        response_time = (end_time - start_time).total_seconds() * 1000  # Convert to milliseconds
        
        if self.log_level in ["DEBUG", "INFO"]:
            response_log = {
                "timestamp": end_time.isoformat() + "Z",
                "request_id": request_id,
                "type": "RESPONSE",
                "status_code": response.status_code,
                "response_time_ms": round(response_time, 2),
                "content_type": response.headers.get("content-type")
            }
            print(f"RESPONSE: {json.dumps(response_log, default=str)}")
        
        # Add response time header
        response.headers["X-Response-Time"] = f"{round(response_time, 2)}ms"
        
        return response