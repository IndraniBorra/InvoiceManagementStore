from datetime import date, datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends
from sqlmodel import Session, select, func
from database import get_session
from models import Invoice, APPayment
import os

router = APIRouter(prefix="/forecasting", tags=["forecasting"])


# ── Helpers ────────────────────────────────────────────────────────────────────

def _month_key(d: date) -> str:
    return d.strftime("%Y-%m")

def _month_label(d: date) -> str:
    return d.strftime("%b %Y")

def _last_n_months(n: int) -> List[date]:
    """Return first day of each of the last N months, oldest first."""
    today = date.today()
    months = []
    for i in range(n - 1, -1, -1):
        # go back i months
        month = (today.replace(day=1) - timedelta(days=1))
        for _ in range(i):
            month = (month.replace(day=1) - timedelta(days=1))
        months.append(month.replace(day=1))
    return months

def _linear_forecast(values: List[float], steps: int = 3) -> List[float]:
    """Simple linear regression forecast."""
    n = len(values)
    if n < 2:
        avg = values[0] if values else 0
        return [avg] * steps
    x_mean = (n - 1) / 2
    y_mean = sum(values) / n
    numerator   = sum((i - x_mean) * (values[i] - y_mean) for i in range(n))
    denominator = sum((i - x_mean) ** 2 for i in range(n))
    slope = numerator / denominator if denominator else 0
    intercept = y_mean - slope * x_mean
    return [max(0, intercept + slope * (n + i)) for i in range(steps)]


# ── Revenue Forecast ───────────────────────────────────────────────────────────

@router.get("/revenue")
def get_revenue_forecast(session: Session = Depends(get_session)):
    """Monthly revenue (paid invoices) for last 12 months + 3-month projection."""
    months = _last_n_months(12)
    month_map = {_month_key(m): 0.0 for m in months}

    paid_invoices = session.exec(
        select(Invoice).where(Invoice.invoice_status == "paid")
    ).all()

    for inv in paid_invoices:
        paid_date = inv.date_paid.date() if inv.date_paid else inv.date_issued
        key = _month_key(paid_date)
        if key in month_map:
            month_map[key] += inv.invoice_total

    actual = [{"month": _month_label(m), "revenue": round(month_map[_month_key(m)], 2), "type": "actual"} for m in months]
    values = [d["revenue"] for d in actual]
    projected_values = _linear_forecast(values, 3)

    projected = []
    last_month = months[-1]
    for i, val in enumerate(projected_values):
        # advance by i+1 months
        next_m = last_month
        for _ in range(i + 1):
            next_m = (next_m.replace(day=28) + timedelta(days=4)).replace(day=1)
        projected.append({"month": _month_label(next_m), "revenue": round(val, 2), "type": "projected"})

    total_actual    = sum(d["revenue"] for d in actual)
    total_projected = sum(d["revenue"] for d in projected)
    avg_monthly     = total_actual / 12 if total_actual else 0
    next_month_est  = projected[0]["revenue"] if projected else 0

    return {
        "actual": actual,
        "projected": projected,
        "summary": {
            "total_12m_revenue":  round(total_actual, 2),
            "avg_monthly_revenue": round(avg_monthly, 2),
            "next_month_estimate": round(next_month_est, 2),
            "3m_projected_total":  round(total_projected, 2),
        }
    }


# ── Cash Flow Forecast ─────────────────────────────────────────────────────────

@router.get("/cashflow")
def get_cashflow_forecast(session: Session = Depends(get_session)):
    """Monthly cash in vs cash out for last 12 months + 3-month projection."""
    months = _last_n_months(12)
    cash_in  = {_month_key(m): 0.0 for m in months}
    cash_out = {_month_key(m): 0.0 for m in months}

    # Cash in: paid AR invoices
    for inv in session.exec(select(Invoice).where(Invoice.invoice_status == "paid")).all():
        paid_date = inv.date_paid.date() if inv.date_paid else inv.date_issued
        key = _month_key(paid_date)
        if key in cash_in:
            cash_in[key] += inv.invoice_total

    # Cash out: AP payments
    for pmt in session.exec(select(APPayment)).all():
        key = _month_key(pmt.payment_date)
        if key in cash_out:
            cash_out[key] += pmt.payment_amount

    result = []
    for m in months:
        key = _month_key(m)
        ci = round(cash_in[key], 2)
        co = round(cash_out[key], 2)
        result.append({
            "month":    _month_label(m),
            "cash_in":  ci,
            "cash_out": co,
            "net":      round(ci - co, 2),
        })

    # Project next 3 months
    in_values  = [d["cash_in"]  for d in result]
    out_values = [d["cash_out"] for d in result]
    in_proj    = _linear_forecast(in_values,  3)
    out_proj   = _linear_forecast(out_values, 3)

    projected = []
    last_month = months[-1]
    for i in range(3):
        next_m = last_month
        for _ in range(i + 1):
            next_m = (next_m.replace(day=28) + timedelta(days=4)).replace(day=1)
        ci = round(in_proj[i], 2)
        co = round(out_proj[i], 2)
        projected.append({"month": _month_label(next_m), "cash_in": ci, "cash_out": co, "net": round(ci - co, 2), "type": "projected"})

    return {"actual": result, "projected": projected}


