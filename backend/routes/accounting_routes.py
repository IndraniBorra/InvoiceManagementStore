import csv
import io
import json
import re
from datetime import date, datetime
from typing import List, Optional

import anthropic
import pdfplumber
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlmodel import Session, select, func

from database import get_session
from models import BankAccount, CategoryRule, ChartOfAccount, JournalEntry, JournalLine

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


class BankTransaction(BaseModel):
    date: str
    description: str
    amount: float
    type: str                           # credit | debit
    debit_account: str                  # account code e.g. "1000"
    credit_account: str
    journal_description: str
    confidence: float = 1.0             # 0.0–1.0; rules always = 1.0
    rule_matched: Optional[str] = None  # rule name if matched by rule


class BankStatementConfirm(BaseModel):
    transactions: List[BankTransaction]
    bank_account_id: Optional[int] = None   # If set, use that BankAccount's GL code as cash

CONFIDENCE_THRESHOLD = 0.95


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
    Idempotent: skips if an entry with the same reference_type + reference_id already exists.
    """
    existing = session.exec(
        select(JournalEntry).where(
            JournalEntry.reference_type == reference_type,
            JournalEntry.reference_id == reference_id,
        )
    ).first()
    if existing:
        return  # already posted, skip duplicate

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
    limit: int = Query(200, ge=1, le=1000),
    session: Session = Depends(get_session),
):
    from sqlalchemy import select as sa_select, outerjoin
    from sqlalchemy.orm import aliased

    # Single query: JOIN entries with lines, aggregate totals, apply filters + limit
    stmt = (
        sa_select(
            JournalEntry.id,
            JournalEntry.entry_date,
            JournalEntry.description,
            JournalEntry.reference_type,
            JournalEntry.reference_id,
            JournalEntry.created_at,
            func.coalesce(func.sum(JournalLine.debit), 0.0).label("total_debit"),
            func.coalesce(func.sum(JournalLine.credit), 0.0).label("total_credit"),
        )
        .select_from(JournalEntry)
        .outerjoin(JournalLine, JournalLine.journal_entry_id == JournalEntry.id)
        .group_by(JournalEntry.id)
        .order_by(JournalEntry.entry_date.desc(), JournalEntry.id.desc())
        .limit(limit)
    )
    if start_date:
        stmt = stmt.where(JournalEntry.entry_date >= start_date)
    if end_date:
        stmt = stmt.where(JournalEntry.entry_date <= end_date)
    if reference_type:
        stmt = stmt.where(JournalEntry.reference_type == reference_type)

    rows = session.exec(stmt).all()
    return [
        {
            "id": r.id,
            "entry_date": str(r.entry_date),
            "description": r.description,
            "reference_type": r.reference_type,
            "reference_id": r.reference_id,
            "total_debit": round(r.total_debit, 2),
            "total_credit": round(r.total_credit, 2),
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


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


# ── Bank Statement Upload ───────────────────────────────────────────────────────

def apply_category_rules(raw_transactions: list, session: Session):
    """
    Split transactions into rule-matched and unmatched (needs Claude).
    Rule-matched get confidence=1.0; unmatched go to Claude.
    """
    import re as _re
    rules = session.exec(
        select(CategoryRule)
        .where(CategoryRule.is_active == True)
        .order_by(CategoryRule.priority)
    ).all()

    matched, unmatched = [], []
    for txn in raw_transactions:
        desc = (txn.get("description") or "").lower()
        rule_hit = None
        for rule in rules:
            val = rule.match_value.lower()
            if rule.match_type == "contains" and val in desc:
                rule_hit = rule
            elif rule.match_type == "starts_with" and desc.startswith(val):
                rule_hit = rule
            elif rule.match_type == "exact" and desc == val:
                rule_hit = rule
            elif rule.match_type == "regex":
                if _re.search(val, desc, _re.IGNORECASE):
                    rule_hit = rule
            if rule_hit:
                break

        if rule_hit:
            matched.append({
                **txn,
                "debit_account": rule_hit.debit_account,
                "credit_account": rule_hit.credit_account,
                "journal_description": rule_hit.category_label or rule_hit.name,
                "type": "credit" if rule_hit.debit_account.startswith("1") else "debit",
                "confidence": 1.0,
                "rule_matched": rule_hit.name,
            })
        else:
            unmatched.append(txn)
    return matched, unmatched


_BANK_SYSTEM_PROMPT = """You are a bookkeeping AI. Classify bank statement transactions using double-entry accounting.

Chart of Accounts:
- 1000: Cash (asset)
- 1100: Accounts Receivable (asset)
- 2000: Accounts Payable (liability)
- 4000: Revenue (revenue)
- 5000: Expenses (expense)

Rules:
- Positive amount (money IN from a customer invoice payment): DR Cash(1000) / CR AR(1100)
- Positive amount (other income/revenue deposits): DR Cash(1000) / CR Revenue(4000)
- Negative amount (paying a supplier/vendor bill): DR AP(2000) / CR Cash(1000)
- Negative amount (operating expense — rent, payroll, subscriptions, utilities, fees): DR Expenses(5000) / CR Cash(1000)

