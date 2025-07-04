from sqlmodel import SQLModel, Field, Relationship
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
    # terms: enumerate = Field( 'Net 15', 'Net 30','Net 45', 'Net 60', 'Due on the receipt','Due end of the month', 'Due end of the next month','Custom',default=' Due end of the month' , nullable=True)  # Assuming terms is an optional field
    terms: str
    due_date: date
    items: List["InvoiceItem"] = Relationship(back_populates="invoice")


class InvoiceItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    description: str
    qty: int
    price: float
    amount: float
    invoice_id: Optional[int] = Field(default=None, foreign_key="invoice.id")
    invoice: Optional[Invoice] = Relationship(back_populates="items") #many-to-one relationship with Invoice

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
    items: list[InvoiceItemRequest]

#response schemas
class InvoiceItemMinimalResponse(BaseModel):
    description: str
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
    items: list[InvoiceItemMinimalResponse]

    class Config:
        orm_mode = True


InvoiceItem.invoice = Relationship(back_populates="items")
Invoice.update_forward_refs() # This is to solve the circular reference between Invoice and InvoiceItem
