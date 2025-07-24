from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from database import get_session, engine
from typing import List
from datetime import date, timedelta
from models import Invoice, LineItem, Customer
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
        invoice_status=invoice_data.invoice_status,
        customer=customer,
        line_items=[
            LineItem(
                product_id=item.product_id,
                lineitem_qty=item.lineitem_qty,
                lineitem_total=item.lineitem_total
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
                lineitem_qty=item.lineitem_qty,
                lineitem_total=item.lineitem_total
            )
            for item in invoice.line_items
        ]
    )

  


#Get: Retrieve all invoices
@router.get("/invoices", response_model=List[InvoiceMinimalResponse])
def get_all_invoices(session: Session = Depends(get_session)):
    invoices = session.exec(select(Invoice)).all()
    print("Retrieved Invoices:", invoices)
    if not invoices:
        raise HTTPException(status_code=404, detail="No invoices found")
    return [
        InvoiceMinimalResponse(
            id=inv.id,
            customer_id=inv.customer_id,
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
                    lineitem_qty=item.lineitem_qty,
                    lineitem_total=item.lineitem_total
                )
                for item in inv.line_items
            ]
        )
        for inv in invoices
    ]


#Get: Retrieve a specific invoice by ID
@router.get("/invoice/{invoice_id}", response_model=InvoiceMinimalResponse)
def get_invoice(invoice_id: int, session: Session = Depends(get_session)):
    invoice = session.get(Invoice, invoice_id)
    print("Invoice ID:", invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    response = InvoiceMinimalResponse(
        id=invoice.id,
        customer_name=invoice.customer_name,
        address=invoice.address,
        phone=invoice.phone,
        date_issued=invoice.date_issued,
        due_date=invoice.due_date,
        terms=invoice.terms,
        invoice_status=invoice.invoice_status,
        total=invoice.total,
        items=[
            LineItemMinimalResponse(
                description=item.description,
                qty=item.qty , # Include quantity if needed
                price=item.price , # Include price if needed
                amount=item.amount

            )
            for item in invoice.items
        ]
    )
    print("Response:", response)
    return response
    

#Delete: Delete a specific invoice by ID
@router.delete("/invoice/{invoice_id}")
def delete_invoice(invoice_id: int, session: Session = Depends(get_session)):
    invoice = session.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    session.delete(invoice)
    session.commit()
    return {"deleted": True, "id": invoice_id, "message": "Invoice deleted successfully"}

#Put: Update a specific invoice by ID
@router.put("/invoice/{invoice_id}", response_model=InvoiceMinimalResponse)
def update_invoice(invoice_id: int, updated_invoice: InvoiceRequest, session: Session = Depends(get_session)):

    statement = select(Invoice).where(Invoice.id == invoice_id).with_for_update()
    invoice_db = session.exec(statement).first()

    if not invoice_db:
        raise HTTPException(status_code=404, detail="Invoice not found")

   
    # Update fields
    invoice_db.customer_name = updated_invoice.customer_name
    invoice_db.address = updated_invoice.address
    invoice_db.phone = updated_invoice.phone
    invoice_db.date_issued = updated_invoice.date_issued
    invoice_db.terms = updated_invoice.terms
    invoice_db.due_date = calculate_due_date(updated_invoice.date_issued, updated_invoice.terms)
    invoice_db.invoice_status = "draft"


    # Clear old items and add new ones
    invoice_db.items.clear()
    total = 0.0
    for item_data in updated_invoice.items:
        amount = item_data.qty * item_data.price
        total += amount
        invoice_db.items.append(LineItem(
            description=item_data.description,
            qty=item_data.qty,
            price=item_data.price,
            amount=amount
        ))

    invoice_db.total = total
    
    session.add(invoice_db)
    session.commit()
    session.refresh(invoice_db)

    return InvoiceMinimalResponse(
        id=invoice_db.id,
        customer_name=invoice_db.customer_name,
        address=invoice_db.address,
        phone=invoice_db.phone,
        date_issued=invoice_db.date_issued,
        due_date=invoice_db.due_date,
        invoice_status=invoice_db.invoice_status,
        terms=invoice_db.terms,
        total=invoice_db.total,
        items=[
            LineItemMinimalResponse(
                description=item.description,
                qty=item.qty , # Include quantity if needed
                price=item.price , # Include price if needed
                amount=item.amount
            )
            for item in invoice_db.items
        ]
    )
