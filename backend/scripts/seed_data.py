import random
from datetime import date, datetime, timedelta
from typing import List

from faker import Faker
from sqlmodel import Session, select

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import engine, create_db_and_tables
from models import Customer, Product, Invoice, LineItem


def generate_due_date(sent_date: date, terms: str) -> date:
    """Generate due date based on sent date and payment terms"""
    terms_map = {
        "Due on Receipt": 0,
        "Net 15": 15,
        "Net 30": 30,
        "Net 45": 45,
        "Net 60": 60,
        "Due end of the month": 0,
        "Due end of next month": 0,
    }

    if terms == "Due end of the month":
        next_month = sent_date.replace(day=1) + timedelta(days=32)
        return next_month.replace(day=1) - timedelta(days=1)
    if terms == "Due end of next month":
        next_month = sent_date.replace(day=1) + timedelta(days=32)
        following_month = next_month.replace(day=1) + timedelta(days=32)
        return following_month.replace(day=1) - timedelta(days=1)
    return sent_date + timedelta(days=terms_map.get(terms, 0))


def generate_diverse_products(fake: Faker, num_products: int = 50) -> List[dict]:
    """Generate diverse products across multiple categories"""
    
    product_categories = {
        "Electronics": [
            ("Wireless Bluetooth Headphones", 89.99, 299.99),
            ("4K Webcam", 129.99, 249.99),
            ("USB-C Docking Station", 149.99, 399.99),
            ("Mechanical Keyboard", 79.99, 199.99),
            ("Gaming Mouse", 49.99, 129.99),
            ("Tablet Stand", 29.99, 79.99),
            ("Portable Monitor", 199.99, 499.99),
            ("Wireless Charging Pad", 24.99, 69.99),
        ],
        "Software": [
            ("Microsoft Office 365 License", 99.99, 149.99),
            ("Adobe Creative Suite Subscription", 239.99, 599.99),
            ("Antivirus Software License", 39.99, 89.99),
            ("Project Management Software", 199.99, 499.99),
            ("Database Management Tool", 299.99, 799.99),
            ("Cloud Storage Subscription", 59.99, 199.99),
            ("Video Editing Software", 149.99, 399.99),
            ("Business Intelligence Platform", 499.99, 1999.99),
        ],
        "Office Supplies": [
            ("Ergonomic Office Chair", 199.99, 599.99),
            ("Standing Desk Converter", 149.99, 399.99),
            ("Premium Paper Ream", 12.99, 24.99),
            ("Professional Pen Set", 29.99, 79.99),
            ("Document Shredder", 89.99, 199.99),
            ("Laminating Machine", 49.99, 129.99),
            ("Office Phone System", 299.99, 799.99),
            ("Wireless Printer", 149.99, 399.99),
        ],
        "Services": [
            ("Website Development", 999.99, 4999.99),
            ("SEO Optimization Service", 299.99, 1499.99),
            ("Social Media Management", 499.99, 1999.99),
            ("Cloud Migration Service", 1999.99, 9999.99),
            ("IT Security Audit", 799.99, 2999.99),
            ("Database Optimization", 599.99, 1999.99),
            ("System Integration", 1499.99, 4999.99),
            ("Training Workshop", 399.99, 1299.99),
        ],
        "Hardware": [
            ("Network Switch", 199.99, 899.99),
            ("Server Rack Unit", 499.99, 1999.99),
            ("UPS Battery Backup", 149.99, 499.99),
            ("Ethernet Cables Bundle", 29.99, 99.99),
            ("Network Security Appliance", 799.99, 2999.99),
            ("Wireless Access Point", 129.99, 399.99),
            ("Server Memory Module", 199.99, 599.99),
            ("SSD Storage Drive", 99.99, 499.99),
        ],
        "Consulting": [
            ("Business Process Analysis", 1499.99, 4999.99),
            ("Technology Strategy Consultation", 2999.99, 9999.99),
            ("Digital Transformation Planning", 1999.99, 7999.99),
            ("Cybersecurity Assessment", 999.99, 3999.99),
            ("Data Analytics Consultation", 1299.99, 4999.99),
            ("Cloud Architecture Review", 1799.99, 5999.99),
            ("Compliance Audit Service", 899.99, 2999.99),
            ("Performance Optimization", 699.99, 2499.99),
        ]
    }
    
    products = []
    used_descriptions = set()
    
    # Generate products from predefined categories
    for category, items in product_categories.items():
        for description, min_price, max_price in items:
            if len(products) >= num_products:
                break
            price = round(random.uniform(min_price, max_price), 2)
            products.append({
                "description": description,
                "price": price,
                "category": category
            })
            used_descriptions.add(description.lower())
    
    # Fill remaining slots with generated products
    attempt = 0
    while len(products) < num_products and attempt < 100:  # Prevent infinite loop
        category = random.choice(list(product_categories.keys()))
        
        # Generate unique product names
        adjectives = ["Premium", "Professional", "Enterprise", "Advanced", "Standard", "Deluxe", "Pro", "Elite", "Ultimate", "Superior"]
        nouns = ["Solution", "Package", "Service", "Tool", "System", "Platform", "Suite", "Kit", "Module", "Component"]
        
        # Add a unique identifier to ensure uniqueness
        unique_id = random.randint(1000, 9999)
        description = f"{random.choice(adjectives)} {category} {random.choice(nouns)} #{unique_id}"
        
        if description.lower() not in used_descriptions:
            price = round(random.uniform(49.99, 2999.99), 2)
            products.append({
                "description": description,
                "price": price,
                "category": category
            })
            used_descriptions.add(description.lower())
        
        attempt += 1
    
    return products[:num_products]


