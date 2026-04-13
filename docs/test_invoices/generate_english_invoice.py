from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER

OUTPUT = "azure_grand_hotel_INV-2026-0042.pdf"

doc = SimpleDocTemplate(OUTPUT, pagesize=A4,
                        topMargin=1.5*cm, bottomMargin=2*cm,
                        leftMargin=2*cm, rightMargin=2*cm)

styles = getSampleStyleSheet()
normal = styles["Normal"]
bold_style = ParagraphStyle("bold", parent=normal, fontName="Helvetica-Bold")
title_style = ParagraphStyle("title", parent=normal, fontName="Helvetica-Bold", fontSize=16)
sub_style = ParagraphStyle("sub", parent=normal, fontName="Helvetica-Bold", fontSize=10)
right_style = ParagraphStyle("right", parent=normal, alignment=TA_RIGHT)
center_style = ParagraphStyle("center", parent=normal, alignment=TA_CENTER, fontSize=8)
small = ParagraphStyle("small", parent=normal, fontSize=8)
small_bold = ParagraphStyle("small_bold", parent=normal, fontSize=8, fontName="Helvetica-Bold")
small_center = ParagraphStyle("small_center", parent=normal, fontSize=8, alignment=TA_CENTER)

story = []

# ── Header ─────────────────────────────────────────────────────────────────────
header_data = [
    [
        Paragraph("<b>AZURE GRAND HOTEL & RESORT</b>", title_style),
        Table([
            [Paragraph("<b>Invoice No:</b>", small_bold), Paragraph("INV-2026-0042", small)],
            [Paragraph("<b>Booking Ref:</b>", small_bold), Paragraph("BK-9920045871", small)],
            [Paragraph("<b>Confirmation No:</b>", small_bold), Paragraph("A7731-CONF-88201", small)],
            [Paragraph("<b>Date:</b>", small_bold), Paragraph("05/04/2026", small)],
        ], colWidths=[3.5*cm, 5*cm])
    ]
]
header_table = Table(header_data, colWidths=[9*cm, 9*cm])
header_table.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
]))
story.append(header_table)
story.append(Spacer(1, 0.2*cm))
story.append(Paragraph("1200 Ocean Drive, Miami Beach, FL 33139 — United States", small))
story.append(Paragraph("Tax ID (EIN): 59-4821037", small))
story.append(Spacer(1, 0.4*cm))
story.append(HRFlowable(width="100%", thickness=1, color=colors.black))
story.append(Spacer(1, 0.3*cm))

# ── Guest / Bill To ─────────────────────────────────────────────────────────────
story.append(Paragraph("Bill To / Guest:", sub_style))
story.append(Spacer(1, 0.15*cm))
guest_data = [
    [
        Paragraph("<b>DELTA COMMERCE SOLUTIONS LLC</b>", bold_style),
    ],
    [Paragraph("450 Park Avenue, Suite 2800", normal)],
    [Paragraph("New York, NY 10022 — United States", normal)],
    [Paragraph("Federal Tax ID: 82-3410597", normal)],
]
guest_table = Table(guest_data, colWidths=[18*cm])
guest_table.setStyle(TableStyle([
    ("BOX", (0, 0), (-1, -1), 0.75, colors.black),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ("BACKGROUND", (0, 0), (-1, -1), colors.whitesmoke),
]))
story.append(guest_table)
story.append(Spacer(1, 0.4*cm))

# ── Stay Info ──────────────────────────────────────────────────────────────────
stay_data = [
    [Paragraph("<b>Adults:</b>", small_bold), Paragraph("2", small),
     Paragraph("<b>Children:</b>", small_bold), Paragraph("0", small)],
    [Paragraph("<b>Check-in:</b>", small_bold), Paragraph("31/03/2026", small),
     Paragraph("<b>Check-out:</b>", small_bold), Paragraph("05/04/2026", small)],
]
stay_table = Table(stay_data, colWidths=[3*cm, 3*cm, 3*cm, 3*cm])
stay_table.setStyle(TableStyle([
    ("BOX", (0, 0), (-1, -1), 0.75, colors.black),
    ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.grey),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
]))
story.append(stay_table)
story.append(Spacer(1, 0.3*cm))
story.append(Paragraph("Page 1 of 2", ParagraphStyle("pg", parent=normal, alignment=TA_RIGHT, fontSize=8)))
story.append(Spacer(1, 0.3*cm))

# ── Line Items ─────────────────────────────────────────────────────────────────
line_items = [
    ["Room", "Guest Name", "From", "To", "Service", "Qty", "Unit Price", "Total"],
    ["101", "James Whitfield", "31/03/26", "05/04/26", "All Inclusive Package", "1", "380.00", "380.00"],
    ["101", "James Whitfield", "31/03/26", "05/04/26", "All Inclusive Package", "1", "380.00", "380.00"],
    ["101", "James Whitfield", "31/03/26", "05/04/26", "All Inclusive Package", "1", "355.50", "355.50"],
    ["101", "James Whitfield", "31/03/26", "05/04/26", "All Inclusive Package", "1", "355.50", "355.50"],
    ["101", "James Whitfield", "31/03/26", "05/04/26", "All Inclusive Package", "1", "355.50", "355.50"],
]

items_table = Table(line_items, colWidths=[1.2*cm, 4*cm, 2*cm, 2*cm, 4*cm, 1*cm, 2.2*cm, 2*cm])
items_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2c3e50")),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 8),
    ("ALIGN", (5, 0), (-1, -1), "RIGHT"),
    ("ALIGN", (0, 0), (4, -1), "LEFT"),
    ("BOX", (0, 0), (-1, -1), 0.75, colors.black),
    ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.grey),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f2f2f2")]),
    ("LEFTPADDING", (0, 0), (-1, -1), 5),
    ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
]))
story.append(items_table)
story.append(Spacer(1, 1*cm))

