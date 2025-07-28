from sqlmodel import SQLModel, Field, Relationship
from typing import Optional,List
from pydantic import field_validator


from datetime import date

#Database models
class Invoice(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    customer_id: int = Field(foreign_key="customer.customer_id")
    date_issued: date
    invoice_terms: str
    invoice_due_date: date
    line_items: List["LineItem"] = Relationship(back_populates="invoice", sa_relationship_kwargs={"cascade": "all, delete-orphan","primaryjoin": "Invoice.id == LineItem.invoice_id"})
    invoice_total: float = 0.0
    invoice_status: str = Field(default="draft")

    customer: Optional["Customer"] = Relationship(back_populates="invoices")  # many-to-one relationship with Customer
    


    @field_validator("date_issued", "invoice_terms", "invoice_due_date", "invoice_status")
    @classmethod
    def not_empty(cls, v):
        if not v:
            raise ValueError("This field cannot be empty")
        return v
    @field_validator("invoice_total")
    @classmethod
    def positive_total(cls, v):
        if v is None or v < 0:
            raise ValueError("Total must be a positive number")
        return v
    



class LineItem(SQLModel, table=True):
    lineitem_id: Optional[int] = Field(default=None, primary_key=True)
    lineitem_qty: int = Field(..., gt=0, description="Quantity must be > 0")
    lineitem_total: float = Field(..., gt=0, description="Total must be > 0")
    invoice_id: Optional[int] = Field(default=None, foreign_key="invoice.id")
    invoice: Optional["Invoice"] = Relationship(back_populates="line_items")  # many-to-one relationship with Invoice
    product_id: Optional[int] = Field(default=None, foreign_key="product.product_id")
    product: Optional["Product"] = Relationship(back_populates="line_items")  # many-to-one relationship with Product

    @field_validator("lineitem_qty")
    @classmethod
    def not_empty(cls, v):
        if v is None or v < 0:
            raise ValueError("This field cannot be empty or negative")
        return v


class Customer(SQLModel, table=True):
    customer_id: Optional[int] = Field(default=None, primary_key=True)
    customer_name: str
    customer_address: str
    customer_phone: str
    customer_email: str = None

    invoices: List["Invoice"] = Relationship(back_populates="customer")



    @field_validator("customer_name", "customer_address")
    @classmethod
    def not_empty(cls, v):
        if not v:
            raise ValueError("This field cannot be empty")
        return v

    @field_validator("customer_phone")
    @classmethod
    def valid_phone(cls, v):
        if not v.isdigit() or len(v) != 10:
            raise ValueError("Phone number must be 10 digits")
        return v

    @field_validator("customer_email")
    @classmethod
    def valid_email_format(cls, v):
        if v and ("@" not in v or "." not in v):
            raise ValueError("Invalid email format")
        return v

class Product(SQLModel, table=True):
    product_id: Optional[int] = Field(default=None, primary_key=True)
    product_description: str = Field(..., unique=True)
    product_price: float
    line_items: List["LineItem"] = Relationship(back_populates="product", sa_relationship_kwargs={"cascade": "all, delete-orphan","primaryjoin": "Product.product_id == LineItem.product_id"})

    @field_validator("product_description")
    @classmethod
    def not_empty(cls, v):
        if not v:
            raise ValueError("This field cannot be empty")
        return v

    @field_validator("product_price")
    @classmethod
    def positive_price(cls, v):
        if v is None or v < 0:
            raise ValueError("Price must be a positive number")
        return v
