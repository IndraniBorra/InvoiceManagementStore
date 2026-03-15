"""
Plaid Integration Routes

Handles Plaid Link token creation, public→access token exchange,
transaction fetching with Claude classification, and bank account listing.
"""

import os
import json
from datetime import datetime, timedelta, date
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlmodel import Session, select

from database import get_session
from models import BankAccount, Company, CategoryRule, ChartOfAccount, JournalEntry, JournalLine
from routes.accounting_routes import apply_category_rules, CONFIDENCE_THRESHOLD

import plaid
from plaid.api import plaid_api
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.transactions_get_request import TransactionsGetRequest
from plaid.model.transactions_get_request_options import TransactionsGetRequestOptions
from plaid.model.accounts_get_request import AccountsGetRequest
from plaid.model.country_code import CountryCode
from plaid.model.products import Products

import anthropic

router = APIRouter(prefix="/plaid", tags=["plaid"])

# ── Plaid client setup ─────────────────────────────────────────────────────────

def _get_plaid_client() -> plaid_api.PlaidApi:
    plaid_env = os.getenv("PLAID_ENV", "sandbox")
    env_map = {
        "sandbox": plaid.Environment.Sandbox,
        "production": plaid.Environment.Production,
    }
    configuration = plaid.Configuration(
        host=env_map.get(plaid_env, plaid.Environment.Sandbox),
        api_key={
            "clientId": os.getenv("PLAID_CLIENT_ID", ""),
            "secret": os.getenv("PLAID_SECRET", ""),
        },
    )
    api_client = plaid.ApiClient(configuration)
    return plaid_api.PlaidApi(api_client)


# ── Request / Response schemas ─────────────────────────────────────────────────

class ExchangeTokenRequest(BaseModel):
    public_token: str
    institution_name: str
    account_name: str
    masked_number: Optional[str] = None


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_or_create_company(session: Session) -> Company:
    company = session.exec(select(Company)).first()
    if not company:
        company = Company(name="SmartInvoiceInc", fiscal_year_start=1)
        session.add(company)
        session.commit()
        session.refresh(company)
    return company


def _next_gl_code(session: Session) -> str:
    """Return next available bank GL code: 1000, 1001, 1002 …"""
    existing = session.exec(
        select(BankAccount.gl_account_code)
    ).all()
    used = {int(c) for c in existing if c.isdigit()}
    code = 1000
    while code in used:
        code += 1
    return str(code)


def _ensure_coa(session: Session, code: str, name: str):
    """Create a ChartOfAccount entry for the GL code if it doesn't exist."""
    exists = session.exec(
        select(ChartOfAccount).where(ChartOfAccount.code == code)
    ).first()
    if not exists:
        session.add(ChartOfAccount(
            code=code,
            name=name,
            account_type="asset",
            normal_balance="debit",
            description=f"Bank account: {name}",
        ))
        session.commit()


_BANK_SYSTEM_PROMPT_TEMPLATE = """
You are a bookkeeping assistant for SmartInvoiceInc.

Classify each bank transaction and produce double-entry journal line suggestions.
The company's bank account for these transactions has GL code {cash_gl_code} ({cash_account_name}).

For every transaction return a JSON array (no markdown fences) where each element is:
{{
  "date": "YYYY-MM-DD",
  "description": "<original description>",
  "amount": <positive float>,
  "type": "credit" | "debit",
  "debit_account": "<GL code>",
  "credit_account": "<GL code>",
  "journal_description": "<concise bookkeeping memo>"
}}

Rules:
- Money IN  (deposits, customer payments): debit {cash_gl_code}, credit 1100 (AR) or 4000 (Revenue)
- Money OUT (expenses, fees, rent, payroll): debit 5000 (Expense) or 2000 (AP), credit {cash_gl_code}
- Also return a "confidence" field (float 0.0–1.0) per transaction. Be conservative — only give 0.95+ when the classification is completely unambiguous.
- Return ONLY the JSON array, no extra text.
""".strip()


def _classify_with_claude(transactions: list[dict], cash_gl_code: str, cash_account_name: str) -> list[dict]:
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    prompt = _BANK_SYSTEM_PROMPT_TEMPLATE.format(
        cash_gl_code=cash_gl_code,
        cash_account_name=cash_account_name,
    )
    user_msg = json.dumps(transactions, default=str)
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        system=prompt,
        messages=[{"role": "user", "content": user_msg}],
    )
    text = msg.content[0].text.strip()
    # Strip markdown fences if present
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text)


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/link-token")
def create_link_token():
    """Create a Plaid Link token for the frontend to initialize Plaid Link."""
    try:
        client = _get_plaid_client()
        request = LinkTokenCreateRequest(
            products=[Products("transactions")],
            client_name="SmartInvoiceInc",
            country_codes=[CountryCode("US")],
            language="en",
            user=LinkTokenCreateRequestUser(client_user_id="smartinvoiceinc-user"),
        )
        response = client.link_token_create(request)
        return {"link_token": response["link_token"]}
    except plaid.ApiException as e:
        raise HTTPException(status_code=400, detail=f"Plaid error: {e.body}")


