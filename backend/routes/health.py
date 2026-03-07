"""
Health Check and Monitoring Routes for Invoice Management System

Provides endpoints for system health monitoring, database connectivity checks,
and basic performance metrics.
"""

import time
import psutil
from typing import Dict, Any
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, text
from database import get_session


router = APIRouter(tags=["Health & Monitoring"])


@router.get("/health")
async def health_check():
    """
    Basic health check endpoint.
    
    Returns simple OK status for load balancers and monitoring systems.
    """
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "service": "Invoice Management System",
        "version": "2.0.0"
    }


@router.get("/health/detailed")
async def detailed_health_check(session: Session = Depends(get_session)):
    """
    Detailed health check with database connectivity and system metrics.
    
    Returns comprehensive system status including:
    - Database connectivity
    - System resource usage
    - Application performance metrics
    """
    health_status = {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "service": "Invoice Management System",
        "version": "2.0.0",
        "checks": {}
    }
    
    # Database connectivity check
    try:
        start_time = time.time()
        result = session.exec(text("SELECT 1")).first()
        db_response_time = (time.time() - start_time) * 1000  # Convert to milliseconds
        
        health_status["checks"]["database"] = {
            "status": "healthy" if result else "unhealthy",
            "response_time_ms": round(db_response_time, 2),
            "details": "Database connection successful" if result else "Database query failed"
        }
    except Exception as e:
        health_status["checks"]["database"] = {
            "status": "unhealthy",
            "response_time_ms": None,
            "details": f"Database connection failed: {str(e)}"
        }
        health_status["status"] = "unhealthy"
    
    # System resource usage
    try:
        health_status["checks"]["system_resources"] = {
            "status": "healthy",
            "cpu_usage_percent": psutil.cpu_percent(interval=1),
            "memory_usage_percent": psutil.virtual_memory().percent,
            "disk_usage_percent": psutil.disk_usage('/').percent,
            "details": "System resources within normal limits"
        }
        
        # Mark as unhealthy if resources are critically high
        if (psutil.cpu_percent() > 90 or 
            psutil.virtual_memory().percent > 90 or 
            psutil.disk_usage('/').percent > 95):
            health_status["checks"]["system_resources"]["status"] = "unhealthy"
            health_status["checks"]["system_resources"]["details"] = "System resources critically high"
            health_status["status"] = "unhealthy"
            
    except Exception as e:
        health_status["checks"]["system_resources"] = {
            "status": "unknown",
            "details": f"Unable to retrieve system metrics: {str(e)}"
        }
    
    # Application-specific checks
    try:
        # Check if we can perform basic database operations
        start_time = time.time()
        from models import Invoice, Customer, Product
        
        invoice_count = len(session.exec(text("SELECT id FROM invoice LIMIT 1")).all())
        customer_count = len(session.exec(text("SELECT customer_id FROM customer LIMIT 1")).all())
        product_count = len(session.exec(text("SELECT product_id FROM product LIMIT 1")).all())
        
        app_response_time = (time.time() - start_time) * 1000
        
        health_status["checks"]["application"] = {
            "status": "healthy",
            "response_time_ms": round(app_response_time, 2),
            "data_status": {
                "invoices_available": invoice_count > 0,
                "customers_available": customer_count > 0,
                "products_available": product_count > 0
            },
            "details": "Application components operational"
        }
        
    except Exception as e:
        health_status["checks"]["application"] = {
            "status": "unhealthy",
            "details": f"Application check failed: {str(e)}"
        }
        health_status["status"] = "unhealthy"
    
    return health_status


@router.get("/health/database")
async def database_health_check(session: Session = Depends(get_session)):
    """
    Focused database health check with connection pooling information.
    """
    try:
        start_time = time.time()
        
        # Test basic connectivity
        basic_query = session.exec(text("SELECT 1 as test")).first()
        basic_response_time = (time.time() - start_time) * 1000
        
        # Test table access
        start_time = time.time()
        table_query = session.exec(text("SELECT COUNT(*) FROM invoice")).first()
        table_response_time = (time.time() - start_time) * 1000
        
        # Get database version/info
        try:
            version_query = session.exec(text("SELECT sqlite_version()")).first()
            db_version = version_query[0] if version_query else "unknown"
        except:
            db_version = "unknown"
        
        return {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "database": {
                "connectivity": "healthy",
                "basic_query_ms": round(basic_response_time, 2),
                "table_query_ms": round(table_response_time, 2),
                "version": db_version,
                "total_invoices": table_query[0] if table_query else 0
            }
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "unhealthy",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "database": {
                    "connectivity": "failed",
                    "error": str(e)
                }
            }
        )


@router.get("/metrics")
async def get_metrics(session: Session = Depends(get_session)):
    """
    Application metrics endpoint for monitoring systems.
    
    Returns key business and technical metrics.
    """
    try:
        start_time = time.time()
        
        # Business metrics
        from models import Invoice, Customer, Product
        
        # Invoice metrics
        total_invoices = session.exec(text("SELECT COUNT(*) FROM invoice")).first()[0]
        draft_invoices = session.exec(text("SELECT COUNT(*) FROM invoice WHERE invoice_status = 'draft'")).first()[0]
        submitted_invoices = session.exec(text("SELECT COUNT(*) FROM invoice WHERE invoice_status = 'submitted'")).first()[0]
        
        # Customer metrics
        total_customers = session.exec(text("SELECT COUNT(*) FROM customer")).first()[0]
        
        # Product metrics
        total_products = session.exec(text("SELECT COUNT(*) FROM product")).first()[0]
        
        # Recent activity (last 7 days)
        seven_days_ago = (datetime.utcnow() - timedelta(days=7)).strftime('%Y-%m-%d')
        recent_invoices = session.exec(
            text(f"SELECT COUNT(*) FROM invoice WHERE date_issued >= '{seven_days_ago}'")
        ).first()[0]
        
        # Performance metrics
        query_time = (time.time() - start_time) * 1000
        
        return {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "business_metrics": {
                "invoices": {
                    "total": total_invoices,
                    "draft": draft_invoices,
                    "submitted": submitted_invoices,
                    "recent_7_days": recent_invoices
                },
                "customers": {
                    "total": total_customers
                },
                "products": {
                    "total": total_products
                }
            },
            "performance_metrics": {
                "query_response_time_ms": round(query_time, 2),
                "system_uptime_hours": round((time.time() - psutil.boot_time()) / 3600, 2) if hasattr(psutil, 'boot_time') else None,
                "cpu_usage_percent": psutil.cpu_percent(interval=0.1),
                "memory_usage_percent": psutil.virtual_memory().percent
            }
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Unable to retrieve metrics",
                "details": str(e),
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }
        )


@router.get("/status")
async def get_application_status():
    """
    Simple application status endpoint.
    
    Useful for service discovery and basic monitoring.
    """
    return {
        "service": "Invoice Management System",
        "version": "2.0.0",
        "status": "running",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "features": [
            "Invoice Management",
            "Customer Management", 
            "Product Management",
            "Input Validation",
            "Rate Limiting",
            "Security Headers",
            "Performance Optimization"
        ],
        "endpoints": {
            "health": "/health",
            "detailed_health": "/health/detailed",
            "database_health": "/health/database",
            "metrics": "/metrics",
            "api_docs": "/docs",
            "redoc": "/redoc"
        }
    }