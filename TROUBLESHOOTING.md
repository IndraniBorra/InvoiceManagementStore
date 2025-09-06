# TROUBLESHOOTING

This document tracks issues encountered during development and their solutions. Updated as new issues arise.

## Table of Contents
- [Faker Import Naming Conflict](#faker-import-naming-conflict)
- [Date Range Logic Errors in Invoice Generation](#date-range-logic-errors-in-invoice-generation)  
- [Product Description Uniqueness Constraint Violations](#product-description-uniqueness-constraint-violations)
- [Chronological Date Sequencing Issues](#chronological-date-sequencing-issues)
- [Module Import Path Issues](#module-import-path-issues)

---

## Faker Import Naming Conflict

**Date**: 2025-09-05  
**Category**: Import/Module Issues  
**Severity**: High

### Problem
```
ImportError: cannot import name 'Faker' from 'faker' 
(consider renaming '/Users/.../backend/scripts/faker.py' if it has the same name as a library you intended to import)
```

### Core Issue
Script file named `faker.py` creates naming conflict with the Faker library we're trying to import. Python imports the local file instead of the library.

### Solution
Rename the script file to something descriptive that doesn't conflict with library names.

### Key Changes
```python
# WRONG:
faker.py  # Conflicts with 'from faker import Faker'

# CORRECT:  
seed_data.py  # Descriptive, no conflicts
```

### Implementation
1. Rename file: `mv faker.py seed_data.py`
2. Update any references to the old filename
3. Test import works correctly

### Prevention
- Avoid naming files after libraries you import
- Use descriptive, specific names for scripts
- Check for naming conflicts before creating files

---

## Date Range Logic Errors in Invoice Generation

**Date**: 2025-09-05  
**Category**: Data Generation/Business Logic  
**Severity**: High

### Problem
```
ValueError: empty range for _rand_seconds: start datetime must be before than end datetime
```
Faker's `date_between()` function fails when start_date >= end_date.

### Core Issue
We're calculating due dates from issue date, then adding processing delays that push timestamps past the due date, creating impossible date ranges.

**Broken Logic Flow:**
1. Issue Date: Random date in past year
2. Due Date: Issue date + payment terms  
3. Processing Time: Issue + 0-5 days (can exceed due date!)
4. Payment Date: Between processing and due date ❌ **INVALID RANGE**

### Solution
Calculate due dates from the SENT date (when customer actually receives invoice), not issue date. This mirrors real business processes where payment terms start when customer receives the invoice.

**Fixed Logic Flow:**
1. Issue Date: Random date in past year
2. Processing Time: 0-5 days for internal processing (draft → submitted → sent)
3. Sent Date: Issue date + processing time
4. Due Date: Sent date + payment terms ✅ **ALWAYS VALID**
5. Status Assignment: Based on realistic business timelines

### Key Changes

```python
# WRONG (original):
def determine_invoice_status_and_dates(issue_date: date, due_date: date):
    due_date = generate_due_date(issue_date, terms)  # Based on issue date
    # Later: submitted_date = issue_date + 0-2 days
    # Later: sent_date = submitted_date + 0-3 days  
    # Problem: sent_date can be > due_date!

# CORRECT (fixed):
def generate_invoice_with_timestamps(issue_date: date, terms: str):
    # Step 1: Calculate processing timeline first
    processing_days = random.randint(0, 5)
    submitted_days = random.randint(0, 2)
    sent_days = submitted_days + random.randint(1, 3)
    
    date_submitted = issue_date + timedelta(days=submitted_days)
    date_sent = issue_date + timedelta(days=min(sent_days, processing_days))
    
    # Step 2: Calculate due date from SENT date
    due_date = generate_due_date(date_sent, terms)  # Based on sent date
```

### Realistic Status Distribution
```python
# Business-realistic percentages:
Draft: 10%     # Very recent invoices  
Submitted: 15% # Recent invoices, being processed
Sent: 25%      # Sent but not due yet, or recently due  
Paid: 45%      # Normal business - most invoices get paid
Overdue: 4%    # Small percentage past due
Cancelled: 1%  # Very rare
```

### Implementation Steps
1. **Rewrite due date calculation**: Base on sent_date instead of issue_date
2. **Fix timestamp generation**: Ensure chronological order always
3. **Add date validation**: Check ranges before calling faker.date_between()
4. **Update business logic**: Use realistic status progressions
5. **Test with small dataset**: Verify logic before scaling

### Prevention
- Always validate date ranges before using faker.date_between()
- Model real business processes in code logic
- Generate timestamps in chronological order
- Test edge cases with short payment terms (e.g., "Due on Receipt")

---

## Product Description Uniqueness Constraint Violations

**Date**: 2025-09-05  
**Category**: Database/Data Generation  
**Severity**: Medium

### Problem
```
sqlite3.IntegrityError: UNIQUE constraint failed: product.product_description
```

### Core Issue
Random product generation creating duplicate descriptions due to limited combinations and deterministic random seeding.

### Solution
Add unique identifiers to generated product names and implement better duplicate prevention logic.

### Key Changes

```python
# WRONG (original):
description = f"{random.choice(adjectives)} {category} {random.choice(nouns)}"
# Limited combinations, high chance of duplicates

# CORRECT (fixed):  
unique_id = random.randint(1000, 9999)
description = f"{random.choice(adjectives)} {category} {random.choice(nouns)} #{unique_id}"
# Unique identifier ensures no duplicates
```

### Enhanced Duplicate Prevention
```python
# Added tracking and validation:
used_descriptions = set()

if description.lower() not in used_descriptions:
    price = round(random.uniform(49.99, 2999.99), 2)
    products.append({
        "description": description,
        "price": price,
        "category": category
    })
    used_descriptions.add(description.lower())
```

### Implementation  
1. **Add unique identifiers**: Append random numbers to generated names
2. **Track used descriptions**: Maintain set of existing descriptions  
3. **Expand word lists**: More adjectives/nouns = more combinations
4. **Add attempt limits**: Prevent infinite loops in generation

### Prevention
- Always check for uniqueness constraints in database models
- Use tracking sets when generating unique data
- Add sufficient variety in generation algorithms
- Test with production data volumes, not just small samples

---

## Chronological Date Sequencing Issues

**Date**: 2025-09-05  
**Category**: Data Generation/Business Logic  
**Severity**: Medium

### Problem
Generated timestamps don't follow logical business sequence, causing invalid date ranges and unrealistic data.

### Core Issue
Timestamps generated independently without considering business workflow order:
Issue → Submit → Send → Pay/Cancel should be chronological.

### Solution
Generate timestamps in proper business sequence with validation at each step.

### Key Changes

```python
# WRONG (original):
# Generated dates independently, could be out of order
submit_date = issue_date + random.randint(0, 2)  
sent_date = submit_date + random.randint(0, 3)
# No validation of chronological order

# CORRECT (fixed):
# Generate in sequence with validation
submitted_days = random.randint(0, 2)
sent_days = submitted_days + random.randint(1, 3)  # Always after submitted

date_submitted = issue_date + timedelta(days=submitted_days)
date_sent = issue_date + timedelta(days=min(sent_days, processing_days))

# Validate before using in faker.date_between()
if earliest_pay <= latest_pay:
    pay_date = fake.date_between(earliest_pay, latest_pay)
```

### Business Logic Validation
```python
# Added proper status-based timestamp logic:
if status == "paid":
    # Payment date: mostly before due date, some after
    if random.random() < 0.8:  # 80% pay on time
        earliest_pay = date_sent
        latest_pay = due_date  
    else:  # 20% pay late
        earliest_pay = due_date
        latest_pay = due_date + timedelta(days=30)
    
    # Ensure we don't go beyond today
    latest_pay = min(latest_pay, today)
```

### Implementation
1. **Define business workflow**: Map out logical sequence of events
2. **Generate sequentially**: Each timestamp builds on previous ones  
3. **Add validation**: Check ranges before using faker functions
4. **Handle edge cases**: What if dates would be invalid?
5. **Test realistic scenarios**: Various payment terms and date ranges

### Prevention
- Model real business processes in timestamp generation
- Always validate date ranges before faker operations
- Use additive logic (next_date = previous_date + increment)
- Consider business rules (can't pay before receiving invoice)

---

## Module Import Path Issues

**Date**: 2025-09-05  
**Category**: Import/Module Issues  
**Severity**: Low

### Problem
```
ModuleNotFoundError: No module named 'database'  
ModuleNotFoundError: No module named 'models'
```

### Core Issue
Script running from subdirectory (`/scripts/`) can't find modules in parent directory (`/backend/`).

### Solution
Add parent directory to Python path so script can find modules.

### Key Changes

```python
# ADDED to top of script:
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Now imports work:
from database import engine, create_db_and_tables  
from models import Customer, Product, Invoice, LineItem
```

### Alternative Solutions
```python  
# Option 1: Relative imports (if package structure)
from ..database import engine
from ..models import Customer

# Option 2: Run from parent directory  
cd /backend
python scripts/seed_data.py

# Option 3: PYTHONPATH environment variable
export PYTHONPATH="${PYTHONPATH}:/path/to/backend"
```

### Implementation
1. **Add path manipulation**: Use `sys.path.append()` with relative path calculation
2. **Test imports**: Verify all modules can be found
3. **Document requirements**: Note in README how to run scripts

### Prevention
- Consider project structure when placing scripts
- Use consistent import patterns across the project  
- Document script execution requirements
- Consider using proper Python package structure with `__init__.py`

---

## How to Use This Document

### When You Encounter an Issue
1. **Search this document** for similar problems
2. **Check the solution** and key changes  
3. **Apply the fix** following implementation steps
4. **Add new issues** if not already documented

### When Adding New Issues
1. **Follow the format**: Problem → Core Issue → Solution → Key Changes
2. **Include code examples**: Show before/after code
3. **Add prevention tips**: Help avoid the issue in future
4. **Update table of contents**: Keep navigation current

### Maintenance
This document should be updated whenever new issues are encountered and resolved. It serves as institutional knowledge for the project.