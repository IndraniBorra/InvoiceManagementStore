import os
from datetime import date, datetime
from typing import List, Optional

import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlmodel import Session, select

from database import get_session
from models import APInvoice, APLineItem, APPayment, APVendor
from services.ap_extractor import extract_from_bytes

router = APIRouter(tags=["accounts-payable"])

# Local fallback directory (used when S3_UPLOADS_BUCKET is not set)
# Use /tmp in Lambda (read-only filesystem), local path otherwise
if os.getenv("AWS_LAMBDA_FUNCTION_NAME"):
    UPLOAD_DIR = "/tmp/uploads/ap"
else:
    UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads", "ap")
os.makedirs(UPLOAD_DIR, exist_ok=True)

S3_BUCKET = os.getenv("S3_UPLOADS_BUCKET", "")


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class APLineItemSchema(BaseModel):
    description: Optional[str] = None
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    line_total: Optional[float] = None

    class Config:
        from_attributes = True


class APVendorSchema(BaseModel):
    id: int
    vendor_name: str
    vendor_email: Optional[str] = None
    vendor_address: Optional[str] = None
    vendor_phone: Optional[str] = None
    bank_details: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class APInvoiceResponse(BaseModel):
    id: int
    vendor_id: Optional[int] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[date] = None
    due_date: Optional[date] = None
    total_amount: float
    currency: str
    status: str
    email_subject: Optional[str] = None
    email_from: Optional[str] = None
    email_received_at: Optional[datetime] = None
    pdf_filename: Optional[str] = None
    extraction_confidence: Optional[float] = None
    notes: Optional[str] = None
    created_at: datetime
    vendor: Optional[APVendorSchema] = None
    line_items: List[APLineItemSchema] = []
    payments: List[dict] = []

    class Config:
        from_attributes = True


class APVendorCreate(BaseModel):
    vendor_name: str
    vendor_email: Optional[str] = None
    vendor_address: Optional[str] = None
    vendor_phone: Optional[str] = None
    bank_details: Optional[str] = None


class APInvoiceUpdate(BaseModel):
    invoice_number: Optional[str] = None
    invoice_date: Optional[date] = None
    due_date: Optional[date] = None
    total_amount: Optional[float] = None
    currency: Optional[str] = None
    notes: Optional[str] = None
    vendor_id: Optional[int] = None
    line_items: Optional[List[APLineItemSchema]] = None


class APPaymentCreate(BaseModel):
    payment_date: date
    payment_amount: float
    payment_method: str
    payment_reference: Optional[str] = None
    notes: Optional[str] = None


class APRejectRequest(BaseModel):
    notes: str


# ── Helper ────────────────────────────────────────────────────────────────────

def _find_or_create_vendor(
    email_from: str,
    vendor_name: Optional[str],
    session: Session,
    vendor_email: Optional[str] = None,
    vendor_address: Optional[str] = None,
) -> Optional[APVendor]:
    """
    Match existing vendor by extracted email.
    If not found, create a new vendor with all available data.
    """
    lookup_email = email_from or vendor_email
    if lookup_email:
        vendor = session.exec(select(APVendor).where(APVendor.vendor_email == lookup_email)).first()
        if vendor:
            return vendor
    if not vendor_name:
        return None
    vendor = APVendor(
        vendor_name=vendor_name,
        vendor_email=lookup_email or None,
        vendor_address=vendor_address or None,
    )
    session.add(vendor)
    session.flush()
    return vendor


def _save_pdf(pdf_bytes: bytes, invoice_id: int) -> str:
    """Save PDF to S3 (production) or local filesystem (development)."""
    filename = f"{invoice_id}.pdf"
    if S3_BUCKET:
        boto3.client("s3").put_object(
            Bucket=S3_BUCKET,
            Key=f"ap/{filename}",
            Body=pdf_bytes,
            ContentType="application/pdf",
        )
    else:
        path = os.path.join(UPLOAD_DIR, filename)
        with open(path, "wb") as f:
            f.write(pdf_bytes)
    return filename


