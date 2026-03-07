"""
Custom Exceptions for Invoice Management System

Defines business-specific exceptions with appropriate error codes and messages.
"""

from typing import Optional, Dict, Any
from fastapi import HTTPException


class BusinessException(HTTPException):
    """
    Base class for business logic exceptions.
    """
    def __init__(
        self, 
        status_code: int, 
        detail: str, 
        error_code: str,
        extra_data: Optional[Dict[str, Any]] = None
    ):
        super().__init__(status_code=status_code, detail=detail)
        self.error_code = error_code
        self.extra_data = extra_data or {}


class InvoiceException(BusinessException):
    """Base class for invoice-related exceptions."""
    pass


class InvoiceNotFoundError(InvoiceException):
    """Raised when an invoice is not found."""
    def __init__(self, invoice_id: int):
        super().__init__(
            status_code=404,
            detail=f"Invoice with ID {invoice_id} was not found",
            error_code="INVOICE_NOT_FOUND",
            extra_data={"invoice_id": invoice_id}
        )


class InvoiceAlreadySubmittedError(InvoiceException):
    """Raised when trying to modify a submitted invoice."""
    def __init__(self, invoice_id: int, current_status: str):
        super().__init__(
            status_code=409,
            detail=f"Cannot modify invoice {invoice_id} with status '{current_status}'",
            error_code="INVOICE_ALREADY_SUBMITTED",
            extra_data={"invoice_id": invoice_id, "current_status": current_status}
        )


class InvalidInvoiceStatusError(InvoiceException):
    """Raised when an invalid invoice status is provided."""
    def __init__(self, status: str, valid_statuses: list):
        super().__init__(
            status_code=400,
            detail=f"Invalid invoice status '{status}'. Valid statuses: {', '.join(valid_statuses)}",
            error_code="INVALID_INVOICE_STATUS",
            extra_data={"provided_status": status, "valid_statuses": valid_statuses}
        )


class InvoiceTotalMismatchError(InvoiceException):
    """Raised when invoice total doesn't match line items total."""
    def __init__(self, declared_total: float, calculated_total: float):
        super().__init__(
            status_code=400,
            detail=f"Invoice total {declared_total} doesn't match calculated total {calculated_total}",
            error_code="INVOICE_TOTAL_MISMATCH",
            extra_data={"declared_total": declared_total, "calculated_total": calculated_total}
        )


class CustomerException(BusinessException):
    """Base class for customer-related exceptions."""
    pass


class CustomerNotFoundError(CustomerException):
    """Raised when a customer is not found."""
    def __init__(self, customer_id: int):
        super().__init__(
            status_code=404,
            detail=f"Customer with ID {customer_id} was not found",
            error_code="CUSTOMER_NOT_FOUND",
            extra_data={"customer_id": customer_id}
        )


class DuplicateCustomerError(CustomerException):
    """Raised when attempting to create a duplicate customer."""
    def __init__(self, identifier: str, identifier_type: str = "email"):
        super().__init__(
            status_code=409,
            detail=f"Customer with {identifier_type} '{identifier}' already exists",
            error_code="DUPLICATE_CUSTOMER",
            extra_data={"identifier": identifier, "identifier_type": identifier_type}
        )


class CustomerHasInvoicesError(CustomerException):
    """Raised when trying to delete a customer with existing invoices."""
    def __init__(self, customer_id: int, invoice_count: int):
        super().__init__(
            status_code=409,
            detail=f"Cannot delete customer {customer_id} with {invoice_count} existing invoices",
            error_code="CUSTOMER_HAS_INVOICES",
            extra_data={"customer_id": customer_id, "invoice_count": invoice_count}
        )


class ProductException(BusinessException):
    """Base class for product-related exceptions."""
    pass


class ProductNotFoundError(ProductException):
    """Raised when a product is not found."""
    def __init__(self, product_id: int):
        super().__init__(
            status_code=404,
            detail=f"Product with ID {product_id} was not found",
            error_code="PRODUCT_NOT_FOUND",
            extra_data={"product_id": product_id}
        )


