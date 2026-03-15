from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Index
from typing import Optional, List
from pydantic import field_validator
from datetime import date, datetime


# ── Category Rules ─────────────────────────────────────────────────────────────

class CategoryRule(SQLModel, table=True):
    __tablename__ = "category_rule"

    id: Optional[int] = Field(default=None, primary_key=True)
    company_id: Optional[int] = Field(default=None, foreign_key="company.id", index=True)
    name: str                                   # "AWS Cloud Expenses"
    match_type: str = Field(default="contains") # contains | starts_with | exact | regex
    match_value: str                            # "AWS" — matched against description (case-insensitive)
    debit_account: str                          # GL code e.g. "5000"
    credit_account: str                         # GL code e.g. "1000"
    category_label: Optional[str] = None        # "Software & Cloud"
    priority: int = Field(default=100)          # lower = applied first
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())


# ── Company & Bank Account Models ──────────────────────────────────────────────

class Company(SQLModel, table=True):
    __tablename__ = "company"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str                                           # "SmartInvoiceInc"
    tax_id: Optional[str] = None                        # EIN
    address: Optional[str] = None
    email: Optional[str] = None
    fiscal_year_start: int = Field(default=1)           # month number (1=January)
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    bank_accounts: List["BankAccount"] = Relationship(back_populates="company")


class BankAccount(SQLModel, table=True):
    __tablename__ = "bank_account"

    id: Optional[int] = Field(default=None, primary_key=True)
    company_id: int = Field(foreign_key="company.id", index=True)
    institution_name: str                               # "Chase"
    account_name: str                                   # "Business Checking"
    masked_number: Optional[str] = None                 # "****4521"
    plaid_access_token: Optional[str] = None            # stored securely
    plaid_account_id: Optional[str] = None              # Plaid's account identifier
    plaid_item_id: Optional[str] = None
    gl_account_code: str = Field(default="1000")        # maps to ChartOfAccount.code
    is_active: bool = Field(default=True)
    connected_at: Optional[datetime] = None

    company: Optional[Company] = Relationship(back_populates="bank_accounts")


# ── Accounting Models ──────────────────────────────────────────────────────────

class ChartOfAccount(SQLModel, table=True):
    __tablename__ = "chart_of_account"

    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(unique=True, index=True)          # e.g. "1000"
    name: str = Field(index=True)                        # e.g. "Cash"
    account_type: str                                    # asset | liability | equity | revenue | expense
    normal_balance: str                                  # debit | credit
    description: Optional[str] = None
    is_active: bool = Field(default=True)

    lines: List["JournalLine"] = Relationship(back_populates="account")


class JournalEntry(SQLModel, table=True):
    __tablename__ = "journal_entry"

    id: Optional[int] = Field(default=None, primary_key=True)
    entry_date: date
    description: str
    reference_type: Optional[str] = None   # ar_invoice | ap_invoice | ap_payment | manual
    reference_id: Optional[int] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    lines: List["JournalLine"] = Relationship(
        back_populates="entry",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )


class JournalLine(SQLModel, table=True):
    __tablename__ = "journal_line"

    id: Optional[int] = Field(default=None, primary_key=True)
    journal_entry_id: int = Field(foreign_key="journal_entry.id", index=True)
    account_id: int = Field(foreign_key="chart_of_account.id", index=True)
    debit: float = Field(default=0.0)
    credit: float = Field(default=0.0)
    description: Optional[str] = None

    entry: Optional[JournalEntry] = Relationship(back_populates="lines")
    account: Optional[ChartOfAccount] = Relationship(back_populates="lines")


# ── Accounts Payable Models ────────────────────────────────────────────────────

class APVendor(SQLModel, table=True):
    __tablename__ = "ap_vendor"

    id: Optional[int] = Field(default=None, primary_key=True)
    vendor_name: str = Field(index=True)
    vendor_email: Optional[str] = Field(default=None, index=True)
    vendor_address: Optional[str] = None
    vendor_phone: Optional[str] = None
    bank_details: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    invoices: List["APInvoice"] = Relationship(back_populates="vendor")


class APInvoice(SQLModel, table=True):
    __tablename__ = "ap_invoice"

    id: Optional[int] = Field(default=None, primary_key=True)
    vendor_id: Optional[int] = Field(default=None, foreign_key="ap_vendor.id", index=True)
    invoice_number: Optional[str] = None
    invoice_date: Optional[date] = Field(default=None, index=True)
    due_date: Optional[date] = Field(default=None, index=True)
    total_amount: float = Field(default=0.0)
    currency: str = Field(default="USD")
    status: str = Field(default="pending_review", index=True)  # pending_review | approved | paid | rejected
    email_subject: Optional[str] = None
    email_from: Optional[str] = None
    email_received_at: Optional[datetime] = None
    pdf_filename: Optional[str] = None
    extraction_confidence: Optional[float] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    vendor: Optional["APVendor"] = Relationship(back_populates="invoices")
    line_items: List["APLineItem"] = Relationship(
        back_populates="ap_invoice",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )
    payments: List["APPayment"] = Relationship(
        back_populates="ap_invoice",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )


class APLineItem(SQLModel, table=True):
    __tablename__ = "ap_line_item"

    id: Optional[int] = Field(default=None, primary_key=True)
    ap_invoice_id: int = Field(foreign_key="ap_invoice.id", index=True)
    description: Optional[str] = None
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    line_total: Optional[float] = None

    ap_invoice: Optional["APInvoice"] = Relationship(back_populates="line_items")


class APPayment(SQLModel, table=True):
    __tablename__ = "ap_payment"

    id: Optional[int] = Field(default=None, primary_key=True)
    ap_invoice_id: int = Field(foreign_key="ap_invoice.id", index=True)
    payment_date: date
    payment_amount: float
    payment_method: str  # bank_transfer | check | credit_card | other
    payment_reference: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    ap_invoice: Optional["APInvoice"] = Relationship(back_populates="payments")

#Database models
class Invoice(SQLModel, table=True):
    __tablename__ = "invoice"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    customer_id: int = Field(foreign_key="customer.customer_id", index=True)  # Index for customer lookups
    date_issued: date = Field(index=True)  # Index for date-based queries
    invoice_terms: str
    invoice_due_date: date = Field(index=True)  # Index for due date queries
    line_items: List["LineItem"] = Relationship(back_populates="invoice", sa_relationship_kwargs={"cascade": "all, delete-orphan","primaryjoin": "Invoice.id == LineItem.invoice_id"})
    invoice_total: float = 0.0
    invoice_status: str = Field(default="draft", index=True)  # Index for status filtering
    
    # Status tracking timestamps
    date_submitted: Optional[datetime] = Field(default=None, index=True)
    date_sent: Optional[datetime] = Field(default=None, index=True)
    date_paid: Optional[datetime] = Field(default=None, index=True)
    date_cancelled: Optional[datetime] = Field(default=None)

    customer: Optional["Customer"] = Relationship(back_populates="invoices")  # many-to-one relationship with Customer
    
    # Define composite indexes for common query patterns
    __table_args__ = (
        Index('idx_customer_date', 'customer_id', 'date_issued'),  # Customer invoice history
        Index('idx_status_date', 'invoice_status', 'date_issued'),  # Status-based filtering with dates
        Index('idx_due_date_status', 'invoice_due_date', 'invoice_status'),  # Overdue invoice queries
    )
    


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
    __tablename__ = "lineitem"
    
    lineitem_id: Optional[int] = Field(default=None, primary_key=True)
    lineitem_qty: int = Field(..., gt=0, description="Quantity must be > 0")
    lineitem_total: float = Field(..., gt=0, description="Total must be > 0")
    invoice_id: Optional[int] = Field(default=None, foreign_key="invoice.id", index=True)  # Index for invoice lookups
    invoice: Optional["Invoice"] = Relationship(back_populates="line_items")  # many-to-one relationship with Invoice
    product_id: Optional[int] = Field(default=None, foreign_key="product.product_id", index=True)  # Index for product lookups
    product: Optional["Product"] = Relationship(back_populates="line_items")  # many-to-one relationship with Product
    
    # Composite index for common queries
    __table_args__ = (
        Index('idx_invoice_product', 'invoice_id', 'product_id'),  # Invoice line item queries
    )

    @field_validator("lineitem_qty")
    @classmethod
    def not_empty(cls, v):
        if v is None or v < 0:
            raise ValueError("This field cannot be empty or negative")
        return v


class Customer(SQLModel, table=True):
    __tablename__ = "customer"
    
    customer_id: Optional[int] = Field(default=None, primary_key=True)
    customer_name: str = Field(index=True)  # Index for name searches
    customer_address: str
    customer_phone: str = Field(index=True)  # Index for phone lookups
    customer_email: str = Field(default=None, index=True)  # Index for email lookups

    invoices: List["Invoice"] = Relationship(back_populates="customer")
    
    # Composite index for customer searches
    __table_args__ = (
        Index('idx_customer_search', 'customer_name', 'customer_email'),  # Name and email search
    )



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
    __tablename__ = "product"
    
    product_id: Optional[int] = Field(default=None, primary_key=True)
    product_description: str = Field(..., unique=True, index=True)  # Index for product searches
    product_price: float = Field(index=True)  # Index for price-based queries
    line_items: List["LineItem"] = Relationship(back_populates="product", sa_relationship_kwargs={"cascade": "all, delete-orphan","primaryjoin": "Product.product_id == LineItem.product_id"})
    
    # Index for price range queries
    __table_args__ = (
        Index('idx_product_price_desc', 'product_price', 'product_description'),  # Price and description search
    )

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