# ── AR Aging Summary ───────────────────────────────────────────────────────────

@router.get("/aging")
def get_aging_summary(session: Session = Depends(get_session)):
    """AR aging buckets for outstanding invoices."""
    today = date.today()
    buckets = {"current": 0.0, "1_30": 0.0, "31_60": 0.0, "61_90": 0.0, "over_90": 0.0}
    counts  = {"current": 0,   "1_30": 0,   "31_60": 0,   "61_90": 0,   "over_90": 0}

    outstanding = session.exec(
        select(Invoice).where(Invoice.invoice_status.in_(["submitted", "sent", "overdue"]))
    ).all()

    for inv in outstanding:
        days = (today - inv.invoice_due_date).days
        if days <= 0:
            b = "current"
        elif days <= 30:
            b = "1_30"
        elif days <= 60:
            b = "31_60"
        elif days <= 90:
            b = "61_90"
        else:
            b = "over_90"
        buckets[b] += inv.invoice_total
        counts[b]  += 1

    total = sum(buckets.values())
    return {
        "buckets": [
            {"label": "Current",   "key": "current", "amount": round(buckets["current"], 2), "count": counts["current"]},
            {"label": "1–30 days", "key": "1_30",    "amount": round(buckets["1_30"],    2), "count": counts["1_30"]},
            {"label": "31–60 days","key": "31_60",   "amount": round(buckets["31_60"],   2), "count": counts["31_60"]},
            {"label": "61–90 days","key": "61_90",   "amount": round(buckets["61_90"],   2), "count": counts["61_90"]},
            {"label": "90+ days",  "key": "over_90", "amount": round(buckets["over_90"], 2), "count": counts["over_90"]},
        ],
        "total_outstanding": round(total, 2),
        "total_invoices": len(outstanding),
    }


# ── AI Insights ────────────────────────────────────────────────────────────────

@router.get("/insights")
async def get_ai_insights(session: Session = Depends(get_session)):
    """Claude-generated narrative analysis of the business financials."""
    from anthropic import Anthropic

    # Gather key metrics
    today = date.today()
    three_months_ago = today - timedelta(days=90)
    six_months_ago   = today - timedelta(days=180)

    all_invoices = session.exec(select(Invoice)).all()
    paid = [i for i in all_invoices if i.invoice_status == "paid"]
    outstanding = [i for i in all_invoices if i.invoice_status in ("submitted", "sent", "overdue")]
    overdue = [i for i in all_invoices if i.invoice_status == "overdue" or
               (i.invoice_status in ("submitted", "sent") and i.invoice_due_date < today)]

    recent_revenue = sum(i.invoice_total for i in paid
                         if (i.date_paid.date() if i.date_paid else i.date_issued) >= three_months_ago)
    prev_revenue   = sum(i.invoice_total for i in paid
                         if three_months_ago > (i.date_paid.date() if i.date_paid else i.date_issued) >= six_months_ago)

    growth = ((recent_revenue - prev_revenue) / prev_revenue * 100) if prev_revenue else 0
    total_outstanding = sum(i.invoice_total for i in outstanding)
    total_overdue     = sum(i.invoice_total for i in overdue)

    prompt = f"""You are a financial analyst for a small business using SmartInvoice.
Analyze these metrics and give 3-4 sentences of sharp, actionable insights.
Be specific with numbers. Focus on what matters most to a business owner.

Key metrics:
- Revenue last 3 months: ${recent_revenue:,.0f}
- Revenue 3-6 months ago: ${prev_revenue:,.0f}
- Revenue growth: {growth:+.1f}%
- Total outstanding AR: ${total_outstanding:,.0f} ({len(outstanding)} invoices)
- Overdue AR: ${total_overdue:,.0f} ({len(overdue)} invoices)
- Total invoices: {len(all_invoices)}

Write 3-4 actionable sentences. No bullet points. No headers. Just clear analysis."""

    try:
        client = Anthropic()
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}]
        )
        insight_text = response.content[0].text
    except Exception:
        insight_text = f"Revenue grew {growth:+.1f}% over the last quarter (${recent_revenue:,.0f} vs ${prev_revenue:,.0f}). You have ${total_outstanding:,.0f} in outstanding receivables across {len(outstanding)} invoices, with ${total_overdue:,.0f} overdue."

    return {
        "insights": insight_text,
        "metrics": {
            "recent_revenue": round(recent_revenue, 2),
            "prev_revenue":   round(prev_revenue, 2),
            "growth_pct":     round(growth, 1),
            "total_outstanding": round(total_outstanding, 2),
            "total_overdue":  round(total_overdue, 2),
            "overdue_count":  len(overdue),
        }
    }
