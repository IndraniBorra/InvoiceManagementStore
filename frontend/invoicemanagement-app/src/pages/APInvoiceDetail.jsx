import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient } from '../services/api';
import '../styles/components/APModule.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n ?? 0);

const StatusBadge = ({ status, overdue }) => {
  if (overdue) return <span className="ap-badge ap-badge--overdue">Overdue</span>;
  const map = { pending_review: ['pending','Pending Review'], approved: ['approved','Approved'], paid: ['paid','Paid'], rejected: ['rejected','Rejected'] };
  const [cls, label] = map[status] || ['pending', status];
  return <span className={`ap-badge ap-badge--${cls}`}>{label}</span>;
};

const APInvoiceDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [invoice, setInvoice]         = useState(null);
  const [vendors, setVendors]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);

  // Editable form state
  const [form, setForm] = useState({
    invoice_number: '', invoice_date: '', due_date: '',
    total_amount: '', currency: 'USD', notes: '', vendor_id: '',
  });
  const [lineItems, setLineItems] = useState([]);

  // Payment modal state
  const [payForm, setPayForm] = useState({
    payment_date: new Date().toISOString().slice(0,10),
    payment_amount: '', payment_method: 'bank_transfer', payment_reference: '', notes: '',
  });

  // Reject modal state
  const [rejectNotes, setRejectNotes] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [invRes, vendorRes] = await Promise.all([
        apiClient.get(`/ap/invoice/${id}`),
        apiClient.get('/ap/vendors'),
      ]);
      const inv = invRes.data;
      setInvoice(inv);
      setVendors(vendorRes.data || []);
      setForm({
        invoice_number: inv.invoice_number || '',
        invoice_date:   inv.invoice_date   || '',
        due_date:       inv.due_date       || '',
        total_amount:   inv.total_amount   != null ? String(inv.total_amount) : '',
        currency:       inv.currency       || 'USD',
        notes:          inv.notes          || '',
        vendor_id:      inv.vendor_id      != null ? String(inv.vendor_id) : '',
      });
      setLineItems(inv.line_items || []);
      setPayForm(prev => ({ ...prev, payment_amount: String(inv.total_amount || '') }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  // Fetch PDF as blob to avoid X-Frame-Options cross-origin blocking
  useEffect(() => {
    if (!invoice?.pdf_filename) return;
    let url;
    apiClient.get(`/ap/invoice/${id}/pdf`, { responseType: 'blob' })
      .then(res => { url = URL.createObjectURL(res.data); setPdfBlobUrl(url); })
      .catch(() => {});
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [invoice?.pdf_filename, id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.put(`/ap/invoice/${id}`, {
        ...form,
        invoice_date:  form.invoice_date  || null,
        due_date:      form.due_date      || null,
        total_amount:  parseFloat(form.total_amount) || 0,
        vendor_id:     form.vendor_id ? parseInt(form.vendor_id) : null,
        line_items:    lineItems,
      });
      await load();
      alert('Invoice updated.');
    } catch (e) {
      alert(`Save failed: ${e.response?.data?.detail || e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    try {
      await apiClient.post(`/ap/invoice/${id}/approve`);
      await load();
    } catch (e) { alert(e.response?.data?.detail || e.message); }
  };

  const handleReject = async () => {
    if (!rejectNotes.trim()) return alert('Please provide a reason for rejection.');
    try {
      await apiClient.post(`/ap/invoice/${id}/reject`, { notes: rejectNotes });
      setShowRejectModal(false);
      await load();
    } catch (e) { alert(e.response?.data?.detail || e.message); }
  };

  const handlePay = async () => {
    if (!payForm.payment_amount || parseFloat(payForm.payment_amount) <= 0)
      return alert('Enter a valid payment amount.');
    try {
      await apiClient.post(`/ap/invoice/${id}/pay`, {
        ...payForm,
        payment_amount: parseFloat(payForm.payment_amount),
      });
      setShowPayModal(false);
      await load();
    } catch (e) { alert(e.response?.data?.detail || e.message); }
  };

  const updateLineItem = (i, field, val) => {
    setLineItems(prev => {
      const updated = [...prev];
      updated[i] = { ...updated[i], [field]: val };
      return updated;
    });
  };

  if (loading) return <div className="ap-page"><p style={{ color: '#94a3b8' }}>Loading invoice…</p></div>;
  if (!invoice) return <div className="ap-page"><p>Invoice not found.</p></div>;

  const canApprove = invoice.status === 'pending_review';
  const canReject  = invoice.status !== 'paid';
  const canPay     = invoice.status === 'approved';

  return (
    <div className="ap-page">
      {/* Header */}
      <div className="ap-page-header">
        <div>
          <button className="ap-btn ap-btn--outline ap-btn--sm" onClick={() => navigate('/ap/invoices')} style={{ marginBottom: 8 }}>
            ← Back
          </button>
          <h1 className="ap-page-title">
            {invoice.invoice_number || `AP-${String(invoice.id).padStart(5,'0')}`}
          </h1>
          <p className="ap-page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusBadge status={invoice.status} overdue={invoice.overdue} />
            {invoice.email_from && <span>· from {invoice.email_from}</span>}
            {invoice.extraction_confidence != null && (
              <span className="ap-confidence">
                Extraction
                <div className="ap-confidence-bar">
                  <div className="ap-confidence-fill" style={{ width: `${invoice.extraction_confidence * 100}%` }} />
                </div>
                {Math.round(invoice.extraction_confidence * 100)}%
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Action bar */}
      <div className="ap-action-bar">
        {canApprove && <button className="ap-btn ap-btn--success" onClick={handleApprove}>✓ Approve</button>}
        {canPay     && <button className="ap-btn ap-btn--primary" onClick={() => setShowPayModal(true)}>💳 Record Payment</button>}
        {canReject  && <button className="ap-btn ap-btn--danger"  onClick={() => setShowRejectModal(true)}>✕ Reject</button>}
        <button className="ap-btn ap-btn--outline" onClick={handleSave} disabled={saving} style={{ marginLeft: 'auto' }}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {/* Main grid: PDF left, form right */}
      <div className="ap-detail-grid">
        {/* PDF preview */}
        <div className="ap-pdf-frame">
          {pdfBlobUrl ? (
            <iframe src={pdfBlobUrl} title="Invoice PDF" />
          ) : invoice.pdf_filename ? (
            <div className="ap-pdf-placeholder"><p style={{ fontSize: '2rem' }}>⏳</p><p>Loading PDF…</p></div>
          ) : (
            <div className="ap-pdf-placeholder">
              <p style={{ fontSize: '2rem' }}>📄</p>
              <p>No PDF attached</p>
            </div>
          )}
        </div>

        {/* Form panel */}
        <div className="ap-detail-panel">
          {/* Vendor */}
          <div className="ap-field-card">
            <h3>Vendor</h3>
            <div className="ap-form-grid full">
              <label className="ap-field-label">Vendor</label>
              <select className="ap-field-input" value={form.vendor_id} onChange={e => setForm(f => ({ ...f, vendor_id: e.target.value }))}>
                <option value="">— unassigned —</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
              </select>
            </div>
          </div>

          {/* Invoice fields */}
          <div className="ap-field-card">
            <h3>Invoice Details</h3>
            <div className="ap-form-grid">
              <div>
                <label className="ap-field-label">Invoice Number</label>
                <input className="ap-field-input" value={form.invoice_number} onChange={e => setForm(f => ({...f, invoice_number: e.target.value}))} />
              </div>
              <div>
                <label className="ap-field-label">Currency</label>
                <input className="ap-field-input" value={form.currency} onChange={e => setForm(f => ({...f, currency: e.target.value}))} />
              </div>
              <div>
                <label className="ap-field-label">Invoice Date</label>
                <input type="date" className="ap-field-input" value={form.invoice_date} onChange={e => setForm(f => ({...f, invoice_date: e.target.value}))} />
              </div>
              <div>
                <label className="ap-field-label">Due Date</label>
                <input type="date" className="ap-field-input" value={form.due_date} onChange={e => setForm(f => ({...f, due_date: e.target.value}))} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="ap-field-label">Total Amount</label>
                <input type="number" className="ap-field-input" value={form.total_amount} onChange={e => setForm(f => ({...f, total_amount: e.target.value}))} />
              </div>
            </div>
          </div>

          {/* Line items */}
          {lineItems.length > 0 && (
            <div className="ap-field-card">
              <h3>Line Items</h3>
              <div className="ap-table-card" style={{ boxShadow: 'none', border: '1px solid #f1f5f9' }}>
                <table className="ap-table">
                  <thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
                  <tbody>
                    {lineItems.map((li, i) => (
                      <tr key={i}>
                        <td><input className="ap-field-input" value={li.description || ''} onChange={e => updateLineItem(i, 'description', e.target.value)} /></td>
                        <td><input type="number" className="ap-field-input" style={{ width: 70 }} value={li.quantity ?? ''} onChange={e => updateLineItem(i, 'quantity', e.target.value)} /></td>
                        <td><input type="number" className="ap-field-input" style={{ width: 90 }} value={li.unit_price ?? ''} onChange={e => updateLineItem(i, 'unit_price', e.target.value)} /></td>
                        <td><input type="number" className="ap-field-input" style={{ width: 90 }} value={li.line_total ?? ''} onChange={e => updateLineItem(i, 'line_total', e.target.value)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="ap-field-card">
            <h3>Notes</h3>
            <textarea
              className="ap-field-input"
              rows={3}
              style={{ resize: 'vertical' }}
              value={form.notes}
              onChange={e => setForm(f => ({...f, notes: e.target.value}))}
              placeholder="Internal notes…"
            />
          </div>

          {/* Payment history */}
          {invoice.payments?.length > 0 && (
            <div className="ap-field-card">
              <h3>Payment History</h3>
              <table className="ap-table" style={{ marginTop: 0 }}>
                <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Ref</th></tr></thead>
                <tbody>
                  {invoice.payments.map(p => (
                    <tr key={p.id}>
                      <td>{p.payment_date}</td>
                      <td style={{ fontWeight: 600 }}>{fmt(p.payment_amount)}</td>
                      <td>{p.payment_method}</td>
                      <td>{p.payment_reference || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Payment modal */}
      {showPayModal && (
        <div className="ap-modal-overlay" onClick={() => setShowPayModal(false)}>
          <div className="ap-modal" onClick={e => e.stopPropagation()}>
            <h2>Record Payment</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label className="ap-field-label">Payment Date</label>
                <input type="date" className="ap-field-input" value={payForm.payment_date} onChange={e => setPayForm(f => ({...f, payment_date: e.target.value}))} />
              </div>
              <div>
                <label className="ap-field-label">Amount</label>
                <input type="number" className="ap-field-input" value={payForm.payment_amount} onChange={e => setPayForm(f => ({...f, payment_amount: e.target.value}))} />
              </div>
              <div>
                <label className="ap-field-label">Method</label>
                <select className="ap-field-input" value={payForm.payment_method} onChange={e => setPayForm(f => ({...f, payment_method: e.target.value}))}>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="check">Check</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="ap-field-label">Reference (optional)</label>
                <input className="ap-field-input" value={payForm.payment_reference} onChange={e => setPayForm(f => ({...f, payment_reference: e.target.value}))} placeholder="Transaction ID, check #…" />
              </div>
            </div>
            <div className="ap-modal-actions">
              <button className="ap-btn ap-btn--outline" onClick={() => setShowPayModal(false)}>Cancel</button>
              <button className="ap-btn ap-btn--success" onClick={handlePay}>Confirm Payment</button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {showRejectModal && (
        <div className="ap-modal-overlay" onClick={() => setShowRejectModal(false)}>
          <div className="ap-modal" onClick={e => e.stopPropagation()}>
            <h2>Reject Invoice</h2>
            <label className="ap-field-label">Reason *</label>
            <textarea className="ap-field-input" rows={4} value={rejectNotes} onChange={e => setRejectNotes(e.target.value)} placeholder="Explain why this invoice is being rejected…" />
            <div className="ap-modal-actions">
              <button className="ap-btn ap-btn--outline" onClick={() => setShowRejectModal(false)}>Cancel</button>
              <button className="ap-btn ap-btn--danger" onClick={handleReject}>Reject Invoice</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default APInvoiceDetail;
