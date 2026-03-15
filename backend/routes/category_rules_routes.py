"""
Expense Category Rules — CRUD endpoints.

Rules are matched against transaction descriptions before Claude classification.
Rule-matched transactions get confidence=1.0 (no AI needed).
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from database import get_session
from models import CategoryRule

router = APIRouter(prefix="/accounting/category-rules", tags=["category-rules"])


class CategoryRuleCreate(BaseModel):
    name: str
    match_type: str = "contains"        # contains | starts_with | exact | regex
    match_value: str
    debit_account: str
    credit_account: str
    category_label: Optional[str] = None
    priority: int = 100


class CategoryRuleUpdate(BaseModel):
    name: Optional[str] = None
    match_type: Optional[str] = None
    match_value: Optional[str] = None
    debit_account: Optional[str] = None
    credit_account: Optional[str] = None
    category_label: Optional[str] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None


def _rule_out(rule: CategoryRule) -> dict:
    return {
        "id": rule.id,
        "name": rule.name,
        "match_type": rule.match_type,
        "match_value": rule.match_value,
        "debit_account": rule.debit_account,
        "credit_account": rule.credit_account,
        "category_label": rule.category_label,
        "priority": rule.priority,
        "is_active": rule.is_active,
        "created_at": rule.created_at.isoformat() if rule.created_at else None,
    }


@router.get("")
def list_rules(session: Session = Depends(get_session)):
    rules = session.exec(
        select(CategoryRule)
        .where(CategoryRule.is_active == True)
        .order_by(CategoryRule.priority, CategoryRule.id)
    ).all()
    return [_rule_out(r) for r in rules]


@router.post("", status_code=201)
def create_rule(body: CategoryRuleCreate, session: Session = Depends(get_session)):
    rule = CategoryRule(**body.model_dump())
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return _rule_out(rule)


@router.put("/{rule_id}")
def update_rule(rule_id: int, body: CategoryRuleUpdate, session: Session = Depends(get_session)):
    rule = session.get(CategoryRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return _rule_out(rule)


@router.delete("/{rule_id}", status_code=204)
def delete_rule(rule_id: int, session: Session = Depends(get_session)):
    rule = session.get(CategoryRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    rule.is_active = False
    session.add(rule)
    session.commit()