@router.post("/exchange-token")
def exchange_token(
    body: ExchangeTokenRequest,
    session: Session = Depends(get_session),
):
    """Exchange a Plaid public token for an access token and store the bank account."""
    try:
        client = _get_plaid_client()

        # Exchange public_token → access_token
        exchange_req = ItemPublicTokenExchangeRequest(public_token=body.public_token)
        exchange_resp = client.item_public_token_exchange(exchange_req)
        access_token = exchange_resp["access_token"]
        item_id = exchange_resp["item_id"]

        # Fetch account details to get plaid_account_id
        accounts_resp = client.accounts_get(AccountsGetRequest(access_token=access_token))
        plaid_account_id = None
        if accounts_resp["accounts"]:
            plaid_account_id = accounts_resp["accounts"][0]["account_id"]

        # Get or create the company
        company = _get_or_create_company(session)

        # Determine next GL code
        gl_code = _next_gl_code(session)
        coa_name = f"{body.institution_name} {body.account_name}"

        # Ensure COA entry exists for this GL code
        _ensure_coa(session, gl_code, coa_name)

        # Create BankAccount record
        bank_account = BankAccount(
            company_id=company.id,
            institution_name=body.institution_name,
            account_name=body.account_name,
            masked_number=body.masked_number,
            plaid_access_token=access_token,
            plaid_account_id=plaid_account_id,
            plaid_item_id=item_id,
            gl_account_code=gl_code,
            is_active=True,
            connected_at=datetime.utcnow(),
        )
        session.add(bank_account)
        session.commit()
        session.refresh(bank_account)

        return {
            "bank_account_id": bank_account.id,
            "gl_account_code": gl_code,
            "institution": body.institution_name,
            "account_name": body.account_name,
        }
    except plaid.ApiException as e:
        raise HTTPException(status_code=400, detail=f"Plaid error: {e.body}")


@router.get("/transactions")
def fetch_transactions(
    bank_account_id: int,
    days: int = 30,
    session: Session = Depends(get_session),
):
    """
    Fetch transactions from Plaid for a connected bank account,
    classify them with Claude, and return the result for review.
    """
    bank_account = session.get(BankAccount, bank_account_id)
    if not bank_account or not bank_account.plaid_access_token:
        raise HTTPException(status_code=404, detail="Bank account not found or not connected via Plaid")

    try:
        client = _get_plaid_client()
        end_date = date.today()
        start_date = end_date - timedelta(days=days)

        txn_request = TransactionsGetRequest(
            access_token=bank_account.plaid_access_token,
            start_date=start_date,
            end_date=end_date,
            options=TransactionsGetRequestOptions(count=500),
        )
        txn_response = client.transactions_get(txn_request)
        plaid_txns = txn_response["transactions"]

        # Normalise into a flat list for Claude
        raw = []
        for t in plaid_txns:
            amount = float(t["amount"])  # Plaid: positive = money out, negative = money in
            raw.append({
                "date": str(t["date"]),
                "description": t["name"],
                "amount": abs(amount),
                "direction": "out" if amount > 0 else "in",
            })

        if not raw:
            return {
                "transactions": [], "count": 0,
                "total_credits": 0, "total_debits": 0,
                "bank_account_id": bank_account_id,
                "gl_account_code": bank_account.gl_account_code,
                "flagged_count": 0, "rule_matched_count": 0,
            }

        # Apply category rules first
        rule_matched, needs_claude = apply_category_rules(raw, session)

        claude_classified = []
        if needs_claude:
            coa = session.exec(
                select(ChartOfAccount).where(ChartOfAccount.code == bank_account.gl_account_code)
            ).first()
            cash_account_name = coa.name if coa else bank_account.gl_account_code
            claude_classified = _classify_with_claude(needs_claude, bank_account.gl_account_code, cash_account_name)
            for t in claude_classified:
                t.setdefault("confidence", 0.80)
                t.setdefault("rule_matched", None)

        classified = rule_matched + claude_classified
        gl_code = bank_account.gl_account_code
        total_credits = sum(t.get("amount", 0) for t in classified if t.get("debit_account") == gl_code)
        total_debits = sum(t.get("amount", 0) for t in classified if t.get("credit_account") == gl_code)
        flagged = sum(1 for t in classified if t.get("confidence", 1.0) < CONFIDENCE_THRESHOLD)

        return {
            "transactions": classified,
            "count": len(classified),
            "total_credits": round(total_credits, 2),
            "total_debits": round(total_debits, 2),
            "bank_account_id": bank_account_id,
            "gl_account_code": gl_code,
            "flagged_count": flagged,
            "rule_matched_count": len(rule_matched),
        }
    except plaid.ApiException as e:
        raise HTTPException(status_code=400, detail=f"Plaid error: {e.body}")


@router.get("/accounts")
def list_bank_accounts(session: Session = Depends(get_session)):
    """Return all connected bank accounts for the company."""
    accounts = session.exec(
        select(BankAccount).where(BankAccount.is_active == True)
    ).all()

    return [
        {
            "id": a.id,
            "institution_name": a.institution_name,
            "account_name": a.account_name,
            "masked_number": a.masked_number,
            "gl_account_code": a.gl_account_code,
            "connected_at": a.connected_at.isoformat() if a.connected_at else None,
            "is_active": a.is_active,
        }
        for a in accounts
    ]
