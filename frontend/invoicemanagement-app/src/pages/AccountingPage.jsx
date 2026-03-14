import React, { useEffect, useRef, useState } from 'react';
import { apiClient } from '../services/api';
import '../styles/components/AccountingPage.css';

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0);

const TYPE_BADGE = ({ type }) => (
  <span className={`acct-badge acct-badge--${type}`}>{type}</span>
);

const TABS = ['Journal', 'Chart of Accounts', 'Trial Balance', 'Bank Statement'];

const AccountingPage = () => {
  const [tab, setTab] = useState(0);
  const [summary, setSummary] = useState(null);
  const [journal, setJournal] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [trialBalance, setTrialBalance] = useState(null);
  const [expandedEntry, setExpandedEntry] = useState(null);
  const [entryLines, setEntryLines] = useState({});
  const [loading, setLoading] = useState(true);

  // Journal filter
  const [journalFilter, setJournalFilter] = useState('all');

  // Bank statement state
  const [uploadingStatement, setUploadingStatement] = useState(false);
  const [statementResult, setStatementResult] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const statementInputRef = useRef(null);

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

  const uploadStatement = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'csv' && ext !== 'pdf') {
      alert('Only CSV and PDF files are supported');
      return;
    }
    setUploadingStatement(true);
    setStatementResult(null);
    setConfirmResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiClient.post('/accounting/bank-statement', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setStatementResult(res.data);
    } catch (e) {
      alert('Upload failed: ' + (e.response?.data?.detail || e.message));
    } finally {
      setUploadingStatement(false);
      if (statementInputRef.current) statementInputRef.current.value = '';
    }
  };

  const handleStatementFile = (e) => uploadStatement(e.target.files[0]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    uploadStatement(e.dataTransfer.files[0]);
  };

  const handleConfirm = async () => {
    if (!statementResult) return;
    setConfirming(true);
    try {
      const res = await apiClient.post('/accounting/bank-statement/confirm', {
        transactions: statementResult.transactions,
      });
      setConfirmResult(res.data);
      setStatementResult(null);
      // Refresh journal and summary
      const [sumRes, jRes] = await Promise.all([
        apiClient.get('/accounting/summary'),
        apiClient.get('/accounting/journal'),
      ]);
      setSummary(sumRes.data);
      setJournal(jRes.data);
    } catch (e) {
      alert('Confirm failed: ' + (e.response?.data?.detail || e.message));
    } finally {
      setConfirming(false);
    }
  };

  const refLabel = (type, id) => {
    if (!type) return '—';
    const labels = { ar_invoice: 'AR', ap_invoice: 'AP', ap_payment: 'Payment', manual: 'Manual', bank_statement: 'Bank' };
    return id ? `${labels[type] || type} #${id}` : labels[type] || type;
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
      {tab === 0 && (() => {
        const filteredJournal = journal.filter(e => {
          if (journalFilter === 'ar')     return e.reference_type === 'ar_invoice';
          if (journalFilter === 'ap')     return ['ap_invoice', 'ap_payment'].includes(e.reference_type);
          if (journalFilter === 'bank')   return e.reference_type === 'bank_statement';
          if (journalFilter === 'manual') return e.reference_type === 'manual';
          return true;
        });
        const countFor = (f) => {
          if (f === 'all')    return journal.length;
          if (f === 'ar')     return journal.filter(e => e.reference_type === 'ar_invoice').length;
          if (f === 'ap')     return journal.filter(e => ['ap_invoice','ap_payment'].includes(e.reference_type)).length;
          if (f === 'bank')   return journal.filter(e => e.reference_type === 'bank_statement').length;
          if (f === 'manual') return journal.filter(e => e.reference_type === 'manual').length;
          return 0;
        };
        return (
          <>
            <div className="acct-journal-filters">
              {[
                { key: 'all',    label: 'All' },
                { key: 'ar',     label: 'AR Invoices' },
                { key: 'ap',     label: 'AP / Payments' },
                { key: 'bank',   label: 'Bank' },
                { key: 'manual', label: 'Manual' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  className={`acct-journal-pill${journalFilter === key ? ' active' : ''}`}
                  onClick={() => setJournalFilter(key)}
                >
                  {label} <span className="acct-journal-pill-count">{countFor(key)}</span>
                </button>
              ))}
            </div>
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
              ) : filteredJournal.length === 0 ? (
                <tr><td colSpan="5" className="acct-empty">{journalFilter === 'all' ? 'No journal entries yet.' : `No ${journalFilter.toUpperCase()} entries found.`}</td></tr>
              ) : (
                filteredJournal.map((entry) => (
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
        </>
        );
      })()}

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

      {/* Bank Statement Tab */}
      {tab === 3 && (
        <div className="acct-card">
          {/* Success message */}
          {confirmResult && (
            <div className="acct-bank-success">
              ✓ {confirmResult.message} — switch to the Journal tab to see them.
              <button className="acct-bank-reset" onClick={() => setConfirmResult(null)}>Upload Another</button>
            </div>
          )}

          {/* Upload zone — shown when no result yet */}
          {!statementResult && !confirmResult && (
            <label
              className={`acct-bank-dropzone${dragOver ? ' drag-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <input
                ref={statementInputRef}
                type="file"
                accept=".csv,.pdf"
                style={{ display: 'none' }}
                disabled={uploadingStatement}
                onChange={handleStatementFile}
              />
              {uploadingStatement ? (
                <>
                  <span className="acct-bank-icon">⏳</span>
                  <p className="acct-bank-label">Claude is classifying transactions…</p>
                </>
              ) : (
                <>
                  <span className="acct-bank-icon">📄</span>
                  <p className="acct-bank-label">Drop a bank statement here or <u>browse</u></p>
                  <p className="acct-bank-sub">Supports CSV and PDF · Columns: Date, Description, Amount</p>
                </>
              )}
            </label>
          )}

          {/* Review table — shown after classification */}
          {statementResult && (
            <>
              <div className="acct-bank-meta">
                <span>{statementResult.count} transactions classified</span>
                <span className="acct-bank-credits">+{fmt(statementResult.total_credits)} in</span>
                <span className="acct-bank-debits">−{fmt(statementResult.total_debits)} out</span>
              </div>
              <table className="acct-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Debit Acct</th>
                    <th>Credit Acct</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {statementResult.transactions.map((t, i) => (
                    <tr key={i} className={t.amount >= 0 ? 'acct-bank-row--in' : 'acct-bank-row--out'}>
                      <td>{t.date}</td>
                      <td>{t.journal_description || t.description}</td>
                      <td style={{ fontFamily: 'monospace' }}>{t.debit_account}</td>
                      <td style={{ fontFamily: 'monospace' }}>{t.credit_account}</td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        {t.amount >= 0 ? '+' : '−'}{fmt(Math.abs(t.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="acct-bank-actions">
                <button className="acct-bank-cancel" onClick={() => setStatementResult(null)}>Cancel</button>
                <button className="acct-bank-confirm" onClick={handleConfirm} disabled={confirming}>
                  {confirming ? 'Posting…' : `Confirm & Post All ${statementResult.count} Entries`}
                </button>
              </div>
            </>
          )}
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
