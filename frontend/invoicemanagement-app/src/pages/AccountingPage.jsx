import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/api';
import '../styles/components/AccountingPage.css';

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0);

const TYPE_BADGE = ({ type }) => (
  <span className={`acct-badge acct-badge--${type}`}>{type}</span>
);

const TABS = ['Journal', 'Chart of Accounts', 'Trial Balance'];

const AccountingPage = () => {
  const [tab, setTab] = useState(0);
  const [summary, setSummary] = useState(null);
  const [journal, setJournal] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [trialBalance, setTrialBalance] = useState(null);
  const [expandedEntry, setExpandedEntry] = useState(null);
  const [entryLines, setEntryLines] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [sumRes, jRes, aRes, tbRes] = await Promise.all([
          apiClient.get('/accounting/summary'),
          apiClient.get('/accounting/journal'),
          apiClient.get('/accounting/accounts'),
          apiClient.get('/accounting/trial-balance'),
        ]);
        setSummary(sumRes.data);
        setJournal(jRes.data);
        setAccounts(aRes.data);
        setTrialBalance(tbRes.data);
      } catch (e) {
        console.error('Accounting load error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const toggleEntry = async (id) => {
    if (expandedEntry === id) {
      setExpandedEntry(null);
      return;
    }
    setExpandedEntry(id);
    if (!entryLines[id]) {
      try {
        const res = await apiClient.get(`/accounting/journal/${id}`);
        setEntryLines((prev) => ({ ...prev, [id]: res.data.lines }));
      } catch (e) {
        console.error(e);
      }
    }
  };

  const refLabel = (type, id) => {
    if (!type) return '—';
    const labels = { ar_invoice: 'AR', ap_invoice: 'AP', ap_payment: 'Payment', manual: 'Manual' };
    return `${labels[type] || type} #${id}`;
  };

  return (
    <div className="acct-page">
      <div className="acct-page-header">
        <h1 className="acct-page-title">Accounting Ledger</h1>
        <p className="acct-page-subtitle">Double-entry journal, chart of accounts, and trial balance</p>
      </div>

      {/* Summary KPIs */}
      <div className="acct-summary-grid">
        {[
          { label: 'Revenue',             value: summary?.revenue,            cls: 'positive' },
          { label: 'Expenses (COGS)',      value: summary?.expenses,           cls: '' },
          { label: 'Net Income',           value: summary?.net_income,         cls: summary?.net_income >= 0 ? 'positive' : 'negative' },
          { label: 'Cash Balance',         value: summary?.cash_balance,       cls: '' },
          { label: 'Accounts Receivable',  value: summary?.accounts_receivable, cls: '' },
          { label: 'Accounts Payable',     value: summary?.accounts_payable,   cls: '' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="acct-kpi">
            <p className="acct-kpi-label">{label}</p>
            <p className={`acct-kpi-value ${cls}`}>{loading ? '—' : fmt(value)}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="acct-tabs">
        {TABS.map((t, i) => (
          <button key={t} className={`acct-tab${tab === i ? ' active' : ''}`} onClick={() => setTab(i)}>
            {t}
          </button>
        ))}
      </div>

      {/* Journal Tab */}
      {tab === 0 && (
        <div className="acct-card">
          <table className="acct-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Reference</th>
                <th className="num">Debit</th>
                <th className="num">Credit</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(5)].map((__, j) => (
                      <td key={j}><div className="acct-skeleton" /></td>
                    ))}
                  </tr>
                ))
              ) : journal.length === 0 ? (
                <tr><td colSpan="5" className="acct-empty">No journal entries yet. They appear automatically when invoices change status.</td></tr>
              ) : (
                journal.map((entry) => (
                  <React.Fragment key={entry.id}>
                    <tr className="expandable" onClick={() => toggleEntry(entry.id)}>
                      <td>{entry.entry_date}</td>
                      <td>{entry.description}</td>
                      <td style={{ color: '#64748b', fontSize: '0.8125rem' }}>
                        {refLabel(entry.reference_type, entry.reference_id)}
                      </td>
                      <td className="num">{fmt(entry.total_debit)}</td>
                      <td className="num">{fmt(entry.total_credit)}</td>
                    </tr>
                    {expandedEntry === entry.id && (entryLines[entry.id] || []).map((line) => (
                      <tr key={line.id} className="sub-row">
                        <td></td>
                        <td>{line.account_code} · {line.account_name}</td>
                        <td style={{ color: '#94a3b8' }}>{line.description || '—'}</td>
                        <td className="num">{line.debit > 0 ? fmt(line.debit) : ''}</td>
                        <td className="num">{line.credit > 0 ? fmt(line.credit) : ''}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Chart of Accounts Tab */}
      {tab === 1 && (
        <div className="acct-card">
          <table className="acct-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Account Name</th>
                <th>Type</th>
                <th>Normal Balance</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i}>{[...Array(5)].map((__, j) => <td key={j}><div className="acct-skeleton" /></td>)}</tr>
                ))
              ) : accounts.length === 0 ? (
                <tr><td colSpan="5" className="acct-empty">No accounts found.</td></tr>
              ) : (
                accounts.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{a.code}</td>
                    <td>{a.name}</td>
                    <td><TYPE_BADGE type={a.account_type} /></td>
                    <td style={{ color: '#64748b', textTransform: 'capitalize' }}>{a.normal_balance}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{fmt(a.balance)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Trial Balance Tab */}
      {tab === 2 && (
        <>
          {trialBalance && (
            <p style={{ marginBottom: '0.75rem' }}>
              {trialBalance.balanced
                ? <span className="acct-balanced">✓ Balanced</span>
                : <span className="acct-unbalanced">✗ Unbalanced — check for missing entries</span>}
            </p>
          )}
          <div className="acct-card">
            <table className="acct-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account Name</th>
                  <th>Type</th>
                  <th className="num">Debit</th>
                  <th className="num">Credit</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(6)].map((_, i) => (
                    <tr key={i}>{[...Array(5)].map((__, j) => <td key={j}><div className="acct-skeleton" /></td>)}</tr>
                  ))
                ) : !trialBalance || trialBalance.accounts.length === 0 ? (
                  <tr><td colSpan="5" className="acct-empty">No transactions recorded yet.</td></tr>
                ) : (
                  trialBalance.accounts.map((a) => (
                    <tr key={a.code}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{a.code}</td>
                      <td>{a.name}</td>
                      <td><TYPE_BADGE type={a.account_type} /></td>
                      <td className="num">{a.debit > 0 ? fmt(a.debit) : ''}</td>
                      <td className="num">{a.credit > 0 ? fmt(a.credit) : ''}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {trialBalance && trialBalance.accounts.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan="3">Total</td>
                    <td className="num">{fmt(trialBalance.total_debit)}</td>
                    <td className="num">{fmt(trialBalance.total_credit)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default AccountingPage;
