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
        [Paragraph("SmartInvoiceInc",                  STYLES["body"]),
         Paragraph("Terms:",                          STYLES["meta_label"]),
         Paragraph(terms,                             STYLES["meta_value"])],
        [Paragraph("123 Main St, Suite 100",           STYLES["body"]),
         Paragraph("Due Date:",                       STYLES["meta_label"]),
         Paragraph(due_date.strftime("%m/%d/%Y"),     STYLES["meta_value"])],
        [Paragraph("Dallas, Texas 75201",              STYLES["body"]), "", ""],
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

    # ── 20 diverse-format invoices ─────────────────────────────────────────────
    print("\nGenerating 20 diverse-format test invoices...\n")

    generate_invoice(
        filename="eurotech_ET-2026-0051.pdf",
        vendor_name="Sender: EuroTech GmbH",
        vendor_address="Berliner Str. 42",
        vendor_city="Berlin, Germany 10115",
        vendor_email="rechnungen@eurotech.de",
        invoice_number="ET-2026-0051",
        invoice_date=date(2026, 1, 8),
        due_date=date(2026, 2, 7),
        terms="Net 30",
        line_items=[
            {"description": "Hardware Maintenance Contract",     "qty": 1, "rate": 1200.00},
            {"description": "Software License – Enterprise",     "qty": 5, "rate":  380.00},
            {"description": "Remote Support Hours",              "qty": 8, "rate":   95.00},
        ],
    )

    generate_invoice(
        filename="pacific_freight_PFC-2026-0077.pdf",
        vendor_name="Issued By: Pacific Freight Co",
        vendor_address="88 Harbor Drive, Dock 7",
        vendor_city="Los Angeles, CA 90021",
        vendor_email="invoices@pacificfreight.com",
        invoice_number="PFC-2026-0077",
        invoice_date=date(2026, 1, 12),
        due_date=date(2026, 3, 13),
        terms="Net 60",
        line_items=[
            {"description": "Ocean Freight – Container 20ft (PO# PO-2026-1142)", "qty": 2, "rate": 1850.00},
            {"description": "Port Handling & Documentation",                      "qty": 1, "rate":  320.00},
            {"description": "Customs Brokerage Fee",                              "qty": 1, "rate":  475.00},
            {"description": "Fuel Surcharge",                                     "qty": 1, "rate":  210.00},
        ],
    )

    generate_invoice(
        filename="summit_consulting_SC-INV-2026-0031.pdf",
        vendor_name="From: Summit Consulting Group",
        vendor_address="500 Business Park, Suite 12",
        vendor_city="Boston, MA 02101",
        vendor_email="billing@summitconsult.io",
        invoice_number="SC-INV-2026-0031",
        invoice_date=date(2026, 1, 20),
        due_date=date(2026, 2, 19),
        terms="Net 30",
        line_items=[
            {"description": "Strategy Consulting – Week 1 (40 hrs @ $175)",  "qty": 40, "rate": 175.00},
            {"description": "Strategy Consulting – Week 2 (40 hrs @ $175)",  "qty": 40, "rate": 175.00},
            {"description": "Travel & Expenses",                              "qty":  1, "rate": 620.00},
        ],
    )

    generate_invoice(
        filename="datacloud_saas_DC-2026-0019.pdf",
        vendor_name="DataCloud SaaS Inc.",
        vendor_address="700 Cloud Avenue, Floor 8",
        vendor_city="San Francisco, CA 94107",
        vendor_email="accounts@datacloudapp.com",
        invoice_number="DC-2026-0019",
        invoice_date=date(2026, 2, 1),
        due_date=date(2026, 3, 3),
        terms="Net 30",
        line_items=[
            {"description": "Enterprise Plan – Monthly Subscription", "qty":  1, "rate": 2499.00},
            {"description": "Additional Seats (10 users)",             "qty": 10, "rate":   49.00},
            {"description": "Advanced Analytics Add-on",              "qty":  1, "rate":  299.00},
            {"description": "Priority Support Plan",                  "qty":  1, "rate":  199.00},
        ],
    )

    generate_invoice(
        filename="buildright_contractors_BRC-2026-0008.pdf",
        vendor_name="Billed By: BuildRight Contractors LLC",
        vendor_address="12 Construction Ave",
        vendor_city="Phoenix, AZ 85001",
        vendor_email="finance@buildrightco.com",
        invoice_number="BRC-2026-0008",
        invoice_date=date(2026, 2, 5),
        due_date=date(2026, 3, 7),
        terms="Net 30",
        line_items=[
            {"description": "Labor – Structural Framing (120 hrs)",    "qty": 120, "rate":  65.00},
            {"description": "Concrete – 50 yards delivered",           "qty":  50, "rate":  92.00},
            {"description": "Steel Beams – W8x31 (20ft)",              "qty":   8, "rate": 340.00},
            {"description": "Equipment Rental – Crane (5 days)",       "qty":   5, "rate": 850.00},
            {"description": "Safety Compliance & Site Management",     "qty":   1, "rate": 1500.00},
        ],
    )

    generate_invoice(
        filename="lexgroup_legal_LGL-2026-0042.pdf",
        vendor_name="Billed By: LexGroup Legal Partners",
        vendor_address="900 Attorney Row, Suite 1400",
        vendor_city="New York, NY 10004",
        vendor_email="billing@lexgroup.law",
        invoice_number="LGL-2026-0042",
        invoice_date=date(2026, 2, 10),
        due_date=date(2026, 3, 12),
        terms="Net 30",
        line_items=[
            {"description": "Corporate Restructuring Advisory",   "qty":  6, "rate":  650.00},
            {"description": "IP Registration – 3 Trademarks",    "qty":  3, "rate":  450.00},
            {"description": "Employment Agreements Review",       "qty":  5, "rate":  350.00},
            {"description": "Monthly Retainer – General Counsel", "qty":  1, "rate": 3000.00},
        ],
    )

    generate_invoice(
        filename="medsupply_MSI-2026-0091.pdf",
        vendor_name="MedSupply Inc.",
        vendor_address="333 Healthcare Blvd",
        vendor_city="Nashville, TN 37201",
        vendor_email="orders@medsupplyinc.com",
        invoice_number="MSI-2026-0091",
        invoice_date=date(2026, 2, 15),
        due_date=date(2026, 3, 2),
        terms="Net 15",
        line_items=[
            {"description": "Nitrile Gloves – Box of 100 (PO# PO-2026-0334)", "qty": 50, "rate":  12.50},
            {"description": "Surgical Masks – 3-ply (50-pack)",                "qty": 20, "rate":  18.00},
            {"description": "Hand Sanitizer 500ml",                            "qty": 30, "rate":   8.75},
            {"description": "First Aid Kits – Standard",                       "qty": 10, "rate":  45.00},
            {"description": "Infrared Thermometers",                           "qty":  5, "rate":  89.00},
        ],
    )

    generate_invoice(
        filename="advantage_mktg_ADV-2026-0011.pdf",
        vendor_name="Company: AdVantage Marketing Agency",
        vendor_address="15 Madison Square",
        vendor_city="New York, NY 10010",
        vendor_email="finance@advantagemktg.com",
        invoice_number="ADV-2026-0011",
        invoice_date=date(2026, 2, 20),
        due_date=date(2026, 4, 21),
        terms="Net 60",
        line_items=[
            {"description": "Monthly Retainer – Brand Strategy",       "qty":  1, "rate": 4500.00},
            {"description": "Google Ads Management",                   "qty":  1, "rate": 1200.00},
            {"description": "Social Media Content – 20 posts",        "qty": 20, "rate":   85.00},
            {"description": "Influencer Campaign Coordination",        "qty":  1, "rate": 2200.00},
            {"description": "Monthly Analytics Report",                "qty":  1, "rate":  350.00},
        ],
    )

    generate_invoice(
        filename="staffbridge_SB-2026-0055.pdf",
        vendor_name="StaffBridge Workforce Solutions",
        vendor_address="200 Talent Drive, Suite 500",
        vendor_city="Denver, CO 80202",
        vendor_email="billing@staffbridge.com",
        invoice_number="SB-2026-0055",
        invoice_date=date(2026, 3, 1),
        due_date=date(2026, 3, 16),
        terms="Net 15",
        line_items=[
            {"description": "Temp Staff – Week of Feb 03 (3 staff × 40hrs)", "qty": 120, "rate":  28.00},
            {"description": "Temp Staff – Week of Feb 10 (3 staff × 40hrs)", "qty": 120, "rate":  28.00},
            {"description": "Temp Staff – Week of Feb 17 (3 staff × 40hrs)", "qty": 120, "rate":  28.00},
            {"description": "Temp Staff – Week of Feb 24 (3 staff × 40hrs)", "qty": 120, "rate":  28.00},
            {"description": "Placement Administration Fee",                   "qty":   1, "rate": 350.00},
        ],
    )

    generate_invoice(
        filename="equiprent_EQR-2026-0022.pdf",
        vendor_name="Issued By: EquipRent Industrial",
        vendor_address="77 Equipment Way",
        vendor_city="Houston, TX 77001",
        vendor_email="rentals@equiprent.com",
        invoice_number="EQR-2026-0022",
        invoice_date=date(2026, 3, 5),
        due_date=date(2026, 4, 4),
        terms="Net 30",
        line_items=[
            {"description": "Forklift Rental – 10 days @ $250/day",   "qty": 10, "rate":  250.00},
            {"description": "Aerial Lift (Scissor) – 5 days @ $180",  "qty":  5, "rate":  180.00},
            {"description": "Compressor 185CFM – 10 days @ $95",      "qty": 10, "rate":   95.00},
            {"description": "Delivery & Pickup Fee",                   "qty":  1, "rate":  350.00},
        ],
    )

    generate_invoice(
        filename="secureguard_SGD-2026-0033.pdf",
        vendor_name="SecureGuard Security Ltd.",
        vendor_address="44 Shield Street",
        vendor_city="Dallas, TX 75201",
        vendor_email="invoices@secureguard.co",
        invoice_number="SGD-2026-0033",
        invoice_date=date(2026, 3, 8),
        due_date=date(2026, 4, 7),
        terms="Net 30",
        line_items=[
            {"description": "Manned Guarding – 240 hrs (Monthly)",  "qty": 240, "rate":  22.50},
            {"description": "CCTV Monitoring – Remote (Monthly)",   "qty":   1, "rate": 450.00},
            {"description": "Access Control Maintenance",           "qty":   1, "rate": 180.00},
            {"description": "Security Audit Report",                "qty":   1, "rate": 350.00},
        ],
    )

    generate_invoice(
        filename="netcloud_pro_NCP-2026-0014.pdf",
        vendor_name="Company: NetCloud Pro Services",
        vendor_address="1 Network Blvd, Suite 200",
        vendor_city="Seattle, WA 98101",
        vendor_email="billing@netcloudpro.com",
        invoice_number="NCP-2026-0014",
        invoice_date=date(2026, 3, 10),
        due_date=date(2026, 4, 9),
        terms="Net 30",
        line_items=[
            {"description": "Managed Firewall Service (Monthly)",    "qty":  1, "rate":  699.00},
            {"description": "SD-WAN Management – 3 sites",          "qty":  3, "rate":  350.00},
            {"description": "Endpoint Security – 50 devices",       "qty": 50, "rate":   18.00},
            {"description": "24/7 NOC Monitoring",                  "qty":  1, "rate":  599.00},
            {"description": "Patch Management Service",             "qty":  1, "rate":  249.00},
        ],
    )

    generate_invoice(
        filename="alphacpa_ACP-2026-Q1.pdf",
        vendor_name="Issued By: AlphaCPA Accounting Firm",
        vendor_address="88 Finance Street, Floor 6",
        vendor_city="Chicago, IL 60602",
        vendor_email="accounts@alphacpa.com",
        invoice_number="ACP-2026-Q1",
        invoice_date=date(2026, 1, 1),
        due_date=date(2026, 2, 1),
        terms="Net 30",
        line_items=[
            {"description": "Quarterly Bookkeeping – Q1 2026",   "qty":  1, "rate": 1800.00},
            {"description": "Payroll Processing – 3 months",     "qty":  3, "rate":  350.00},
            {"description": "Tax Planning Consultation",          "qty":  2, "rate":  400.00},
            {"description": "Year-End Financial Statements",     "qty":  1, "rate": 1200.00},
        ],
    )

    generate_invoice(
        filename="skytravel_STR-2026-0088.pdf",
        vendor_name="Sender: SkyTravel Agency",
        vendor_address="500 Airport Road, Suite 300",
        vendor_city="Miami, FL 33101",
        vendor_email="corporate@skytravelagency.com",
        invoice_number="STR-2026-0088",
        invoice_date=date(2026, 3, 15),
        due_date=date(2026, 4, 14),
        terms="Net 30",
        line_items=[
            {"description": "Flight – DFW to NYC (J. Smith)",        "qty":  1, "rate":  450.00},
            {"description": "Flight – DFW to NYC (M. Johnson)",      "qty":  1, "rate":  450.00},
            {"description": "Hotel – Marriott Midtown 3 nights",     "qty":  3, "rate":  289.00},
            {"description": "Car Rental – SUV 4 days",               "qty":  4, "rate":   95.00},
            {"description": "Travel Insurance – 2 pax",              "qty":  2, "rate":   55.00},
            {"description": "Agency Service Fee",                    "qty":  1, "rate":  125.00},
        ],
    )

    generate_invoice(
        filename="officesupplymax_OSM-2026-0201.pdf",
        vendor_name="OfficeSupplyMax",
        vendor_address="888 Bulk Order Ave",
        vendor_city="Dallas, TX 75234",
        vendor_email="orders@officesupplymax.com",
        invoice_number="OSM-2026-0201",
        invoice_date=date(2026, 3, 20),
        due_date=date(2026, 4, 4),
        terms="Net 15",
        line_items=[
            {"description": "Copy Paper – 500-sheet Ream",            "qty": 50, "rate":   8.99},
            {"description": "Ballpoint Pens – Box of 12 (Blue)",      "qty": 20, "rate":   5.50},
            {"description": "Mechanical Pencils – Box of 24",         "qty": 10, "rate":   9.25},
            {"description": "Legal Pads – Yellow (dozen)",            "qty":  8, "rate":  14.99},
            {"description": "Hanging File Folders – Box 25",          "qty":  6, "rate":  18.75},
            {"description": "Binder Clips Assorted (100-pack)",       "qty": 10, "rate":   4.50},
            {"description": "Whiteboard Markers (8-pack)",            "qty":  5, "rate":  11.99},
            {"description": "Scissors – Stainless Steel",             "qty": 15, "rate":   6.25},
            {"description": "Tape Dispenser + 6 rolls",               "qty":  8, "rate":   8.50},
            {"description": "Staples 5000-count box",                 "qty": 12, "rate":   4.75},
        ],
    )

    generate_invoice(
        filename="telcoone_TCO-2026-0039.pdf",
        vendor_name="TelcoOne Communications",
        vendor_address="25 Telecom Plaza",
        vendor_city="Atlanta, GA 30303",
        vendor_email="billing@telcoone.net",
        invoice_number="TCO-2026-0039",
        invoice_date=date(2026, 3, 1),
        due_date=date(2026, 3, 31),
        terms="Net 30",
        line_items=[
            {"description": "Business Phone Lines – 10 lines (Mar 2026)",   "qty": 10, "rate":  35.00},
            {"description": "Fiber Internet 1Gbps (Mar 2026)",              "qty":  1, "rate": 299.00},
            {"description": "Cloud PBX System – 50 extensions",            "qty":  1, "rate": 199.00},
            {"description": "International Calling Bundle",                 "qty":  1, "rate":  75.00},
            {"description": "Equipment Lease – Routers x3",                "qty":  3, "rate":  45.00},
        ],
    )

    generate_invoice(
        filename="greenenergy_GEC-2026-0012.pdf",
        vendor_name="GreenEnergy Co.",
        vendor_address="12 Solar Avenue",
        vendor_city="Phoenix, AZ 85002",
        vendor_email="billing@greenenergy.co",
        invoice_number="GEC-2026-0012",
        invoice_date=date(2026, 2, 28),
        due_date=date(2026, 3, 30),
        terms="Net 30",
        line_items=[
            {"description": "Electricity – Commercial Rate (Feb 2026) 12,400 kWh", "qty":  1, "rate": 1488.00},
            {"description": "Demand Charge – Peak 45kW",                            "qty":  1, "rate":  540.00},
            {"description": "Solar Feed-in Credit",                                 "qty":  1, "rate":  -95.00},
            {"description": "Transmission & Distribution Fee",                      "qty":  1, "rate":  180.00},
        ],
    )

    generate_invoice(
        filename="freshcatering_FC-2026-0097.pdf",
        vendor_name="FreshCatering Co.",
        vendor_address="45 Gourmet Lane",
        vendor_city="Austin, TX 78702",
        vendor_email="invoices@freshcatering.com",
        invoice_number="FC-2026-0097",
        invoice_date=date(2026, 3, 10),
        due_date=date(2026, 3, 25),
        terms="Net 15",
        line_items=[
            {"description": "All-Hands Lunch – 50 pax (Mar 5)",          "qty": 50, "rate":  28.00},
            {"description": "Executive Catering – Board Meeting 12 pax", "qty": 12, "rate":  75.00},
            {"description": "Daily Coffee & Snack Service (10 days)",    "qty": 10, "rate": 120.00},
            {"description": "Special Dietary – Vegan Menu (8 pax)",      "qty":  8, "rate":  40.00},
            {"description": "Event Setup & Cleanup Fee",                  "qty":  1, "rate": 250.00},
            {"description": "Gratuity (18%)",                            "qty":  1, "rate": 392.04},
        ],
    )

    generate_invoice(
        filename="swiftlogistics_SWL-2026-0066.pdf",
        vendor_name="SwiftLogistics International",
        vendor_address="1 Freight Circle, Warehouse 3",
        vendor_city="Louisville, KY 40201",
        vendor_email="ar@swiftlogistics.com",
        invoice_number="SWL-2026-0066",
        invoice_date=date(2026, 3, 12),
        due_date=date(2026, 4, 11),
        terms="Net 30",
        line_items=[
            {"description": "Air Freight – 450kg DFW to LHR",      "qty": 450, "rate":   3.20},
            {"description": "Ground Transport – Origin",            "qty":   1, "rate": 280.00},
            {"description": "Ground Transport – Destination",       "qty":   1, "rate": 320.00},
            {"description": "Customs Documentation & Filing",       "qty":   1, "rate": 195.00},
            {"description": "Cargo Insurance (1.5% of declared)",   "qty":   1, "rate": 216.00},
            {"description": "Fuel Surcharge",                       "qty":   1, "rate": 145.00},
        ],
    )

    generate_invoice(
        filename="apexhr_APX-2026-0044.pdf",
        vendor_name="From: ApexHR Consulting",
        vendor_address="300 People Street, Suite 700",
        vendor_city="San Francisco, CA 94105",
        vendor_email="billing@apexhrconsult.com",
        invoice_number="APX-2026-0044",
        invoice_date=date(2026, 3, 18),
        due_date=date(2026, 4, 17),
        terms="Net 30",
        line_items=[
            {"description": "HR Strategy Consulting – 20 hrs @ $220",  "qty": 20, "rate": 220.00},
            {"description": "Recruitment Support – 3 roles",           "qty":  3, "rate": 800.00},
            {"description": "Employee Handbook Update",                "qty":  1, "rate": 650.00},
            {"description": "Performance Review System Setup",         "qty":  1, "rate": 950.00},
            {"description": "Training Workshop – DEI (2 sessions)",    "qty":  2, "rate": 700.00},
        ],
    )

    print(f"\nDone! 30 PDFs total saved to:\n  {OUTPUT_DIR}/")