def _build_ap_invoice_from_extraction(
    extracted: dict,
    vendor_id: Optional[int],
    email_subject: Optional[str],
    email_from: Optional[str],
    email_received_at: Optional[datetime],
    session: Session,
) -> APInvoice:
    invoice = APInvoice(
        vendor_id=vendor_id,
        invoice_number=extracted.get("invoice_number"),
        invoice_date=extracted.get("invoice_date"),
        due_date=extracted.get("due_date"),
        total_amount=extracted.get("total_amount") or 0.0,
        currency=extracted.get("currency") or "USD",
        status="pending_review",
        email_subject=email_subject,
        email_from=email_from,
        email_received_at=email_received_at,
        extraction_confidence=extracted.get("confidence"),
    )
    session.add(invoice)
    session.flush()  # get invoice.id

    for item in extracted.get("line_items") or []:
        session.add(APLineItem(
            ap_invoice_id=invoice.id,
            description=item.get("description"),
            quantity=item.get("quantity"),
            unit_price=item.get("unit_price"),
            line_total=item.get("line_total"),
        ))

    return invoice


# ── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/ap/dashboard")
def ap_dashboard(session: Session = Depends(get_session)):
    today = date.today()

    all_invoices = session.exec(select(APInvoice)).all()

    pending_count   = sum(1 for i in all_invoices if i.status == "pending_review")
    approved_count  = sum(1 for i in all_invoices if i.status == "approved")
    paid_count      = sum(1 for i in all_invoices if i.status == "paid")
    rejected_count  = sum(1 for i in all_invoices if i.status == "rejected")

    total_payable = sum(
        i.total_amount for i in all_invoices
        if i.status in ("pending_review", "approved")
    )

    overdue_count = sum(
        1 for i in all_invoices
        if i.status != "paid" and i.status != "rejected"
        and i.due_date and i.due_date < today
    )

    due_soon_count = sum(
        1 for i in all_invoices
        if i.status in ("pending_review", "approved")
        and i.due_date and today <= i.due_date <= date.fromordinal(today.toordinal() + 7)
    )

    return {
        "pending_count":  pending_count,
        "approved_count": approved_count,
        "paid_count":     paid_count,
        "rejected_count": rejected_count,
        "total_payable":  round(total_payable, 2),
        "overdue_count":  overdue_count,
        "due_soon_count": due_soon_count,
    }


# ── PDF upload (manual) ───────────────────────────────────────────────────────

