CREATE TABLE Invoice (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    address TEXT NOT NULL,
    phone TEXT NOT NULL,
    date_issued DATE NOT NULL,
    total REAL DEFAULT 0.0
);



CREATE TABLE InvoiceItem (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    qty INTEGER NOT NULL,
    price REAL NOT NULL,
    amount REAL NOT NULL,
    invoice_id INTEGER,
    FOREIGN KEY (invoice_id) REFERENCES Invoice(id) ON DELETE CASCADE
);