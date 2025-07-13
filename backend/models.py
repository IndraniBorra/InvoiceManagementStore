from sqlmodel import SQLModel, Field, Relationship
from pydantic import BaseModel, EmailStr, field_validator

from pydantic import BaseModel
from typing import Optional, List
from datetime import date

#Database models
class Invoice(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    customer_name: str
    address: str
    phone: str
    date_issued: date
    total: float = 0.0
    terms: str
    due_date: date
    items: List["InvoiceItem"] = Relationship(back_populates="invoice")
    invoice_status: str = Field(default="draft")

    @field_validator("customer_name", "address", "phone", "date_issued", "terms", "due_date")
    @classmethod
    def not_empty(cls, v):
        if not v.strip():
            raise ValueError("This field cannot be empty")
        return v

    @field_validator("phone")
    @classmethod
    def valid_phone(cls, v):
        if not v.isdigit() or len(v) != 10:
            raise ValueError("Phone number must be 10 digits")
        return v


class InvoiceItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    description: str
    qty: int = Field(..., gt=0, description="Quantity must be > 0")
    price: float = Field(..., gt=0, description="Price must be > 0")
    amount: float = Field(..., ge=0)
    invoice_id: Optional[int] = Field(default=None, foreign_key="invoice.id")
    invoice: Optional[Invoice] = Relationship(back_populates="items") #many-to-one relationship with Invoice

    @field_validator("description")
    @classmethod
    def description_must_not_be_empty(cls, v):
        if not v.strip():
            raise ValueError("Item description cannot be empty")
        return v

class Customer(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    address: str
    phone: str
    email: str = None
    # invoices: List[Invoice] = Relationship(back_populates="customer")

class Item(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    description: str
    qty: int
    price: float
    # invoices: List[InvoiceItem] = Relationship(back_populates="item")

#request schemas
class InvoiceItemRequest(BaseModel):
    description: str
    qty: int
    price: float

class InvoiceRequest(BaseModel):
    customer_name: str
    address: str
    phone: str
    date_issued: date
    terms: str
    due_date: date
    invoice_status: Optional[str] = "draft"  # Default status
    items: list[InvoiceItemRequest]

class CustomerRequest(BaseModel):
    name: str
    address: str
    phone: str
    email: Optional[str] = None

class ItemRequest(BaseModel):
    description: str
    qty: int
    price: float

#response schemas
class InvoiceItemMinimalResponse(BaseModel):
    description: str
    qty: int
    price: float
    amount: float

class InvoiceMinimalResponse(BaseModel):
    id: int
    customer_name: str
    address: str
    phone: str
    date_issued: date
    due_date: date
    terms: str
    total: float
    invoice_status: str
    items: list[InvoiceItemMinimalResponse]

    class Config:
        orm_mode = True

class CustomerMinimalResponse(BaseModel):
    id: int
    name: str
    address: str
    phone: str
    email: str

class ItemMinimalResponse(BaseModel):
    id: int
    description: str
    qty: int
    price: float
    amount: float

    class Config:
        orm_mode = True


InvoiceItem.invoice = Relationship(back_populates="items")
Invoice.update_forward_refs() # This is to solve the circular reference between Invoice and InvoiceItem
