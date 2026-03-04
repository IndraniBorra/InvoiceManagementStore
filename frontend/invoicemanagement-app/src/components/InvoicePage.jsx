import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/api'; // Modern API client
import { useParams, useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import '../App.css';
import CustomerSearch from './ui/search/CustomerSearch';
import ProductSearch from './ui/search/ProductSearch';


const InvoicePage = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [errors, setErrors] = useState({});
  const [formData, setFormData] = useState({
    customer_id: null,  // this state will help us to store the form data for creating a new invoice
    customer_name: '',
    customer_address: '',
    customer_phone: '',
    date_issued: '',
    invoice_terms: 'Due end of the month', // Default term
    invoice_due_date: '' ,// This will be calculated based on terms
    invoice_status: 'draft', // Default status
    invoice_total: 0, // Total amount of the invoice
    line_items: [{ 
      product_id: null,
      product_description: '', 
      line_items_qty: 1, 
      product_price: 0, 
      line_items_total: 0 
    }], // Default line item
  });


  

  // Function to validate form data
  const validateForm = () => {
    const newErrors = {};
    if (!formData.customer_id) newErrors.customer_id = "Please select a customer from the search results.";
    if (!formData.customer_name) newErrors.customer_name = "Customer name is required.";
    if (!formData.customer_address) newErrors.customer_address = "Address is required.";
    if (!formData.customer_phone) {
      newErrors.customer_phone = "Phone number is required.";
    } else if (!/^\d{10}$/.test(formData.customer_phone)) {
      newErrors.customer_phone = "Phone number must be 10 digits.";
    }
    if (!formData.date_issued) newErrors.date_issued = "Issue date is required.";
    if (!formData.invoice_terms) newErrors.invoice_terms = "Terms are required.";

    formData.line_items.forEach((item, index) => {

      // if (!item.product_id) newErrors[`item_id_${index}`] = "Product ID is required.";
      if (item.line_items_qty <= 0) newErrors[`item_qty_${index}`] = "Quantity must be greater than 0.";
      if (!item.product_description) newErrors[`item_desc_${index}`] = "Description is required.";
      if (item.product_price <= 0) newErrors[`item_price_${index}`] = "Price must be greater than 0.";
    });

    setErrors(newErrors);
    console.log("Validation Errors:", newErrors);
    return Object.keys(newErrors).length === 0;
  };


  // Function to calculate due date based on terms - matches backend logic exactly
  const calculateDueDate = (issued, terms) => {
    if (!issued) return 'Due date not set';
    
    const date = new Date(issued);
    const termsMap = {
      "Due on Receipt": 0,
      "Net 15": 15,
      "Net 30": 30,
      "Net 45": 45,
      "Net 60": 60,
      "Due end of the month": 0,
      "Due end of next month": 0
    };

    if (terms === "Due end of the month") {
      // Get first day of next month, then subtract one day (matches backend)
      const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
      nextMonth.setDate(nextMonth.getDate() + 32); // Move to following month
      const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 0);
      return lastDay.toISOString().split('T')[0];
    } else if (terms === "Due end of next month") {
      // Skip to next month, then add one more month (matches backend)
      const nextMonth = new Date(date.getFullYear(), date.getMonth() + 2, 1);
      nextMonth.setDate(nextMonth.getDate() + 32);
      const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 0);
      return lastDay.toISOString().split('T')[0];
    } else {
      // Standard day addition
      const daysToAdd = termsMap[terms] || 0;
      date.setDate(date.getDate() + daysToAdd);
      return date.toISOString().split('T')[0];
    }
  }

  useEffect(() => {
    const fetchInvoiceToEdit = async () => {
    try {
      const response = await apiClient.get(`/invoice/${id}`);
      const invoice = response.data;

      const editData = {
        customer_id: invoice.customer_id,
        customer_name: invoice.customer_name,
        customer_address: invoice.customer_address,
        customer_phone: invoice.customer_phone,
        date_issued: invoice.date_issued,
        invoice_terms: invoice.terms || 'Due end of the month',
        invoice_due_date: invoice.due_date || '',
        line_items: invoice.items.map(item => ({
          product_id: item.product_id || null,
          product_description: item.product_description || item.line_items_description || '',
          line_items_qty: item.line_items_qty || 1,
          product_price: item.product_price || item.line_items_price || 0,
          line_items_total: (item.line_items_qty || 1) * (item.product_price || item.line_items_price || 0),
        }))
    };

      setFormData(editData);
    } catch (error) {
      console.error("Error fetching invoice to edit:", error);
    }
  }; // Fetch invoice data if id is present in the URL
    if (id) {
      fetchInvoiceToEdit();
    }
  }, [id]);

  // Handle AI extracted invoice data - auto-fill form
  useEffect(() => {
    if (location.state?.extractedData && location.state?.action === 'create_invoice_with_data') {
      console.log('🎯 Invoice creation with extracted data:', location.state.extractedData);
      const extractedData = location.state.extractedData;

      // Auto-fill customer information if available
      let newFormData = { ...formData };

      if (extractedData.customer_info?.customer_name) {
        newFormData.customer_name = extractedData.customer_info.customer_name;
        console.log('✅ Auto-filled customer name:', extractedData.customer_info.customer_name);
      }

      // Auto-fill line items if available
      if (extractedData.line_items && extractedData.line_items.length > 0) {
        newFormData.line_items = extractedData.line_items.map(item => ({
          product_id: null,
          product_description: item.product_description || '',
          line_items_qty: item.line_items_qty || 1,
          product_price: item.product_price || 0,
          line_items_total: (item.line_items_qty || 1) * (item.product_price || 0)
        }));

        // Calculate total
        const total = newFormData.line_items.reduce(
          (sum, item) => sum + (item.line_items_qty * item.product_price), 0
        );
        newFormData.invoice_total = total;

        console.log('✅ Auto-filled line items:', newFormData.line_items);
      }

      // Set default date to today if not set
      if (!newFormData.date_issued) {
        const today = new Date().toISOString().split('T')[0];
        newFormData.date_issued = today;
        newFormData.invoice_due_date = calculateDueDate(today, newFormData.invoice_terms);
      }

      console.log('✅ Auto-filling invoice form with extracted data:', newFormData);
      setFormData(newFormData);
    }
  }, [location.state]);

  // Handle form item changes
  const handleItemChange = (index, field, value) => {
    const updatedItems = [...formData.line_items];
    updatedItems[index][field] = value;
    // Calculate new total
    const newTotal = updatedItems.reduce(
      (total, item) => total + (item.line_items_qty * item.product_price || 0),
      0
    );
    setFormData({ ...formData, line_items: updatedItems, invoice_total: newTotal });
  };

  // Add new item to invoice
  const addItem = () => {
    const newItems = [...formData.line_items, { product_id: null, product_description: '', line_items_qty: 1, product_price: 0, line_items_total: 0 }];
    const newTotal = newItems.reduce(
      (total, item) => total + (item.line_items_qty * item.product_price || 0),
      0
    );
    setFormData({
      ...formData,
      line_items: newItems,
      invoice_total: newTotal,
    });
  };
  // Remove item from invoice
  const removeItem = (index) => {

    if (formData.line_items.length === 1) {
        alert("At least one line item is required.");
        return;
      }
    const updatedItems = formData.line_items.filter((_, i) => i !== index);
    const newTotal = updatedItems.reduce(
      (total, item) => total + (item.line_items_qty * item.product_price || 0),
      0
    );
    setFormData({ ...formData, line_items: updatedItems, invoice_total: newTotal });
  };

  // Submit invoice
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      alert("Please fix the errors before submitting.");
      return;
    }

    // Check if customer is selected
    if (!formData.customer_id) {
      alert("Please select a customer from the search results.");
      return;
    }

    // Log the exact data being sent
    console.log("=== FRONTEND DATA BEING SENT ===");
    console.log(JSON.stringify(formData, null, 2));

    try {

      console.log("FormData being submitted:", formData);

      if (id) {
        // Update existing invoice
        const response = await apiClient.put(`/invoice/${id}`, formData);
        if (response.status === 200) {
          alert(`Invoice ID: ${response.data.id} updated successfully!`);
        } else {
          alert('Failed to update invoice.');
        }
      } else {
        // Create new invoice
        const response = await apiClient.post('/invoice', formData);
        if (response.status === 201 || response.status === 200) {
          alert(`Invoice ID: ${response.data.id} created successfully!`);
        } else {
          alert('Failed to create invoice.');
        }
      }
      setFormData({
        customer_id: '',
        customer_name: '',
        customer_address: '',
        customer_phone: '',
        date_issued: '',
        invoice_terms: 'Due end of the month', // Default term
        invoice_due_date: '' ,// This will be calculated based on terms
        invoice_status: 'draft', // Default status
        invoice_total: 0, // Total amount of the invoice
        line_items: [{ 
          product_id: null,
          product_description: '', 
          line_items_qty: 1, 
          product_price: 0, 
          line_items_total: 0 
        }], // Default line item
      });
      navigate('/invoices');
    } catch (error) {
      console.error('=== ERROR DETAILS ===');
      console.error('Status:', error.response?.status);
      console.error('Response:', error.response?.data);
      
      if (error.response?.data?.detail) {
        if (Array.isArray(error.response.data.detail)) {
          const errors = error.response.data.detail.map(err => 
            `${err.loc.join('.')}: ${err.msg}`
          ).join('\n');
          alert(`Validation Errors:\n${errors}`);
        } else {
          alert(`Error: ${error.response.data.detail}`);
        }
      } else {
        alert('Error submitting invoice: ' + error.message);
      }
    }
  };





  return (
    <div className="container">
      <h2>Invoice Management Store (IMS)</h2>
      <h3>{id ? `Editing Invoice #${id}` : 'Create New Invoice'}</h3>


        <form onSubmit={handleSubmit}>

            <label>Customer Name</label>

           
            <CustomerSearch
              value={formData.customer_name}
              onSelect={(customer, customerId) => {
                setFormData({
                  ...formData,
                  customer_id: customerId,
                  customer_name: customer.customer_name,
                  customer_address: customer.customer_address,
                  customer_phone: customer.customer_phone,
                });
              }}
            />

            {errors.customer_name && <p className="error-text">{errors.customer_name}</p>}

            <label>Address</label>
            <input type="text" placeholder="Address" value={formData.customer_address}
                onChange={e => setFormData({ ...formData, customer_address: e.target.value })} />
            {errors.customer_address && <p className="error-text">{errors.customer_address}</p>}

            <label>Phone Number</label>
            <input type="text" placeholder="Phone" value={formData.customer_phone}
                onChange={e => setFormData({ ...formData, customer_phone: e.target.value })} />
            {errors.customer_phone && <p className="error-text">{errors.customer_phone}</p>}

            <label>Date Issued</label>
            <input type="date" value={formData.date_issued}
                onChange={e => setFormData({ ...formData, date_issued: e.target.value })} />
            {errors.date_issued && <p className="error-text">{errors.date_issued}</p>}

            <label>Terms</label>
              <select
                value={formData.invoice_terms}
                onChange={(e) => {
                  const newTerms = e.target.value;
                  console.log(e.target.value);
                  const due = calculateDueDate(formData.date_issued, newTerms);
                  setFormData({ ...formData, invoice_terms: newTerms, invoice_due_date: due });
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
              {errors.terms && <p className="error-text">{errors.terms}</p>}

              <label>Due Date</label>
              <input type="date" value={formData.invoice_due_date} disabled />

              <h4>Item Table</h4>
              <div className = "item-table-scroll">
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
              {formData.line_items.map((item, index) => (

                <tr key={index}>
                <td padding="0 12px">
                  <ProductSearch
                      value={item.product_description}
                      onSelect={(product, productId) => {
                        console.log("Selected product:", product); // Debug log
                        // User selected a product from dropdown
                        handleItemChange(index, 'product_id', productId);    // ✅ Set product_id
                        handleItemChange(index, 'product_description', product.product_description);
                        handleItemChange(index, 'product_price', product.product_price);
                        
                        // Auto-calculate line total with current quantity
                        const currentQty = item.line_items_qty || 1;
                        const lineTotal = currentQty * product.product_price;
                        handleItemChange(index, 'line_items_total', lineTotal);
                      }}
                      onInputChange={(value) => {
                        // User is typing - update description only
                        handleItemChange(index, 'product_description', value);
                      }}
                    />
                    {errors[`item_desc_${index}`] && <p className="error-text">{errors[`item_desc_${index}`]}</p>}
                </td>
                
                <td>
                  <input
                  type="number"
                  placeholder="Qty"
                  value={item.line_items_qty}
                  onChange={e => {
                    const qty = e.target.value;
                    handleItemChange(index, 'line_items_qty', qty);
                    // Update line_items_total for this item
                    handleItemChange(index, 'line_items_total', qty * (item.product_price || 0));
                  }}
                  />
                  {errors[`item_qty_${index}`] && <p className="error-text">{errors[`item_qty_${index}`]}</p>}
                </td>
                <td>
                  <input
                  type="number"
                  placeholder="Price"
                  value={item.product_price}
                  onChange={e => {
                    const price = e.target.value;
                    handleItemChange(index, 'product_price', price);
                    // Update line_items_total for this item
                    handleItemChange(index, 'line_items_total', price * (item.line_items_qty || 0));
                  }}
                  />
                  {errors[`item_price_${index}`] && <p className="error-text">{errors[`item_price_${index}`]}</p>}
                </td>

                <td>
                  <strong>
                  {(item.line_items_qty * item.product_price || 0).toLocaleString(undefined, {
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
             
              {/* <td padding="0 12px">
                {errors[`item_desc_${index}`] && <p className="error-text">{errors[`item_desc_${index}`]}</p>}
              </td> */}
              </table>
              </div>
              <div>
              <button type="button" onClick={addItem}>+ Add Item</button>
              {/* Removed editingInvoiceId related code since it's commented out and not used */}

              <button type="submit">

                {id ? 'Update Invoice' : 'Create Invoice'}

              </button>

                <span style={{ marginLeft: '20px', fontWeight: 'bold' }}>
                  Total: {formData.line_items.reduce((total, item) => total + (item.line_items_qty * item.product_price || 0), 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                  })}
                </span>
           
            </div>


        </form>


    </div>
  );
};

export default InvoicePage;
