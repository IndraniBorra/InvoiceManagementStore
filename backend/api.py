from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import date

#request schemas
class LineItemRequest(BaseModel):
    product_id: int
    lineitem_qty: int
    lineitem_total: float

class InvoiceRequest(BaseModel):
    customer_id: int
    date_issued: date
    invoice_terms: str
    invoice_due_date: date
    invoice_status: Optional[str] = "draft"  # Default status
    line_items: List[LineItemRequest]

class CustomerRequest(BaseModel):
    customer_name: str
    customer_address: str
    customer_phone: str
    customer_email: Optional[str] = None

class ProductRequest(BaseModel):
    product_description: str
    product_price: float

#response schemas
class LineItemMinimalResponse(BaseModel):
    product_id: int
    lineitem_qty: int
    lineitem_total: float

class InvoiceMinimalResponse(BaseModel):
    id: int
    customer_name: str
    customer_address: str
    customer_phone: str
    date_issued: date
    invoice_due_date: date
    invoice_terms: str
    invoice_total: float
    invoice_status: str
    line_items: List[LineItemMinimalResponse]


class CustomerMinimalResponse(BaseModel):
    customer_id: int
    customer_name: str
    customer_address: str
    customer_phone: str
    customer_email: Optional[str] = None

class ProductMinimalResponse(BaseModel):
    product_id: int
    product_description: str
    product_price: float


    # class model_config:
    #     ConfigDict(from_attributes = True)

    # class Config:
    #     orm_mode = True


