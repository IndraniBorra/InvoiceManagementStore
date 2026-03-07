# Training data for 12-action invoice management classifier
# Just add examples as you think of them - no need for exact counts

training_data = [
    # view_invoice examples
    ("view invoice 123", "view_invoice"),
    ("show invoice 456", "view_invoice"),
    ("display invoice 789", "view_invoice"),
    ("open invoice 100", "view_invoice"),
    ("see invoice 200", "view_invoice"),
    ("look at invoice 300", "view_invoice"),
    ("check invoice 400", "view_invoice"),
    ("invoice 500", "view_invoice"),
    ("view invoice number 600", "view_invoice"),
    ("show me invoice 700", "view_invoice"),

    # list_invoices examples
    ("list invoices", "list_invoices"),
    ("show all invoices", "list_invoices"),
    ("display invoices", "list_invoices"),
    ("view invoices", "list_invoices"),
    ("get all invoices", "list_invoices"),
    ("show invoice list", "list_invoices"),
    ("all invoices", "list_invoices"),
    ("invoice list", "list_invoices"),

    # create_invoice examples
    ("create invoice", "create_invoice"),
    ("new invoice", "create_invoice"),
    ("add invoice", "create_invoice"),
    ("create new invoice", "create_invoice"),
    ("make invoice", "create_invoice"),
    ("generate invoice", "create_invoice"),

    # edit_invoice examples
    ("edit invoice 123", "edit_invoice"),
    ("modify invoice 456", "edit_invoice"),
    ("update invoice 789", "edit_invoice"),
    ("change invoice 100", "edit_invoice"),
    ("edit invoice number 200", "edit_invoice"),

    # list_customers examples
    ("list customers", "list_customers"),
    ("show customers", "list_customers"),
    ("display customers", "list_customers"),
    ("view customers", "list_customers"),
    ("get customers", "list_customers"),
    ("customer list", "list_customers"),

    # list_products examples
    ("list products", "list_products"),
    ("show products", "list_products"),
    ("display products", "list_products"),
    ("view products", "list_products"),
    ("product list", "list_products"),

    # show_reports examples
    ("show reports", "show_reports"),
    ("display reports", "show_reports"),
    ("view reports", "show_reports"),
    ("reports", "show_reports"),

    # overdue_invoices examples
    ("overdue invoices", "overdue_invoices"),
    ("show overdue invoices", "overdue_invoices"),
    ("late invoices", "overdue_invoices"),
    ("overdue", "overdue_invoices"),

    # help examples
    ("help", "help"),
    ("help me", "help"),
    ("assistance", "help"),
    ("support", "help"),
    ("what can you do", "help"),

    # create_product_with_data examples
    ("create product Laptop price 1000 dollars", "create_product_with_data"),
    ("add product Mouse description wireless price 25", "create_product_with_data"),
    ("make product Keyboard priced at 50 USD", "create_product_with_data"),
    ("create new product Monitor cost 300", "create_product_with_data"),
    ("add new product Speaker with price 100 dollars", "create_product_with_data"),
    ("generate product Webcam with price 75", "create_product_with_data"),
    ("create product WaterBottle price 5 dollars", "create_product_with_data"),
    ("add product CoffeeMug description ceramic price 15", "create_product_with_data"),
    ("make product Headphones priced at 200 USD", "create_product_with_data"),
    ("create product Phone cost 800", "create_product_with_data"),
    ("add product Tablet price 500 dollars", "create_product_with_data"),
    ("make product Cable description USB price 10", "create_product_with_data"),

    # create_customer_with_data examples
    ("add customer John Smith email john@example.com phone 555-1234", "create_customer_with_data"),
    ("create customer Sarah Johnson address 123 Main St phone 555-5678", "create_customer_with_data"),
    ("register customer Mike Wilson email mike@company.com", "create_customer_with_data"),
    ("add new customer Lisa Brown phone 555-9012", "create_customer_with_data"),
    ("create new customer David Lee address 456 Oak Ave", "create_customer_with_data"),
    ("make customer Jennifer Davis phone 555-3456", "create_customer_with_data"),
    ("add customer Robert Taylor email robert@office.com", "create_customer_with_data"),
    ("create customer Amanda White address 789 Pine St", "create_customer_with_data"),
    ("register customer Chris Anderson email chris@test.com", "create_customer_with_data"),
    ("add customer Michelle Garcia phone 555-7890", "create_customer_with_data"),

    # create_invoice_with_data examples
    ("create invoice for customer John with product Laptop quantity 2 at 1000 each", "create_invoice_with_data"),
    ("make invoice for Sarah 5 CoffeeMugs at 15 dollars each", "create_invoice_with_data"),
    ("new invoice customer Mike product WaterBottle qty 10 price 5", "create_invoice_with_data"),
    ("generate invoice for Lisa with 3 Keyboards at 50 per unit", "create_invoice_with_data"),
    ("add invoice customer David 1 Monitor at 300 dollars", "create_invoice_with_data"),
    ("create invoice for Jennifer with 2 Speakers at 100 each", "create_invoice_with_data"),
    ("make invoice customer Robert 4 Mice at 25 per piece", "create_invoice_with_data"),
    ("new invoice for Amanda with 1 Tablet at 500 dollars", "create_invoice_with_data"),
    ("generate invoice customer Chris 6 Cables at 10 each", "create_invoice_with_data"),
    ("add invoice for Michelle with 2 Phones at 800 per unit", "create_invoice_with_data"),

    # Add more examples easily
    ("show invoice #999", "view_invoice"),
    ("display all customers", "list_customers"),
    ("get all products", "list_products"),
    ("create product Printer price 200", "create_product_with_data"),
    ("add customer Tom Wilson email tom@work.com", "create_customer_with_data"),
    ("make invoice for Tom 1 Printer at 200", "create_invoice_with_data"),
]




def get_training_data():
    """Return training examples and labels"""
    texts = [example[0] for example in training_data]
    labels = [example[1] for example in training_data]
    return texts, labels

def get_label_mappings():
    """Return label mappings"""
    _, labels = get_training_data()
    unique_labels = sorted(list(set(labels)))
    label2id = {label: idx for idx, label in enumerate(unique_labels)}
    id2label = {idx: label for label, idx in label2id.items()}
    return label2id, id2label

if __name__ == "__main__":
    texts, labels = get_training_data()
    print(f"Total training examples: {len(texts)}")
    print(f"Total labels: {len(labels)}")
    print(f"Unique actions: {len(set(labels))}")

    # Show label distribution
    from collections import Counter
    label_counts = Counter(labels)
    print("\nLabel distribution:")
    for label, count in sorted(label_counts.items()):
        print(f"  {label}: {count} examples")