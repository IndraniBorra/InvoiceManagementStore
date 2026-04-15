import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../services/api';
import '../styles/components/AccountingPage.css';

// Load Plaid script and open Link directly — avoids react-plaid-link hook/CDN issues
function openPlaidLinkDirect(token, onSuccess, onExit) {
  const PLAID_SCRIPT = '/plaid-link-initialize.js';

  function init() {
    const handler = window.Plaid.create({
      token,
      onSuccess: (public_token, metadata) => onSuccess(public_token, metadata),
      onExit: (err) => { if (onExit) onExit(err); },
      onEvent: () => {},
    });
    handler.open();
  }

  if (window.Plaid) {
    init();
  } else {
    const existing = document.querySelector(`script[src="${PLAID_SCRIPT}"]`);
    if (!existing) {
      const script = document.createElement('script');
      script.src = PLAID_SCRIPT;
      script.async = true;
      script.onload = init;
      script.onerror = () => alert('Failed to load Plaid script. Check network/CORS.');
      document.head.appendChild(script);
    } else {
      existing.addEventListener('load', init);
    }
  }
}

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0);

const TYPE_BADGE = ({ type }) => (
  <span className={`acct-badge acct-badge--${type}`}>{type}</span>
);

const TABS = ['Journal', 'Chart of Accounts', 'Trial Balance', 'Bank Statement', 'Rules'];

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

  // Plaid state
  const [plaidAccounts, setPlaidAccounts] = useState([]);
  const [fetchingPlaid, setFetchingPlaid] = useState(null); // bank_account_id being fetched
  const [manualUploadOpen, setManualUploadOpen] = useState(true);
  const [activeBankAccountId, setActiveBankAccountId] = useState(null);

  // Category rules state
  const [rules, setRules] = useState([]);
  const [showAddRule, setShowAddRule] = useState(false);
  const [editingRule, setEditingRule] = useState(null); // rule object being edited
  const [ruleForm, setRuleForm] = useState({
    name: '', match_type: 'contains', match_value: '',
    debit_account: '5000', credit_account: '1000',
    category_label: '', priority: 100,
  });

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
      const res = await apiClient.post('/accounting/bank-statement', form, { timeout: 90000 });
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

  const loadPlaidAccounts = useCallback(async () => {
    try {
      const res = await apiClient.get('/plaid/accounts');
      setPlaidAccounts(res.data);
    } catch (e) {
      console.error('Could not load Plaid accounts:', e);
    }
  }, []);

  useEffect(() => { loadPlaidAccounts(); }, [loadPlaidAccounts]);

  const loadRules = useCallback(async () => {
    try {
      const res = await apiClient.get('/accounting/category-rules');
      setRules(res.data);
    } catch (e) {
      console.error('Could not load rules:', e);
    }
  }, []);

  useEffect(() => { loadRules(); }, [loadRules]);

  const saveRule = async () => {
    try {
      if (editingRule) {
        await apiClient.put(`/accounting/category-rules/${editingRule.id}`, ruleForm);
      } else {
        await apiClient.post('/accounting/category-rules', ruleForm);
      }
      await loadRules();
      setShowAddRule(false);
      setEditingRule(null);
      setRuleForm({ name: '', match_type: 'contains', match_value: '', debit_account: '5000', credit_account: '1000', category_label: '', priority: 100 });
    } catch (e) {
      alert('Failed to save rule: ' + (e.response?.data?.detail || e.message));
    }
  };

  const deleteRule = async (id) => {
    if (!window.confirm('Delete this rule?')) return;
    try {
      await apiClient.delete(`/accounting/category-rules/${id}`);
      await loadRules();
    } catch (e) {
      alert('Failed to delete rule: ' + (e.response?.data?.detail || e.message));
    }
  };

  const startEditRule = (rule) => {
    setEditingRule(rule);
    setRuleForm({
      name: rule.name, match_type: rule.match_type, match_value: rule.match_value,
      debit_account: rule.debit_account, credit_account: rule.credit_account,
      category_label: rule.category_label || '', priority: rule.priority,
    });
    setShowAddRule(true);
  };

  const openPlaidLink = async () => {
    try {
      const res = await apiClient.post('/plaid/link-token');
      const token = res.data.link_token;
      openPlaidLinkDirect(token, onPlaidSuccess, () => {});
    } catch (e) {
      alert('Could not start Plaid Link: ' + (e.response?.data?.detail || e.message));
    }
  };

  const onPlaidSuccess = useCallback(async (publicToken, metadata) => {
    try {
      const institution = metadata?.institution?.name || 'Bank';
      const account = metadata?.accounts?.[0] || {};
      await apiClient.post('/plaid/exchange-token', {
        public_token: publicToken,
        institution_name: institution,
        account_name: account.name || 'Checking',
        masked_number: account.mask ? `****${account.mask}` : null,
      });
      await loadPlaidAccounts();
      setTab(3); // Switch to Bank Statement tab to show connected account
    } catch (e) {
      alert('Failed to connect bank: ' + (e.response?.data?.detail || e.message));
    }
  }, [loadPlaidAccounts]);

  const fetchPlaidTransactions = async (bankAccountId) => {
    setFetchingPlaid(bankAccountId);
    setStatementResult(null);
    setConfirmResult(null);
    setActiveBankAccountId(bankAccountId);
    try {
      const res = await apiClient.get(`/plaid/transactions?bank_account_id=${bankAccountId}&days=30`);
      setStatementResult(res.data);
    } catch (e) {
      alert('Failed to fetch transactions: ' + (e.response?.data?.detail || e.message));
    } finally {
      setFetchingPlaid(null);
    }
  };

  const handleConfirm = async () => {
    if (!statementResult) return;
    setConfirming(true);
    try {
      const res = await apiClient.post('/accounting/bank-statement/confirm', {
        transactions: statementResult.transactions,
        bank_account_id: activeBankAccountId || null,
      });
      setConfirmResult(res.data);
      setStatementResult(null);
      setActiveBankAccountId(null);
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
        <div>
          {/* ── Section A: Connected Bank Accounts ──────────────────────── */}
          <div className="acct-card" style={{ marginBottom: '1rem' }}>
            <div className="acct-plaid-header">
              <h3 className="acct-plaid-title">Connected Bank Accounts</h3>
              <button className="acct-plaid-connect-btn" onClick={openPlaidLink}>
                + Connect New Bank Account
              </button>
            </div>

            {plaidAccounts.length === 0 ? (
              <p className="acct-plaid-empty">
                No bank accounts connected yet. Click "Connect New Bank Account" to link your bank via Plaid.
              </p>
            ) : (
              <div className="acct-plaid-accounts">
                {plaidAccounts.map((acct) => (
                  <div key={acct.id} className="acct-plaid-account-card">
                    <div className="acct-plaid-account-info">
                      <span className="acct-plaid-institution">{acct.institution_name}</span>
                      <span className="acct-plaid-account-name">{acct.account_name} {acct.masked_number || ''}</span>
                      <span className="acct-plaid-gl-badge">GL {acct.gl_account_code}</span>
                    </div>
                    <button
                      className="acct-plaid-fetch-btn"
                      onClick={() => fetchPlaidTransactions(acct.id)}
                      disabled={fetchingPlaid === acct.id}
                    >
                      {fetchingPlaid === acct.id ? 'Fetching…' : 'Fetch Last 30 Days'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Transaction Review (Plaid or CSV) ────────────────────────── */}
          {(statementResult || confirmResult) && (
            <div className="acct-card" style={{ marginBottom: '1rem' }}>
              {confirmResult && (
                <div className="acct-bank-success">
                  ✓ {confirmResult.message} — switch to the Journal tab to see them.
                  <button className="acct-bank-reset" onClick={() => { setConfirmResult(null); setActiveBankAccountId(null); }}>
                    Done
                  </button>
                </div>
              )}

              {statementResult && (
                <>
                  <div className="acct-bank-meta">
                    <span>{statementResult.count} transactions classified</span>
                    <span className="acct-bank-credits">+{fmt(statementResult.total_credits)} in</span>
                    <span className="acct-bank-debits">−{fmt(statementResult.total_debits)} out</span>
                    {activeBankAccountId && (() => {
                      const ba = plaidAccounts.find(a => a.id === activeBankAccountId);
                      return ba ? <span style={{ color: '#64748b' }}>· {ba.institution_name} GL {ba.gl_account_code}</span> : null;
                    })()}
                    {statementResult.rule_matched_count > 0 && (
                      <span className="acct-bank-rules-hit">⚡ {statementResult.rule_matched_count} auto-categorized by rules</span>
                    )}
                  </div>
                  <table className="acct-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Debit Acct</th>
                        <th>Credit Acct</th>
                        <th className="num">Amount</th>
                        <th>Source</th>
                        <th>Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statementResult.transactions.map((t, i) => {
                        const glCode = statementResult.gl_account_code || '1000';
                        const isIn = t.debit_account === glCode;
                        return (
                        <tr key={i} className={`${isIn ? 'acct-bank-row--in' : 'acct-bank-row--out'}${(t.confidence ?? 1.0) < 0.95 ? ' acct-bank-row--flagged' : ''}`}>
                          <td>{t.date}</td>
                          <td title={t.journal_description}>{t.description || t.journal_description}</td>
                          <td style={{ fontFamily: 'monospace' }}>{t.debit_account}</td>
                          <td style={{ fontFamily: 'monospace' }}>{t.credit_account}</td>
                          <td className="num" style={{ fontWeight: 600 }}>
                            {isIn ? '+' : '−'}{fmt(Math.abs(t.amount))}
                          </td>
                          <td>
                            {t.rule_matched
                              ? <span className="acct-badge-rule" title={`Rule: ${t.rule_matched}`}>⚡ {t.rule_matched}</span>
                              : <span className="acct-badge-claude">✦ Claude AI</span>}
                          </td>
                          <td>
                            {(() => {
                              const conf = t.confidence ?? 1.0;
                              const pct = Math.round(conf * 100);
                              if (conf >= 0.95) return <span className="acct-conf acct-conf--high">✓ {pct}%</span>;
                              return <span className="acct-conf acct-conf--low">⚠ {pct}%</span>;
                            })()}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="acct-bank-actions">
                    <button className="acct-bank-cancel" onClick={() => { setStatementResult(null); setActiveBankAccountId(null); }}>Cancel</button>
                    <button className="acct-bank-confirm" onClick={handleConfirm} disabled={confirming}>
                      {confirming ? 'Posting…' : `Confirm & Post All ${statementResult.count} Entries`}
                    </button>
                  </div>
                  {statementResult.flagged_count > 0 && (
                    <p className="acct-bank-flagged-note">
                      ⚠ {statementResult.flagged_count} transaction(s) flagged (confidence &lt; 95%) — they will be skipped until you review them.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Section B: Manual Upload (collapsed by default) ──────────── */}
          <div className="acct-card">
            <button
              className="acct-plaid-manual-toggle"
              onClick={() => setManualUploadOpen((o) => !o)}
            >
              {manualUploadOpen ? '▾' : '▸'} Manual Upload (CSV / PDF)
            </button>

            {manualUploadOpen && (
              <>
                {!statementResult && (
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
              </>
            )}
          </div>
        </div>
      )}

      {/* Rules Tab */}
      {tab === 4 && (
        <div>
          <div className="acct-rules-header">
            <div>
              <h3 className="acct-rules-title">Expense Categorization Rules</h3>
              <p className="acct-rules-subtitle">Rules run before Claude — matched transactions are auto-categorized with 100% confidence.</p>
            </div>
            <button className="acct-plaid-connect-btn" onClick={() => { setShowAddRule(true); setEditingRule(null); setRuleForm({ name: '', match_type: 'contains', match_value: '', debit_account: '5000', credit_account: '1000', category_label: '', priority: 100 }); }}>
              + Add Rule
            </button>
          </div>

          {/* Add/Edit form */}
          {showAddRule && (
            <div className="acct-rule-form-card">
              <h4 className="acct-rule-form-title">{editingRule ? 'Edit Rule' : 'New Rule'}</h4>
              <div className="acct-rule-form-grid">
                <div className="acct-rule-field">
                  <label>Rule Name</label>
                  <input value={ruleForm.name} onChange={e => setRuleForm(f => ({...f, name: e.target.value}))} placeholder="e.g. AWS Cloud" />
                </div>
                <div className="acct-rule-field">
                  <label>Category Label</label>
                  <input value={ruleForm.category_label} onChange={e => setRuleForm(f => ({...f, category_label: e.target.value}))} placeholder="e.g. Software & Cloud" />
                </div>
                <div className="acct-rule-field">
                  <label>Match Type</label>
                  <select value={ruleForm.match_type} onChange={e => setRuleForm(f => ({...f, match_type: e.target.value}))}>
                    <option value="contains">Contains</option>
                    <option value="starts_with">Starts With</option>
                    <option value="exact">Exact Match</option>
                    <option value="regex">Regex</option>
                  </select>
                </div>
                <div className="acct-rule-field">
                  <label>Match Value (case-insensitive)</label>
                  <input value={ruleForm.match_value} onChange={e => setRuleForm(f => ({...f, match_value: e.target.value}))} placeholder='e.g. "AWS" or "UBER"' />
                </div>
                <div className="acct-rule-field">
                  <label>Debit Account (GL Code)</label>
                  <select value={ruleForm.debit_account} onChange={e => setRuleForm(f => ({...f, debit_account: e.target.value}))}>
                    {accounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
                  </select>
                </div>
                <div className="acct-rule-field">
                  <label>Credit Account (GL Code)</label>
                  <select value={ruleForm.credit_account} onChange={e => setRuleForm(f => ({...f, credit_account: e.target.value}))}>
                    {accounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
                  </select>
                </div>
                <div className="acct-rule-field">
                  <label>Priority (lower = checked first)</label>
                  <input type="number" value={ruleForm.priority} onChange={e => setRuleForm(f => ({...f, priority: parseInt(e.target.value) || 100}))} />
                </div>
              </div>
              <div className="acct-rule-form-actions">
                <button className="acct-bank-cancel" onClick={() => { setShowAddRule(false); setEditingRule(null); }}>Cancel</button>
                <button className="acct-bank-confirm" onClick={saveRule} disabled={!ruleForm.name || !ruleForm.match_value}>
                  {editingRule ? 'Save Changes' : 'Create Rule'}
                </button>
              </div>
            </div>
          )}

          {/* Rules table */}
          <div className="acct-card">
            <table className="acct-table">
              <thead>
                <tr>
                  <th style={{width: '50px'}}>Priority</th>
                  <th>Rule Name</th>
                  <th>Match</th>
                  <th>GL Entry</th>
                  <th>Category</th>
                  <th style={{width: '80px'}}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.length === 0 ? (
                  <tr><td colSpan="6" className="acct-empty">No rules yet. Click "+ Add Rule" to create one.</td></tr>
                ) : (
                  rules.map(rule => (
                    <tr key={rule.id}>
                      <td style={{ textAlign: 'center', color: '#64748b', fontSize: '0.8125rem' }}>{rule.priority}</td>
                      <td style={{ fontWeight: 600 }}>{rule.name}</td>
                      <td style={{ color: '#475569', fontSize: '0.85rem' }}>
                        <span style={{ background: '#f1f5f9', padding: '0.15rem 0.5rem', borderRadius: '4px', fontFamily: 'monospace' }}>{rule.match_type}</span>
                        {' '}&quot;{rule.match_value}&quot;
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        DR {rule.debit_account} → CR {rule.credit_account}
                      </td>
                      <td>
                        {rule.category_label && <span className="acct-badge-rule">{rule.category_label}</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="acct-rule-action-btn" onClick={() => startEditRule(rule)} title="Edit">✏️</button>
                          <button className="acct-rule-action-btn acct-rule-action-btn--delete" onClick={() => deleteRule(rule.id)} title="Delete">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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