def generate_invoice_with_timestamps(issue_date: date, terms: str) -> dict:
    """Generate invoice with proper chronological timestamps and realistic status"""
    today = date.today()
    
    # Step 1: Generate processing timeline
    # Internal processing time: 0-5 days (draft → submitted → sent)
    processing_days = random.randint(0, 5)
    
    # Calculate key dates in proper order
    submitted_days = random.randint(0, 2)  # 0-2 days to submit
    sent_days = submitted_days + random.randint(1, 3)  # Additional 1-3 days to send
    
    date_submitted = issue_date + timedelta(days=submitted_days)
    date_sent = issue_date + timedelta(days=min(sent_days, processing_days))
    
    # Step 2: Calculate due date from SENT date (when customer receives it)
    due_date = generate_due_date(date_sent, terms)
    
    # Step 3: Determine status based on realistic business timing
    days_since_issue = (today - issue_date).days
    days_since_sent = (today - date_sent).days if date_sent <= today else -1
    days_past_due = (today - due_date).days if due_date <= today else -1
    
    # Realistic status distribution
    if days_since_issue <= 2:  # Very recent
        status_options = [("draft", 0.4), ("submitted", 0.6)]
    elif days_since_sent <= 0:  # Not sent yet
        status_options = [("submitted", 0.7), ("sent", 0.3)]
    elif days_past_due < 0:  # Sent but not due yet
        status_options = [("sent", 0.6), ("paid", 0.4)]
    elif days_past_due <= 30:  # Recently due
        status_options = [("sent", 0.1), ("paid", 0.8), ("overdue", 0.1)]
    else:  # Long overdue
        status_options = [("paid", 0.7), ("overdue", 0.25), ("cancelled", 0.05)]
    
    statuses, weights = zip(*status_options)
    status = random.choices(statuses, weights=weights)[0]
    
    # Step 4: Generate timestamps based on final status
    result = {
        "status": status,
        "due_date": due_date
    }
    
    # Add timestamps based on progression
    if status in ["submitted", "sent", "paid", "overdue", "cancelled"]:
        result["date_submitted"] = datetime.combine(
            date_submitted,
            datetime.now().time().replace(hour=random.randint(9, 17), minute=random.randint(0, 59))
        )
    
    if status in ["sent", "paid", "overdue", "cancelled"]:
        result["date_sent"] = datetime.combine(
            date_sent,
            datetime.now().time().replace(hour=random.randint(9, 17), minute=random.randint(0, 59))
        )
    
    if status == "paid":
        # Payment date: mostly before due date, some after
        if random.random() < 0.8:  # 80% pay on time
            # Pay between sent date and due date
            earliest_pay = date_sent
            latest_pay = due_date
        else:  # 20% pay late
            # Pay between due date and 30 days after
            earliest_pay = due_date
            latest_pay = due_date + timedelta(days=30)
        
        # Ensure we don't go beyond today
        latest_pay = min(latest_pay, today)
        if earliest_pay <= latest_pay:
            pay_date = fake.date_between(earliest_pay, latest_pay)
            result["date_paid"] = datetime.combine(
                pay_date,
                datetime.now().time().replace(hour=random.randint(9, 17), minute=random.randint(0, 59))
            )
    
    if status == "cancelled":
        # Cancelled: usually before due date or shortly after
        cancel_end = min(due_date + timedelta(days=14), today)
        if date_sent <= cancel_end:
            cancel_date = fake.date_between(date_sent, cancel_end)
            result["date_cancelled"] = datetime.combine(
                cancel_date,
                datetime.now().time().replace(hour=random.randint(9, 17), minute=random.randint(0, 59))
            )
    
    return result


