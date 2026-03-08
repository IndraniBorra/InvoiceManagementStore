"""
Seed journal entries for existing invoices.

Backfills the accounting ledger based on invoice statuses:
  - submitted / sent / overdue  → DR Accounts Receivable / CR Revenue
  - paid                        → above + DR Cash / CR Accounts Receivable
  - draft / cancelled           → skipped

Run locally:
    python scripts/seed_accounting.py

Run against AWS:
    DATABASE_URL="postgresql://..." python scripts/seed_accounting.py
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from sqlmodel import Session, select
from database import engine, create_db_and_tables
from models import Invoice, ChartOfAccount, JournalEntry, JournalLine


def get_account(session: Session, code: str) -> ChartOfAccount:
    acct = session.exec(select(ChartOfAccount).where(ChartOfAccount.code == code)).first()
    if not acct:
        raise RuntimeError(f"Account {code} not found — run the backend once first to seed COA")
    return acct


def already_posted(session: Session, reference_type: str, reference_id: int) -> bool:
    existing = session.exec(
        select(JournalEntry).where(
            JournalEntry.reference_type == reference_type,
            JournalEntry.reference_id == reference_id,
        )
    ).first()
    return existing is not None


def post_entry(session: Session, entry_date, description, ref_type, ref_id, lines):
    entry = JournalEntry(
        entry_date=entry_date,
        description=description,
        reference_type=ref_type,
        reference_id=ref_id,
    )
    session.add(entry)
    session.flush()
    for line in lines:
        session.add(JournalLine(
            journal_entry_id=entry.id,
            account_id=line["account_id"],
            debit=line.get("debit", 0.0),
            credit=line.get("credit", 0.0),
            description=line.get("description"),
        ))


def main():
    create_db_and_tables()

    with Session(engine) as session:
        # Load accounts
        ar     = get_account(session, "1100")
        cash   = get_account(session, "1000")
        rev    = get_account(session, "4000")

        invoices = session.exec(select(Invoice)).all()
        total = len(invoices)
        posted_ar = 0
        posted_cash = 0
        skipped = 0

        print(f"\n📒 Seeding journal entries for {total} invoices...\n")

        for inv in invoices:
            status = inv.invoice_status
            amount = inv.invoice_total

            if status in ("draft", "cancelled") or amount <= 0:
                skipped += 1
                continue

            # AR entry: submitted / sent / overdue / paid
            entry_date = inv.date_submitted.date() if inv.date_submitted else inv.date_issued

            if not already_posted(session, "ar_invoice", inv.id):
                post_entry(
                    session, entry_date,
                    f"AR Invoice #{inv.id} — {status}",
                    "ar_invoice", inv.id,
                    [
                        {"account_id": ar.id,  "debit": amount,  "credit": 0.0, "description": "Accounts Receivable"},
                        {"account_id": rev.id, "debit": 0.0,  "credit": amount, "description": "Revenue"},
                    ]
                )
                posted_ar += 1

            # Cash entry: paid invoices
            if status == "paid":
                paid_date = inv.date_paid.date() if inv.date_paid else entry_date
                # Use a unique ref_type so it doesn't clash with the AR entry
                if not already_posted(session, "ar_payment", inv.id):
                    post_entry(
                        session, paid_date,
                        f"AR Invoice #{inv.id} — payment received",
                        "ar_payment", inv.id,
                        [
                            {"account_id": cash.id, "debit": amount,  "credit": 0.0, "description": "Cash received"},
                            {"account_id": ar.id,   "debit": 0.0,  "credit": amount, "description": "AR cleared"},
                        ]
                    )
                    posted_cash += 1

        session.commit()

    print(f"✅ Done!")
    print(f"   📋 AR entries posted  : {posted_ar}")
    print(f"   💰 Cash entries posted: {posted_cash}")
    print(f"   ⏭️  Skipped (draft/cancelled/zero): {skipped}")
    print(f"\n🎉 Accounting ledger is now populated.\n")


if __name__ == "__main__":
    main()
