import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { reportApi, invoiceApi } from '../services/api';
import '../styles/components/DashboardPage.css';

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n ?? 0);

const today = new Date().toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
});

const STATUS_COLORS = {
  paid:      { bg: '#f0fdf4', color: '#16a34a' },
  overdue:   { bg: '#fef2f2', color: '#dc2626' },
  cancelled: { bg: '#f8fafc', color: '#64748b' },
  draft:     { bg: '#eff6ff', color: '#2563eb' },
  sent:      { bg: '#eff6ff', color: '#2563eb' },
  pending:   { bg: '#eff6ff', color: '#2563eb' },
  partial:   { bg: '#fff7ed', color: '#ea580c' },
};

const StatusBadge = ({ status }) => {
  const s = status?.toLowerCase() || 'draft';
  const style = STATUS_COLORS[s] || STATUS_COLORS.draft;
  return (
    <span className="dash-badge" style={style}>
      {status || 'Draft'}
    </span>
  );
};

const KpiCard = ({ icon, label, value, sub, colorVar }) => (
  <div className="kpi-card" style={{ '--kpi-color': colorVar }}>
    <div className="kpi-icon">{icon}</div>
    <div className="kpi-body">
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
      {sub && <p className="kpi-sub">{sub}</p>}
    </div>
  </div>
);

const SkeletonRow = () => (
  <tr className="skeleton-row">
    {[...Array(5)].map((_, i) => (
      <td key={i}><div className="skeleton-cell" /></td>
    ))}
  </tr>
);

const DashboardPage = () => {
  const navigate = useNavigate();
  const [stats, setStats]     = useState(null);
  const [overdue, setOverdue] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [summaryRes, overdueRes, invoicesRes] = await Promise.all([
          reportApi.getSummaryStats(),
          reportApi.getOverdueReport(),
          invoiceApi.getAll(),
        ]);
        setStats(summaryRes);
        setOverdue(overdueRes);
        // Sort by id desc, take last 5
        const sorted = [...(invoicesRes || [])].sort((a, b) => b.id - a.id).slice(0, 5);
        setInvoices(sorted);
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const QUICK_ACTIONS = [
    { label: '+ New Invoice',  onClick: () => navigate('/invoice'),   primary: true  },
    { label: '+ Customer',     onClick: () => navigate('/customer'),  primary: false },
    { label: '+ Product',      onClick: () => navigate('/product'),   primary: false },
    { label: 'All Invoices',   onClick: () => navigate('/invoices'),  primary: false },
    { label: 'Reports',        onClick: () => navigate('/reports'),   primary: false },
  ];

  return (
    <div className="dash-page">
      {/* Welcome */}
      <div className="dash-welcome">
        <div>
          <h1 className="dash-title">Welcome back</h1>
          <p className="dash-date">{today}</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <KpiCard
          icon="💰"
          label="Total Revenue"
          value={loading ? '—' : fmt(stats?.total_revenue)}
          sub={loading ? '' : `${stats?.total_invoices?.toLocaleString() || 0} invoices`}
          colorVar="var(--color-primary, #3b82f6)"
        />
        <KpiCard
          icon="⏳"
          label="Outstanding"
          value={loading ? '—' : fmt(stats?.outstanding_amount)}
          sub="Unpaid invoices"
          colorVar="var(--color-warning, #f59e0b)"
        />
        <KpiCard
          icon="⚠️"
          label="Overdue"
          value={loading ? '—' : fmt(overdue?.total_overdue)}
          sub={loading ? '' : `${overdue?.invoice_count ?? 0} invoice${overdue?.invoice_count === 1 ? '' : 's'}`}
          colorVar="var(--color-danger, #ef4444)"
        />
        <KpiCard
          icon="👥"
          label="Total Customers"
          value={loading ? '—' : (stats?.total_customers?.toLocaleString() ?? '—')}
          sub="Active accounts"
          colorVar="var(--color-accent, #8b5cf6)"
        />
      </div>

      {/* Quick Actions */}
      <div className="dash-section">
        <h2 className="dash-section-title">Quick Actions</h2>
        <div className="quick-actions">
          {QUICK_ACTIONS.map(({ label, onClick, primary }) => (
            <button
              key={label}
              className={`qa-btn ${primary ? 'qa-btn--primary' : 'qa-btn--secondary'}`}
              onClick={onClick}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Recent Invoices */}
      <div className="dash-section">
        <div className="dash-section-header">
          <h2 className="dash-section-title">Recent Invoices</h2>
          <button className="dash-view-all" onClick={() => navigate('/invoices')}>
            View All →
          </button>
        </div>

        <div className="dash-table-wrapper">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <>{[...Array(3)].map((_, i) => <SkeletonRow key={i} />)}</>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan="6" className="dash-empty">
                    No invoices yet — create your first one!
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => {
                  const customer = inv.customer?.customer_name || inv.customer_name || '—';
                  const date = inv.date_issued
                    ? new Date(inv.date_issued).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : '—';
                  return (
                    <tr key={inv.id} className="dash-row">
                      <td className="dash-inv-num">INV-{String(inv.id).padStart(6, '0')}</td>
                      <td className="dash-customer">{customer}</td>
                      <td className="dash-date">{date}</td>
                      <td className="dash-amount">{fmt(inv.invoice_total)}</td>
                      <td><StatusBadge status={inv.invoice_status} /></td>
                      <td>
                        <button
                          className="dash-view-btn"
                          onClick={() => navigate(`/invoice/${inv.id}`)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
