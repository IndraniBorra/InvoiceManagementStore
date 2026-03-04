from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from anthropic import Anthropic
from typing import List
import os

router = APIRouter()
client = Anthropic()  # reads ANTHROPIC_API_KEY from environment automatically


class ConversationMessage(BaseModel):
    role: str    # 'user' or 'assistant'
    content: str

class AssistantQuery(BaseModel):
    query: str
    conversation_history: List[ConversationMessage] = []


INVOICE_APP_TOOL = {
    "name": "navigate_app",
    "description": "Navigate the invoice management app or create entities with pre-filled data",
    "input_schema": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": [
                    "view_invoice",
                    "list_invoices",
                    "create_invoice",
                    "edit_invoice",
                    "list_customers",
                    "list_products",
                    "show_reports",
                    "overdue_invoices",
                    "help",
                    "create_customer_with_data",
                    "create_product_with_data",
                    "create_invoice_with_data"
                ],
                "description": "The action to perform in the app"
            },
            "invoice_id": {
                "type": "integer",
                "description": "Invoice ID — required for view_invoice and edit_invoice actions"
            },
            "extracted_data": {
                "type": "object",
                "description": "Entity data extracted from the user's message for creation actions",
                "properties": {
                    "customer_name":    {"type": "string"},
                    "customer_email":   {"type": "string"},
                    "customer_phone":   {"type": "string"},
                    "customer_address": {"type": "string"},
                    "product_description": {"type": "string"},
                    "product_price":    {"type": "number"},
                    "lineitem_qty":     {"type": "integer"}
                }
            }
        },
        "required": ["action"]
    }
}

SYSTEM_PROMPT = """You are an assistant for an invoice management app.
Always use the navigate_app tool to respond — never reply with plain text.

Action selection rules (check in this exact order):
1. User says "create/add/new customer" WITHOUT mentioning invoice → create_customer_with_data
2. User says "create/add/new product" WITHOUT mentioning invoice → create_product_with_data
3. User says "create/make/new invoice" OR mentions both a customer AND a product/item in the same request → create_invoice_with_data
4. User says "show/list/view customers" → list_customers
5. User says "show/list/view products" → list_products
6. User says "show/list/view invoices" → list_invoices
7. User says "show/view invoice #N" → view_invoice with invoice_id=N
8. User says "show reports" → show_reports
9. User says "overdue invoices" → overdue_invoices

Examples:
- "create a customer" → create_customer_with_data
- "add a new customer named John" → create_customer_with_data
- "create a product" → create_product_with_data
- "create invoice for John with laptop qty 2" → create_invoice_with_data
- "make an invoice" → create_invoice_with_data
- "show customers" → list_customers
- "show products" → list_products

When action is create_invoice_with_data, extract into extracted_data:
- customer_name, product_description, lineitem_qty (integer), product_price (if mentioned)

When action is create_customer_with_data, extract into extracted_data:
- customer_name, customer_email, customer_phone, customer_address (whatever is mentioned)

When action is create_product_with_data, extract into extracted_data:
- product_description, product_price (if mentioned)"""


@router.post("/assistant/query")
async def process_query(body: AssistantQuery):
    try:
        # Build message history for multi-turn context (last 3 exchanges = 6 messages)
        messages = [{"role": m.role, "content": m.content} for m in body.conversation_history[-6:]]
        messages.append({"role": "user", "content": body.query})

        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            system=SYSTEM_PROMPT,
            tools=[INVOICE_APP_TOOL],
            tool_choice={"type": "auto"},
            messages=messages
        )

        for block in response.content:
            if block.type == "tool_use":
                return block.input

        return {"action": "help"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
