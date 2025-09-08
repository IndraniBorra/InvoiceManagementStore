from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from sqlalchemy.orm import selectinload, joinedload
from database import get_session, engine
from typing import List
from datetime import date, timedelta
from models import Invoice, LineItem, Customer, Product
from api import InvoiceRequest, InvoiceMinimalResponse, LineItemMinimalResponse, LineItemRequest

router = APIRouter()

# Invoice routes



#calculate due date based on terms
def calculate_due_date(date_issued: date, terms: str) -> date:
    terms_map = {
        "Due on Receipt": 0,
        "Net 15": 15,
        "Net 30": 30,
        "Net 45": 45,
        "Net 60": 60,
        "Due end of the month": 0,
        "Due end of next month": 0
    }
    if terms == "Due end of the month":
        # Get first day of next month, then subtract one day
        next_month = date_issued.replace(day=1) + timedelta(days=32)
        return next_month.replace(day=1) - timedelta(days=1)
    elif terms == "Due end of next month":
        # Skip to next month, then add one more month
        next_month = date_issued.replace(day=1) + timedelta(days=32)
        following_month = next_month.replace(day=1) + timedelta(days=32)
        return following_month.replace(day=1) - timedelta(days=1)
    return date_issued + timedelta(days=terms_map.get(terms, 0))






#Post: Create a new invoice
@router.post("/invoice", response_model=InvoiceMinimalResponse)
def create_invoice(invoice_data: InvoiceRequest, session: Session = Depends(get_session)):

    customer = session.get(Customer, invoice_data.customer_id)
   
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    
    due_date = calculate_due_date(invoice_data.date_issued, invoice_data.invoice_terms)
    
    invoice = Invoice(
        customer_id=invoice_data.customer_id,
        date_issued=invoice_data.date_issued,
        invoice_terms=invoice_data.invoice_terms,
        invoice_due_date=due_date,
        invoice_total=invoice_data.invoice_total,
        invoice_status=invoice_data.invoice_status,
        customer=customer,
        line_items=[
            LineItem(
                product_id=item.product_id,
                lineitem_qty=item.line_items_qty,
                lineitem_total=item.line_items_total
            )
            for item in invoice_data.line_items
        ]
    )

    print(f"Creating Invoice: {invoice}")

    invoice.invoice_status = "submitted"
    session.add(invoice)
    session.commit()
    session.refresh(invoice)

    return InvoiceMinimalResponse(
        id=invoice.id,
        customer_id=invoice.customer_id,
        customer_name=invoice.customer.customer_name,
        customer_address=invoice.customer.customer_address,
        customer_phone=invoice.customer.customer_phone,
        date_issued=invoice.date_issued,
        invoice_due_date=due_date,
        invoice_terms=invoice.invoice_terms,
        invoice_status=invoice.invoice_status,
        invoice_total=invoice.invoice_total,
        line_items=[
            LineItemMinimalResponse(
                product_id=item.product_id,
                product_description=item.product.product_description,
                product_price=item.product.product_price,
                lineitem_qty=item.lineitem_qty,
                lineitem_total=item.lineitem_total
            )
            for item in invoice.line_items
        ]
    )

  


#Get: Retrieve all invoices (optimized with eager loading to fix N+1 issues)
@router.get("/invoices", response_model=List[InvoiceMinimalResponse])
def get_all_invoices(session: Session = Depends(get_session)):
    """
    Retrieve all invoices with optimized query to prevent N+1 issues.
    
    Uses selectinload for one-to-many relationships (line_items) and 
    joinedload for many-to-one relationships (customer, product).
    """
    # Optimized query with eager loading for all relationships
    statement = (
        select(Invoice)
        .options(
            # Load customer data with joinedload (many-to-one)
            joinedload(Invoice.customer),
            # Load line items with selectinload (one-to-many)
            selectinload(Invoice.line_items).joinedload(LineItem.product)
        )
    )
    
    invoices = session.exec(statement).unique().all()
    
    if not invoices:
        raise HTTPException(status_code=404, detail="No invoices found")
    
    return [
        InvoiceMinimalResponse(
            id=inv.id,
            customer_name=inv.customer.customer_name,
            customer_address=inv.customer.customer_address,
            customer_phone=inv.customer.customer_phone,
            date_issued=inv.date_issued,
            invoice_due_date=inv.invoice_due_date,
            invoice_terms=inv.invoice_terms,
            invoice_status=inv.invoice_status,
            invoice_total=inv.invoice_total,
            line_items=[
                LineItemMinimalResponse(
                    product_id=item.product_id,
                    product_description=item.product.product_description if item.product else "Unknown Product",
                    product_price=item.product.product_price if item.product else 0.0,
                    lineitem_qty=item.lineitem_qty,
                    lineitem_total=item.lineitem_total
                )
                for item in inv.line_items
            ]
        )
        for inv in invoices
    ]


