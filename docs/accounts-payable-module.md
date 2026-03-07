Accounts Payable (AP) Module
Context
The current app is Accounts Receivable — you create invoices and get paid. This module adds Accounts Payable — vendors email you invoices (PDFs) and you track, approve, and pay them. Email arrives via Mailgun inbound routing. PDF data is extracted using the existing NLP project (pdfplumber + sentence-transformers). Module lives inside the same app under /ap routes.

Architecture Overview

Vendor email → Mailgun → POST /ap/email/inbound
                                   ↓
                         Extract PDF attachment
                                   ↓
                         ap_extractor.py (pdfplumber + semantic matcher)
                                   ↓
                         Create APInvoice (status: pending_review)
                                   ↓
                     User reviews in /ap/invoice/:id
                                   ↓
                         approve → paid | reject
Phase 1: Core AP Module (build now)
1. New Database Models — backend/models.py
Add 4 new SQLModel tables alongside existing ones:


class APVendor(SQLModel, table=True):
    id: int (PK)
    vendor_name: str
    vendor_email: Optional[str]
    vendor_address: Optional[str]
    vendor_phone: Optional[str]
    bank_details: Optional[str]      # free-text for now
    created_at: datetime

class APInvoice(SQLModel, table=True):
    id: int (PK)
    vendor_id: Optional[int] → APVendor (nullable — vendor auto-created from email)
    invoice_number: Optional[str]    # from the received invoice doc
    invoice_date: Optional[date]
    due_date: Optional[date]
    total_amount: float = 0.0
    currency: str = "USD"
    status: str = "pending_review"   # pending_review | approved | paid | rejected
    email_subject: Optional[str]
    email_from: Optional[str]
    email_received_at: Optional[datetime]
    pdf_filename: Optional[str]      # stored in backend/uploads/ap/
    extraction_confidence: Optional[float]
    notes: Optional[str]
    created_at: datetime

class APLineItem(SQLModel, table=True):
    id: int (PK)
    ap_invoice_id: int → APInvoice
    description: Optional[str]
    quantity: Optional[float]
    unit_price: Optional[float]
    line_total: Optional[float]

class APPayment(SQLModel, table=True):
    id: int (PK)
    ap_invoice_id: int → APInvoice
    payment_date: date
    payment_amount: float
    payment_method: str             # bank_transfer | check | credit_card | other
    payment_reference: Optional[str]
    notes: Optional[str]
2. Extraction Service — backend/services/ap_extractor.py
Copy + adapt logic from:
~/OneDrive/Projects/NLP-projects/excelEntitiesExtraction-Project/pdf_processor.py
~/OneDrive/Projects/NLP-projects/excelEntitiesExtraction-Project/semantic_matcher.py


class APExtractor:
    def extract_from_bytes(pdf_bytes: bytes) -> dict:
        # 1. pdfplumber → extract text + tables
        # 2. Regex patterns → invoice_number, dates, amounts, vendor info
        # 3. SemanticMatcher → normalize column headers for line item tables
        # Returns: {
        #   invoice_number, invoice_date, due_date,
        #   vendor_name, vendor_email, vendor_address,
        #   total_amount, currency,
        #   line_items: [{description, quantity, unit_price, line_total}],
        #   confidence: float
        # }
New backend deps (add to requirements.txt):


pdfplumber>=0.10
sentence-transformers>=2.2.0
python-multipart  # likely already installed for FastAPI file uploads
3. AP Routes — backend/routes/ap_routes.py

POST /ap/invoice/upload              → upload PDF → extract → create APInvoice
POST /ap/email/inbound              → Mailgun webhook (multipart form)
GET  /ap/invoices                   → list all AP invoices (filter: status, vendor, due)
GET  /ap/invoice/{id}               → single invoice with line items + vendor
PUT  /ap/invoice/{id}               → user edits extracted fields
POST /ap/invoice/{id}/approve       → status → approved
POST /ap/invoice/{id}/reject        → status → rejected (notes required)
POST /ap/invoice/{id}/pay           → record APPayment → status → paid
GET  /ap/vendors                    → list vendors
POST /ap/vendor                     → create vendor
PUT  /ap/vendor/{id}               → update vendor
GET  /ap/dashboard                  → {pending_count, total_payable, overdue_count, due_soon_count}
Mailgun webhook format (/ap/email/inbound):

Mailgun POSTs multipart/form-data with fields: sender, subject, recipient, attachment-1, attachment-count
Extract all PDF attachments, run through extractor, create one APInvoice per PDF
Auto-match vendor by email against existing APVendor records; create new vendor if not found
PDF storage: save to backend/uploads/ap/{invoice_id}.pdf — serve via GET /ap/invoice/{id}/pdf

4. Register in backend/api.py

from routes.ap_routes import router as ap_router
app.include_router(ap_router, prefix="/ap")
Also call SQLModel.metadata.create_all(engine) to create the new tables (already happens on startup).

Phase 2: Frontend — 4 New Pages
All under /ap prefix. Add "Payables" link to Navbar.

/ap — AP Dashboard
4 stat cards: Pending Review | Total Payable | Overdue | Due This Week
Recent AP invoices table (last 5, sorted by due date asc)
"Upload Invoice" button
/ap/invoices — All AP Invoices
Table: Vendor | Invoice # | Invoice Date | Due Date | Amount | Status | Actions
Filter by status (pending_review, approved, paid, rejected)
Status badges: orange=pending, blue=approved, green=paid, red=rejected/overdue
/ap/invoice/:id — AP Invoice Detail
Left: PDF preview (iframe or embed from /ap/invoice/:id/pdf)
Right: extracted fields (editable form): vendor, invoice #, dates, total, line items
Action bar: Approve | Reject | Record Payment (based on current status)
Shows extraction confidence score
Payment history at the bottom
/ap/vendors — Vendor Management
Table of vendors with edit capability
Simple create form
New files:

src/pages/APDashboard.jsx
src/pages/APInvoiceList.jsx
src/pages/APInvoiceDetail.jsx
src/pages/APVendors.jsx
src/styles/components/APModule.css    (shared styles for all AP pages)
Navbar Update
Add "Payables" link to Navbar.jsx pointing to /ap

Files to Create / Modify
File	Action
backend/models.py	Add APVendor, APInvoice, APLineItem, APPayment models
backend/routes/ap_routes.py	Create — all AP API endpoints
backend/services/ap_extractor.py	Create — PDF extraction service (adapted from NLP project)
backend/requirements.txt	Add pdfplumber, sentence-transformers
backend/api.py	Register ap_router
src/pages/APDashboard.jsx	Create
src/pages/APInvoiceList.jsx	Create
src/pages/APInvoiceDetail.jsx	Create
src/pages/APVendors.jsx	Create
src/styles/components/APModule.css	Create
src/components/Navbar.jsx	Add Payables link
src/App.js	Add /ap routes
Mailgun Setup (one-time config, done by user)
Mailgun account → add your domain or use sandbox
Inbound Routes → Create route:
Expression: match_recipient("bills@yourdomain.com")
Action: forward("https://your-api.com/ap/email/inbound")
Set MAILGUN_SIGNING_KEY env var for webhook signature verification
Verification
Upload a PDF invoice → extracted fields appear in the review form
Edit extracted fields → save → data persists
Approve invoice → status changes to "approved"
Record payment → status changes to "paid", payment shows in history
Reject invoice → status "rejected", notes saved
AP Dashboard shows correct counts
Overdue invoices (due_date < today, status != paid) highlighted in red
Mailgun: send email with PDF attachment to configured address → AP invoice created automatically
