"""
Seed script for Accounts Payable test data.
Generates vendors, AP invoices (mixed statuses), line items, and payments.
Run from the backend directory:
    python scripts/seed_ap_data.py
"""
import sys
import os
import random
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlmodel import Session, create_engine, select
from models import APVendor, APInvoice, APLineItem, APPayment

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./database.db")
engine = create_engine(DATABASE_URL, echo=False)

random.seed(42)

# ── Vendor data ───────────────────────────────────────────────────────────────

VENDORS = [
    {"vendor_name": "Acme Office Supplies Co.",      "vendor_email": "billing@acmeoffice.com",    "vendor_address": "123 Commerce Blvd, Chicago, IL 60601",       "vendor_phone": "3125550101", "bank_details": "Chase Bank | Routing: 021000021 | Acct: 4400112233"},
    {"vendor_name": "CloudHost Pro LLC",              "vendor_email": "invoices@cloudhostpro.io",  "vendor_address": "456 Tech Park, Austin, TX 78701",             "vendor_phone": "5125550202", "bank_details": "Wells Fargo | Routing: 121042882 | Acct: 7700998877"},
    {"vendor_name": "Metro Courier Services",         "vendor_email": "ar@metrocourier.net",       "vendor_address": "789 Delivery Ln, New York, NY 10001",         "vendor_phone": "2125550303", "bank_details": "Bank of America | Routing: 026009593 | Acct: 3300445566"},
    {"vendor_name": "Pinnacle Marketing Group",       "vendor_email": "finance@pinnaclemktg.com",  "vendor_address": "321 Madison Ave, New York, NY 10017",         "vendor_phone": "2125550404", "bank_details": "Citibank | Routing: 021000089 | Acct: 9900223344"},
    {"vendor_name": "SafeGuard Insurance Partners",   "vendor_email": "premiums@safeguardins.com", "vendor_address": "654 Risk Ave, Hartford, CT 06103",            "vendor_phone": "8605550505", "bank_details": "US Bank | Routing: 091000022 | Acct: 1100667788"},
    {"vendor_name": "SwiftClean Facilities Mgmt",    "vendor_email": "billing@swiftclean.co",     "vendor_address": "987 Service Rd, Atlanta, GA 30301",           "vendor_phone": "4045550606", "bank_details": "PNC Bank | Routing: 043000096 | Acct: 5500334455"},
    {"vendor_name": "DataVault Backup Solutions",    "vendor_email": "accounts@datavault.io",     "vendor_address": "111 Storage Way, Seattle, WA 98101",          "vendor_phone": "2065550707", "bank_details": "Chase Bank | Routing: 021000021 | Acct: 2200556677"},
    {"vendor_name": "GreenLeaf Catering Inc.",       "vendor_email": "invoicing@greenleafcater.com","vendor_address": "222 Flavor St, San Francisco, CA 94105",    "vendor_phone": "4155550808", "bank_details": "Bank of America | Routing: 026009593 | Acct: 8800112244"},
    {"vendor_name": "ProLegal Advisors LLP",         "vendor_email": "billing@prolegal.com",      "vendor_address": "333 Justice Blvd, Washington, DC 20001",      "vendor_phone": "2025550909", "bank_details": "Capital One | Routing: 056073502 | Acct: 6600778899"},
    {"vendor_name": "TechParts Direct",              "vendor_email": "ap@techpartsdirect.com",    "vendor_address": "444 Silicon Dr, San Jose, CA 95110",          "vendor_phone": "4085551010", "bank_details": "Wells Fargo | Routing: 121042882 | Acct: 4400998811"},
]

# ── Line item templates per vendor category ───────────────────────────────────

LINE_ITEM_POOL = {
    "office":    [("Office paper (case)",20,45.0),("Printer ink cartridges",5,32.5),("Sticky notes bundle",10,8.99),("Pens & markers set",4,14.0),("Filing folders (100pk)",3,22.0)],
    "cloud":     [("Compute instances (monthly)",1,1200.0),("Object storage – 5TB",1,250.0),("CDN bandwidth overage",1,87.5),("Managed DB (PostgreSQL)",1,499.0),("Support plan – Business",1,199.0)],
    "courier":   [("Same-day deliveries",12,18.5),("Overnight packages",8,34.0),("Freight pallet – domestic",2,320.0),("Signature confirmation fee",25,2.5),("Fuel surcharge",1,45.0)],
    "marketing": [("Social media ad spend",1,3500.0),("Copywriting – 10 articles",10,250.0),("SEO audit",1,1200.0),("Email campaign design",1,800.0),("Brand refresh consultation",1,2500.0)],
    "insurance": [("General liability premium",1,2100.0),("Workers comp – Q1",1,870.0),("Property coverage",1,1540.0),("D&O policy installment",1,3200.0),("Cyber liability add-on",1,450.0)],
    "facilities":[("Monthly janitorial service",1,950.0),("Window cleaning",1,300.0),("Carpet deep clean",1,450.0),("Restroom supply restock",1,180.0),("HVAC filter replacement",4,55.0)],
    "data":      [("Backup storage – 10TB",1,399.0),("Disaster recovery SLA",1,599.0),("Data migration service",1,1500.0),("Annual license renewal",1,1200.0),("Setup & onboarding",1,250.0)],
    "catering":  [("Team lunch – 25 pax",25,22.0),("Executive board dinner",12,65.0),("Coffee & snack station",1,380.0),("Holiday party catering",50,45.0),("Weekly fruit basket",1,85.0)],
    "legal":     [("Contract review – 3 hrs",3,350.0),("Employment law consult",2,400.0),("NDA drafting",1,500.0),("IP filing assistance",1,1800.0),("Retainer fee – monthly",1,2500.0)],
    "parts":     [("Server rack units x4",4,480.0),("Network switch 24-port",2,320.0),("UPS battery replacement",3,155.0),("SSD drives 1TB",10,110.0),("Keyboard & mouse sets",8,45.0)],
}

