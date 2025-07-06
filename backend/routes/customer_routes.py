from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from database import get_session, engine
from typing import List
import models
from models import Customer, CustomerRequest, CustomerMinimalResponse

router = APIRouter()
# Create the database tables if they don't exist when our application starts
models.SQLModel.metadata.create_all(bind=engine)    

# Customer routes

# Create a new customer
@router.post("/customers", response_model=CustomerMinimalResponse)
def create_customer(customer: CustomerRequest, session: Session = Depends(get_session)):
    customer_db = Customer.from_orm(customer)
    session.add(customer_db)
    session.commit()
    session.refresh(customer_db)
    return CustomerMinimalResponse(
        id=customer_db.id,
        name=customer_db.name,
        address=customer_db.address,
        phone=customer_db.phone,
        email=customer_db.email
    )   

# Get all customers
@router.get("/customers", response_model=List[CustomerMinimalResponse])
def get_customers(session: Session = Depends(get_session)):
    customers = session.exec(select(Customer)).all()
    return [
        CustomerMinimalResponse(
            id=customer.id,
            name=customer.name,
            address=customer.address,
            phone=customer.phone,
            email=customer.email
        ) for customer in customers
    ]    

# Get a customer by ID
@router.get("/customers/{customer_id}", response_model=CustomerMinimalResponse)
def get_customer(customer_id: int, session: Session = Depends(get_session)):
    customer = session.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return CustomerMinimalResponse(
        id=customer.id,
        name=customer.name,
        address=customer.address,
        phone=customer.phone,
        email=customer.email
    )




# Update an existing customer
@router.put("/customers/{customer_id}", response_model=CustomerMinimalResponse)
def update_customer(customer_id: int, customer: CustomerRequest, session: Session = Depends(get_session)):
    customer_db = session.exec(select(Customer).where(Customer.id == customer_id).with_for_update()).one_or_none()  #retrieve a single database record when you expect either one result or no results at all.
    if not customer_db:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Update fields
    customer_db.name = customer.name
    customer_db.address = customer.address
    customer_db.phone = customer.phone
    customer_db.email = customer.email
    
    session.add(customer_db)
    session.commit()
    session.refresh(customer_db)
    
    return CustomerMinimalResponse(
        id=customer_db.id,
        name=customer_db.name,
        address=customer_db.address,
        phone=customer_db.phone,
        email=customer_db.email
    )

# Delete a customer
@router.delete("/customers/{customer_id}")
def delete_customer(customer_id: int, session: Session = Depends(get_session
)):
    customer = session.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    session.delete(customer)
    session.commit()
    
    return {"deleted": True, "id": customer_id, "message": "Customer deleted successfully"}