def seed(
    num_customers: int = 20,
    num_products: int = 50,
    num_invoices: int = 1000,
    min_items_per_invoice: int = 1,
    max_items_per_invoice: int = 6,
    seed_random: int | None = 42,
):
    """Generate comprehensive test data with realistic business scenarios"""
    
    global fake  # Make fake available to other functions
    fake = Faker()
    if seed_random is not None:
        random.seed(seed_random)
        Faker.seed(seed_random)

    create_db_and_tables()

    with Session(engine) as session:
        print(f"🏢 Generating {num_customers} customers...")
        
        # Generate diverse customers
        customers: list[Customer] = []
        business_types = [
            "Tech Solutions", "Marketing Agency", "Consulting Group", "Manufacturing Co", 
            "Healthcare Services", "Educational Institute", "Retail Chain", "Construction LLC",
            "Financial Services", "Media Production", "Real Estate Group", "Transportation Co",
            "Food Services", "Energy Solutions", "Legal Associates", "Design Studio"
        ]
        
        for i in range(num_customers):
            business_type = random.choice(business_types) if i < len(business_types) else "Business Solutions"
            company_name = f"{fake.company()} {business_type}"
            
            customer = Customer(
                customer_name=company_name,
                customer_address=fake.address().replace("\n", ", "),
                customer_phone="".join([str(random.randint(0, 9)) for _ in range(10)]),
                customer_email=fake.company_email(),
            )
            session.add(customer)
            customers.append(customer)

        print(f"📦 Generating {num_products} products...")
        
        # Generate diverse products
        product_data = generate_diverse_products(fake, num_products)
        products: list[Product] = []
        
        for prod in product_data:
            product = Product(
                product_description=prod["description"],
                product_price=prod["price"]
            )
            session.add(product)
            products.append(product)

        session.commit()
        
        # Refresh to get IDs
        for c in customers:
            session.refresh(c)
        for p in products:
            session.refresh(p)

        print(f"🧾 Generating {num_invoices} invoices with realistic status progression...")
        
        # Generate invoices across last year
        terms_options = [
            "Due on Receipt", "Net 15", "Net 30", "Net 45", "Net 60",
            "Due end of the month", "Due end of next month"
        ]
        
        # Customer weights for more realistic distribution
        # Some customers get more invoices (larger clients)
        customer_weights = []
        for i, customer in enumerate(customers):
            if i < 5:  # Top 5 customers get more invoices
                customer_weights.append(3)
            elif i < 12:  # Mid-tier customers
                customer_weights.append(2)
            else:  # Smaller customers
                customer_weights.append(1)

        for i in range(num_invoices):
            if i % 100 == 0:
                print(f"  Generated {i} invoices...")
            
            # Select customer with weighted probability
            customer = random.choices(customers, weights=customer_weights)[0]
            
            # Generate issue date across last year with seasonal variation
            # More invoices in Q4, fewer in summer
            today = date.today()
            start_date = today - timedelta(days=365)
            
            # Seasonal weights by month
            month_weights = {
                1: 1.0, 2: 0.9, 3: 1.1, 4: 1.0, 5: 0.8, 6: 0.7,  # Q1-Q2
                7: 0.6, 8: 0.7, 9: 1.0, 10: 1.2, 11: 1.3, 12: 1.4  # Q3-Q4
            }
            
            # Generate weighted random date
            issue_date = fake.date_between(start_date, today)
            month_weight = month_weights.get(issue_date.month, 1.0)
            
            # Skip some dates based on seasonal weight
            if random.random() > month_weight:
                continue
            
            terms = random.choice(terms_options)
            
            # Generate invoice with proper chronological timestamps
            invoice_info = generate_invoice_with_timestamps(issue_date, terms)

            invoice = Invoice(
                customer_id=customer.customer_id,
                date_issued=issue_date,
                invoice_terms=terms,
                invoice_due_date=invoice_info["due_date"],
                invoice_status=invoice_info["status"],
                invoice_total=0.0,
                date_submitted=invoice_info.get("date_submitted"),
                date_sent=invoice_info.get("date_sent"),
                date_paid=invoice_info.get("date_paid"),
                date_cancelled=invoice_info.get("date_cancelled"),
            )

            # Generate line items
            num_items = random.randint(min_items_per_invoice, max_items_per_invoice)
            total = 0.0
            used_product_ids: set[int] = set()
            
            for _ in range(num_items):
                product = random.choice(products)
                # Avoid duplicate products in same invoice
                if product.product_id in used_product_ids:
                    continue
                used_product_ids.add(product.product_id)

                qty = random.randint(1, 10)
                line_total = round(qty * float(product.product_price), 2)

                line = LineItem(
                    product_id=product.product_id,
                    lineitem_qty=qty,
                    lineitem_total=line_total,
                )
                invoice.line_items.append(line)
                total += line_total

            invoice.invoice_total = round(total, 2)
            session.add(invoice)

        session.commit()
        
        print(f"\n✅ Successfully generated:")
        print(f"   📋 {num_customers} customers")
        print(f"   📦 {num_products} products")
        print(f"   🧾 {num_invoices} invoices")
        print(f"   📊 Status distribution across last 12 months")
        print(f"   💰 Revenue data for comprehensive reporting")


if __name__ == "__main__":
    print("🚀 Starting Invoice Management System data generation...")
    print("=" * 60)
    
    # Full production dataset
    seed(
        num_customers=20,
        num_products=50,
        num_invoices=1000,  # Full 1000 invoices for reporting
    )
    
    print("=" * 60)
    print("🎉 Data generation complete! Ready for reporting features.")