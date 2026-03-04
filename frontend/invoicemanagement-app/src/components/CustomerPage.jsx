import React, { useEffect, useState } from 'react';
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

  // Handle extracted data from AI assistant - auto-fill form
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
            if (location.state?.returnToInvoice) {
              const intent = location.state.returnToInvoice;
              alert(`Customer "${newCustomer.customer_name}" created! Taking you back to invoice creation.`);
              navigate('/invoice', {
                state: {
                  action: 'create_invoice_with_data',
                  llmData: {
                    customer_id:      newCustomer.customer_id,
                    customer_name:    newCustomer.customer_name,
                    customer_address: newCustomer.customer_address,
                    customer_phone:   newCustomer.customer_phone,
                    line_items: [{
                      product_description: intent.product_description || '',
                      lineitem_qty:        intent.lineitem_qty        || 1,
                      product_price:       intent.product_price       || 0,
                    }],
                  },
                },
              });
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
