from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from database import get_session, engine
from typing import List
import models
from models import Customer
from api import CustomerRequest, CustomerMinimalResponse
from fastapi import Query


router = APIRouter()

# Create the database tables if they don't exist when our application starts
models.SQLModel.metadata.create_all(bind = engine)
# Customer routes

# Create a new customer
@router.post("/customer", response_model=CustomerMinimalResponse)
def create_customer(customer: CustomerRequest, session: Session = Depends(get_session)):

    existing_customer = session.exec(select(Customer).where(Customer.customer_name == customer.customer_name)).one_or_none()
    if existing_customer:
        raise HTTPException(status_code=400, detail="Customer already exists")

    customer_db = Customer.model_validate(customer)
    session.add(customer_db)
    session.commit()
    session.refresh(customer_db)
    return CustomerMinimalResponse(
        **customer_db.model_dump()
    )

# Get all customers with query parameters
@router.get("/customers", response_model=List[CustomerMinimalResponse])
def get_customers(
    customer_name: str = Query(None, description="Filter by customer name"),
    skip: int = 0,
    limit: int = 100,
    session: Session = Depends(get_session)
):
    query = select(Customer)
    if customer_name:
        query = query.where(Customer.customer_name.ilike(f"%{customer_name}%"))
    customers = session.exec(query.offset(skip).limit(limit)).all()
    return [
        CustomerMinimalResponse(
            **customer.model_dump()
        ) for customer in customers
    ]

# Get a customer by ID
@router.get("/customer/{customer_id}", response_model=CustomerMinimalResponse)
def get_customer(customer_id: int, session: Session = Depends(get_session)):
    customer = session.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return CustomerMinimalResponse(
        **customer.model_dump()
    )




# Update an existing customer
@router.put("/customer/{customer_id}", response_model=CustomerMinimalResponse)
def update_customer(customer_id: int, customer: CustomerRequest, session: Session = Depends(get_session)):
    customer_request_dict = customer.model_dump()

    customer_db = session.exec(select(Customer).where(Customer.customer_id == customer_id).with_for_update()).one_or_none()  #retrieve a single database record when you expect either one result or no results at all.
    print("Updating customer with ID:", customer_id)  # Debugging log
    print("Customer request data:", customer_request_dict)  # Debugging log
    if not customer_db:
        raise HTTPException(status_code=404, detail="Customer not found")
    

    # Update fields properly - assign values to attributes
    for field, value in customer_request_dict.items():
        setattr(customer_db, field, value)
    
    session.add(customer_db)
    session.commit()
    session.refresh(customer_db)
    
    return CustomerMinimalResponse(
        **customer_db.model_dump()  
    )

# Delete a customer
@router.delete("/customer/{customer_id}")
def delete_customer(customer_id: int, session: Session = Depends(get_session)):
    customer = session.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    session.delete(customer)
    session.commit()

    return CustomerMinimalResponse(
        **{"deleted": True, "id": customer_id, "message": "Customer deleted successfully"}
    )

