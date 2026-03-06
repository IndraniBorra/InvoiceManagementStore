import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import '../styles/components/APModule.css';

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n ?? 0);

const StatusBadge = ({ status, overdue }) => {
  if (overdue) return <span className="ap-badge ap-badge--overdue">Overdue</span>;
  const cls = { pending_review: 'pending', approved: 'approved', paid: 'paid', rejected: 'rejected' }[status] || 'pending';
  const label = { pending_review: 'Pending Review', approved: 'Approved', paid: 'Paid', rejected: 'Rejected' }[status] || status;
  return <span className={`ap-badge ap-badge--${cls}`}>{label}</span>;
};

const APDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats]     = useState(null);
  const [recent, setRecent]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [dashRes, listRes] = await Promise.all([
          apiClient.get('/ap/dashboard'),
          apiClient.get('/ap/invoices'),
        ]);
        setStats(dashRes.data);
        setRecent([...(listRes.data || [])].slice(0, 5));
      } catch (e) {
        console.error('AP dashboard load error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await apiClient.post('/ap/invoice/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      navigate(`/ap/invoice/${res.data.id}`);
    } catch (err) {
      alert(`Upload failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.name.endsWith('.pdf')) return alert('Please drop a PDF file.');
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await apiClient.post('/ap/invoice/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      navigate(`/ap/invoice/${res.data.id}`);
    } catch (err) {
      alert(`Upload failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const KpiCard = ({ icon, label, value, sub, color }) => (
    <div className="ap-kpi-card" style={{ '--kpi-color': color }}>
      <div className="ap-kpi-icon">{icon}</div>
      <div>
        <p className="ap-kpi-label">{label}</p>
        <p className="ap-kpi-value">{value}</p>
        {sub && <p className="ap-kpi-sub">{sub}</p>}
      </div>
    </div>
  );

  return (
    <div className="ap-page">
      <div className="ap-page-header">
        <div>
          <h1 className="ap-page-title">Accounts Payable</h1>
          <p className="ap-page-subtitle">Track and manage invoices you need to pay</p>
        </div>
        <button className="ap-btn ap-btn--primary" onClick={() => navigate('/ap/invoices')}>
          View All Invoices
        </button>
      </div>

      {/* KPI cards */}
      <div className="ap-kpi-grid">
        <KpiCard icon="🕐" label="Pending Review"  value={loading ? '—' : stats?.pending_count  ?? 0} sub="Awaiting action"       color="#f59e0b" />
        <KpiCard icon="💸" label="Total Payable"   value={loading ? '—' : fmt(stats?.total_payable)} sub="Pending + Approved"   color="#3b82f6" />
        <KpiCard icon="⚠️" label="Overdue"          value={loading ? '—' : stats?.overdue_count  ?? 0} sub="Past due date"        color="#ef4444" />
        <KpiCard icon="📅" label="Due This Week"   value={loading ? '—' : stats?.due_soon_count ?? 0} sub="Next 7 days"          color="#8b5cf6" />
      </div>

      {/* Upload */}
      <div className="ap-section">
        <h2 className="ap-section-title">Upload Invoice PDF</h2>
        <label
          className={`ap-upload-zone${uploading ? ' drag-over' : ''}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <input type="file" accept=".pdf" hidden onChange={handleFileUpload} disabled={uploading} />
          <div className="ap-upload-icon">{uploading ? '⏳' : '📄'}</div>
          <p className="ap-upload-label">{uploading ? 'Extracting data…' : 'Drop a PDF here or click to upload'}</p>
          <p className="ap-upload-hint">Vendor invoices will be automatically parsed</p>
        </label>
      </div>

      {/* Recent invoices */}
      <div className="ap-section">
        <div className="ap-section-header">
          <h2 className="ap-section-title">Recent Invoices</h2>
          <button className="ap-view-btn" onClick={() => navigate('/ap/invoices')}>View All →</button>
        </div>
        <div className="ap-table-card">
          <table className="ap-table">
            <thead>
              <tr><th>Vendor</th><th>Invoice #</th><th>Due Date</th><th>Amount</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(3)].map((_, i) => (
                  <tr key={i}>{[...Array(5)].map((__, j) => <td key={j}><div className="ap-skeleton" /></td>)}<td /></tr>
                ))
              ) : recent.length === 0 ? (
                <tr><td colSpan="6" className="ap-table-empty">No invoices yet — upload your first one above</td></tr>
              ) : recent.map((inv) => (
                <tr key={inv.id}>
                  <td style={{ fontWeight: 500 }}>{inv.vendor_name || '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8125rem', color: '#64748b' }}>{inv.invoice_number || `AP-${String(inv.id).padStart(5,'0')}`}</td>
                  <td>{inv.due_date || '—'}</td>
                  <td style={{ fontWeight: 600 }}>{fmt(inv.total_amount)}</td>
                  <td><StatusBadge status={inv.status} overdue={inv.overdue} /></td>
                  <td><button className="ap-view-btn" onClick={() => navigate(`/ap/invoice/${inv.id}`)}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default APDashboard;
