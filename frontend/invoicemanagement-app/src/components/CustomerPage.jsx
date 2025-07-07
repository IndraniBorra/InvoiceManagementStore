import React, { useEffect, useState } from 'react';
import api from '../api'; // Adjust the path according to your project structure
import '../App.css'; // Import your CSS styles
const CustomerPage = () => {
  const [customers, setCustomers] = useState([]); // This will hold the list of customers fetched from the server
  const [showList, setShowList] = useState(false); // This will toggle the visibility of the customer list
  const [formData, setFormData] = useState({    // This will hold the form data for creating or editing a customer
    name: '',
    address: '',
    phone: '',
    email: '',
  });
  const [editingId, setEditingId] = useState(null); // This will hold the ID of the customer being edited

  const fetchCustomers = async () => {
    try {
      const res = await api.get('/customers');
      setCustomers(res.data);
    } catch (err) {
      console.error('Error fetching customers:', err);
    }
  };

  useEffect(() => {
    if (showList) fetchCustomers();
  }, [showList]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        const response = await api.put(`/customer/${editingId}`, formData);
        alert(`Customer ID: ${response.data.id} updated successfully!`);
      } else {
        const response = await api.post('/customer', formData);
        alert(`Customer ID: ${response.data.id} created successfully!`);
      }
      resetForm();
      fetchCustomers();
    } catch (err) {
      console.error('Failed to submit form:', err);
      alert('Error submitting form. Please try again.');
    }
  };

  const handleEdit = (customer) => {
    setFormData({
      name: customer.name,
      address: customer.address,
      phone: customer.phone,
      email: customer.email,
    });
    setEditingId(customer.id);
  };

  const resetForm = () => {
    setFormData({ name: '', address: '', phone: '', email: '' });
    setEditingId(null);
  };

  return (
    <div className="p-4 max-w-xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Customer Form</h2>
        <button
          className="text-sm bg-gray-200 px-2 py-1 rounded hover:bg-gray-300"
          onClick={() => setShowList(!showList)}
        >
          ☰ All Customers
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 border p-4 rounded shadow">
        <input
          type="text"
          placeholder="Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full border px-3 py-2 rounded"
          required
        />
        <input
          type="text"
          placeholder="Address"
          value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          className="w-full border px-3 py-2 rounded"
          required
        />
        <input
          type="text"
          placeholder="Phone"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          className="w-full border px-3 py-2 rounded"
          required
        />
        <input
          type="email"
          placeholder="Email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className="w-full border px-3 py-2 rounded"
        />
        <div className="flex gap-3">
          <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded">
            {editingId ? 'Update Customer' : 'Create Customer'}
          </button>
          {editingId && (
            <button
              type="button"
              className="bg-gray-400 text-white px-4 py-2 rounded"
              onClick={resetForm}
            >
              Cancel Edit
            </button>
          )}
        </div>
      </form>

      {showList && (
        <div className="mt-6 border rounded p-4 shadow">
          <h3 className="font-bold text-lg mb-2">All Customers</h3>
          <ul className="space-y-2">
            {customers.map((cust) => (
              <li key={cust.id} className="flex justify-between items-center border-b py-2">
                <div>
                  <p className="font-medium">{cust.name}</p>
                  <p className="text-sm text-gray-500">{cust.email} | {cust.phone}</p>
                </div>
                <button
                  onClick={() => handleEdit(cust)}
                  className="bg-yellow-400 text-white px-3 py-1 rounded"
                >
                  Edit
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default CustomerPage;
