import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import '../styles/components/InvoicePage.css'; // Using shared styles

const CustomerPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [showList, setShowList] = useState(false);
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_address: '',
    customer_phone: '',
    customer_email: '',
  });

  const [editingId, setEditingId] = useState(null);
  // Capture returnToInvoice once on mount; cleared after use so stale history can't retrigger it
  const returnToInvoiceRef = useRef(location.state?.returnToInvoice || null);

  const fetchCustomers = async () => {
    try {
      const res = await apiClient.get('/customers');
      setCustomers(res.data);
    } catch (err) {
      console.error('Error fetching customers:', err);
      }
    }

 
   
  


  // Auto-open list when navigated from LLM "show customers"
  useEffect(() => {
    if (location.state?.showList) {
      setShowList(true);
    }
  }, [location.state]);

  useEffect(() => {
    if (showList) {
      fetchCustomers();
    }
  }, [showList]);

  // Handle extracted data from AI assistant - auto-fill form (create)
  useEffect(() => {
    const data = location.state?.llmData || location.state?.extractedData;
    if (data && location.state?.action === 'create_customer_with_data') {
      setFormData({
        customer_name:    data.customer_name    || '',
        customer_address: data.customer_address || '',
        customer_phone:   data.customer_phone   || '',
        customer_email:   data.customer_email   || '',
      });
    }
  }, [location.state]);

  // Pre-fill edit form from LLM Assistant (update)
  useEffect(() => {
    if (location.state?.action === 'update_customer_with_data' && location.state?.editCustomerId) {
      const data = location.state.llmData || {};
      setEditingId(location.state.editCustomerId);
      setFormData({
        customer_name:    data.customer_name    || '',
        customer_address: data.customer_address || '',
        customer_phone:   data.customer_phone   || '',
        customer_email:   data.customer_email   || '',
      });
      setShowList(true);
    }
  }, [location.state]);

  const handleSubmit = async (e) => {
        e.preventDefault();
        const { customer_name, customer_address, customer_phone, customer_email } = formData;
        console.log('Form Data:', formData);

        // Basic checks
        if (!customer_name.trim() || !customer_address.trim() || !customer_phone.trim()) {
          alert("Name, address, and phone are required.");
          return;
        }

        if (!/^\d{10}$/.test(customer_phone)) {
          alert("Phone number must be exactly 10 digits.");
          return;
        }

        if (customer_email && !/^\S+@\S+\.\S+$/.test(customer_email)) {
          alert("Invalid email format.");
          return;
        }
        if (!editingId && customers.some(c => c.customer_name.trim().toLowerCase() === customer_name.trim().toLowerCase())) {
          alert("Customer with this name already exists!");
          return;
        }
        try {
          if (editingId) {
            const response = await apiClient.put(`/customer/${editingId}`, formData);
            console.log('Update Response:', response.data);
            alert(`Customer ID: ${response.data.customer_id} updated successfully!`);
            resetForm();
            fetchCustomers();
          } else {
            const response = await apiClient.post('/customer', formData);
            const newCustomer = response.data;
            const returnIntent = returnToInvoiceRef.current;
            if (returnIntent) {
              returnToInvoiceRef.current = null; // consume once — prevent stale retrigger

              // Normalize to line_items array
              const rawItems = returnIntent.line_items?.length > 0
                ? returnIntent.line_items
                : returnIntent.product_description
                  ? [{ product_description: returnIntent.product_description, lineitem_qty: returnIntent.lineitem_qty || 1, product_price: returnIntent.product_price || 0 }]
                  : [];

              // Check which products already exist
              let resolvedItems = rawItems.map(item => ({ ...item, product_id: item.product_id || null }));
              try {
                const { data: products } = await apiClient.get('/products');
                resolvedItems = rawItems.map(item => {
                  const found = products.find(p =>
                    p.product_description.toLowerCase().includes((item.product_description || '').toLowerCase())
                  );
                  if (found) {
                    return { product_id: found.product_id, product_description: found.product_description, lineitem_qty: item.lineitem_qty || 1, product_price: item.product_price ?? found.product_price };
                  }
                  return { product_id: null, product_description: item.product_description || '', lineitem_qty: item.lineitem_qty || 1, product_price: item.product_price || 0 };
                });
              } catch { /* use unresolved items if fetch fails */ }

              const customerInfo = {
                customer_id:      newCustomer.customer_id,
                customer_name:    newCustomer.customer_name,
                customer_address: newCustomer.customer_address,
                customer_phone:   newCustomer.customer_phone,
              };

              const firstUnresolved = resolvedItems.find(item => item.product_id === null);
              if (firstUnresolved) {
                alert(`Customer "${newCustomer.customer_name}" created! Now let's create product "${firstUnresolved.product_description}".`);
                navigate('/product', {
                  state: {
                    action: 'create_product_with_data',
                    llmData: {
                      product_description: firstUnresolved.product_description,
                      product_price:       firstUnresolved.product_price || '',
                    },
                    returnToInvoice: { ...customerInfo, line_items: resolvedItems },
                  },
                });
              } else {
                alert(`Customer "${newCustomer.customer_name}" created! Taking you back to invoice creation.`);
                navigate('/invoice', {
                  state: {
                    action: 'create_invoice_with_data',
                    llmData: { ...customerInfo, line_items: resolvedItems },
                  },
                });
              }
              return;
            }
            alert(`Customer ID: ${newCustomer.customer_id} created successfully!`);
            resetForm();
            fetchCustomers();
          }
        } catch (err) {
        if (err.response?.data?.detail) {
          alert(`Error: ${err.response.data.detail}`);
        } else {
          console.error('Failed to submit form:', err);
          alert('Error submitting form. Please try again.');
        }
      }
    };

    const handleEdit = (customer) => {
      setFormData({
        customer_name: customer.customer_name,
        customer_address: customer.customer_address,
        customer_phone: customer.customer_phone,
        customer_email: customer.customer_email,
      });
    
      setEditingId(customer.customer_id);
      if (!showList) setShowList(true);
    };

  const resetForm = () => {
    setFormData({ customer_name: '', customer_address: '', customer_phone: '', customer_email: '' });
    setEditingId(null);
  };


  return (
    <div className="container">
      <header className="header">
        <h2>Customer Management</h2>
        <button className="btn toggle-list-btn" onClick={() => setShowList(!showList)}>
          ☰ All Customers
        </button>
      </header>

      <form className="customer-form" onSubmit={handleSubmit}>
        <div className="form-group">
            <input
            type="text"
            placeholder="Name *"
            value={formData.customer_name}
            onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder="Address *"
            value={formData.customer_address}
            onChange={(e) => setFormData({ ...formData, customer_address: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder="Phone *"
            value={formData.customer_phone}
            onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
            required
          />
          <input
            type="email"
            placeholder="Email"
            value={formData.customer_email}
            onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
          />

          <div className="form-actions">
            <button type="submit" className="btn primary-btn">
              {editingId ? 'Update Customer' : 'Create Customer'}
            </button>
            {editingId && (
              <button type="button" className="btn cancel-btn" onClick={resetForm}>
                Cancel Edit
              </button>
            )}
          </div>
        </div>
      </form>

      {showList && (
        <section className="customer-list-section">
          <h3>All Customers</h3>
          <div className="table-wrapper">
            <table className="customer-table" cellSpacing="0" cellPadding="8">
              <thead>
                <tr>
                  <th>Cust ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Address</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.length === 0 && (
                  <tr>
                    <td colSpan="6" className="no-data">
                      No customers found.
                    </td>
                  </tr>
                )}
                {customers.map((cust) => (
                  <tr key={cust.customer_id}>
                    <td>{cust.customer_id}</td>
                    <td>{cust.customer_name}</td>
                    <td>{cust.customer_email || '-'}</td>
                    <td>{cust.customer_phone}</td>
                    <td>{cust.customer_address}</td>
                    <td>
                      <button className="btn edit-btn" onClick={() => handleEdit(cust)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

    </div>
  );
};

export default CustomerPage;
