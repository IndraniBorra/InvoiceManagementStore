from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select, func, and_, or_
from datetime import date, datetime, timedelta
from typing import Optional, List
from database import get_session
from models import Invoice, Customer, Product, LineItem
from services.report_service import ReportService
import logging

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reports", tags=["reports"])

@router.get("/revenue-summary")
async def get_revenue_summary(
    session: Session = Depends(get_session)
):
    """
    Get revenue summary dashboard data
    Returns current month, last month, growth rates, and key metrics
    """
    try:
        report_service = ReportService(session)
        summary = await report_service.get_revenue_summary()
        return summary
    except Exception as e:
        logger.error(f"Error generating revenue summary: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate revenue summary")

@router.get("/invoices")
async def get_all_invoices_report(
    start_date: Optional[date] = Query(None, description="Start date filter"),
    end_date: Optional[date] = Query(None, description="End date filter"),
    customer_id: Optional[int] = Query(None, description="Filter by customer ID"),
    status: Optional[str] = Query(None, description="Filter by invoice status"),
    min_amount: Optional[float] = Query(None, description="Minimum amount filter"),
    max_amount: Optional[float] = Query(None, description="Maximum amount filter"),
    page: int = Query(1, description="Page number", ge=1),
    page_size: int = Query(50, description="Items per page", ge=1, le=100),
    session: Session = Depends(get_session)
):
    """
    Get all invoices with filtering, pagination, and summary statistics
    """
    try:
        report_service = ReportService(session)
        result = await report_service.get_all_invoices_report(
            start_date=start_date,
            end_date=end_date,
            customer_id=customer_id,
            status=status,
            min_amount=min_amount,
            max_amount=max_amount,
            page=page,
            page_size=page_size
        )
        return result
    except Exception as e:
        logger.error(f"Error generating all invoices report: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate invoices report")

@router.get("/customer/{customer_id}")
async def get_customer_report(
    customer_id: int,
    session: Session = Depends(get_session)
):
    """
    Get detailed report for a specific customer
    Returns customer info, invoice history, payment behavior, and summary metrics
    """
    try:
        report_service = ReportService(session)
        result = await report_service.get_customer_report(customer_id)
        return result
    except Exception as e:
        logger.error(f"Error generating customer report for ID {customer_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate customer report")

@router.get("/aging")
async def get_invoice_aging_report(
    as_of_date: Optional[date] = Query(None, description="Aging calculation date (defaults to today)"),
    session: Session = Depends(get_session)
):
    """
    Get invoice aging report with buckets: 0-15, 16-30, 31-60, 60+ days
    Returns summary totals and detailed breakdown for each aging bucket
    """
    try:
        report_service = ReportService(session)
        if not as_of_date:
            as_of_date = date.today()
        
        result = await report_service.get_aging_report(as_of_date)
        return result
    except Exception as e:
        logger.error(f"Error generating aging report: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate aging report")

@router.get("/overdue")
async def get_overdue_invoices_report(
    session: Session = Depends(get_session)
):
    """
    Get overdue invoices report showing all past-due invoices with action items
    Returns invoices that are past their due date with contact information
    """
    try:
        report_service = ReportService(session)
        result = await report_service.get_overdue_report()
        return result
    except Exception as e:
        logger.error(f"Error generating overdue report: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate overdue report")

@router.get("/customers/list")
async def get_customers_for_reports(
    session: Session = Depends(get_session)
):
    """
    Get list of customers for dropdown selection in reports
    Returns customer ID, name, and basic info for UI dropdowns
    """
    try:
        statement = select(Customer.customer_id, Customer.customer_name, Customer.customer_email).order_by(Customer.customer_name)
        customers = session.exec(statement).all()
        
        return [
            {
                "customer_id": customer.customer_id,
                "customer_name": customer.customer_name,
                "customer_email": customer.customer_email
            }
            for customer in customers
        ]
    except Exception as e:
        logger.error(f"Error fetching customers list: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch customers list")

@router.get("/summary-stats")
async def get_summary_statistics(
    session: Session = Depends(get_session)
):
    """
    Get key summary statistics for the reports dashboard
    Returns total invoices, total revenue, outstanding amount, etc.
    """
    try:
        report_service = ReportService(session)
        stats = await report_service.get_summary_statistics()
        return stats
    except Exception as e:
        logger.error(f"Error generating summary statistics: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate summary statistics")