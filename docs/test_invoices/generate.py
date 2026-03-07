"""
Generate test AP invoice PDFs that match the SmartInvoice AR invoice layout.

Layout mirrors SingleInvoicePage.jsx:
  Left header  : Vendor name + address + email
  Right header : INVOICE title + # INV-XXXX + Balance Due
  Metadata row : Invoice Date | Terms | Due Date
  Bill To      : SmartInvoice, Texas U.S.A, induborra09@gmail.com
  Table        : # | Description | Qty | Rate | Amount
  Totals       : Subtotal / Total / Balance Due
  Footer       : Thanks for your business.
"""

import os
from datetime import date

from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUTPUT_DIR = os.path.dirname(__file__)

# ── Colours ───────────────────────────────────────────────────────────────────
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


def generate_invoice(
    filename, vendor_name, vendor_address, vendor_city, vendor_email,
    invoice_number, invoice_date, due_date, terms, line_items,
):
    filepath = os.path.join(OUTPUT_DIR, filename)
    doc = SimpleDocTemplate(
        filepath, pagesize=letter,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
        topMargin=0.75 * inch,  bottomMargin=0.75 * inch,
    )

    subtotal = sum(i["qty"] * i["rate"] for i in line_items)
    total    = subtotal
    story    = []

    # ── 1. Header: vendor (left) + invoice info (right) ───────────────────────
    hdr = Table([
        [Paragraph(vendor_name,    STYLES["vendor_name"]),  Paragraph("INVOICE",             STYLES["inv_title"])],
        [Paragraph(vendor_address, STYLES["vendor_sub"]),   Paragraph(f"# {invoice_number}", STYLES["inv_num"])],
        [Paragraph(vendor_city,    STYLES["vendor_sub"]),   ""],
        [Paragraph(vendor_email,   STYLES["vendor_sub"]),   Paragraph("Balance Due",          STYLES["bal_label"])],
        ["",                                                Paragraph(f"${total:,.2f}",       STYLES["bal_amount"])],
    ], colWidths=[4 * inch, 3 * inch])
    hdr.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING",    (0, 0), (-1, -1), 2),
    ]))
    story += [hdr, Spacer(1, 0.2 * inch)]

    # ── 2. Bill To (left) | Invoice Date / Terms / Due Date (right) ───────────
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
    ], colWidths=[3 * inch, 1.5 * inch, 2.5 * inch])
    meta.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
    ]))
    story += [meta, Spacer(1, 0.2 * inch),
              HRFlowable(width="100%", thickness=1, color=LIGHT_GRAY),
              Spacer(1, 0.15 * inch)]

    # ── 3. Line items table ────────────────────────────────────────────────────
    rows = [["#", "Description", "Qty", "Rate", "Amount"]]
    for idx, item in enumerate(line_items, 1):
        amt = item["qty"] * item["rate"]
        rows.append([
            str(idx),
            item["description"],
            f"{item['qty']} pcs",
            f"${item['rate']:,.2f}",
            f"${amt:,.2f}",
        ])

    items_tbl = Table(rows, colWidths=[0.4*inch, 3.2*inch, 0.8*inch, 1.1*inch, 1.5*inch])
    items_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0),  BLUE),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  white),
        ("FONTNAME",      (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, 0),  10),
        ("BOTTOMPADDING", (0, 0), (-1, 0),  8),
        ("TOPPADDING",    (0, 0), (-1, 0),  8),
        ("FONTNAME",      (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",      (0, 1), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
        ("TOPPADDING",    (0, 1), (-1, -1), 6),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [white, LIGHT_GRAY]),
        ("ALIGN",         (0, 0), (0, -1),  "CENTER"),
        ("ALIGN",         (2, 0), (-1, -1), "RIGHT"),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW",     (0, 0), (-1,  0), 0.5, BLUE),
        ("LINEBELOW",     (0,-1), (-1, -1), 0.5, GRAY),
    ]))
    story += [items_tbl, Spacer(1, 0.2 * inch)]

    # ── 4. Totals ──────────────────────────────────────────────────────────────
    totals = Table([
        ["", "Subtotal:",    f"${subtotal:,.2f}"],
        ["", "Total:",       f"${total:,.2f}"],
        ["", "Balance Due:", f"${total:,.2f}"],
    ], colWidths=[4 * inch, 1.5 * inch, 1.5 * inch])
    totals.setStyle(TableStyle([
        ("FONTNAME",      (0, 0), (-1, -2), "Helvetica"),
        ("FONTNAME",      (0,-1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, -1), 10),
        ("ALIGN",         (1, 0), (-1, -1), "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("LINEABOVE",     (1,-1), (-1, -1), 1,   BLUE),
        ("TEXTCOLOR",     (1,-1), (-1, -1), BLUE),
    ]))
    story += [
        totals,
        Spacer(1, 0.4 * inch),
        HRFlowable(width="100%", thickness=0.5, color=LIGHT_GRAY),
        Spacer(1, 0.15 * inch),
        Paragraph("Thanks for your business.", STYLES["footer"]),
    ]

    doc.build(story)
    print(f"Generated: {filename}  (total: ${total:,.2f})")


# ── Invoices ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    generate_invoice(
        filename="acme_supplies_INV-2025-0841.pdf",
        vendor_name="Acme Supplies Inc.",
        vendor_address="4521 Commerce Blvd",
        vendor_city="Austin, TX 78701",
        vendor_email="billing@acmesupplies.com",
        invoice_number="INV-2025-0841",
        invoice_date=date(2025, 1, 15),
        due_date=date(2025, 2, 14),
        terms="Net 30",
        line_items=[
            {"description": "Office Paper A4 (Box of 500)",  "qty": 20, "rate":  45.00},
            {"description": "Ballpoint Pens (Pack of 50)",   "qty":  5, "rate":  18.50},
            {"description": "Printer Ink Cartridge - Black", "qty":  8, "rate":  32.00},
            {"description": "Stapler Heavy Duty",            "qty":  4, "rate":  24.75},
            {"description": "File Folders (Box of 100)",     "qty":  6, "rate":  22.00},
        ],
    )

    generate_invoice(
        filename="techflow_INV-TF-2025-0042.pdf",
        vendor_name="TechFlow Solutions LLC",
        vendor_address="890 Innovation Drive, Suite 400",
        vendor_city="San Francisco, CA 94105",
        vendor_email="invoices@techflow.io",
        invoice_number="INV-TF-2025-0042",
        invoice_date=date(2025, 2, 1),
        due_date=date(2025, 3, 3),
        terms="Net 30",
        line_items=[
            {"description": "Software Development - Backend API", "qty": 40, "rate":  95.00},
            {"description": "UI/UX Design Consulting",            "qty": 16, "rate": 120.00},
            {"description": "Cloud Infrastructure Setup",         "qty":  8, "rate": 150.00},
            {"description": "Technical Documentation",            "qty": 10, "rate":  75.00},
        ],
    )

    generate_invoice(
        filename="globalfreight_GFC-INV-2025-1193.pdf",
        vendor_name="Global Freight Co.",
        vendor_address="12 Harbor Way",
        vendor_city="Houston, TX 77002",
        vendor_email="ar@globalfreight.com",
        invoice_number="GFC-INV-2025-1193",
        invoice_date=date(2025, 3, 1),
        due_date=date(2025, 3, 31),
        terms="Net 30",
        line_items=[
            {"description": "International Freight - Container Shipment", "qty":  2, "rate": 1850.00},
            {"description": "Customs Clearance Fee",                      "qty":  1, "rate":  450.00},
            {"description": "Warehousing & Handling (per pallet)",        "qty": 10, "rate":   85.00},
            {"description": "Insurance Premium",                          "qty":  1, "rate":  670.00},
        ],
    )