@router.post("/ap/invoice/upload")
async def upload_ap_invoice(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    pdf_bytes = await file.read()
    extracted = extract_from_bytes(pdf_bytes)

    import json as _json
    print("\n" + "="*60)
    print(f"[AP EXTRACTION] {file.filename}")
    print(_json.dumps(extracted, indent=2, default=str))
    print("="*60 + "\n")

    vendor = _find_or_create_vendor(
        email_from="",
        vendor_name=extracted.get("vendor_name"),
        vendor_email=extracted.get("vendor_email"),
        vendor_address=extracted.get("vendor_address"),
        session=session,
    )

    invoice = _build_ap_invoice_from_extraction(
        extracted=extracted,
        vendor_id=vendor.id if vendor else None,
        email_subject=file.filename,
        email_from=None,
        email_received_at=datetime.utcnow(),
        session=session,
    )

    # Save PDF after we have invoice.id
    invoice.pdf_filename = _save_pdf(pdf_bytes, invoice.id)

    session.commit()
    session.refresh(invoice)

    return {
        "id": invoice.id,
        "status": invoice.status,
        "extraction_confidence": invoice.extraction_confidence,
        "extracted": {
            "invoice_number": invoice.invoice_number,
            "invoice_date":   str(invoice.invoice_date) if invoice.invoice_date else None,
            "due_date":       str(invoice.due_date) if invoice.due_date else None,
            "total_amount":   invoice.total_amount,
            "currency":       invoice.currency,
            "vendor_name":    extracted.get("vendor_name"),
        },
    }


# ── List AP invoices ──────────────────────────────────────────────────────────

@router.get("/ap/invoices")
def list_ap_invoices(
    status: Optional[str] = None,
    session: Session = Depends(get_session),
):
    stmt = select(APInvoice)
    if status:
        stmt = stmt.where(APInvoice.status == status)
    invoices = session.exec(stmt.order_by(APInvoice.created_at.desc())).all()

    result = []
    for inv in invoices:
        vendor = session.get(APVendor, inv.vendor_id) if inv.vendor_id else None
        result.append({
            "id":           inv.id,
            "vendor_id":    inv.vendor_id,
            "vendor_name":  vendor.vendor_name if vendor else None,
            "invoice_number": inv.invoice_number,
            "invoice_date": str(inv.invoice_date) if inv.invoice_date else None,
            "due_date":     str(inv.due_date) if inv.due_date else None,
            "total_amount": inv.total_amount,
            "currency":     inv.currency,
            "status":       inv.status,
            "overdue":      (
                inv.status not in ("paid", "rejected")
                and inv.due_date is not None
                and inv.due_date < date.today()
            ),
            "created_at":   inv.created_at.isoformat(),
        })
    return result


# ── Single AP invoice detail ──────────────────────────────────────────────────

@router.get("/ap/invoice/{invoice_id}")
def get_ap_invoice(invoice_id: int, session: Session = Depends(get_session)):
    invoice = session.get(APInvoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail=f"AP Invoice #{invoice_id} not found")

    vendor = session.get(APVendor, invoice.vendor_id) if invoice.vendor_id else None
    line_items = session.exec(select(APLineItem).where(APLineItem.ap_invoice_id == invoice_id)).all()
    payments = session.exec(select(APPayment).where(APPayment.ap_invoice_id == invoice_id)).all()

    return {
        "id":           invoice.id,
        "vendor_id":    invoice.vendor_id,
        "vendor":       {"id": vendor.id, "vendor_name": vendor.vendor_name, "vendor_email": vendor.vendor_email, "vendor_address": vendor.vendor_address, "vendor_phone": vendor.vendor_phone, "bank_details": vendor.bank_details} if vendor else None,
        "invoice_number": invoice.invoice_number,
        "invoice_date": str(invoice.invoice_date) if invoice.invoice_date else None,
        "due_date":     str(invoice.due_date) if invoice.due_date else None,
        "total_amount": invoice.total_amount,
        "currency":     invoice.currency,
        "status":       invoice.status,
        "email_subject": invoice.email_subject,
        "email_from":   invoice.email_from,
        "email_received_at": invoice.email_received_at.isoformat() if invoice.email_received_at else None,
        "pdf_filename": invoice.pdf_filename,
        "extraction_confidence": invoice.extraction_confidence,
        "notes":        invoice.notes,
        "created_at":   invoice.created_at.isoformat(),
        "overdue": (
            invoice.status not in ("paid", "rejected")
            and invoice.due_date is not None
            and invoice.due_date < date.today()
        ),
        "line_items": [
            {"id": li.id, "description": li.description, "quantity": li.quantity, "unit_price": li.unit_price, "line_total": li.line_total}
            for li in line_items
        ],
        "payments": [
            {"id": p.id, "payment_date": str(p.payment_date), "payment_amount": p.payment_amount, "payment_method": p.payment_method, "payment_reference": p.payment_reference, "notes": p.notes, "created_at": p.created_at.isoformat()}
            for p in payments
        ],
    }


# ── Serve PDF ─────────────────────────────────────────────────────────────────

@router.get("/ap/invoice/{invoice_id}/pdf")
def serve_pdf(invoice_id: int, session: Session = Depends(get_session)):
    invoice = session.get(APInvoice, invoice_id)
    if not invoice or not invoice.pdf_filename:
        raise HTTPException(status_code=404, detail="PDF not found")

    if S3_BUCKET:
        # Production: proxy PDF bytes from S3 through Lambda
        # (avoids CORS/iframe issues with presigned URLs)
        try:
            obj = boto3.client("s3").get_object(
                Bucket=S3_BUCKET, Key=f"ap/{invoice.pdf_filename}"
            )
            return Response(content=obj["Body"].read(), media_type="application/pdf")
        except ClientError as e:
            raise HTTPException(status_code=404, detail="PDF not found in storage")
    else:
        # Local development: serve from filesystem
        from fastapi.responses import FileResponse
        path = os.path.join(UPLOAD_DIR, invoice.pdf_filename)
        if not os.path.exists(path):
            raise HTTPException(status_code=404, detail="PDF file missing on disk")
        return FileResponse(path, media_type="application/pdf")


# ── Update (user corrects extracted fields) ───────────────────────────────────

@router.put("/ap/invoice/{invoice_id}")
def update_ap_invoice(
    invoice_id: int,
    body: APInvoiceUpdate,
    session: Session = Depends(get_session),
):
    invoice = session.get(APInvoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="AP Invoice not found")

    if body.invoice_number is not None: invoice.invoice_number = body.invoice_number
    if body.invoice_date   is not None: invoice.invoice_date   = body.invoice_date
    if body.due_date       is not None: invoice.due_date       = body.due_date
    if body.total_amount   is not None: invoice.total_amount   = body.total_amount
    if body.currency       is not None: invoice.currency       = body.currency
    if body.notes          is not None: invoice.notes          = body.notes
    if body.vendor_id      is not None: invoice.vendor_id      = body.vendor_id

    if body.line_items is not None:
        # Replace all line items
        existing = session.exec(select(APLineItem).where(APLineItem.ap_invoice_id == invoice_id)).all()
        for li in existing:
            session.delete(li)
        for item in body.line_items:
            session.add(APLineItem(
                ap_invoice_id=invoice_id,
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                line_total=item.line_total,
            ))

    session.commit()
    session.refresh(invoice)
    return {"id": invoice.id, "status": invoice.status}


# ── Approve ───────────────────────────────────────────────────────────────────

@router.post("/ap/invoice/{invoice_id}/approve")
def approve_ap_invoice(invoice_id: int, session: Session = Depends(get_session)):
    invoice = session.get(APInvoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="AP Invoice not found")
    if invoice.status not in ("pending_review",):
        raise HTTPException(status_code=400, detail=f"Cannot approve an invoice with status '{invoice.status}'")
    invoice.status = "approved"
    session.commit()
    return {"id": invoice.id, "status": invoice.status}


# ── Reject ────────────────────────────────────────────────────────────────────

@router.post("/ap/invoice/{invoice_id}/reject")
def reject_ap_invoice(
    invoice_id: int,
    body: APRejectRequest,
    session: Session = Depends(get_session),
):
    invoice = session.get(APInvoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="AP Invoice not found")
    if invoice.status == "paid":
        raise HTTPException(status_code=400, detail="Cannot reject a paid invoice")
    invoice.status = "rejected"
    invoice.notes  = body.notes
    session.commit()
    return {"id": invoice.id, "status": invoice.status}


# ── Record Payment ────────────────────────────────────────────────────────────

@router.post("/ap/invoice/{invoice_id}/pay")
def record_payment(
    invoice_id: int,
    body: APPaymentCreate,
    session: Session = Depends(get_session),
):
    invoice = session.get(APInvoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="AP Invoice not found")
    if invoice.status == "rejected":
        raise HTTPException(status_code=400, detail="Cannot pay a rejected invoice")

    payment = APPayment(
        ap_invoice_id=invoice_id,
        payment_date=body.payment_date,
        payment_amount=body.payment_amount,
        payment_method=body.payment_method,
        payment_reference=body.payment_reference,
        notes=body.notes,
    )
    invoice.status = "paid"
    session.add(payment)
    session.commit()
    return {"id": invoice.id, "status": invoice.status, "payment_id": payment.id}


# ── Vendors ───────────────────────────────────────────────────────────────────

@router.get("/ap/vendors")
def list_vendors(session: Session = Depends(get_session)):
    vendors = session.exec(select(APVendor).order_by(APVendor.vendor_name)).all()
    return [
        {"id": v.id, "vendor_name": v.vendor_name, "vendor_email": v.vendor_email,
         "vendor_address": v.vendor_address, "vendor_phone": v.vendor_phone,
         "bank_details": v.bank_details, "created_at": v.created_at.isoformat()}
        for v in vendors
    ]


@router.post("/ap/vendor")
def create_vendor(body: APVendorCreate, session: Session = Depends(get_session)):
    vendor = APVendor(**body.model_dump())
    session.add(vendor)
    session.commit()
    session.refresh(vendor)
    return {"id": vendor.id, "vendor_name": vendor.vendor_name}


@router.put("/ap/vendor/{vendor_id}")
def update_vendor(
    vendor_id: int,
    body: APVendorCreate,
    session: Session = Depends(get_session),
):
    vendor = session.get(APVendor, vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(vendor, k, v)
    session.commit()
    session.refresh(vendor)
    return {"id": vendor.id, "vendor_name": vendor.vendor_name}
