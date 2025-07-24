from typing import Annotated, Any, Dict, Optional, List
from fastapi import FastAPI, Depends, HTTPException
from sqlmodel import Field, Relationship, Session, SQLModel, create_engine, select
from datetime import datetime

# FastAPI app
app = FastAPI()

# ---------- DATABASE SETUP ----------
sqlite_file_name = "database1.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"
connect_args = {"check_same_thread": False}
engine = create_engine(sqlite_url, connect_args=connect_args,echo=True,)

def create_db_and_tables():
    SQLModel.metadata.create_all(engine, checkfirst=True)

def get_session():
    with Session(engine) as session:
        yield session

SessionDep = Annotated[Session, Depends(get_session)]

# ---------- MODELS ----------
class ModelBase(SQLModel):
    created_at: Optional[datetime] = Field(default_factory=datetime.now, nullable=False)
    modified_at: Optional[datetime] = Field(default_factory=datetime.now, nullable=False)
    deleted_at: Optional[datetime] = Field(default=None, nullable=True)


class Customer(ModelBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    email: str
    phone: str
    address: str

    invoices: List["Invoice"] = Relationship(back_populates="customer")


class InvoiceBase(ModelBase):
    # invoice_number: str
    date: str
    amount: float
    customer_id: int = Field(foreign_key="customer.id")
    status: str = Field(default="pending")


class Invoice(InvoiceBase, table=True):
    __tablename__ = "invoice"

    id: Optional[int] = Field(default=None, primary_key=True)

    customer: Optional[Customer] = Relationship(back_populates="invoices")
    items: List["InvoiceItem"] = Relationship(
        back_populates="invoice",
        sa_relationship_kwargs={
            "primaryjoin": "Invoice.id==InvoiceItem.invoice_id",
            "cascade": "all, delete-orphan"
        }
    )


class InvoiceItemInput(SQLModel):
    invoice_id: int = Field(foreign_key="invoice.id")
    name: str
    price: float
    quantity: Optional[int] = Field(default=1)
    desc: Optional[str] = None


class InvoiceItem(InvoiceItemInput, ModelBase, table=True):
    __tablename__ = "invoice_item"

    id: Optional[int] = Field(default=None, primary_key=True)
    invoice: Optional[Invoice] = Relationship(back_populates="items")

# ---------- Pydantic Request Models ----------
class CustomerRef(SQLModel):
    id: int

class InvoiceItemCreate(SQLModel):
    name: str
    price: float
    quantity: Optional[int] = 1
    desc: Optional[str] = None

class InvoiceCreate(SQLModel):
    invoice_number: str
    date: str
    amount: float
    customer: CustomerRef
    status: Optional[str] = "pending"
    items: Optional[List[InvoiceItemCreate]] = []

class InvoiceItemRead(SQLModel):
    id: int
    name: str
    price: float
    quantity: int
    desc: Optional[str]

class CustomerRead(SQLModel):
    id: int
    name: str
    email: str
    phone: str
    address: str

class InvoiceRead(SQLModel):
    id: int
    invoice_number: str
    date: str
    amount: float
    status: str
    customer: CustomerRead
    items: List[InvoiceItemRead]

# ---------- SERVICE FUNCTION ----------
def create_invoice(invoice_data: InvoiceCreate, session: Session):
    customer = session.get(Customer, invoice_data.customer.id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    invoice = Invoice(
        invoice_number=invoice_data.invoice_number,
        date=invoice_data.date,
        amount=invoice_data.amount,
        status=invoice_data.status,
        customer_id=customer.id,
        customer=customer
    )

    for item_data in invoice_data.items:
        item = InvoiceItem(
            name=item_data.name,
            price=item_data.price,
            quantity=item_data.quantity,
            desc=item_data.desc,
            invoice=invoice
        )
        session.add(item)

    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    return invoice


def update_invoice_items(invoice_id: int, updated_items: list[dict]):
    """
    updated_items: List of dictionaries like:
    [
        {"id": 1, "name": "New Widget A", "price": 12.0, "quantity": 3},
        {"name": "New Widget C", "price": 50.0, "quantity": 1}  # New item, no 'id'
    ]
    """
    with Session(engine) as session:
        invoice = session.get(Invoice, invoice_id)

        if not invoice:
            print(f"Invoice {invoice_id} not found.")
            return

        existing_items_by_id = {item.id: item for item in invoice.items if item.id is not None}

        new_items = []

        for item_data in updated_items:
            item_id = item_data.get("id")
            if item_id and item_id in existing_items_by_id:
                # Update existing item
                item = existing_items_by_id[item_id]
                item.name = item_data.get("name", item.name)
                item.price = item_data.get("price", item.price)
                item.quantity = item_data.get("quantity", item.quantity)
                item.desc = item_data.get("desc", item.desc)
            else:
                # Create a new item
                new_item = InvoiceItem(
                    invoice_id=invoice_id,
                    name=item_data["name"],
                    price=item_data["price"],
                    quantity=item_data.get("quantity", 1),
                    desc=item_data.get("desc")
                )
                new_items.append(new_item)

        # Optional: Remove items that are no longer present
        incoming_ids = {item.get("id") for item in updated_items if item.get("id")}
        to_remove = [item for item in invoice.items if item.id not in incoming_ids]
        for item in to_remove:
            session.delete(item)

        # Add new items
        session.add_all(new_items)

        session.commit()
        print(f"Invoice {invoice_id} updated successfully.")

def update_invoice(invoice_id: int, invoice_data: InvoiceCreate, session: Session):
    """
    Update an existing invoice with new data.
    """
    invoice = session.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Update invoice fields
    invoice.invoice_number = invoice_data.invoice_number
    invoice.date = invoice_data.date
    invoice.amount = invoice_data.amount
    invoice.status = invoice_data.status

    # Update customer reference
    customer = session.get(Customer, invoice_data.customer.id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    invoice.customer = customer

    # Clear existing items and add new ones
    invoice.items.clear()
    for item_data in invoice_data.items:
        item = InvoiceItem(
            name=item_data.name,
            price=item_data.price,
            quantity=item_data.quantity,
            desc=item_data.desc,
            invoice=invoice
        )
        session.add(item)

    session.commit()
    session.refresh(invoice)
    return invoice

  # if your model is in models.py

# ---------- ROUTES ----------
@app.on_event("startup")
def on_startup():
    create_db_and_tables()

@app.get("/")
async def root():
    return {"message": "Hello World"}

@app.post("/invoice", response_model=Invoice)
async def create_invoice_endpoint(invoice_data: InvoiceCreate, session: SessionDep):
    return create_invoice(invoice_data, session)

@app.put("/invoice/{id}", response_model=Invoice)
async def update_invoice_endpoint(id: int, invoice_data: InvoiceCreate, session: SessionDep):
    return update_invoice(id, invoice_data, session)

@app.get("/invoice", response_model=List[InvoiceRead])
async def get_invoices(session: SessionDep, id: Optional[int] = None):
    if id:
        invoice = session.get(Invoice, id)
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        return [invoice]
    else:
        return session.exec(select(Invoice)).all()

@app.delete("/invoice/{id}", response_model=dict)
async def delete_invoice(id: int, session: SessionDep):
    invoice = session.get(Invoice, id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    session.delete(invoice)
    session.commit()
    return {"message": f"Invoice {invoice.invoice_number} deleted successfully"}


@app.post("/customers", response_model=Customer)
def add_customer(customer: Customer, session: SessionDep):
    print(customer)
    session.add(customer)
    session.commit()
    session.refresh(customer)
    return customer
