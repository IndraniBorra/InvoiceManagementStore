from sqlmodel import Session, select, func, and_, or_, text
from datetime import date, datetime, timedelta
from typing import Dict, List, Any, Optional
import calendar
from models import Invoice, Customer, Product, LineItem

class ReportService:
    def __init__(self, session: Session):
        self.session = session

    async def get_revenue_summary(self) -> Dict[str, Any]:
        """
        Generate revenue summary dashboard data
        Returns current month, last month, growth rates, and key metrics
        """
        today = date.today()
        current_month_start = today.replace(day=1)
        
        # Calculate last month
        if current_month_start.month == 1:
            last_month_start = current_month_start.replace(year=current_month_start.year - 1, month=12)
            last_month_end = current_month_start - timedelta(days=1)
        else:
            last_month_start = current_month_start.replace(month=current_month_start.month - 1)
            last_month_end = current_month_start - timedelta(days=1)

        # Current month revenue
        current_month_stmt = select(
            func.count(Invoice.id).label('invoice_count'),
            func.coalesce(func.sum(Invoice.invoice_total), 0).label('total_revenue')
        ).where(
            and_(
                Invoice.date_issued >= current_month_start,
                Invoice.date_issued <= today,
                Invoice.invoice_status != 'cancelled'
            )
        )
        current_month_result = self.session.exec(current_month_stmt).first()

        # Last month revenue
        last_month_stmt = select(
            func.count(Invoice.id).label('invoice_count'),
            func.coalesce(func.sum(Invoice.invoice_total), 0).label('total_revenue')
        ).where(
            and_(
                Invoice.date_issued >= last_month_start,
                Invoice.date_issued <= last_month_end,
                Invoice.invoice_status != 'cancelled'
            )
        )
        last_month_result = self.session.exec(last_month_stmt).first()

        # Paid vs Unpaid amounts
        paid_stmt = select(
            func.coalesce(func.sum(Invoice.invoice_total), 0)
        ).where(
            Invoice.invoice_status == 'paid'
        )
        paid_amount = self.session.exec(paid_stmt).first()

        unpaid_stmt = select(
            func.coalesce(func.sum(Invoice.invoice_total), 0)
        ).where(
            and_(
                Invoice.invoice_status.in_(['draft', 'sent']),
                Invoice.invoice_status != 'cancelled'
            )
        )
        unpaid_amount = self.session.exec(unpaid_stmt).first()

        # Calculate growth rate
        current_revenue = float(current_month_result.total_revenue) if current_month_result else 0
        last_revenue = float(last_month_result.total_revenue) if last_month_result else 0
        growth_rate = ((current_revenue - last_revenue) / last_revenue * 100) if last_revenue > 0 else 0

        # Get 6-month revenue trend
        monthly_trends = await self._get_monthly_revenue_trend(6)

        return {
            "current_month": {
                "revenue": current_revenue,
                "invoice_count": current_month_result.invoice_count if current_month_result else 0,
                "month_name": calendar.month_name[today.month],
                "year": today.year
            },
            "last_month": {
                "revenue": last_revenue,
                "invoice_count": last_month_result.invoice_count if last_month_result else 0,
                "month_name": calendar.month_name[last_month_start.month],
                "year": last_month_start.year
            },
            "growth": {
                "rate": round(growth_rate, 2),
                "amount": round(current_revenue - last_revenue, 2),
                "is_positive": growth_rate >= 0
            },
            "amounts": {
                "paid": float(paid_amount) if paid_amount else 0,
                "unpaid": float(unpaid_amount) if unpaid_amount else 0,
                "total": float(paid_amount or 0) + float(unpaid_amount or 0)
            },
            "monthly_trends": monthly_trends,
            "generated_at": datetime.now().isoformat()
        }

    async def _get_monthly_revenue_trend(self, months: int) -> List[Dict[str, Any]]:
        """Get monthly revenue trend for the last N months"""
        trends = []
        today = date.today()
        
        for i in range(months - 1, -1, -1):
            # Calculate month start/end
            if today.month - i <= 0:
                month = 12 + (today.month - i)
                year = today.year - 1
            else:
                month = today.month - i
                year = today.year
            
            month_start = date(year, month, 1)
            if month == 12:
                month_end = date(year + 1, 1, 1) - timedelta(days=1)
            else:
                month_end = date(year, month + 1, 1) - timedelta(days=1)
            
            # Don't include future months
            if month_start > today:
                continue
                
            # Get revenue for this month
            stmt = select(
                func.coalesce(func.sum(Invoice.invoice_total), 0)
            ).where(
                and_(
                    Invoice.date_issued >= month_start,
                    Invoice.date_issued <= month_end,
                    Invoice.invoice_status != 'cancelled'
                )
            )
            revenue = self.session.exec(stmt).first()
            
            trends.append({
                "month": calendar.month_name[month],
                "year": year,
                "revenue": float(revenue) if revenue else 0,
                "month_key": f"{year}-{month:02d}"
            })
        
        return trends

    async def get_all_invoices_report(self, start_date: Optional[date] = None, end_date: Optional[date] = None,
                                    customer_id: Optional[int] = None, status: Optional[str] = None,
                                    min_amount: Optional[float] = None, max_amount: Optional[float] = None,
                                    page: int = 1, page_size: int = 50) -> Dict[str, Any]:
        """
        Get all invoices with filtering and pagination
        """
        # Build base query
        stmt = select(
            Invoice.id,
            Invoice.date_issued,
            Invoice.invoice_due_date,
            Invoice.invoice_total,
            Invoice.invoice_status,
            Customer.customer_name,
            Customer.customer_id
        ).join(Customer, Invoice.customer_id == Customer.customer_id)
        
        # Apply filters
        filters = []
        if start_date:
            filters.append(Invoice.date_issued >= start_date)
        if end_date:
            filters.append(Invoice.date_issued <= end_date)
        if customer_id:
            filters.append(Invoice.customer_id == customer_id)
        if status:
            filters.append(Invoice.invoice_status == status)
        if min_amount:
            filters.append(Invoice.invoice_total >= min_amount)
        if max_amount:
            filters.append(Invoice.invoice_total <= max_amount)
        
        if filters:
            stmt = stmt.where(and_(*filters))
        
        # Get total count for pagination
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_count = self.session.exec(count_stmt).first()
        
        # Apply pagination and ordering
        stmt = stmt.order_by(Invoice.date_issued.desc())
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        
        invoices = self.session.exec(stmt).all()
        
        # Calculate summary statistics
        summary_stmt = select(
            func.count(Invoice.id).label('total_invoices'),
            func.coalesce(func.sum(Invoice.invoice_total), 0).label('total_amount')
        )
        
        if filters:
            summary_stmt = summary_stmt.where(and_(*filters))
            
        summary = self.session.exec(summary_stmt).first()
        
        # Calculate paid/unpaid separately for simplicity
        paid_amount = sum(float(inv.invoice_total) for inv in invoices if inv.invoice_status == 'paid')
        unpaid_amount = sum(float(inv.invoice_total) for inv in invoices if inv.invoice_status != 'paid')
        
        return {
            "invoices": [
                {
                    "id": inv.id,
                    "invoice_number": f"INV-{inv.id:04d}",
                    "customer_name": inv.customer_name,
                    "customer_id": inv.customer_id,
                    "invoice_date": inv.date_issued.isoformat(),
                    "due_date": inv.invoice_due_date.isoformat() if inv.invoice_due_date else None,
                    "total_amount": float(inv.invoice_total),
                    "status": inv.invoice_status
                }
                for inv in invoices
            ],
            "summary": {
                "total_invoices": summary.total_invoices if summary else 0,
                "total_amount": float(summary.total_amount) if summary else 0,
                "paid_amount": paid_amount,
                "unpaid_amount": unpaid_amount
            },
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total_count": total_count,
                "total_pages": (total_count + page_size - 1) // page_size if total_count else 0,
                "has_next": page * page_size < total_count,
                "has_previous": page > 1
            },
            "filters_applied": {
                "start_date": start_date.isoformat() if start_date else None,
                "end_date": end_date.isoformat() if end_date else None,
                "customer_id": customer_id,
                "status": status,
                "min_amount": min_amount,
                "max_amount": max_amount
            }
        }

    async def get_customer_report(self, customer_id: int) -> Dict[str, Any]:
        """
        Get detailed report for a specific customer
        """
        # Get customer info
        customer_stmt = select(Customer).where(Customer.customer_id == customer_id)
        customer = self.session.exec(customer_stmt).first()
        
        if not customer:
            raise ValueError(f"Customer with ID {customer_id} not found")
        
        # Get customer invoice summary
        summary_stmt = select(
            func.count(Invoice.id).label('total_invoices'),
            func.coalesce(func.sum(Invoice.invoice_total), 0).label('total_amount'),
            func.coalesce(func.avg(Invoice.invoice_total), 0).label('avg_invoice')
        ).where(
            and_(
                Invoice.customer_id == customer_id,
                Invoice.invoice_status != 'cancelled'
            )
        )
        summary = self.session.exec(summary_stmt).first()
        
        # Get recent invoices (last 10)
        recent_stmt = select(
            Invoice.id,
            Invoice.date_issued,
            Invoice.invoice_due_date,
            Invoice.invoice_total,
            Invoice.invoice_status
        ).where(
            Invoice.customer_id == customer_id
        ).order_by(Invoice.date_issued.desc()).limit(10)
        
        recent_invoices = self.session.exec(recent_stmt).all()
        
        # Calculate outstanding balance from recent invoices  
        outstanding_balance = sum(float(inv.invoice_total) for inv in recent_invoices if inv.invoice_status != 'paid')
        paid_amount = sum(float(inv.invoice_total) for inv in recent_invoices if inv.invoice_status == 'paid')
        
        # Calculate payment behavior
        payment_stats = await self._calculate_payment_behavior(customer_id)
        
        return {
            "customer": {
                "id": customer.customer_id,
                "name": customer.customer_name,
                "address": customer.customer_address,
                "phone": customer.customer_phone,
                "email": customer.customer_email
            },
            "summary": {
                "total_invoices": summary.total_invoices if summary else 0,
                "total_amount": float(summary.total_amount) if summary else 0,
                "paid_amount": paid_amount,
                "outstanding_amount": outstanding_balance
            },
            "invoices": [
                {
                    "id": inv.id,
                    "invoice_number": f"INV-{inv.id:04d}",
                    "invoice_date": inv.date_issued.isoformat(),
                    "due_date": inv.invoice_due_date.isoformat() if inv.invoice_due_date else None,
                    "total_amount": float(inv.invoice_total),
                    "status": inv.invoice_status,
                    "days_to_pay": None  # Simplified - would need actual payment tracking
                }
                for inv in recent_invoices
            ],
            "payment_behavior": payment_stats,
            "generated_at": datetime.now().isoformat()
        }

    async def _calculate_payment_behavior(self, customer_id: int) -> Dict[str, Any]:
        """Calculate payment behavior metrics for a customer"""
        # Get paid invoices with payment dates (we'll need to add payment tracking later)
        # For now, we'll calculate based on current status
        
        paid_stmt = select(func.count(Invoice.id)).where(
            and_(
                Invoice.customer_id == customer_id,
                Invoice.invoice_status == 'paid'
            )
        )
        paid_count = self.session.exec(paid_stmt).first()
        
        total_stmt = select(func.count(Invoice.id)).where(
            and_(
                Invoice.customer_id == customer_id,
                Invoice.invoice_status != 'cancelled'
            )
        )
        total_count = self.session.exec(total_stmt).first()
        
        overdue_stmt = select(func.count(Invoice.id)).where(
            and_(
                Invoice.customer_id == customer_id,
                Invoice.invoice_due_date < date.today(),
                Invoice.invoice_status != 'paid',
                Invoice.invoice_status != 'cancelled'
            )
        )
        overdue_count = self.session.exec(overdue_stmt).first()
        
        # Calculate payment rate
        payment_rate = (paid_count / total_count * 100) if total_count and total_count > 0 else 0
        
        # Determine risk level
        if payment_rate >= 90:
            risk_level = "Low"
            rating = 5
        elif payment_rate >= 70:
            risk_level = "Medium"
            rating = 3
        else:
            risk_level = "High"
            rating = 1
        
        return {
            "payment_rate": round(payment_rate, 2),
            "paid_invoices": paid_count or 0,
            "total_invoices": total_count or 0,
            "overdue_invoices": overdue_count or 0,
            "risk_level": risk_level,
            "rating": rating,
            "estimated_days_to_pay": 30  # This would be calculated from actual payment data
        }

    async def get_aging_report(self, as_of_date: date) -> Dict[str, Any]:
        """
        Generate invoice aging report with buckets: 0-15, 16-30, 31-60, 60+ days
        """
        # Get all outstanding invoices
        stmt = select(
            Invoice.id,
            Invoice.date_issued,
            Invoice.invoice_due_date,
            Invoice.invoice_total,
            Customer.customer_name,
            Customer.customer_id
        ).join(
            Customer, Invoice.customer_id == Customer.customer_id
        ).where(
            and_(
                Invoice.invoice_due_date < as_of_date,
                Invoice.invoice_status.in_(['draft', 'sent']),
                Invoice.invoice_status != 'cancelled'
            )
        ).order_by(Invoice.invoice_due_date.asc())
        
        all_invoices = self.session.exec(stmt).all()
        
        # Define aging buckets
        buckets = {
            "current": {"min": 0, "max": 15, "label": "Current (0-15 days)", "invoices": [], "total_amount": 0},
            "days_30": {"min": 16, "max": 30, "label": "16-30 days", "invoices": [], "total_amount": 0},
            "days_60": {"min": 31, "max": 60, "label": "31-60 days", "invoices": [], "total_amount": 0},
            "over_60": {"min": 61, "max": 999, "label": "60+ days", "invoices": [], "total_amount": 0}
        }
        
        # Categorize invoices into buckets
        for inv in all_invoices:
            days_overdue = (as_of_date - inv.invoice_due_date).days
            
            # Determine which bucket this invoice belongs to
            bucket_key = None
            if days_overdue <= 15:
                bucket_key = "current"
            elif days_overdue <= 30:
                bucket_key = "days_30"
            elif days_overdue <= 60:
                bucket_key = "days_60"
            else:
                bucket_key = "over_60"
            
            if bucket_key:
                invoice_data = {
                    "id": inv.id,
                    "customer_name": inv.customer_name,
                    "customer_id": inv.customer_id,
                    "date_issued": inv.date_issued.isoformat(),
                    "due_date": inv.invoice_due_date.isoformat(),
                    "amount": float(inv.invoice_total),
                    "days_overdue": days_overdue
                }
                buckets[bucket_key]["invoices"].append(invoice_data)
                buckets[bucket_key]["total_amount"] += float(inv.invoice_total)
        
        # Calculate totals
        total_amount = sum(bucket["total_amount"] for bucket in buckets.values())
        total_invoices = sum(len(bucket["invoices"]) for bucket in buckets.values())
        
        # Calculate aging buckets summary
        aging_buckets = [
            {
                "bucket": bucket["label"],
                "total_amount": bucket["total_amount"],
                "invoice_count": len(bucket["invoices"]),
                "percentage": round((bucket["total_amount"] / total_amount * 100) if total_amount > 0 else 0, 1)
            }
            for bucket in buckets.values()
        ]
        
        # Flatten all invoices for detail view
        all_invoice_details = []
        for bucket_key, bucket in buckets.items():
            for inv in bucket["invoices"]:
                all_invoice_details.append({
                    "id": inv["id"],
                    "customer_name": inv["customer_name"],
                    "invoice_date": inv["date_issued"],
                    "due_date": inv["due_date"],
                    "total_amount": inv["amount"],
                    "days_outstanding": inv["days_overdue"],
                    "aging_bucket": bucket["label"]
                })
        
        return {
            "as_of_date": as_of_date.isoformat(),
            "summary": {
                "total_outstanding": total_amount,
                "total_invoices": total_invoices,
                "avg_days_outstanding": sum(inv["days_overdue"] for bucket in buckets.values() for inv in bucket["invoices"]) // total_invoices if total_invoices > 0 else 0,
                "oldest_days": max([inv["days_overdue"] for bucket in buckets.values() for inv in bucket["invoices"]], default=0),
                "oldest_invoice": buckets["over_60"]["invoices"][0]["id"] if buckets["over_60"]["invoices"] else None,
                "at_risk_amount": buckets["over_60"]["total_amount"],
                "at_risk_count": len(buckets["over_60"]["invoices"])
            },
            "aging_buckets": aging_buckets,
            "invoices": all_invoice_details,
            "generated_at": datetime.now().isoformat()
        }

    async def get_overdue_report(self) -> Dict[str, Any]:
        """
        Get overdue invoices report - invoices past their due date
        """
        today = date.today()
        
        # Get all overdue invoices
        stmt = select(
            Invoice.id,
            Invoice.date_issued,
            Invoice.invoice_due_date,
            Invoice.invoice_total,
            Invoice.invoice_status,
            Customer.customer_name,
            Customer.customer_id,
            Customer.customer_phone,
            Customer.customer_email
        ).join(
            Customer, Invoice.customer_id == Customer.customer_id
        ).where(
            and_(
                Invoice.invoice_due_date < today,
                Invoice.invoice_status.in_(['draft', 'sent']),
                Invoice.invoice_status != 'cancelled'
            )
        ).order_by(
            Invoice.invoice_due_date.asc()  # Oldest due date first
        )
        
        overdue_invoices = self.session.exec(stmt).all()
        
        # Calculate summary stats
        total_overdue = len(overdue_invoices)
        total_amount = sum(float(inv.invoice_total) for inv in overdue_invoices)
        avg_days_late = sum((today - inv.invoice_due_date).days for inv in overdue_invoices) / total_overdue if total_overdue > 0 else 0
        
        # Categorize by suggested action
        invoices_with_actions = []
        for inv in overdue_invoices:
            days_overdue = (today - inv.invoice_due_date).days
            
            if days_overdue >= 60:
                action = "📞 Urgent Call"
                priority = "High"
            elif days_overdue >= 30:
                action = "📞 Phone Call"
                priority = "Medium"
            elif days_overdue >= 15:
                action = "📧 Email Reminder"
                priority = "Medium"
            else:
                action = "📧 Gentle Reminder"
                priority = "Low"
            
            invoices_with_actions.append({
                "id": inv.id,
                "customer_name": inv.customer_name,
                "customer_id": inv.customer_id,
                "customer_phone": inv.customer_phone,
                "customer_email": inv.customer_email,
                "date_issued": inv.date_issued.isoformat(),
                "due_date": inv.invoice_due_date.isoformat(),
                "amount": float(inv.invoice_total),
                "days_overdue": days_overdue,
                "suggested_action": action,
                "priority": priority
            })
        
        return {
            "summary": {
                "total_overdue_invoices": total_overdue,
                "total_overdue_amount": total_amount,
                "avg_days_overdue": round(avg_days_late, 1),
                "critical_count": len([i for i in invoices_with_actions if i["days_overdue"] >= 90]),
                "critical_amount": sum(i["amount"] for i in invoices_with_actions if i["days_overdue"] >= 90),
                "high_risk_count": len([i for i in invoices_with_actions if 60 <= i["days_overdue"] < 90]),
                "high_risk_amount": sum(i["amount"] for i in invoices_with_actions if 60 <= i["days_overdue"] < 90),
                "medium_risk_count": len([i for i in invoices_with_actions if 30 <= i["days_overdue"] < 60]),
                "medium_risk_amount": sum(i["amount"] for i in invoices_with_actions if 30 <= i["days_overdue"] < 60),
                "low_risk_count": len([i for i in invoices_with_actions if i["days_overdue"] < 30]),
                "low_risk_amount": sum(i["amount"] for i in invoices_with_actions if i["days_overdue"] < 30)
            },
            "invoices": invoices_with_actions,
            "generated_at": datetime.now().isoformat()
        }

    async def get_summary_statistics(self) -> Dict[str, Any]:
        """
        Get key summary statistics for dashboard
        """
        # Total invoices
        total_stmt = select(func.count(Invoice.id)).where(Invoice.invoice_status != 'cancelled')
        total_invoices = self.session.exec(total_stmt).first()
        
        # Total revenue
        revenue_stmt = select(func.coalesce(func.sum(Invoice.invoice_total), 0)).where(Invoice.invoice_status != 'cancelled')
        total_revenue = self.session.exec(revenue_stmt).first()
        
        # Outstanding amount
        outstanding_stmt = select(func.coalesce(func.sum(Invoice.invoice_total), 0)).where(
            and_(
                Invoice.invoice_status.in_(['draft', 'sent']),
                Invoice.invoice_status != 'cancelled'
            )
        )
        outstanding_amount = self.session.exec(outstanding_stmt).first()
        
        # Total customers
        customers_stmt = select(func.count(Customer.customer_id))
        total_customers = self.session.exec(customers_stmt).first()
        
        return {
            "total_invoices": total_invoices or 0,
            "total_revenue": float(total_revenue) if total_revenue else 0,
            "outstanding_amount": float(outstanding_amount) if outstanding_amount else 0,
            "total_customers": total_customers or 0
        }