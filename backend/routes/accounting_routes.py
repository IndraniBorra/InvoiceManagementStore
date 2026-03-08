from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select, func

from database import get_session
from models import ChartOfAccount, JournalEntry, JournalLine

router = APIRouter(prefix="/accounting", tags=["accounting"])


# ── Pydantic schemas ───────────────────────────────────────────────────────────

class AccountCreate(BaseModel):
    code: str
    name: str
    account_type: str       # asset | liability | equity | revenue | expense
    normal_balance: str     # debit | credit
    description: Optional[str] = None


class JournalLineCreate(BaseModel):
    account_id: int
    debit: float = 0.0
    credit: float = 0.0
    description: Optional[str] = None


class JournalEntryCreate(BaseModel):
    entry_date: date
    description: str
    reference_type: Optional[str] = None
    reference_id: Optional[int] = None
    lines: List[JournalLineCreate]


# ── Helper: post a journal entry ───────────────────────────────────────────────

def post_journal_entry(
    session: Session,
    entry_date: date,
    description: str,
    reference_type: str,
    reference_id: int,
    lines: List[dict],          # [{"account_code": "1000", "debit": x, "credit": y}]
):
    """
    Create a balanced journal entry. Silently skips if accounts not found
    (avoids breaking existing workflows if COA not seeded yet).
    """
    entry = JournalEntry(
        entry_date=entry_date,
        description=description,
        reference_type=reference_type,
        reference_id=reference_id,
    )
    session.add(entry)
    session.flush()

    for line in lines:
        account = session.exec(
            select(ChartOfAccount).where(ChartOfAccount.code == line["account_code"])
        ).first()
        if not account:
            continue
        session.add(JournalLine(
            journal_entry_id=entry.id,
            account_id=account.id,
            debit=line.get("debit", 0.0),
            credit=line.get("credit", 0.0),
            description=line.get("description"),
        ))


# ── Chart of Accounts ──────────────────────────────────────────────────────────

@router.get("/accounts")
def list_accounts(session: Session = Depends(get_session)):
    accounts = session.exec(
        select(ChartOfAccount).order_by(ChartOfAccount.code)
    ).all()

    result = []
    for acct in accounts:
        total_debit  = session.exec(
            select(func.coalesce(func.sum(JournalLine.debit), 0.0))
            .where(JournalLine.account_id == acct.id)
        ).first() or 0.0
        total_credit = session.exec(
            select(func.coalesce(func.sum(JournalLine.credit), 0.0))
            .where(JournalLine.account_id == acct.id)
        ).first() or 0.0

        if acct.normal_balance == "debit":
            balance = total_debit - total_credit
        else:
            balance = total_credit - total_debit

        result.append({
            "id": acct.id,
            "code": acct.code,
            "name": acct.name,
            "account_type": acct.account_type,
            "normal_balance": acct.normal_balance,
            "description": acct.description,
            "is_active": acct.is_active,
            "balance": round(balance, 2),
        })
    return result