VENDOR_CATEGORY = ["office","cloud","courier","marketing","insurance","facilities","data","catering","legal","parts"]

STATUSES = ["pending_review","pending_review","pending_review","approved","approved","paid","paid","paid","rejected"]

def random_date(start: date, end: date) -> date:
    delta = (end - start).days
    return start + timedelta(days=random.randint(0, delta))

def build_line_items(category: str, num: int = None):
    pool = LINE_ITEM_POOL[category]
    chosen = random.sample(pool, k=min(num or random.randint(1, 4), len(pool)))
    items = []
    for desc, qty, unit in chosen:
        qty_actual = qty if random.random() > 0.3 else max(1, qty + random.randint(-2, 5))
        total = round(qty_actual * unit, 2)
        items.append({"description": desc, "quantity": float(qty_actual), "unit_price": unit, "line_total": total})
    return items

def seed():
    with Session(engine) as session:
        # --- Vendors ---
        existing_vendors = session.exec(select(APVendor)).all()
        existing_emails = {v.vendor_email for v in existing_vendors}

        vendor_map = {}  # vendor_name -> APVendor
        for v in existing_vendors:
            vendor_map[v.vendor_name] = v

        new_vendors = []
        for vd in VENDORS:
            if vd["vendor_email"] in existing_emails:
                continue
            vendor = APVendor(**vd)
            session.add(vendor)
            new_vendors.append((vd["vendor_name"], vendor))

        session.flush()

        for name, v in new_vendors:
            vendor_map[name] = v

        print(f"Vendors: {len(new_vendors)} added, {len(existing_vendors)} already existed")

        # --- AP Invoices ---
        today = date(2026, 3, 18)
        start = date(2025, 9, 1)

        invoice_count = 0
        for i, (vname, category) in enumerate(zip([v["vendor_name"] for v in VENDORS], VENDOR_CATEGORY)):
            vendor = vendor_map.get(vname)
            if not vendor:
                continue

            # Create 3–6 invoices per vendor
            for j in range(random.randint(3, 6)):
                inv_date = random_date(start, today - timedelta(days=5))
                terms_days = random.choice([15, 30, 45, 60])
                due_date = inv_date + timedelta(days=terms_days)

                status = random.choice(STATUSES)
                # Force overdue on some pending/approved
                if status in ("pending_review", "approved") and random.random() < 0.35:
                    due_date = inv_date + timedelta(days=random.randint(5, 25))
                    if due_date >= today:
                        due_date = today - timedelta(days=random.randint(1, 15))

                line_items_data = build_line_items(category)
                total = round(sum(li["line_total"] for li in line_items_data), 2)

                inv_num = f"{category.upper()[:3]}-{inv_date.year}-{random.randint(1000,9999)}"

                invoice = APInvoice(
                    vendor_id=vendor.id,
                    invoice_number=inv_num,
                    invoice_date=inv_date,
                    due_date=due_date,
                    total_amount=total,
                    currency="USD",
                    status=status,
                    email_subject=f"Invoice {inv_num} from {vname}",
                    email_from=vendor.vendor_email,
                    email_received_at=datetime.combine(inv_date, datetime.min.time()),
                    extraction_confidence=round(random.uniform(0.82, 0.99), 2),
                    notes=None,
                )
                session.add(invoice)
                session.flush()

                for li in line_items_data:
                    session.add(APLineItem(
                        ap_invoice_id=invoice.id,
                        description=li["description"],
                        quantity=li["quantity"],
                        unit_price=li["unit_price"],
                        line_total=li["line_total"],
                    ))

                if status == "paid":
                    pay_date = due_date - timedelta(days=random.randint(0, 5))
                    if pay_date > today:
                        pay_date = today
                    method = random.choice(["ACH", "Wire", "Check", "Credit Card"])
                    session.add(APPayment(
                        ap_invoice_id=invoice.id,
                        payment_date=pay_date,
                        payment_amount=total,
                        payment_method=method,
                        payment_reference=f"REF-{random.randint(100000,999999)}",
                        notes=f"Payment via {method}",
                    ))

                invoice_count += 1

        session.commit()
        print(f"AP Invoices created: {invoice_count}")
        print("Done!")

if __name__ == "__main__":
    seed()