Also return a "confidence" field (float 0.0–1.0) for each transaction indicating how certain you are about the GL classification. Be conservative — only give 0.95+ when the transaction type is completely unambiguous.

Return ONLY a valid JSON array with no markdown or explanation:
[{"date":"YYYY-MM-DD","description":"original description","amount":0.00,"type":"credit or debit","debit_account":"1000","credit_account":"4000","journal_description":"Brief accounting note","confidence":0.97}]"""


@router.post("/bank-statement")
async def upload_bank_statement(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
):
    filename = (file.filename or "").lower()
    if not (filename.endswith(".csv") or filename.endswith(".pdf")):
        raise HTTPException(status_code=400, detail="Only CSV and PDF files are supported")

    content = await file.read()
    raw_transactions = []

    if filename.endswith(".csv"):
        text = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        for row in reader:
            date_val = row.get("Date") or row.get("date") or ""
            desc_val = row.get("Description") or row.get("description") or row.get("Memo") or ""
            amount_str = row.get("Amount") or row.get("amount") or "0"
            try:
                amount = float(str(amount_str).replace(",", "").replace("$", ""))
            except ValueError:
                continue
            if date_val.strip():
                raw_transactions.append({
                    "date": date_val.strip(),
                    "description": desc_val.strip(),
                    "amount": amount,
                })
    else:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            text_lines = []
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_lines.extend(page_text.split("\n"))
        pattern = re.compile(
            r"(\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4})\s+(.+?)\s+([-]?\$?[\d,]+\.\d{2})\s*$"
        )
        for line in text_lines:
            m = pattern.search(line)
            if m:
                try:
                    amount = float(m.group(3).replace(",", "").replace("$", ""))
                    raw_transactions.append({
                        "date": m.group(1),
                        "description": m.group(2).strip(),
                        "amount": amount,
                    })
                except ValueError:
                    continue

    if not raw_transactions:
        raise HTTPException(status_code=400, detail="No transactions found in the uploaded file")

    # Apply category rules first — rule-matched skip Claude
    rule_matched, needs_claude = apply_category_rules(raw_transactions, session)

    claude_classified = []
    if needs_claude:
        client = anthropic.Anthropic()
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=4096,
            system=_BANK_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": f"Classify these transactions:\n{json.dumps(needs_claude, indent=2)}"}],
        )
        response_text = message.content[0].text.strip()
        response_text = re.sub(r"^```(?:json)?\n?", "", response_text)
        response_text = re.sub(r"\n?```$", "", response_text)
        try:
            claude_classified = json.loads(response_text)
        except json.JSONDecodeError:
            raise HTTPException(status_code=500, detail="Failed to parse AI classification response")
        # Ensure confidence field exists on all Claude results
        for t in claude_classified:
            t.setdefault("confidence", 0.80)
            t.setdefault("rule_matched", None)

    classified = rule_matched + claude_classified

    gl_code = "1000"
    total_credits = sum(t.get("amount", 0) for t in classified if t.get("debit_account") == gl_code)
    total_debits = sum(t.get("amount", 0) for t in classified if t.get("credit_account") == gl_code)
    flagged = sum(1 for t in classified if t.get("confidence", 1.0) < CONFIDENCE_THRESHOLD)

    return {
        "transactions": classified,
        "count": len(classified),
        "total_credits": round(total_credits, 2),
        "total_debits": round(total_debits, 2),
        "flagged_count": flagged,
        "rule_matched_count": len(rule_matched),
    }


@router.post("/bank-statement/confirm")
def confirm_bank_statement(
    body: BankStatementConfirm,
    session: Session = Depends(get_session),
):
    # Determine cash GL code — use the connected BankAccount if provided
    cash_gl_code = "1000"
    if body.bank_account_id:
        bank_account = session.get(BankAccount, body.bank_account_id)
        if bank_account:
            cash_gl_code = bank_account.gl_account_code

    posted = 0
    skipped = 0
    for txn in body.transactions:
        # Skip low-confidence transactions — require manual review
        if txn.confidence < CONFIDENCE_THRESHOLD:
            skipped += 1
            continue

        # Override debit/credit account to use the correct cash GL code
        debit_account = txn.debit_account
        credit_account = txn.credit_account
        if body.bank_account_id:
            if txn.debit_account == "1000":
                debit_account = cash_gl_code
            if txn.credit_account == "1000":
                credit_account = cash_gl_code
        try:
            entry_date_parsed = date.fromisoformat(txn.date)
        except ValueError:
            entry_date_parsed = date.today()

        amount = abs(txn.amount)
        post_journal_entry(
            session=session,
            entry_date=entry_date_parsed,
            description=txn.description or txn.journal_description,
            reference_type="bank_statement",
            reference_id=body.bank_account_id or 0,
            lines=[
                {"account_code": debit_account, "debit": amount, "credit": 0.0},
                {"account_code": credit_account, "debit": 0.0, "credit": amount},
            ],
        )
        posted += 1

    session.commit()
    msg = f"Successfully posted {posted} journal entries."
    if skipped:
        msg += f" {skipped} transaction(s) skipped — confidence below 95%, manual review needed."
    return {"posted": posted, "skipped_low_confidence": skipped, "message": msg}