# ── Payment Instructions ───────────────────────────────────────────────────────
story.append(Paragraph("Wire payments to be made to: AZURE GRAND HOTEL & RESORT LLC", small_bold))
story.append(Spacer(1, 0.3*cm))

payment_data = [
    [Paragraph("<b>UNITED STATES (USD)</b>", small_bold), Paragraph("<b>INTERNATIONAL (EUR)</b>", small_bold)],
    [Paragraph("Beneficiary Account #: 4401882930", small), Paragraph("Bank Name: Citibank N.A.", small)],
    [Paragraph("Receiving Bank: Wells Fargo Bank", small), Paragraph("IBAN: US64CITI0001003344129200", small)],
    [Paragraph("ABA Routing (Wire): 121000248", small), Paragraph("SWIFT/BIC: CITIUS33XXX", small)],
    [Paragraph("ABA Routing (ACH): 121000248", small), Paragraph("Bank Address: 388 Greenwich St, New York, NY 10013", small)],
    [Paragraph("SWIFT Code: WFBIUS6S", small), Paragraph("", small)],
]
pay_table = Table(payment_data, colWidths=[9*cm, 9*cm])
pay_table.setStyle(TableStyle([
    ("BOX", (0, 0), (-1, -1), 0.75, colors.black),
    ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.lightgrey),
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#d5e8f7")),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING", (0, 0), (-1, -1), 3),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
]))
story.append(pay_table)

# ── Page 2 — Totals ────────────────────────────────────────────────────────────
from reportlab.platypus import PageBreak
story.append(PageBreak())

story.append(Paragraph("<b>AZURE GRAND HOTEL & RESORT</b>", title_style))
story.append(Paragraph("Invoice No: INV-2026-0042", small_bold))
story.append(Paragraph("Page 2 of 2", ParagraphStyle("pg2", parent=normal, alignment=TA_RIGHT, fontSize=8)))
story.append(Spacer(1, 0.5*cm))

# Totals table
totals_data = [
    [Paragraph("<b>Tax Type</b>", small_bold), Paragraph("<b>Net Amount</b>", small_bold),
     Paragraph("<b>Tax (USD)</b>", small_bold), Paragraph("<b>Total Invoice</b>", small_bold)],
    ["0.00 %", "1,826.50 USD", "0.00 USD", Paragraph("<b>1,826.50 USD</b>", small_bold)],
    ["", "", Paragraph("<b>Total:</b>", small_bold), "0.00 USD"],
    ["", "", Paragraph("<b>AMOUNT DUE:</b>", small_bold), Paragraph("<b>1,826.50 USD</b>", small_bold)],
]
totals_table = Table(totals_data, colWidths=[3*cm, 5*cm, 5*cm, 5*cm])
totals_table.setStyle(TableStyle([
    ("BOX", (0, 0), (-1, -1), 0.75, colors.black),
    ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.grey),
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2c3e50")),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 8),
    ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
]))
story.append(totals_table)
story.append(Spacer(1, 0.5*cm))

story.append(Paragraph(
    "Note: This invoice is exempt from state sales tax under Florida Statute §212.08(7)(c) "
    "for qualifying corporate travel accounts.",
    small))
story.append(Spacer(1, 0.4*cm))

# Payment breakdown
story.append(Paragraph("<b>Payment Breakdown:</b>", small_bold))
story.append(Spacer(1, 0.2*cm))
breakdown_data = [
    [Paragraph("<b>Date</b>", small_bold), Paragraph("<b>Payment Method</b>", small_bold), Paragraph("<b>Total</b>", small_bold)],
    ["05/04/2026", "Credit — Corporate Account", Paragraph("<b>1,826.50 USD</b>", small_bold)],
]
breakdown_table = Table(breakdown_data, colWidths=[4*cm, 10*cm, 4*cm])
breakdown_table.setStyle(TableStyle([
    ("BOX", (0, 0), (-1, -1), 0.75, colors.black),
    ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.grey),
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#d5e8f7")),
    ("FONTSIZE", (0, 0), (-1, -1), 8),
    ("ALIGN", (2, 0), (2, -1), "RIGHT"),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
]))
story.append(breakdown_table)
story.append(Spacer(1, 1*cm))

# Footer
story.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey))
story.append(Spacer(1, 0.2*cm))
story.append(Paragraph("Wire payments to be made to: AZURE GRAND HOTEL & RESORT LLC", small_center))
story.append(Spacer(1, 0.2*cm))
footer_data = [
    [Paragraph("<b>UNITED STATES (USD)</b>", small_bold), Paragraph("<b>INTERNATIONAL (EUR)</b>", small_bold)],
    [Paragraph("Beneficiary Account #: 4401882930", small), Paragraph("Bank Name: Citibank N.A.", small)],
    [Paragraph("Receiving Bank: Wells Fargo Bank", small), Paragraph("IBAN: US64CITI0001003344129200", small)],
    [Paragraph("ABA Routing (Wire): 121000248", small), Paragraph("SWIFT/BIC: CITIUS33XXX", small)],
    [Paragraph("SWIFT Code: WFBIUS6S", small), Paragraph("Bank Address: 388 Greenwich St, New York, NY 10013", small)],
]
footer_table = Table(footer_data, colWidths=[9*cm, 9*cm])
footer_table.setStyle(TableStyle([
    ("BOX", (0, 0), (-1, -1), 0.75, colors.black),
    ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.lightgrey),
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#d5e8f7")),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING", (0, 0), (-1, -1), 3),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
]))
story.append(footer_table)

doc.build(story)
print(f"Generated: {OUTPUT}")