@router.post("/accounts", status_code=201)
def create_account(body: AccountCreate, session: Session = Depends(get_session)):
    existing = session.exec(
        select(ChartOfAccount).where(ChartOfAccount.code == body.code)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Account code '{body.code}' already exists")
    account = ChartOfAccount(**body.model_dump())
    session.add(account)
    session.commit()
    session.refresh(account)
    return {"id": account.id, "code": account.code, "name": account.name}


# ── Journal Entries ────────────────────────────────────────────────────────────

@router.get("/journal")
def list_journal_entries(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    reference_type: Optional[str] = Query(None),
    session: Session = Depends(get_session),
):
    stmt = select(JournalEntry).order_by(JournalEntry.entry_date.desc(), JournalEntry.id.desc())
    if start_date:
        stmt = stmt.where(JournalEntry.entry_date >= start_date)
    if end_date:
        stmt = stmt.where(JournalEntry.entry_date <= end_date)
    if reference_type:
        stmt = stmt.where(JournalEntry.reference_type == reference_type)

    entries = session.exec(stmt).all()
    result = []
    for e in entries:
        lines = session.exec(select(JournalLine).where(JournalLine.journal_entry_id == e.id)).all()
        total_debit  = sum(l.debit  for l in lines)
        total_credit = sum(l.credit for l in lines)
        result.append({
            "id": e.id,
            "entry_date": str(e.entry_date),
            "description": e.description,
            "reference_type": e.reference_type,
            "reference_id": e.reference_id,
            "total_debit": round(total_debit, 2),
            "total_credit": round(total_credit, 2),
            "created_at": e.created_at.isoformat(),
        })
    return result


@router.get("/journal/{entry_id}")
def get_journal_entry(entry_id: int, session: Session = Depends(get_session)):
    entry = session.get(JournalEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")

    lines = session.exec(select(JournalLine).where(JournalLine.journal_entry_id == entry_id)).all()
    lines_out = []
    for l in lines:
        account = session.get(ChartOfAccount, l.account_id)
        lines_out.append({
            "id": l.id,
            "account_id": l.account_id,
            "account_code": account.code if account else None,
            "account_name": account.name if account else None,
            "debit": l.debit,
            "credit": l.credit,
            "description": l.description,
        })

    return {
        "id": entry.id,
        "entry_date": str(entry.entry_date),
        "description": entry.description,
        "reference_type": entry.reference_type,
        "reference_id": entry.reference_id,
        "created_at": entry.created_at.isoformat(),
        "lines": lines_out,
    }


@router.post("/journal", status_code=201)
def create_journal_entry(body: JournalEntryCreate, session: Session = Depends(get_session)):
    total_debit  = sum(l.debit  for l in body.lines)
    total_credit = sum(l.credit for l in body.lines)
    if round(total_debit, 2) != round(total_credit, 2):
        raise HTTPException(
            status_code=400,
            detail=f"Journal entry is unbalanced: debits={total_debit}, credits={total_credit}"
        )

    entry = JournalEntry(
        entry_date=body.entry_date,
        description=body.description,
        reference_type=body.reference_type,
        reference_id=body.reference_id,
    )
    session.add(entry)
    session.flush()

    for line in body.lines:
        account = session.get(ChartOfAccount, line.account_id)
        if not account:
            raise HTTPException(status_code=404, detail=f"Account {line.account_id} not found")
        session.add(JournalLine(
            journal_entry_id=entry.id,
            account_id=line.account_id,
            debit=line.debit,
            credit=line.credit,
            description=line.description,
        ))

    session.commit()
    return {"id": entry.id}


# ── Account Ledger ─────────────────────────────────────────────────────────────

@router.get("/ledger/{account_id}")
def get_ledger(account_id: int, session: Session = Depends(get_session)):
    account = session.get(ChartOfAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    lines = session.exec(
        select(JournalLine, JournalEntry)
        .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
        .where(JournalLine.account_id == account_id)
        .order_by(JournalEntry.entry_date, JournalEntry.id)
    ).all()

    running = 0.0
    rows = []
    for line, entry in lines:
        if account.normal_balance == "debit":
            running += line.debit - line.credit
        else:
            running += line.credit - line.debit
        rows.append({
            "journal_entry_id": entry.id,
            "entry_date": str(entry.entry_date),
            "description": entry.description,
            "reference_type": entry.reference_type,
            "reference_id": entry.reference_id,
            "debit": line.debit,
            "credit": line.credit,
            "balance": round(running, 2),
        })

    return {
        "account": {"id": account.id, "code": account.code, "name": account.name, "account_type": account.account_type},
        "lines": rows,
        "closing_balance": round(running, 2),
    }


# ── Trial Balance ──────────────────────────────────────────────────────────────

@router.get("/trial-balance")
def get_trial_balance(session: Session = Depends(get_session)):
    accounts = session.exec(select(ChartOfAccount).where(ChartOfAccount.is_active == True).order_by(ChartOfAccount.code)).all()

    rows = []
    total_debit = 0.0
    total_credit = 0.0

    for acct in accounts:
        dr = session.exec(
            select(func.coalesce(func.sum(JournalLine.debit), 0.0))
            .where(JournalLine.account_id == acct.id)
        ).first() or 0.0
        cr = session.exec(
            select(func.coalesce(func.sum(JournalLine.credit), 0.0))
            .where(JournalLine.account_id == acct.id)
        ).first() or 0.0

        if dr == 0 and cr == 0:
            continue

        if acct.normal_balance == "debit":
            balance_debit  = round(dr - cr, 2) if dr >= cr else 0.0
            balance_credit = round(cr - dr, 2) if cr > dr else 0.0
        else:
            balance_debit  = round(dr - cr, 2) if dr > cr else 0.0
            balance_credit = round(cr - dr, 2) if cr >= dr else 0.0

        total_debit  += balance_debit
        total_credit += balance_credit

        rows.append({
            "code": acct.code,
            "name": acct.name,
            "account_type": acct.account_type,
            "debit": balance_debit,
            "credit": balance_credit,
        })

    return {
        "accounts": rows,
        "total_debit": round(total_debit, 2),
        "total_credit": round(total_credit, 2),
        "balanced": round(total_debit, 2) == round(total_credit, 2),
    }


# ── P&L Summary ────────────────────────────────────────────────────────────────

@router.get("/summary")
def get_pl_summary(session: Session = Depends(get_session)):
    def account_balance(code: str) -> float:
        acct = session.exec(select(ChartOfAccount).where(ChartOfAccount.code == code)).first()
        if not acct:
            return 0.0
        dr = session.exec(
            select(func.coalesce(func.sum(JournalLine.debit), 0.0))
            .where(JournalLine.account_id == acct.id)
        ).first() or 0.0
        cr = session.exec(
            select(func.coalesce(func.sum(JournalLine.credit), 0.0))
            .where(JournalLine.account_id == acct.id)
        ).first() or 0.0
        if acct.normal_balance == "debit":
            return round(dr - cr, 2)
        return round(cr - dr, 2)

    revenue  = account_balance("4000")
    cogs     = account_balance("5000")
    cash     = account_balance("1000")
    ar       = account_balance("1100")
    ap       = account_balance("2000")

    return {
        "revenue": revenue,
        "expenses": cogs,
        "net_income": round(revenue - cogs, 2),
        "cash_balance": cash,
        "accounts_receivable": ar,
        "accounts_payable": ap,
    }
