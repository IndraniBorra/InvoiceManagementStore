"""
Generate a batch of test AP invoice PDFs for uploading via the UI.
Run from the backend venv:
    python docs/test_invoices/generate_batch.py
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'docs', 'test_invoices'))

from datetime import date
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

OUTPUT_DIR = os.path.dirname(__file__)

BLUE       = HexColor("#3b82f6")
DARK       = HexColor("#1e293b")
GRAY       = HexColor("#64748b")
LIGHT_GRAY = HexColor("#f1f5f9")

def ps(name, **kw):
    s = ParagraphStyle(name)
    for k, v in kw.items():
        setattr(s, k, v)
    return s

STYLES = {
    "vendor_name":   ps("vn", fontName="Helvetica-Bold", fontSize=18, textColor=DARK),
    "vendor_sub":    ps("vs", fontName="Helvetica",      fontSize=9,  textColor=GRAY, spaceAfter=2),
    "inv_title":     ps("it", fontName="Helvetica-Bold", fontSize=24, textColor=BLUE, alignment=TA_RIGHT),
    "inv_num":       ps("in", fontName="Helvetica",      fontSize=11, textColor=GRAY, alignment=TA_RIGHT),
    "bal_label":     ps("bl", fontName="Helvetica",      fontSize=10, textColor=GRAY, alignment=TA_RIGHT),
    "bal_amount":    ps("ba", fontName="Helvetica-Bold", fontSize=16, textColor=DARK, alignment=TA_RIGHT),
    "meta_label":    ps("ml", fontName="Helvetica",      fontSize=9,  textColor=GRAY, alignment=TA_RIGHT),
    "meta_value":    ps("mv", fontName="Helvetica-Bold", fontSize=9,  textColor=DARK, alignment=TA_RIGHT),
    "section_title": ps("st", fontName="Helvetica-Bold", fontSize=10, textColor=GRAY),
    "body":          ps("bo", fontName="Helvetica",      fontSize=10, textColor=DARK, spaceAfter=2),
    "footer":        ps("fo", fontName="Helvetica",      fontSize=9,  textColor=GRAY, alignment=TA_CENTER),
}

def generate_invoice(filename, vendor_name, vendor_address, vendor_city, vendor_email,
                     invoice_number, invoice_date, due_date, terms, line_items):
    filepath = os.path.join(OUTPUT_DIR, filename)
    doc = SimpleDocTemplate(filepath, pagesize=letter,
        leftMargin=0.75*inch, rightMargin=0.75*inch,
        topMargin=0.75*inch,  bottomMargin=0.75*inch)

    subtotal = sum(i["qty"] * i["rate"] for i in line_items)
    total    = subtotal
    story    = []

    hdr = Table([
        [Paragraph(vendor_name,    STYLES["vendor_name"]),  Paragraph("INVOICE",             STYLES["inv_title"])],
        [Paragraph(vendor_address, STYLES["vendor_sub"]),   Paragraph(f"# {invoice_number}", STYLES["inv_num"])],
        [Paragraph(vendor_city,    STYLES["vendor_sub"]),   ""],
        [Paragraph(vendor_email,   STYLES["vendor_sub"]),   Paragraph("Balance Due",          STYLES["bal_label"])],
        ["",                                                Paragraph(f"${total:,.2f}",       STYLES["bal_amount"])],
    ], colWidths=[4*inch, 3*inch])
    hdr.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("BOTTOMPADDING", (0,0), (-1,-1), 2),
        ("TOPPADDING",    (0,0), (-1,-1), 2),
    ]))
    story += [hdr, Spacer(1, 0.2*inch)]

    meta = Table([
        [Paragraph("Bill To:",                        STYLES["section_title"]),
         Paragraph("Invoice Date:",                   STYLES["meta_label"]),
         Paragraph(invoice_date.strftime("%m/%d/%Y"), STYLES["meta_value"])],
        [Paragraph("SmartInvoice",                    STYLES["body"]),
         Paragraph("Terms:",                          STYLES["meta_label"]),
         Paragraph(terms,                             STYLES["meta_value"])],
        [Paragraph("Texas, U.S.A",                    STYLES["body"]),
         Paragraph("Due Date:",                       STYLES["meta_label"]),
         Paragraph(due_date.strftime("%m/%d/%Y"),     STYLES["meta_value"])],
        [Paragraph("induborra09@gmail.com",            STYLES["body"]), "", ""],
    ], colWidths=[3*inch, 1.5*inch, 2.5*inch])
    meta.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("BOTTOMPADDING", (0,0), (-1,-1), 3),
        ("TOPPADDING",    (0,0), (-1,-1), 3),
    ]))
    story += [meta, Spacer(1, 0.2*inch),
              HRFlowable(width="100%", thickness=1, color=LIGHT_GRAY),
              Spacer(1, 0.15*inch)]

    rows = [["#", "Description", "Qty", "Rate", "Amount"]]
    for idx, item in enumerate(line_items, 1):
        amt = item["qty"] * item["rate"]
        rows.append([str(idx), item["description"], f"{item['qty']} pcs",
                     f"${item['rate']:,.2f}", f"${amt:,.2f}"])

    items_tbl = Table(rows, colWidths=[0.4*inch, 3.2*inch, 0.8*inch, 1.1*inch, 1.5*inch])
    items_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,0),  BLUE),
        ("TEXTCOLOR",     (0,0), (-1,0),  white),
        ("FONTNAME",      (0,0), (-1,0),  "Helvetica-Bold"),
        ("FONTSIZE",      (0,0), (-1,0),  10),
        ("BOTTOMPADDING", (0,0), (-1,0),  8),
        ("TOPPADDING",    (0,0), (-1,0),  8),
        ("FONTNAME",      (0,1), (-1,-1), "Helvetica"),
        ("FONTSIZE",      (0,1), (-1,-1), 9),
        ("BOTTOMPADDING", (0,1), (-1,-1), 6),
        ("TOPPADDING",    (0,1), (-1,-1), 6),
        ("ROWBACKGROUNDS",(0,1), (-1,-1), [white, LIGHT_GRAY]),
        ("ALIGN",         (0,0), (0,-1),  "CENTER"),
        ("ALIGN",         (2,0), (-1,-1), "RIGHT"),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ("LINEBELOW",     (0,0), (-1,0),  0.5, BLUE),
        ("LINEBELOW",     (0,-1),(-1,-1), 0.5, GRAY),
    ]))
    story += [items_tbl, Spacer(1, 0.2*inch)]

    totals = Table([
        ["", "Subtotal:",    f"${subtotal:,.2f}"],
        ["", "Total:",       f"${total:,.2f}"],
        ["", "Balance Due:", f"${total:,.2f}"],
    ], colWidths=[4*inch, 1.5*inch, 1.5*inch])
    totals.setStyle(TableStyle([
        ("FONTNAME",      (0,0), (-1,-2), "Helvetica"),
        ("FONTNAME",      (0,-1),(-1,-1), "Helvetica-Bold"),
        ("FONTSIZE",      (0,0), (-1,-1), 10),
        ("ALIGN",         (1,0), (-1,-1), "RIGHT"),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("TOPPADDING",    (0,0), (-1,-1), 4),
        ("LINEABOVE",     (1,-1),(-1,-1), 1, BLUE),
        ("TEXTCOLOR",     (1,-1),(-1,-1), BLUE),
    ]))
    story += [totals, Spacer(1, 0.4*inch),
              HRFlowable(width="100%", thickness=0.5, color=LIGHT_GRAY),
              Spacer(1, 0.15*inch),
              Paragraph("Thanks for your business.", STYLES["footer"])]

    doc.build(story)
    print(f"  ✓ {filename}  (${total:,.2f})")


if __name__ == "__main__":
    print("Generating test AP invoice PDFs...\n")

    generate_invoice(
        filename="cloudhost_INV-CH-2026-0101.pdf",
        vendor_name="CloudHost Pro LLC",
        vendor_address="456 Tech Park, Suite 200",
        vendor_city="Austin, TX 78701",
        vendor_email="invoices@cloudhostpro.io",
        invoice_number="CH-2026-0101",
        invoice_date=date(2026, 1, 5),
        due_date=date(2026, 2, 4),
        terms="Net 30",
        line_items=[
            {"description": "Compute Instances – Monthly (4x t3.large)", "qty": 4,  "rate": 300.00},
            {"description": "Managed PostgreSQL DB",                      "qty": 1,  "rate": 499.00},
            {"description": "Object Storage – 5TB",                      "qty": 1,  "rate": 250.00},
            {"description": "CDN Bandwidth Overage",                     "qty": 1,  "rate":  87.50},
            {"description": "Business Support Plan",                     "qty": 1,  "rate": 199.00},
        ],
    )

    generate_invoice(
        filename="metro_courier_MCR-2026-0044.pdf",
        vendor_name="Metro Courier Services",
        vendor_address="789 Delivery Lane",
        vendor_city="New York, NY 10001",
        vendor_email="ar@metrocourier.net",
        invoice_number="MCR-2026-0044",
        invoice_date=date(2026, 1, 10),
        due_date=date(2026, 1, 25),
        terms="Net 15",
        line_items=[
            {"description": "Same-Day Deliveries",          "qty": 14, "rate":  18.50},
            {"description": "Overnight Express Packages",   "qty":  9, "rate":  34.00},
            {"description": "Freight Pallet – Domestic",    "qty":  3, "rate": 320.00},
            {"description": "Signature Confirmation Fee",   "qty": 23, "rate":   2.50},
            {"description": "Fuel Surcharge",               "qty":  1, "rate":  55.00},
        ],
    )

    generate_invoice(
        filename="pinnacle_mktg_PMG-INV-2026-0017.pdf",
        vendor_name="Pinnacle Marketing Group",
        vendor_address="321 Madison Avenue, Floor 12",
        vendor_city="New York, NY 10017",
        vendor_email="finance@pinnaclemktg.com",
        invoice_number="PMG-INV-2026-0017",
        invoice_date=date(2026, 1, 15),
        due_date=date(2026, 3, 16),
        terms="Net 60",
        line_items=[
            {"description": "Social Media Ad Spend – Q1 Campaign",  "qty": 1, "rate": 3500.00},
            {"description": "Copywriting – 10 Blog Articles",        "qty":10, "rate":  250.00},
            {"description": "SEO Audit & Strategy Report",           "qty": 1, "rate": 1200.00},
            {"description": "Email Campaign Design & Deployment",    "qty": 1, "rate":  800.00},
        ],
    )

    generate_invoice(
        filename="safeguard_ins_SGI-2026-Q1.pdf",
        vendor_name="SafeGuard Insurance Partners",
        vendor_address="654 Risk Avenue",
        vendor_city="Hartford, CT 06103",
        vendor_email="premiums@safeguardins.com",
        invoice_number="SGI-2026-Q1",
        invoice_date=date(2026, 1, 1),
        due_date=date(2026, 1, 31),
        terms="Net 30",
        line_items=[
            {"description": "General Liability Premium – Q1",    "qty": 1, "rate": 2100.00},
            {"description": "Workers Compensation – Q1",         "qty": 1, "rate":  870.00},
            {"description": "Property Coverage – Q1",            "qty": 1, "rate": 1540.00},
            {"description": "Cyber Liability Add-on",            "qty": 1, "rate":  450.00},
        ],
    )

    generate_invoice(
        filename="swiftclean_SWC-2026-FEB.pdf",
        vendor_name="SwiftClean Facilities Management",
        vendor_address="987 Service Road, Unit 5",
        vendor_city="Atlanta, GA 30301",
        vendor_email="billing@swiftclean.co",
        invoice_number="SWC-2026-FEB",
        invoice_date=date(2026, 2, 1),
        due_date=date(2026, 3, 3),
        terms="Net 30",
        line_items=[
            {"description": "Monthly Janitorial Service",       "qty": 1, "rate":  950.00},
            {"description": "Exterior Window Cleaning",         "qty": 1, "rate":  300.00},
            {"description": "Carpet Deep Clean – 2nd Floor",    "qty": 1, "rate":  450.00},
            {"description": "Restroom Supply Restock",          "qty": 1, "rate":  180.00},
            {"description": "HVAC Filter Replacement (x4)",     "qty": 4, "rate":   55.00},
        ],
    )

    generate_invoice(
        filename="datavault_DVB-2026-0023.pdf",
        vendor_name="DataVault Backup Solutions",
        vendor_address="111 Storage Way, Suite 300",
        vendor_city="Seattle, WA 98101",
        vendor_email="accounts@datavault.io",
        invoice_number="DVB-2026-0023",
        invoice_date=date(2026, 2, 10),
        due_date=date(2026, 3, 12),
        terms="Net 30",
        line_items=[
            {"description": "Backup Storage – 10TB Monthly",    "qty": 1, "rate":  399.00},
            {"description": "Disaster Recovery SLA",            "qty": 1, "rate":  599.00},
            {"description": "Annual License Renewal",           "qty": 1, "rate": 1200.00},
        ],
    )

    generate_invoice(
        filename="greenleaf_catering_GLC-2026-0088.pdf",
        vendor_name="GreenLeaf Catering Inc.",
        vendor_address="222 Flavor Street",
        vendor_city="San Francisco, CA 94105",
        vendor_email="invoicing@greenleafcater.com",
        invoice_number="GLC-2026-0088",
        invoice_date=date(2026, 2, 14),
        due_date=date(2026, 3, 1),
        terms="Net 15",
        line_items=[
            {"description": "Team Lunch – 30 pax",              "qty": 30, "rate":  22.00},
            {"description": "Executive Board Dinner – 10 pax",  "qty": 10, "rate":  65.00},
            {"description": "Coffee & Snack Station (weekly)",  "qty":  4, "rate":  95.00},
            {"description": "Dietary Meal Prep – Special Menu", "qty":  8, "rate":  35.00},
        ],
    )

    generate_invoice(
        filename="prolegal_PLA-2026-0055.pdf",
        vendor_name="ProLegal Advisors LLP",
        vendor_address="333 Justice Boulevard, Suite 900",
        vendor_city="Washington, DC 20001",
        vendor_email="billing@prolegal.com",
        invoice_number="PLA-2026-0055",
        invoice_date=date(2026, 2, 20),
        due_date=date(2026, 3, 22),
        terms="Net 30",
        line_items=[
            {"description": "Contract Review & Redlining",      "qty":  4, "rate":  350.00},
            {"description": "Employment Law Consultation",       "qty":  2, "rate":  400.00},
            {"description": "NDA Drafting",                     "qty":  1, "rate":  500.00},
            {"description": "Monthly Retainer Fee",             "qty":  1, "rate": 2500.00},
        ],
    )

    generate_invoice(
        filename="techparts_direct_TPD-2026-0312.pdf",
        vendor_name="TechParts Direct",
        vendor_address="444 Silicon Drive",
        vendor_city="San Jose, CA 95110",
        vendor_email="ap@techpartsdirect.com",
        invoice_number="TPD-2026-0312",
        invoice_date=date(2026, 3, 1),
        due_date=date(2026, 3, 16),
        terms="Net 15",
        line_items=[
            {"description": "SSD Drives 1TB (Samsung 870 EVO)",  "qty": 10, "rate":  110.00},
            {"description": "Network Switch 24-port (Cisco)",     "qty":  2, "rate":  320.00},
            {"description": "UPS Battery Replacement",           "qty":  3, "rate":  155.00},
            {"description": "Keyboard & Mouse Sets",             "qty":  8, "rate":   45.00},
            {"description": "Patch Cables Cat6 (10-pack)",       "qty":  5, "rate":   28.00},
        ],
    )

    generate_invoice(
        filename="acme_office_AOF-2026-0199.pdf",
        vendor_name="Acme Office Supplies Co.",
        vendor_address="123 Commerce Boulevard",
        vendor_city="Chicago, IL 60601",
        vendor_email="billing@acmeoffice.com",
        invoice_number="AOF-2026-0199",
        invoice_date=date(2026, 3, 5),
        due_date=date(2026, 3, 20),
        terms="Net 15",
        line_items=[
            {"description": "Office Paper A4 – Case of 10 reams", "qty": 20, "rate":  45.00},
            {"description": "Printer Ink Cartridges (Black)",      "qty":  6, "rate":  32.50},
            {"description": "Sticky Notes Assorted (bulk)",        "qty": 12, "rate":   8.99},
            {"description": "Heavy-Duty Stapler",                  "qty":  3, "rate":  24.75},
            {"description": "File Folders Box of 100",             "qty":  4, "rate":  22.00},
        ],
    )

    print(f"\nDone! 10 PDFs saved to:\n  {OUTPUT_DIR}/")
