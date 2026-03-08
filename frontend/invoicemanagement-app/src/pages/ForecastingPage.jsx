import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { apiClient } from '../services/api';
import '../styles/components/ForecastingPage.css';

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n ?? 0);

const pct = (n) => `${n >= 0 ? '+' : ''}${n?.toFixed(1)}%`;

const AGING_COLORS = ['#22c55e', '#f59e0b', '#f97316', '#ef4444', '#991b1b'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.6rem 0.9rem', fontSize: '0.8125rem' }}>
      <p style={{ fontWeight: 600, marginBottom: 4, color: '#0f172a' }}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color, margin: '2px 0' }}>
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
};

const ForecastingPage = () => {
  const [revenue, setRevenue]     = useState(null);
  const [cashflow, setCashflow]   = useState(null);
  const [aging, setAging]         = useState(null);
  const [insights, setInsights]   = useState(null);
  const [riskData, setRiskData]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [insightLoading, setInsightLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [revRes, cfRes, agRes, riskRes] = await Promise.all([
          apiClient.get('/forecasting/revenue'),
          apiClient.get('/forecasting/cashflow'),
          apiClient.get('/forecasting/aging'),
          apiClient.get('/forecasting/risk-all'),
        ]);
        setRevenue(revRes.data);
        setCashflow(cfRes.data);
        setAging(agRes.data);
        setRiskData(riskRes.data);
      } catch (e) {
        console.error('Forecasting load error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();

    // Load AI insights separately (slower)
    apiClient.get('/forecasting/insights')
      .then((r) => setInsights(r.data))
      .catch(console.error)
      .finally(() => setInsightLoading(false));
  }, []);

  // Merge actual + projected for the revenue chart
  const revenueChartData = revenue
    ? [
        ...revenue.actual.map((d) => ({ month: d.month, Actual: d.revenue })),
        ...revenue.projected.map((d) => ({ month: d.month, Projected: d.revenue })),
      ]
    : [];

  // Cash flow chart data
  const cashflowChartData = cashflow
    ? [
        ...cashflow.actual.map((d) => ({ month: d.month, 'Cash In': d.cash_in, 'Cash Out': d.cash_out, Net: d.net })),
        ...cashflow.projected.map((d) => ({ month: d.month, 'Cash In': d.cash_in, 'Cash Out': d.cash_out, Net: d.net, projected: true })),
      ]
    : [];

  const maxAging = aging ? Math.max(...aging.buckets.map((b) => b.amount), 1) : 1;

  const growthPct = insights?.metrics?.growth_pct ?? 0;

  return (
    <div className="forecast-page">
      <div className="forecast-header">
        <h1 className="forecast-title">Forecasting & Insights</h1>
        <p className="forecast-subtitle">Revenue projections, cash flow, AR aging, and AI-powered analysis</p>
      </div>

      {/* KPI Cards */}
      <div className="forecast-kpi-grid">
        {[
          { label: 'Next Month (Est.)',    value: fmt(revenue?.summary?.next_month_estimate),   color: '#3b82f6', cls: '' },
          { label: '3-Month Projection',  value: fmt(revenue?.summary?.['3m_projected_total']), color: '#8b5cf6', cls: '' },
          { label: 'Avg Monthly Revenue', value: fmt(revenue?.summary?.avg_monthly_revenue),    color: '#06b6d4', cls: '' },
          { label: 'Revenue Growth (QoQ)',value: loading ? '—' : pct(growthPct),               color: growthPct >= 0 ? '#16a34a' : '#dc2626', cls: growthPct >= 0 ? 'up' : 'down' },
          { label: 'Total Outstanding AR',value: fmt(aging?.total_outstanding),                 color: '#f59e0b', cls: '' },
          { label: 'Overdue AR',          value: fmt(insights?.metrics?.total_overdue),         color: '#ef4444', cls: 'down' },
        ].map(({ label, value, color, cls }) => (
          <div key={label} className="forecast-kpi" style={{ '--kpi-color': color }}>
            <p className="forecast-kpi-label">{label}</p>
            <p className={`forecast-kpi-value ${cls}`}>{loading && !value ? '—' : (value ?? '—')}</p>
          </div>
        ))}
      </div>

      {/* AI Insights */}
      <div className="forecast-insights">
        <div className="forecast-insights-header">
          <span>✦</span> AI Analysis
        </div>
        {insightLoading ? (
          <div className="forecast-insights-loading">
            <span>Generating insights...</span>
          </div>
        ) : (
          <p className="forecast-insights-text">{insights?.insights ?? 'No insights available.'}</p>
        )}
      </div>

      {/* Revenue + Cash Flow charts */}
      <div className="forecast-grid">
        {/* Revenue Chart */}
        <div className="forecast-card">
          <p className="forecast-card-title">Revenue — 12 months actual + 3 month forecast</p>
          <div className="forecast-legend">
            <span className="forecast-legend-item"><span className="forecast-legend-dot" style={{ background: '#3b82f6' }} />Actual</span>
            <span className="forecast-legend-item"><span className="forecast-legend-dot" style={{ background: '#a78bfa', border: '2px dashed #a78bfa', background: 'transparent' }} />Projected</span>
          </div>
          {loading ? (
            [...Array(4)].map((_, i) => <div key={i} className="fc-skeleton" style={{ width: `${70 + i * 8}%` }} />)
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={revenueChartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Actual" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Line dataKey="Projected" stroke="#a78bfa" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 4, fill: '#a78bfa' }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Cash Flow Chart */}
        <div className="forecast-card">
          <p className="forecast-card-title">Cash Flow — money in vs money out</p>
          <div className="forecast-legend">
            <span className="forecast-legend-item"><span className="forecast-legend-dot" style={{ background: '#22c55e' }} />Cash In</span>
            <span className="forecast-legend-item"><span className="forecast-legend-dot" style={{ background: '#f87171' }} />Cash Out</span>
            <span className="forecast-legend-item"><span className="forecast-legend-dot" style={{ background: '#94a3b8' }} />Net</span>
          </div>
          {loading ? (
            [...Array(4)].map((_, i) => <div key={i} className="fc-skeleton" style={{ width: `${70 + i * 8}%` }} />)
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={cashflowChartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Cash In"  fill="#22c55e" radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Bar dataKey="Cash Out" fill="#f87171" radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Line dataKey="Net" stroke="#94a3b8" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Late Payment Risk — XGBoost */}
      <div className="forecast-card" style={{ marginBottom: '1.25rem' }}>
        <p className="forecast-card-title">
          Late Payment Risk — XGBoost Model
          {riskData && (
            <span style={{ float: 'right', fontSize: '0.75rem', fontWeight: 400, color: '#64748b' }}>
              {riskData.high_risk_count} high · {riskData.medium_risk_count} medium · {riskData.low_risk_count} low
            </span>
          )}
        </p>
        {loading ? (
          [...Array(5)].map((_, i) => <div key={i} className="fc-skeleton" />)
        ) : !riskData || riskData.invoices.length === 0 ? (
          <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>No outstanding invoices to score.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                {['Invoice', 'Amount', 'Due Date', 'Status', 'Risk Score', 'Label'].map((h) => (
                  <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {riskData.invoices.slice(0, 10).map((r) => (
                <tr key={r.invoice_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace' }}>#{r.invoice_id}</td>
                  <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>{fmt(r.amount)}</td>
                  <td style={{ padding: '0.5rem 0.75rem', color: '#64748b' }}>{r.due_date}</td>
                  <td style={{ padding: '0.5rem 0.75rem', textTransform: 'capitalize', color: '#64748b' }}>{r.status}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 999 }}>
                        <div style={{ width: `${r.risk_score}%`, height: '100%', borderRadius: 999,
                          background: r.risk_color === 'green' ? '#22c55e' : r.risk_color === 'orange' ? '#f59e0b' : '#ef4444' }} />
                      </div>
                      <span style={{ fontWeight: 600, minWidth: 28 }}>{r.risk_score}</span>
                    </div>
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <span style={{
                      padding: '0.15rem 0.5rem', borderRadius: 9999, fontSize: '0.7rem', fontWeight: 600,
                      background: r.risk_color === 'green' ? '#dcfce7' : r.risk_color === 'orange' ? '#fff7ed' : '#fee2e2',
                      color: r.risk_color === 'green' ? '#15803d' : r.risk_color === 'orange' ? '#c2410c' : '#b91c1c',
                    }}>{r.risk_label}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* AR Aging */}
      <div className="forecast-card">
        <p className="forecast-card-title">AR Aging — outstanding receivables by age</p>
        {loading ? (
          [...Array(5)].map((_, i) => <div key={i} className="fc-skeleton" />)
        ) : (
          <>
            {aging?.buckets.map((b, i) => (
              <div key={b.key} className="aging-bar-row">
                <span className="aging-bar-label">{b.label}</span>
                <div className="aging-bar-track">
                  <div
                    className="aging-bar-fill"
                    style={{
                      width: `${maxAging > 0 ? (b.amount / maxAging) * 100 : 0}%`,
                      background: AGING_COLORS[i],
                    }}
                  />
                </div>
                <span className="aging-bar-amount">{fmt(b.amount)}</span>
                <span className="aging-bar-count">{b.count} inv</span>
              </div>
            ))}
            <p style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.75rem', marginBottom: 0 }}>
              Total outstanding: <strong>{fmt(aging?.total_outstanding)}</strong> across <strong>{aging?.total_invoices}</strong> invoices
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default ForecastingPage;