#Get: Retrieve a specific invoice by ID (optimized with eager loading)
@router.get("/invoice/{invoice_id}", response_model=InvoiceMinimalResponse)
def get_invoice(invoice_id: int, session: Session = Depends(get_session)):
    """
    Retrieve a specific invoice with optimized query to prevent N+1 issues.
    
    Loads customer and all line items with their product details in a single query.
    """
    # Optimized query with eager loading
    statement = (
        select(Invoice)
        .where(Invoice.id == invoice_id)
        .options(
            # Load customer data with joinedload (many-to-one)
            joinedload(Invoice.customer),
            # Load line items with selectinload (one-to-many)
            selectinload(Invoice.line_items).joinedload(LineItem.product)
        )
    )
    
    invoice = session.exec(statement).unique().first()
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    return InvoiceMinimalResponse(
        id=invoice.id,
        customer_name=invoice.customer.customer_name,
        customer_address=invoice.customer.customer_address,
        customer_phone=invoice.customer.customer_phone,
        date_issued=invoice.date_issued,
        invoice_due_date=invoice.invoice_due_date,
        invoice_terms=invoice.invoice_terms,
        invoice_status=invoice.invoice_status,
        invoice_total=invoice.invoice_total,
        line_items=[
            LineItemMinimalResponse(
                product_id=item.product_id,
                product_description=item.product.product_description if item.product else "Unknown Product",
                product_price=item.product.product_price if item.product else 0.0,
                lineitem_qty=item.lineitem_qty,
                lineitem_total=item.lineitem_total
            )
            for item in invoice.line_items
        ]
    )



#Delete: Delete a specific invoice by ID
@router.delete("/invoice/{invoice_id}")
def delete_invoice(invoice_id: int, session: Session = Depends(get_session)):
    invoice = session.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    session.delete(invoice)
    session.commit()
    return {"deleted": True, "id": invoice_id, "message": "Invoice deleted successfully"}

#Put: Update a specific invoice by ID (optimized with eager loading)
@router.put("/invoice/{invoice_id}", response_model=InvoiceMinimalResponse)
def update_invoice(invoice_id: int, updated_invoice: InvoiceRequest, session: Session = Depends(get_session)):
    """
    Update an existing invoice with optimized database queries.
    
    Uses eager loading to prevent N+1 issues when returning the updated invoice.
    """
    # Get invoice with relationships loaded for efficient updates
    statement = (
        select(Invoice)
        .where(Invoice.id == invoice_id)
        .options(
            selectinload(Invoice.line_items),
            joinedload(Invoice.customer)
        )
        .with_for_update()
    )
    invoice_db = session.exec(statement).unique().first()

    if not invoice_db:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Verify customer exists (if changed)
    if invoice_db.customer_id != updated_invoice.customer_id:
        customer = session.get(Customer, updated_invoice.customer_id)
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
   
    # Update invoice fields (matching actual Invoice model)
    invoice_db.customer_id = updated_invoice.customer_id
    invoice_db.date_issued = updated_invoice.date_issued
    invoice_db.invoice_terms = updated_invoice.invoice_terms
    invoice_db.invoice_due_date = calculate_due_date(updated_invoice.date_issued, updated_invoice.invoice_terms)
    invoice_db.invoice_status = updated_invoice.invoice_status or "draft"
    invoice_db.invoice_total = updated_invoice.invoice_total

    # Clear old line items and add new ones
    invoice_db.line_items.clear()
    
    for item_data in updated_invoice.line_items:
        new_item = LineItem(
            product_id=item_data.product_id,
            lineitem_qty=item_data.line_items_qty,
            lineitem_total=item_data.line_items_total
        )
        invoice_db.line_items.append(new_item)
    
    session.add(invoice_db)
    session.commit()
    session.refresh(invoice_db)
    
    # Reload with relationships to ensure we have fresh data including line item products
    statement = (
        select(Invoice)
        .where(Invoice.id == invoice_id)
        .options(
            joinedload(Invoice.customer),
            selectinload(Invoice.line_items).joinedload(LineItem.product)
        )
    )
    updated_invoice_db = session.exec(statement).unique().first()

    return InvoiceMinimalResponse(
        id=updated_invoice_db.id,
        customer_name=updated_invoice_db.customer.customer_name,
        customer_address=updated_invoice_db.customer.customer_address,
        customer_phone=updated_invoice_db.customer.customer_phone,
        date_issued=updated_invoice_db.date_issued,
        invoice_due_date=updated_invoice_db.invoice_due_date,
        invoice_terms=updated_invoice_db.invoice_terms,
        invoice_status=updated_invoice_db.invoice_status,
        invoice_total=updated_invoice_db.invoice_total,
        line_items=[
            LineItemMinimalResponse(
                product_id=item.product_id,
                product_description=item.product.product_description if item.product else "Unknown Product",
                product_price=item.product.product_price if item.product else 0.0,
                lineitem_qty=item.lineitem_qty,
                lineitem_total=item.lineitem_total
            )
            for item in updated_invoice_db.line_items
        ]
    )
