"""
Input Validation Middleware for Invoice Management System

This middleware provides comprehensive input validation and sanitization
to protect against XSS, SQL injection, and other common web vulnerabilities.
"""

import re
import json
from typing import Dict, Any, List
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import bleach


class InputValidationMiddleware(BaseHTTPMiddleware):
    """
    Middleware for input validation and sanitization.
    
    Features:
    - XSS protection through HTML sanitization
    - Request size limits to prevent DoS attacks  
    - Input type validation beyond Pydantic
    - SQL injection pattern detection
    - Content-Type validation
    """
    
    def __init__(self, app, max_request_size: int = 10 * 1024 * 1024):  # 10MB default
        super().__init__(app)
        self.max_request_size = max_request_size
        
        # Allowed HTML tags and attributes for content sanitization
        self.allowed_tags = []  # No HTML tags allowed in API input
        self.allowed_attributes = {}
        
        # SQL injection patterns to detect
        self.sql_injection_patterns = [
            r"(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)",
            r"(--|#|\/\*|\*\/)",
            r"(\b(OR|AND)\s+\d+\s*=\s*\d+)",
            r"(\b(OR|AND)\s+['\"]?\w+['\"]?\s*=\s*['\"]?\w+['\"]?)",
        ]
        
        # XSS patterns to detect
        self.xss_patterns = [
            r"<script[^>]*>.*?</script>",
            r"javascript:",
            r"vbscript:",
            r"onload\s*=",
            r"onerror\s*=",
            r"onclick\s*=",
        ]

    # Paths exempt from SQL injection / XSS body scanning (natural language input)
    EXEMPT_PATHS = {"/assistant/query"}

    # Paths that completely skip body consumption — FastAPI reads these directly
    BYPASS_BODY_PATHS = {
        "/accounting/bank-statement/confirm",
        "/plaid/exchange-token",
        "/plaid/link-token",
    }

    async def dispatch(self, request: Request, call_next):
        """
        Main middleware dispatcher that validates all incoming requests.
        """
        try:
            # Check request size
            await self._validate_request_size(request)

            # Validate Content-Type for POST/PUT requests
            await self._validate_content_type(request)

            # Read and validate request body for JSON requests only.
            # Multipart/form-data (file uploads) must not have their receive
            # stream consumed here — FastAPI needs it intact for UploadFile parsing.
            # BYPASS_BODY_PATHS are also skipped — FastAPI reads them directly.
            content_type = request.headers.get('content-type', '')
            if (request.method in ["POST", "PUT", "PATCH"]
                    and content_type.startswith('application/json')
                    and request.url.path not in self.BYPASS_BODY_PATHS):
                body = await request.body()
                if body:
                    if request.url.path not in self.EXEMPT_PATHS:
                        await self._validate_request_body(body, request)

                    # Re-create request with validated body
                    request = self._recreate_request(request, body)

            # Process the request
            response = await call_next(request)
            return response
            
        except HTTPException as e:
            return JSONResponse(
                status_code=e.status_code,
                content={
                    "error": {
                        "code": "VALIDATION_ERROR",
                        "message": e.detail,
                        "timestamp": self._get_timestamp(),
                        "request_path": str(request.url.path)
                    }
                }
            )
        except Exception as e:
            return JSONResponse(
                status_code=500,
                content={
                    "error": {
                        "code": "INTERNAL_SERVER_ERROR", 
                        "message": "An unexpected error occurred during validation",
                        "timestamp": self._get_timestamp()
                    }
                }
            )

    async def _validate_request_size(self, request: Request):
        """
        Validate that the request size doesn't exceed limits.
        """
        content_length = request.headers.get('content-length')
        if content_length and int(content_length) > self.max_request_size:
            raise HTTPException(
                status_code=413,
                detail=f"Request size {content_length} bytes exceeds maximum allowed size of {self.max_request_size} bytes"
            )

    async def _validate_content_type(self, request: Request):
        """
        Validate Content-Type header for requests with body.
        Requests with no Content-Type (empty body, e.g. /approve) are allowed through.
        """
        if request.method in ["POST", "PUT", "PATCH"]:
            content_type = request.headers.get('content-type', '').lower()

            # No Content-Type means no body — nothing to validate
            if not content_type:
                return

            allowed_types = [
                'application/json',
                'application/x-www-form-urlencoded',
                'multipart/form-data'
            ]

            if not any(content_type.startswith(allowed) for allowed in allowed_types):
                raise HTTPException(
                    status_code=415,
                    detail=f"Unsupported Content-Type: {content_type}. Allowed types: {', '.join(allowed_types)}"
                )

    async def _validate_request_body(self, body: bytes, request: Request):
        """
        Validate and sanitize request body content.
        """
        content_type = request.headers.get('content-type', '')
        # Only validate JSON bodies — multipart/form-data can contain binary (e.g. PDFs)
        if not content_type.startswith('application/json'):
            return

        try:
            # Decode body
            body_str = body.decode('utf-8')
            
            # Parse JSON if applicable
            if request.headers.get('content-type', '').startswith('application/json'):
                if body_str.strip():  # Only parse non-empty bodies
                    json_data = json.loads(body_str)
                    await self._validate_json_data(json_data)
                    
        except json.JSONDecodeError as e:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid JSON format: {str(e)}"
            )
        except UnicodeDecodeError:
            raise HTTPException(
                status_code=400,
                detail="Request body contains invalid UTF-8 characters"
            )

    async def _validate_json_data(self, data: Any, path: str = ""):
        """
        Recursively validate JSON data for security threats.
        """
        if isinstance(data, dict):
            for key, value in data.items():
                current_path = f"{path}.{key}" if path else key
                await self._validate_json_data(value, current_path)
                
        elif isinstance(data, list):
            for i, item in enumerate(data):
                current_path = f"{path}[{i}]"
                await self._validate_json_data(item, current_path)
                
        elif isinstance(data, str):
            await self._validate_string_input(data, path)

    async def _validate_string_input(self, value: str, field_path: str = ""):
        """
        Validate string input for XSS and SQL injection patterns.
        """
        # Check for SQL injection patterns
        for pattern in self.sql_injection_patterns:
            if re.search(pattern, value, re.IGNORECASE):
                raise HTTPException(
                    status_code=400,
                    detail=f"Potential SQL injection detected in field '{field_path}'"
                )
        
        # Check for XSS patterns
        for pattern in self.xss_patterns:
            if re.search(pattern, value, re.IGNORECASE):
                raise HTTPException(
                    status_code=400,
                    detail=f"Potential XSS attack detected in field '{field_path}'"
                )
        
        # Sanitize HTML content (removes all HTML tags by default)
        sanitized = bleach.clean(value, tags=self.allowed_tags, attributes=self.allowed_attributes)
        
        # Check if sanitization removed content (potential attack)
        if len(sanitized) != len(value):
            raise HTTPException(
                status_code=400,
                detail=f"HTML content detected and removed from field '{field_path}'. Plain text only allowed."
            )

    def _recreate_request(self, request: Request, body: bytes):
        """
        Recreate request object with validated body.
        This is necessary because FastAPI Request body can only be read once.
        """
        async def receive() -> dict:
            return {"type": "http.request", "body": body, "more_body": False}

        return Request(request.scope, receive)

    def _get_timestamp(self) -> str:
        """
        Get current timestamp in ISO format.
        """
        from datetime import datetime
        return datetime.utcnow().isoformat() + "Z"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add security headers to all responses.
    """
    
    def __init__(self, app):
        super().__init__(app)
        
        self.security_headers = {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY", 
            "X-XSS-Protection": "1; mode=block",
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Content-Security-Policy": "default-src 'self'",
        }

    async def dispatch(self, request: Request, call_next):
        """
        Add security headers to all responses.
        """
        response = await call_next(request)
        
        # Add security headers
        for header, value in self.security_headers.items():
            response.headers[header] = value
            
        return response


# Utility function to check if string contains only safe characters
def is_safe_string(value: str, allow_special_chars: bool = True) -> bool:
    """
    Check if a string contains only safe characters.
    
    Args:
        value: String to validate
        allow_special_chars: Whether to allow special characters like @, -, etc.
    
    Returns:
        bool: True if string is safe, False otherwise
    """
    if allow_special_chars:
        # Allow alphanumeric, spaces, and common special characters
        safe_pattern = r'^[a-zA-Z0-9\s@._-]+$'
    else:
        # Only alphanumeric and spaces
        safe_pattern = r'^[a-zA-Z0-9\s]+$'
    
    return bool(re.match(safe_pattern, value))


# Utility function to validate email format
def is_valid_email(email: str) -> bool:
    """
    Validate email format using regex.
    
    Args:
        email: Email string to validate
        
    Returns:
        bool: True if email format is valid
    """
    email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(email_pattern, email))


# Utility function to validate phone number  
def is_valid_phone(phone: str) -> bool:
    """
    Validate phone number format.
    
    Args:
        phone: Phone number string to validate
        
    Returns:
        bool: True if phone format is valid
    """
    # Accept 10-digit numbers with optional formatting
    phone_pattern = r'^[\+]?[1-9][\d]{0,2}[-\s\.]?[\d]{3}[-\s\.]?[\d]{3}[-\s\.]?[\d]{4}$|^[\d]{10}$'
    return bool(re.match(phone_pattern, phone))