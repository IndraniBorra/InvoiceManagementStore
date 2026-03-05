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
                    "update_customer_with_data",
                    "create_product_with_data",
                    "update_product_with_data",
                    "create_invoice_with_data",
                    "add_line_item_to_invoice",
                    "invoice_edit_guidance",
                    "delete_invoice"
                ],
                "description": "The action to perform in the app"
            },
            "invoice_id": {
                "type": "integer",
                "description": "Invoice ID — required for view_invoice, edit_invoice, add_line_item_to_invoice, and invoice_edit_guidance actions"
            },
            "extracted_data": {
                "type": "object",
                "description": "Entity data extracted from the user's message for creation actions",
                "properties": {
                    "customer_name":     {"type": "string"},
                    "new_customer_name": {"type": "string"},
                    "customer_email":    {"type": "string"},
                    "customer_phone":    {"type": "string"},
                    "customer_address":  {"type": "string"},
                    "product_description":     {"type": "string"},
                    "new_product_description": {"type": "string"},
                    "product_price":           {"type": "number"},
                    "lineitem_qty":            {"type": "integer"},
                    "line_items": {
                        "type": "array",
                        "description": "Multiple line items for create_invoice_with_data when user mentions more than one product",
                        "items": {
                            "type": "object",
                            "properties": {
                                "product_description": {"type": "string"},
                                "lineitem_qty":        {"type": "integer"},
                                "product_price":       {"type": "number"}
                            }
                        }
                    }
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
2. User says "update/edit/change/rename customer [name]..." → update_customer_with_data
3. User says "create/add/new product" WITHOUT mentioning invoice → create_product_with_data
4. User says "update/edit/change/rename product [name]..." → update_product_with_data
5. User says "add/include/append [product] to invoice #N" (existing invoice ID mentioned) → add_line_item_to_invoice, invoice_id=N
5b. User says "delete/remove/trash invoice #N" → delete_invoice, invoice_id=N
6. User says "change/update customer [details] IN invoice #N" OR "change/update product [details] IN invoice #N" → invoice_edit_guidance, invoice_id=N
7. User says "create/make/new invoice" OR mentions customer+product WITHOUT an existing invoice # → create_invoice_with_data
8. User says "update/edit invoice #N" (generic edit, no specific data change mentioned) → edit_invoice with invoice_id=N
9. User says "show/list/view customers" → list_customers
10. User says "show/list/view products" → list_products
11. User says "show/list/view invoices" → list_invoices
12. User says "show/view invoice #N" → view_invoice with invoice_id=N
13. User says "show reports" → show_reports
14. User says "overdue invoices" → overdue_invoices

Examples:
- "create a customer" → create_customer_with_data
- "add a new customer named John" → create_customer_with_data
- "update customer John's phone to 9876543210" → update_customer_with_data
- "change John's address to 123 Main St" → update_customer_with_data
- "create a product" → create_product_with_data
- "update bedsheets price to $38" → update_product_with_data
- "change laptop description to Gaming Laptop" → update_product_with_data
- "edit product bedsheets to Bedsheet (King size) at $48" → update_product_with_data
- "add Air pods qty 2 to invoice #889" → add_line_item_to_invoice, invoice_id=889
- "include 3 laptops in invoice 45" → add_line_item_to_invoice, invoice_id=45
- "delete invoice #888" → delete_invoice, invoice_id=888
- "remove invoice 45" → delete_invoice, invoice_id=45
- "change the customer on invoice #5 to Jane" → invoice_edit_guidance, invoice_id=5
- "update the product price in invoice #10" → invoice_edit_guidance, invoice_id=10
- "create invoice for John with laptop qty 2" → create_invoice_with_data
- "make an invoice" → create_invoice_with_data
- "update invoice #5" → edit_invoice with invoice_id=5
- "edit invoice 12" → edit_invoice with invoice_id=12
- "show customers" → list_customers
- "show products" → list_products

When action is create_invoice_with_data, extract into extracted_data:
- customer_name (always)
- If ONE product mentioned: product_description, lineitem_qty (integer), product_price (if mentioned)
- If MULTIPLE products mentioned: line_items array, each with product_description, lineitem_qty (integer, default 1), product_price (if mentioned)
- Example: "create invoice for John with Data Analytics qty 2 and Website Development" → line_items: [{product_description: "Data Analytics", lineitem_qty: 2}, {product_description: "Website Development", lineitem_qty: 1}]

When action is add_line_item_to_invoice, extract:
- invoice_id (top-level, NOT inside extracted_data)
- extracted_data.product_description, extracted_data.lineitem_qty (integer), extracted_data.product_price (if mentioned)

When action is create_customer_with_data, extract into extracted_data:
- customer_name, customer_email, customer_phone, customer_address (whatever is mentioned)

When action is update_customer_with_data, extract into extracted_data:
- customer_name: the CURRENT customer name (used to find them)
- new_customer_name: new name (only if the user wants to rename)
- customer_address: new address (only if changing)
- customer_phone: new phone (only if changing)
- customer_email: new email (only if changing)

When action is create_product_with_data, extract into extracted_data:
- product_description, product_price (if mentioned)

When action is update_product_with_data, extract into extracted_data:
- product_description: the CURRENT product name (used to find it)
- new_product_description: new name/description (only if the user wants to rename it)
- product_price: new price (only if the user wants to change the price)"""


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
