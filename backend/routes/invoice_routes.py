from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from database import get_session, engine
from typing import List
from datetime import date, timedelta
import models
from models import Invoice, InvoiceItem, InvoiceRequest, InvoiceItemRequest, InvoiceMinimalResponse, InvoiceItemMinimalResponse

router = APIRouter()
# Create the database tables if they don't exist when our application starts
models.SQLModel.metadata.create_all(bind = engine)
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
    items = []
    total = 0.0
    for item in invoice_data.items:
        amount = item.qty * item.price
        total += amount
        items.append(InvoiceItem(
            description=item.description,
            qty=item.qty,
            price=item.price,
            amount=amount
        ))
    due_date = calculate_due_date(invoice_data.date_issued, invoice_data.terms)
    invoice = Invoice(
        customer_name=invoice_data.customer_name,
        address=invoice_data.address,
        phone=invoice_data.phone,
        date_issued=invoice_data.date_issued,
        terms=invoice_data.terms,
        due_date=due_date,
        total=total,
        items=items
    )
    invoice.invoice_status = "submitted"
    session.add(invoice)
    session.commit()
    session.refresh(invoice)

    # Debug: print what you're returning
    print(f"Created Invoice: {invoice}")

    # writing custom response manually:
    return InvoiceMinimalResponse(
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
            InvoiceItemMinimalResponse(
                description=item.description,
                qty=item.qty,  # Include quantity if needed
                price=item.price,  # Include price if needed
                amount=item.amount
            )
            for item in invoice.items
        ]    
    )


#Get: Retrieve all invoices
@router.get("/invoices", response_model=List[InvoiceMinimalResponse])
def get_all_invoices(session: Session = Depends(get_session)):
    invoices = session.exec(select(Invoice)).all()

    return [
        InvoiceMinimalResponse(
            id=inv.id,
            customer_name=inv.customer_name,
            address=inv.address,
            phone=inv.phone,
            date_issued=inv.date_issued,
            due_date=inv.due_date,
            terms=inv.terms,
            invoice_status=inv.invoice_status,
            total=inv.total,
            items=[
                InvoiceItemMinimalResponse(
                    description=item.description,
                    qty=item.qty,  # Include quantity if needed
                    price=item.price,  # Include price if needed
                    amount=item.amount
                )
                for item in inv.items
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
            InvoiceItemMinimalResponse(
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
    # invoice_db = session.get(Invoice, invoice_id).with_for_update()  # Lock the row for update
    # Use select() with for_update() instead of session.get()
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
        invoice_db.items.append(InvoiceItem(
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
            InvoiceItemMinimalResponse(
                description=item.description,
                qty=item.qty , # Include quantity if needed
                price=item.price , # Include price if needed
                amount=item.amount
            )
            for item in invoice_db.items
        ]
    )
