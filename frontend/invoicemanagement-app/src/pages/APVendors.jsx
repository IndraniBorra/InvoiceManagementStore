import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import '../styles/components/APModule.css';

const APVendors = () => {
  const navigate = useNavigate();
  const [vendors, setVendors]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ vendor_name: '', vendor_email: '', vendor_address: '', vendor_phone: '', bank_details: '' });

  const load = async () => {
    setLoading(true);
    try { const res = await apiClient.get('/ap/vendors'); setVendors(res.data || []); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm({ vendor_name: '', vendor_email: '', vendor_address: '', vendor_phone: '', bank_details: '' });
    setEditingId(null);
  };

  const handleEdit = (v) => {
    setEditingId(v.id);
    setForm({ vendor_name: v.vendor_name || '', vendor_email: v.vendor_email || '', vendor_address: v.vendor_address || '', vendor_phone: v.vendor_phone || '', bank_details: v.bank_details || '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.vendor_name.trim()) return alert('Vendor name is required.');
    try {
      if (editingId) {
        await apiClient.put(`/ap/vendor/${editingId}`, form);
        alert('Vendor updated.');
      } else {
        await apiClient.post('/ap/vendor', form);
        alert('Vendor created.');
      }
      resetForm();
      load();
    } catch (err) {
      alert(err.response?.data?.detail || err.message);
    }
  };

  return (
    <div className="ap-page">
      <div className="ap-page-header">
        <div>
          <button className="ap-btn ap-btn--outline ap-btn--sm" onClick={() => navigate('/ap')} style={{ marginBottom: 8 }}>← Back to Payables</button>
          <h1 className="ap-page-title">Vendors</h1>
          <p className="ap-page-subtitle">Manage your AP vendors / suppliers</p>
        </div>
      </div>

      {/* Form */}
      <div className="ap-field-card">
        <h3>{editingId ? 'Edit Vendor' : 'Add New Vendor'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="ap-form-grid">
            <div>
              <label className="ap-field-label">Vendor Name *</label>
              <input className="ap-field-input" value={form.vendor_name} onChange={e => setForm(f => ({...f, vendor_name: e.target.value}))} required />
            </div>
            <div>
              <label className="ap-field-label">Email</label>
              <input type="email" className="ap-field-input" value={form.vendor_email} onChange={e => setForm(f => ({...f, vendor_email: e.target.value}))} />
            </div>
            <div>
              <label className="ap-field-label">Phone</label>
              <input className="ap-field-input" value={form.vendor_phone} onChange={e => setForm(f => ({...f, vendor_phone: e.target.value}))} />
            </div>
            <div>
              <label className="ap-field-label">Address</label>
              <input className="ap-field-input" value={form.vendor_address} onChange={e => setForm(f => ({...f, vendor_address: e.target.value}))} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="ap-field-label">Bank Details</label>
              <input className="ap-field-input" value={form.bank_details} onChange={e => setForm(f => ({...f, bank_details: e.target.value}))} placeholder="Account #, routing, IBAN…" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="submit" className="ap-btn ap-btn--primary">{editingId ? 'Update Vendor' : 'Create Vendor'}</button>
            {editingId && <button type="button" className="ap-btn ap-btn--outline" onClick={resetForm}>Cancel</button>}
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="ap-table-card">
        <table className="ap-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Phone</th><th>Address</th><th>Bank Details</th><th></th></tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i}>{[...Array(5)].map((_,j) => <td key={j}><div className="ap-skeleton"/></td>)}<td/></tr>
              ))
            ) : vendors.length === 0 ? (
              <tr><td colSpan="6" className="ap-table-empty">No vendors yet. Add one above.</td></tr>
            ) : vendors.map(v => (
              <tr key={v.id}>
                <td style={{ fontWeight: 500 }}>{v.vendor_name}</td>
                <td>{v.vendor_email || '—'}</td>
                <td>{v.vendor_phone || '—'}</td>
                <td>{v.vendor_address || '—'}</td>
                <td>{v.bank_details || '—'}</td>
                <td><button className="ap-view-btn" onClick={() => handleEdit(v)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default APVendors;
