import React, { useState, useEffect } from 'react';
import api from '../api'; // Make sure this points to your axios setup
import AllInvoices from './GetInvoices/AllInvoicesPage'; // Import the AllInvoices component
import '../App.css';

const InvoicePage = () => {
  const [invoices, setInvoices] = useState([]); // this state will help use to store all the invoices fetched from the backend
  const [editingInvoiceId, setEditingInvoiceId] = useState(null); // this state will help us to store the invoice_id that is being edited
  const [formData, setFormData] = useState({    // this state will help us to store the form data for creating a new invoice
    customer_name: '',
    address: '',
    phone: '',
    date_issued: '',
    terms: 'Due end of the month', // Default term
    due_date: '' ,// This will be calculated based on terms
    items: [{ description: '', qty: 1, price: 0 }],

  });

  // Function to calculate due date based on terms
  const calculateDueDate = (issued,terms) => {
    if (!issued) return 'Due date not set'; // If no issued date, return a message
    const date = new Date(issued);
    switch (terms) {
      case 'Due on Receipt':
        return issued; // Due immediately
      case 'Net 15':
        date.setDate(date.getDate() + 15);
        break;
      case 'Net 30':
        date.setDate(date.getDate() + 30);
        break;
      case 'Net 45':
        date.setDate(date.getDate() + 45);
        break;
      case 'Net 60':
        date.setDate(date.getDate() + 60);
        break;
      case 'Due end of the month':
        date.setMonth(date.getMonth() + 1);
        date.setDate(0); // Last day of the month
        break;
      case 'Due end of next month':
        date.setMonth(date.getMonth() + 2);
        date.setDate(0); // Last day of the month
        break;
      default:
        return issued; // Fallback to issued date
    }
    return date.toISOString().split('T')[0]; // Return in YYYY-MM-DD format

  }

  // Fetch all invoices
  const fetchInvoices = async () => {
    try {
      const response = await api.get('/invoices');
      setInvoices(response.data);
    } catch (error) {
      console.error('Failed to fetch invoices', error);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  // Handle form item changes
  const handleItemChange = (index, field, value) => {
    const updatedItems = [...formData.items];
    updatedItems[index][field] = value;
    setFormData({ ...formData, items: updatedItems });
  };

  // Add new item to invoice
  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { description: '', qty: 1, price: 0 }]
    });
  };
  // Remove item from invoice
  const removeItem = (index) => {
    const updatedItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: updatedItems });
  };

  // Submit invoice
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingInvoiceId !== null) {
      console.log("Submitting formData:", formData);
      const response = await api.put(`/invoice/${editingInvoiceId}`, formData);
      alert(`Invoice ID: ${response.data.id} updated successfully!`);}
      
      else {
        const response = await api.post('/invoice', formData);
        alert(`Invoice ID: ${response.data.id} created successfully!`);}
      setFormData({
        customer_name: '',
        address: '',
        phone: '',
        date_issued: '',
        terms: '',        
        due_date: '',
        items: [{ description: '', qty: 1, price: 0 }]
      });
      setEditingInvoiceId(null);
      fetchInvoices(); // Refresh the table
    } catch (error) {
      console.error('Failed to submit invoice', error);
      alert('Error submitting invoice');
    }
  };

  

  // loads the invoice data into the form for editing
    const loadInvoiceForEdit = (invoice) => {
    const editData = {
        customer_name: invoice.customer_name,
        address: invoice.address,
        phone: invoice.phone,
        date_issued: invoice.date_issued,
        terms: invoice.terms || 'Due end of the month',
        due_date: invoice.due_date || '',
        items: invoice.items.map(item => ({
        description: item.description,
        qty: item.qty || 1,
        price: item.amount / (item.qty || 1)
        }))
    };

  setFormData(editData);
  setEditingInvoiceId(invoice.id);
};

  return (
    <div className="container">
      <h2>Invoice Management Store (IMS)</h2>
      <h3>{editingInvoiceId ? `Editing Invoice #${editingInvoiceId}` : 'Create New Invoice'}</h3>

        <form onSubmit={handleSubmit}>

            <label>Customer Name</label>
            <input type="text" placeholder="Customer Name" value={formData.customer_name}
                onChange={e => setFormData({ ...formData, customer_name: e.target.value })} />

            <label>Address</label>
            <input type="text" placeholder="Address" value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })} />

            <label>Phone Number</label>
            <input type="text" placeholder="Phone" value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })} />

            <label>Date Issued</label>
            <input type="date" value={formData.date_issued}
                onChange={e => setFormData({ ...formData, date_issued: e.target.value })} />

            <label>Terms</label>
              <select
                value={formData.terms}
                onChange={(e) => {
                  const newTerms = e.target.value;
                  console.log(e.target.value);
                  const due = calculateDueDate(formData.date_issued, newTerms);
                  setFormData({ ...formData, terms: newTerms, due_date: due });
                }}
              >
                <option> </option>
                <option>Due end of the month</option>
                <option>Net 15</option>
                <option>Net 30</option>
                <option>Net 45</option>
                <option>Net 60</option>
                <option>Due on receipt</option>
                <option>Due end of next month</option>
                <option>Custom</option>
              </select>


            <label>Due Date</label>
            <input type="date" value={formData.due_date} disabled />


            <h4>Item Table</h4>
            <table className="item-table">
            <thead>
            <tr>
                <th>ITEM DETAILS</th>
                <th>QUANTITY</th>
                <th>PRICE</th>
                <th>AMOUNT</th>
            </tr>
            </thead>
            <tbody>
            {formData.items.map((item, index) => (
                <tr key={index}>
                <td>
                    <input
                    type="text"
                    placeholder="Description"
                    value={item.description}
                    onChange={e => handleItemChange(index, 'description', e.target.value)}
                    />
                </td>
                <td>
                    <input
                    type="number"
                    placeholder="Qty"
                    value={item.qty}
                    onChange={e => handleItemChange(index, 'qty', parseFloat(e.target.value))}
                    />
                </td>
                <td>
                    <input
                    type="number"
                    placeholder="Price"
                    value={item.price}
                    onChange={e => handleItemChange(index, 'price', parseFloat(e.target.value))}
                    />
                </td>

                <td>
                    <strong>
                    {(item.qty * item.price || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                    })}
                    </strong>
                </td>

                <td>
                    <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="delete-btn"
                    >
                        ❌
                    </button>
                </td>
                </tr>
            ))}
            </tbody>
            </table>

            <button type="button" onClick={(addItem)}>+ Add Item</button>
            {editingInvoiceId !== null && (
                <button
                    type="button"
                    onClick={() => {
                    setEditingInvoiceId(null);
                    setFormData({
                        customer_name: '',
                        address: '',
                        phone: '',
                        date_issued: '',
                        items: [{ description: '', qty: 1, price: 0 }]
                    });
                    }}
                    style={{ marginLeft: '10px', background: 'orange', color: 'white' }}
                >
                    Cancel Edit
                </button>
                )}

            <button type="submit">
                {editingInvoiceId ? 'Update Invoice' : 'Create Invoice'}
            </button>


        </form>


    </div>
  );
};

export default InvoicePage;
