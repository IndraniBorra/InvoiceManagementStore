import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import '../styles/components/APModule.css';

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n ?? 0);

const FILTERS = [
  { label: 'All',            value: '' },
  { label: 'Pending Review', value: 'pending_review' },
  { label: 'Approved',       value: 'approved' },
  { label: 'Paid',           value: 'paid' },
  { label: 'Rejected',       value: 'rejected' },
];

const StatusBadge = ({ status, overdue }) => {
  if (overdue) return <span className="ap-badge ap-badge--overdue">Overdue</span>;
  const map = { pending_review: ['pending', 'Pending Review'], approved: ['approved', 'Approved'], paid: ['paid', 'Paid'], rejected: ['rejected', 'Rejected'] };
  const [cls, label] = map[status] || ['pending', status];
  return <span className={`ap-badge ap-badge--${cls}`}>{label}</span>;
};

const APInvoiceList = () => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('');

  const load = async (status) => {
    setLoading(true);
    try {
      const params = status ? { status } : {};
      const res = await apiClient.get('/ap/invoices', { params });
      setInvoices(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(filter); }, [filter]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await apiClient.post('/ap/invoice/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      navigate(`/ap/invoice/${res.data.id}`);
    } catch (err) {
      alert(`Upload failed: ${err.response?.data?.detail || err.message}`);
    } finally { e.target.value = ''; }
  };

  return (
    <div className="ap-page">
      <div className="ap-page-header">
        <div>
          <h1 className="ap-page-title">All AP Invoices</h1>
          <p className="ap-page-subtitle">{loading ? '…' : `${invoices.length} invoice${invoices.length !== 1 ? 's' : ''}`}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <label className="ap-btn ap-btn--primary" style={{ cursor: 'pointer' }}>
            + Upload PDF
            <input type="file" accept=".pdf" hidden onChange={handleUpload} />
          </label>
          <button className="ap-btn ap-btn--outline" onClick={() => navigate('/ap/vendors')}>Vendors</button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="ap-filter-bar">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            className={`ap-filter-btn${filter === f.value ? ' active' : ''}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="ap-table-card">
        <table className="ap-table">
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Invoice #</th>
              <th>Invoice Date</th>
              <th>Due Date</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Confidence</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}>{[...Array(7)].map((__, j) => <td key={j}><div className="ap-skeleton" /></td>)}<td /></tr>
              ))
            ) : invoices.length === 0 ? (
              <tr><td colSpan="8" className="ap-table-empty">No invoices found for this filter.</td></tr>
            ) : invoices.map((inv) => (
              <tr key={inv.id}>
                <td style={{ fontWeight: 500 }}>{inv.vendor_name || '—'}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8125rem', color: '#64748b' }}>{inv.invoice_number || `AP-${String(inv.id).padStart(5,'0')}`}</td>
                <td>{inv.invoice_date || '—'}</td>
                <td style={{ color: inv.overdue ? '#dc2626' : 'inherit', fontWeight: inv.overdue ? 600 : 400 }}>{inv.due_date || '—'}</td>
                <td style={{ fontWeight: 600 }}>{fmt(inv.total_amount)}</td>
                <td><StatusBadge status={inv.status} overdue={inv.overdue} /></td>
                <td>
                  {inv.extraction_confidence != null ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 50, height: 5, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${inv.extraction_confidence * 100}%`, height: '100%', background: '#3b82f6', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{Math.round(inv.extraction_confidence * 100)}%</span>
                    </div>
                  ) : '—'}
                </td>
                <td><button className="ap-view-btn" onClick={() => navigate(`/ap/invoice/${inv.id}`)}>Review</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default APInvoiceList;