class DuplicateProductError(ProductException):
    """Raised when attempting to create a duplicate product."""
    def __init__(self, description: str):
        super().__init__(
            status_code=409,
            detail=f"Product with description '{description}' already exists",
            error_code="DUPLICATE_PRODUCT",
            extra_data={"description": description}
        )


class ProductInUseError(ProductException):
    """Raised when trying to delete a product that's in use."""
    def __init__(self, product_id: int, usage_count: int):
        super().__init__(
            status_code=409,
            detail=f"Cannot delete product {product_id} as it's used in {usage_count} line items",
            error_code="PRODUCT_IN_USE",
            extra_data={"product_id": product_id, "usage_count": usage_count}
        )


class ValidationException(BusinessException):
    """Base class for validation exceptions."""
    pass


class InvalidDateRangeError(ValidationException):
    """Raised when date range is invalid."""
    def __init__(self, start_date: str, end_date: str):
        super().__init__(
            status_code=400,
            detail=f"Invalid date range: start date {start_date} must be before end date {end_date}",
            error_code="INVALID_DATE_RANGE",
            extra_data={"start_date": start_date, "end_date": end_date}
        )


class InvalidAmountError(ValidationException):
    """Raised when amount validation fails."""
    def __init__(self, amount: float, field_name: str, constraint: str):
        super().__init__(
            status_code=400,
            detail=f"Invalid {field_name}: {amount}. {constraint}",
            error_code="INVALID_AMOUNT",
            extra_data={"amount": amount, "field_name": field_name, "constraint": constraint}
        )


class AuthenticationException(BusinessException):
    """Base class for authentication exceptions."""
    pass


class InvalidCredentialsError(AuthenticationException):
    """Raised when authentication credentials are invalid."""
    def __init__(self):
        super().__init__(
            status_code=401,
            detail="Invalid username or password",
            error_code="INVALID_CREDENTIALS"
        )


class TokenExpiredError(AuthenticationException):
    """Raised when JWT token has expired."""
    def __init__(self):
        super().__init__(
            status_code=401,
            detail="Authentication token has expired",
            error_code="TOKEN_EXPIRED"
        )


class InsufficientPermissionsError(AuthenticationException):
    """Raised when user lacks required permissions."""
    def __init__(self, required_permission: str, user_role: str):
        super().__init__(
            status_code=403,
            detail=f"Access denied. Required permission: {required_permission}. User role: {user_role}",
            error_code="INSUFFICIENT_PERMISSIONS",
            extra_data={"required_permission": required_permission, "user_role": user_role}
        )


class RateLimitException(BusinessException):
    """Base class for rate limiting exceptions."""
    pass


class RateLimitExceededError(RateLimitException):
    """Raised when rate limit is exceeded."""
    def __init__(self, limit: int, window: int, retry_after: int):
        super().__init__(
            status_code=429,
            detail=f"Rate limit exceeded. Limit: {limit} requests per {window} seconds. Retry after {retry_after} seconds.",
            error_code="RATE_LIMIT_EXCEEDED",
            extra_data={"limit": limit, "window": window, "retry_after": retry_after}
        )


# Utility functions for creating common exceptions
def create_not_found_error(resource_type: str, resource_id: int) -> BusinessException:
    """Create a generic not found error for any resource type."""
    return BusinessException(
        status_code=404,
        detail=f"{resource_type.title()} with ID {resource_id} was not found",
        error_code=f"{resource_type.upper()}_NOT_FOUND",
        extra_data={f"{resource_type.lower()}_id": resource_id}
    )


def create_validation_error(field_name: str, value: Any, constraint: str) -> BusinessException:
    """Create a generic validation error."""
    return BusinessException(
        status_code=400,
        detail=f"Validation failed for field '{field_name}' with value '{value}'. {constraint}",
        error_code="FIELD_VALIDATION_ERROR",
        extra_data={"field_name": field_name, "value": value, "constraint": constraint}
    )


def create_duplicate_error(resource_type: str, identifier: str) -> BusinessException:
    """Create a generic duplicate resource error."""
    return BusinessException(
        status_code=409,
        detail=f"{resource_type.title()} with identifier '{identifier}' already exists",
        error_code=f"DUPLICATE_{resource_type.upper()}",
        extra_data={"resource_type": resource_type, "identifier": identifier}
    )