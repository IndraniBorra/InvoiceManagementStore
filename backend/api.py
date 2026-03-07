from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import date, datetime

# Request models for API endpoints
class CustomerRequest(BaseModel):
    customer_name: str
    customer_address: str
    customer_phone: str
    customer_email: Optional[str] = None

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


class ProductRequest(BaseModel):
    product_description: str
    product_price: float

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


class LineItemRequest(BaseModel):
    lineitem_qty: int
    product_id: int

    @field_validator("lineitem_qty")
    @classmethod
    def positive_qty(cls, v):
        if v is None or v <= 0:
            raise ValueError("Quantity must be greater than 0")
        return v


class InvoiceRequest(BaseModel):
    customer_id: int
    date_issued: date
    invoice_terms: str
    invoice_due_date: date
    line_items: List[LineItemRequest]
    invoice_total: float
    invoice_status: str

    @field_validator("date_issued", "invoice_terms", "invoice_due_date")
    @classmethod
    def not_empty(cls, v):
        if not v:
            raise ValueError("This field cannot be empty")
        return v


# Response models for API endpoints
class CustomerMinimalResponse(BaseModel):
    customer_id: int
    customer_name: str
    customer_address: str
    customer_phone: str
    customer_email: Optional[str] = None

    class Config:
        from_attributes = True


class ProductMinimalResponse(BaseModel):
    product_id: int
    product_description: str
    product_price: float

    class Config:
        from_attributes = True


class LineItemMinimalResponse(BaseModel):
    lineitem_id: int
    lineitem_qty: int
    lineitem_total: float
    product_id: int
    product: Optional[ProductMinimalResponse] = None

    class Config:
        from_attributes = True


class InvoiceMinimalResponse(BaseModel):
    id: int
    customer_id: int
    date_issued: date
    invoice_terms: str
    invoice_due_date: date
    invoice_total: float
    invoice_status: str
    date_submitted: Optional[datetime] = None
    date_sent: Optional[datetime] = None
    date_paid: Optional[datetime] = None
    date_cancelled: Optional[datetime] = None
    customer: Optional[CustomerMinimalResponse] = None
    line_items: List[LineItemMinimalResponse] = []

    class Config:
        from_attributes = True
