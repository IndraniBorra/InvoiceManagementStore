import random
from datetime import date, timedelta

from faker import Faker
from sqlmodel import Session, select

from database import engine, create_db_and_tables
from models import Customer, Product, Invoice, LineItem

def generate_due_date(issue_date: date, terms: str) -> date:
    terms_map = {
        "Due on Receipt": 0,
        "Net 15": 15,
        "Net 30": 30,
        "Net 45": 45,
        "Net 60": 60,
        "Due end of the month": 0,
        "Due end of next month": 0,
+    }
+
+    if terms == "Due end of the month":
+        next_month = issue_date.replace(day=1) + timedelta(days=32)
+        return next_month.replace(day=1) - timedelta(days=1)
+    if terms == "Due end of next month":
+        next_month = issue_date.replace(day=1) + timedelta(days=32)
+        following_month = next_month.replace(day=1) + timedelta(days=32)
+        return following_month.replace(day=1) - timedelta(days=1)
+    return issue_date + timedelta(days=terms_map.get(terms, 0))
+
+
+def seed(
+    num_customers: int = 10,
+    num_products: int = 25,
+    num_invoices: int = 20,
+    min_items_per_invoice: int = 1,
+    max_items_per_invoice: int = 6,
+    seed_random: int | None = 42,
+):
+    fake = Faker()
+    if seed_random is not None:
+        random.seed(seed_random)
+        Faker.seed(seed_random)
+
+    create_db_and_tables()
+
+    with Session(engine) as session:
+        # Customers
+        customers: list[Customer] = []
+        for _ in range(num_customers):
+            customer = Customer(
+                customer_name=fake.name(),
+                customer_address=fake.address().replace("\n", ", "),
+                customer_phone="".join([str(random.randint(0, 9)) for _ in range(10)]),
+                customer_email=fake.email(),
+            )
+            session.add(customer)
+            customers.append(customer)
+
+        # Products
+        products: list[Product] = []
+        for _ in range(num_products):
+            description = f"{fake.word().capitalize()} {fake.word().capitalize()}"
+            price = round(random.uniform(5.0, 500.0), 2)
+            product = Product(product_description=description, product_price=price)
+            session.add(product)
+            products.append(product)
+
+        session.commit()
+        # Refresh to get IDs
+        for c in customers:
+            session.refresh(c)
+        for p in products:
+            session.refresh(p)
+
+        # Invoices
+        terms_options = [
+            "Due on Receipt",
+            "Net 15",
+            "Net 30",
+            "Net 45",
+            "Net 60",
+            "Due end of the month",
+            "Due end of next month",
+        ]
+
+        for _ in range(num_invoices):
+            customer = random.choice(customers)
+            issue_date = fake.date_between(start_date="-90d", end_date="today")
+            if isinstance(issue_date, str):
+                # Faker <-> typing guard; convert to date
+                issue_date = date.fromisoformat(issue_date)
+            terms = random.choice(terms_options)
+            due_date = generate_due_date(issue_date, terms)
+
+            invoice = Invoice(
+                customer_id=customer.customer_id,
+                date_issued=issue_date,
+                invoice_terms=terms,
+                invoice_due_date=due_date,
+                invoice_status="submitted",
+                invoice_total=0.0,
+            )
+
+            num_items = random.randint(min_items_per_invoice, max_items_per_invoice)
+            total = 0.0
+            used_product_ids: set[int] = set()
+            for _ in range(num_items):
+                product = random.choice(products)
+                # avoid duplicate products in same invoice to keep it realistic
+                if product.product_id in used_product_ids:
+                    continue
+                used_product_ids.add(product.product_id)
+
+                qty = random.randint(1, 10)
+                line_total = round(qty * float(product.product_price), 2)
+
+                line = LineItem(
+                    product_id=product.product_id,
+                    lineitem_qty=qty,
+                    lineitem_total=line_total,
+                )
+                invoice.line_items.append(line)
+                total += line_total
+
+            invoice.invoice_total = round(total, 2)
+            session.add(invoice)
+
+        session.commit()
+
+
+if __name__ == "__main__":
+    # Defaults can be overridden with env vars or by editing here
+    seed(
+        num_customers=12,
+        num_products=30,
+        num_invoices=25,
+    )
+
+
EOF
)