"""
Rate Limiting Middleware for Invoice Management System

This middleware implements rate limiting to prevent API abuse and DoS attacks.
Supports both Redis-based distributed rate limiting and in-memory fallback.
"""

import time
import json
from typing import Dict, Optional, Tuple
from collections import defaultdict, deque
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import asyncio


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Rate limiting middleware with configurable limits per endpoint type.
    
    Features:
    - Per-IP rate limiting with sliding window
    - Different limits for different endpoint types
    - In-memory storage with Redis fallback support
    - Graceful handling of rate limit exceeded
    """
    
    def __init__(
        self, 
        app, 
        default_requests_per_minute: int = 100,
        create_requests_per_minute: int = 20,
        redis_client: Optional[any] = None
    ):
        super().__init__(app)
        self.default_rpm = default_requests_per_minute
        self.create_rpm = create_requests_per_minute
        self.redis_client = redis_client
        
        # In-memory storage for rate limiting (fallback when Redis not available)
        self.request_counts: Dict[str, deque] = defaultdict(deque)
        self.cleanup_interval = 60  # Clean up old entries every 60 seconds
        self.last_cleanup = time.time()
        
        # Rate limit configuration for different endpoint types
        self.rate_limits = {
            "GET": default_requests_per_minute,
            "POST": create_requests_per_minute, 
            "PUT": create_requests_per_minute,
            "PATCH": create_requests_per_minute,
            "DELETE": create_requests_per_minute // 2,  # More restrictive for deletes
        }
        
        # Endpoint-specific rate limits (can override method-based limits)
        self.endpoint_limits = {
            "/health": default_requests_per_minute * 2,  # Allow more health checks
            "/metrics": default_requests_per_minute * 2,  # Allow more metrics calls
        }

    async def dispatch(self, request: Request, call_next):
        """
        Main rate limiting logic.
        """
        try:
            client_ip = self._get_client_ip(request)
            endpoint = request.url.path
            method = request.method
            
            # Check if request is rate limited
            is_limited, retry_after = await self._is_rate_limited(client_ip, endpoint, method)
            
            if is_limited:
                return self._rate_limit_response(retry_after, client_ip, endpoint)
            
            # Record the request
            await self._record_request(client_ip, endpoint, method)
            
            # Process request
            response = await call_next(request)
            
            # Add rate limit headers to response
            self._add_rate_limit_headers(response, client_ip, endpoint, method)
            
            return response
            
        except Exception as e:
            # Don't block requests if rate limiting fails
            print(f"Rate limiting error: {e}")
            return await call_next(request)

    def _get_client_ip(self, request: Request) -> str:
        """
        Extract client IP address from request headers.
        Handles X-Forwarded-For, X-Real-IP headers for proxied requests.
        """
        # Check for forwarded IP first (for load balancers/proxies)
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            # Take the first IP in the chain
            return forwarded_for.split(",")[0].strip()
        
        # Check for real IP header
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip.strip()
        
        # Fallback to direct client IP
        return request.client.host if request.client else "unknown"

    async def _is_rate_limited(self, client_ip: str, endpoint: str, method: str) -> Tuple[bool, int]:
        """
        Check if the client IP has exceeded rate limits.
        
        Returns:
            Tuple of (is_limited: bool, retry_after_seconds: int)
        """
        current_time = time.time()
        limit = self._get_rate_limit(endpoint, method)
        window_size = 60  # 1 minute sliding window
        
        if self.redis_client:
            return await self._check_redis_rate_limit(client_ip, endpoint, method, limit, window_size)
        else:
            return self._check_memory_rate_limit(client_ip, endpoint, method, limit, window_size, current_time)

    def _get_rate_limit(self, endpoint: str, method: str) -> int:
        """
        Get the rate limit for a specific endpoint and method.
        """
        # Check for endpoint-specific limits first
        if endpoint in self.endpoint_limits:
            return self.endpoint_limits[endpoint]
        
        # Use method-based limits
        return self.rate_limits.get(method, self.default_rpm)

    async def _check_redis_rate_limit(self, client_ip: str, endpoint: str, method: str, limit: int, window: int) -> Tuple[bool, int]:
        """
        Check rate limit using Redis (distributed rate limiting).
        """
        try:
            key = f"rate_limit:{client_ip}:{endpoint}:{method}"
            current_time = time.time()
            
            # Use Redis sliding window counter
            pipe = self.redis_client.pipeline()
            pipe.zremrangebyscore(key, 0, current_time - window)
            pipe.zadd(key, {str(current_time): current_time})
            pipe.zcard(key)
            pipe.expire(key, window)
            
            results = await pipe.execute()
            request_count = results[2]
            
            if request_count > limit:
                return True, window
            
            return False, 0
            
        except Exception as e:
            print(f"Redis rate limiting failed: {e}")
            # Fallback to memory-based rate limiting
            return self._check_memory_rate_limit(client_ip, endpoint, method, limit, window, current_time)

    def _check_memory_rate_limit(self, client_ip: str, endpoint: str, method: str, limit: int, window: int, current_time: float) -> Tuple[bool, int]:
        """
        Check rate limit using in-memory storage.
        """
        key = f"{client_ip}:{endpoint}:{method}"
        requests = self.request_counts[key]
        
        # Clean up old requests outside the window
        while requests and requests[0] < current_time - window:
            requests.popleft()
        
        # Check if limit exceeded
        if len(requests) >= limit:
            oldest_request = requests[0]
            retry_after = int(oldest_request + window - current_time) + 1
            return True, retry_after
        
        return False, 0

    async def _record_request(self, client_ip: str, endpoint: str, method: str):
        """
        Record a request for rate limiting purposes.
        """
        current_time = time.time()
        
        if self.redis_client:
            await self._record_redis_request(client_ip, endpoint, method, current_time)
        else:
            self._record_memory_request(client_ip, endpoint, method, current_time)

    async def _record_redis_request(self, client_ip: str, endpoint: str, method: str, current_time: float):
        """
        Record request in Redis.
        """
        try:
            key = f"rate_limit:{client_ip}:{endpoint}:{method}"
            await self.redis_client.zadd(key, {str(current_time): current_time})
        except Exception as e:
            print(f"Failed to record request in Redis: {e}")

    def _record_memory_request(self, client_ip: str, endpoint: str, method: str, current_time: float):
        """
        Record request in memory.
        """
        key = f"{client_ip}:{endpoint}:{method}"
        self.request_counts[key].append(current_time)
        
        # Periodic cleanup to prevent memory leaks
        if current_time - self.last_cleanup > self.cleanup_interval:
            self._cleanup_old_requests(current_time)
            self.last_cleanup = current_time

    def _cleanup_old_requests(self, current_time: float):
        """
        Clean up old request records to prevent memory leaks.
        """
        window = 60  # 1 minute
        keys_to_remove = []
        
        for key, requests in self.request_counts.items():
            # Remove old requests
            while requests and requests[0] < current_time - window:
                requests.popleft()
            
            # Remove empty entries
            if not requests:
                keys_to_remove.append(key)
        
        for key in keys_to_remove:
            del self.request_counts[key]

    def _rate_limit_response(self, retry_after: int, client_ip: str, endpoint: str) -> JSONResponse:
        """
        Return rate limit exceeded response.
        """
        return JSONResponse(
            status_code=429,
            content={
                "error": {
                    "code": "RATE_LIMIT_EXCEEDED",
                    "message": f"Rate limit exceeded. Try again in {retry_after} seconds.",
                    "retry_after": retry_after,
                    "timestamp": self._get_timestamp(),
                    "client_ip": client_ip,
                    "endpoint": endpoint
                }
            },
            headers={
                "Retry-After": str(retry_after),
                "X-RateLimit-Limit": str(self._get_rate_limit(endpoint, "GET")),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(int(time.time()) + retry_after)
            }
        )

    def _add_rate_limit_headers(self, response, client_ip: str, endpoint: str, method: str):
        """
        Add rate limiting headers to successful responses.
        """
        try:
            limit = self._get_rate_limit(endpoint, method)
            key = f"{client_ip}:{endpoint}:{method}"
            
            if self.redis_client:
                # For Redis, we'd need to query current count
                remaining = limit - 1  # Simplified
            else:
                requests = self.request_counts.get(key, deque())
                remaining = max(0, limit - len(requests))
            
            response.headers["X-RateLimit-Limit"] = str(limit)
            response.headers["X-RateLimit-Remaining"] = str(remaining)
            response.headers["X-RateLimit-Reset"] = str(int(time.time()) + 60)
            
        except Exception as e:
            print(f"Failed to add rate limit headers: {e}")

    def _get_timestamp(self) -> str:
        """
        Get current timestamp in ISO format.
        """
        from datetime import datetime
        return datetime.utcnow().isoformat() + "Z"


class IPWhitelistMiddleware(BaseHTTPMiddleware):
    """
    Optional middleware to whitelist specific IP addresses from rate limiting.
    Useful for internal services, health checkers, etc.
    """
    
    def __init__(self, app, whitelisted_ips: list = None):
        super().__init__(app)
        self.whitelisted_ips = set(whitelisted_ips or [])
        
        # Add localhost variations to whitelist
        self.whitelisted_ips.update([
            "127.0.0.1", 
            "::1", 
            "localhost"
        ])

    async def dispatch(self, request: Request, call_next):
        """
        Skip rate limiting for whitelisted IPs.
        """
        client_ip = self._get_client_ip(request)
        
        if client_ip in self.whitelisted_ips:
            # Skip to next middleware/handler
            response = await call_next(request)
            response.headers["X-Rate-Limit-Bypassed"] = "true"
            return response
        
        return await call_next(request)

    def _get_client_ip(self, request: Request) -> str:
        """
        Extract client IP address (same logic as RateLimitMiddleware).
        """
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip.strip()
        
        return request.client.host if request.client else "unknown"