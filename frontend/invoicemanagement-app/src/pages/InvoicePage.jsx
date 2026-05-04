import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useInvoice } from '../context/InvoiceContext';
import { apiClient } from '../services/api';
import CustomerForm from '../components/forms/CustomerForm';
import InvoiceDetailsForm from '../components/forms/InvoiceDetailsForm';
import LineItemsTable from '../components/tables/LineItemsTable';
import Button from '../components/ui/Button';
import '../styles/components/InvoicePage.css';

const InvoicePage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isEditing = Boolean(id);
  const [aiPopulated, setAiPopulated] = useState(false);
  const [showAiNotice, setShowAiNotice] = useState(false);
  // Tracks the location.state reference we last applied a pending item from
  // Using the state object reference as a key handles both fresh mounts AND
  // same-URL re-navigation (where the component doesn't remount but state changes)
  const appliedPendingRef = useRef(null);

  const {
    currentInvoice,
    validationErrors,
    loading,
    saving,
    error,

    // Actions
    setCurrentInvoice,
    updateInvoiceField,
    addLineItem,
    updateLineItem,
    removeLineItem,
    resetCurrentInvoice,
    loadInvoice,
    saveInvoice,
    validateInvoice,
    clearError
  } = useInvoice();

  // Load invoice data if editing
  useEffect(() => {
    if (isEditing) {
      loadInvoice(id);
    } else {
      resetCurrentInvoice();
    }
    return () => { clearError(); };
  }, [id, isEditing, loadInvoice, resetCurrentInvoice, clearError]);

  // Apply pending line item from bot navigation.
  // Watches location.state reactively — fires on both fresh mounts AND
  // same-URL re-navigations where the component doesn't unmount/remount.
  useEffect(() => {
    const pendingItem = location.state?.pendingLineItem;
    if (
      pendingItem &&
      appliedPendingRef.current !== location.state &&  // new state not yet applied
      isEditing &&
      currentInvoice.id === parseInt(id, 10)            // invoice fully loaded
    ) {
      appliedPendingRef.current = location.state;       // mark this state as applied
      const newIndex = currentInvoice.line_items.length;
      addLineItem();
      updateLineItem(newIndex, 'product_id',          pendingItem.product_id || null);
      updateLineItem(newIndex, 'product_description', pendingItem.product_description || '');
      updateLineItem(newIndex, 'lineitem_qty',         pendingItem.lineitem_qty || 1);
      updateLineItem(newIndex, 'product_price',        pendingItem.product_price || 0);
      setShowAiNotice(true);
    }
  }, [location.state, isEditing, currentInvoice.id, currentInvoice.line_items, id, addLineItem, updateLineItem]);

  // Handle AI-populated data from LLM Assistant
  useEffect(() => {
    if (!isEditing && location.state?.llmData && !aiPopulated) {
      const llmData = location.state.llmData;
      const today = new Date().toISOString().split('T')[0];

      const mappedItems = (llmData.line_items?.length > 0)
        ? llmData.line_items.map(item => ({
            product_id:          item.product_id          || null,
            product_description: item.product_description || '',
            lineitem_qty:        item.lineitem_qty         || 1,
            product_price:       item.product_price        || 0,
            line_items_total:    (item.lineitem_qty || 1) * (item.product_price || 0),
          }))
        : [{ product_id: null, product_description: '', lineitem_qty: 1, product_price: 0, line_items_total: 0 }];

      const invoiceTotal = mappedItems.reduce((sum, item) => sum + item.line_items_total, 0);

      setCurrentInvoice({
        customer_id:      llmData.customer_id      || null,
        customer_name:    llmData.customer_name    || '',
        customer_address: llmData.customer_address || '',
        customer_phone:   llmData.customer_phone   || '',
        date_issued:      llmData.date_issued       || today,
        line_items:       mappedItems,
        invoice_total:    invoiceTotal,
      });

      setAiPopulated(true);
      setShowAiNotice(true);
    }
  }, [location.state, isEditing, aiPopulated, setCurrentInvoice]);

  const handleFieldChange = (field, value) => {
    updateInvoiceField(field, value);
  };

  const handleLineItemChange = (index, field, value) => {
    updateLineItem(index, field, value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateInvoice()) {
      alert('Please fix the validation errors before submitting.');
      return;
    }

    try {
      const savedInvoice = await saveInvoice(currentInvoice, isEditing);
      const action = isEditing ? 'updated' : 'created';
      alert(`Invoice #${savedInvoice.id} ${action} successfully!`);
      navigate('/invoices');
    } catch (error) {
      console.error('Save error:', error);
    }
  };

  const handleCancel = () => {
    if (window.confirm('Are you sure you want to cancel? Any unsaved changes will be lost.')) {
      navigate('/invoices');
    }
  };

  // Status transitions — trigger auto journal entries on backend for ledger statuses
  const handleStatusChange = async (newStatus) => {
    if (!currentInvoice.id) return;
    const ledgerStatuses = { submitted: 'Finalize', paid: 'Mark as Paid' };
    const labels = { submitted: 'Finalize', paid: 'Mark as Paid', overdue: 'Mark as Overdue', cancelled: 'Cancel Invoice' };
    const label = labels[newStatus] || newStatus;
    const ledgerNote = ledgerStatuses[newStatus] ? ' This will post a journal entry to the ledger.' : '';
    if (!window.confirm(`${label} Invoice #${currentInvoice.id}?${ledgerNote}`)) return;
    try {
      await saveInvoice({ ...currentInvoice, invoice_status: newStatus }, true);
      if (ledgerStatuses[newStatus]) {
        alert(`Invoice #${currentInvoice.id} marked as ${newStatus}. Journal entry posted to ledger.`);
        navigate('/accounting');
      }
    } catch (err) {
      alert(`Failed: ${err.message}`);
    }
  };

  // Pipeline: ordered steps for the main flow
  const PIPELINE_STEPS = [
    { key: 'draft',     label: 'Draft' },
    { key: 'submitted', label: 'Submitted' },
    { key: 'overdue',   label: 'Overdue' },
    { key: 'paid',      label: 'Paid' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  const currentStatus = currentInvoice.invoice_status || 'draft';
  const currentStepIndex = PIPELINE_STEPS.findIndex(s => s.key === currentStatus);

  const StatusPipeline = () => (
    <div className="status-pipeline">
      <div className="status-pipeline-steps">
        {PIPELINE_STEPS.map((step, idx) => {
          const isDone = idx < currentStepIndex && currentStatus !== 'cancelled';
          const isCurrent = step.key === currentStatus;
          return (
            <div
              key={step.key}
              className={`status-step step-${step.key}${isDone ? ' done' : ''}${isCurrent ? ' current' : ''}`}
            >
              <div className="step-dot">{isDone ? '✓' : idx + 1}</div>
              <span className="step-label">{step.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const StatusActionBar = () => {
    const isTerminal = currentStatus === 'paid' || currentStatus === 'cancelled';
    return (
      <div className="status-action-bar">
        <span className="status-action-label">Change Status:</span>
        {isTerminal ? (
          <span className="status-locked">🔒 This invoice is {currentStatus} — no further changes</span>
        ) : (
          <>
            {currentStatus === 'draft' && (
              <button className="btn-status btn-status-green" onClick={() => handleStatusChange('submitted')} disabled={saving}>
                Finalize → Ledger
              </button>
            )}
            {(currentStatus === 'submitted' || currentStatus === 'overdue') && (
              <button className="btn-status btn-status-green" onClick={() => handleStatusChange('paid')} disabled={saving}>
                Mark as Paid → Ledger
              </button>
            )}
            {currentStatus === 'submitted' && (
              <button className="btn-status btn-status-orange" onClick={() => handleStatusChange('overdue')} disabled={saving}>
                Mark Overdue
              </button>
            )}
            <button className="btn-status btn-status-red" onClick={() => handleStatusChange('cancelled')} disabled={saving}>
              Cancel Invoice
            </button>
          </>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="invoice-page-loading">
        <div className="loading-spinner">
          <div className="spinner" />
          <p>Loading invoice...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="invoice-page">
      <div className="invoice-page-header">
        <h1>
          {isEditing ? `Edit Invoice #${id}` : 'Create New Invoice'}
        </h1>
        <div className="invoice-page-actions">
          <Button
            variant="secondary"
            onClick={handleCancel}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="invoice-form"
            loading={saving}
            disabled={loading}
          >
            {saving
              ? 'Saving...'
              : isEditing
                ? 'Update Invoice'
                : 'Create Invoice'
            }
          </Button>
          {isEditing && (
            <Button variant="secondary" onClick={() => navigate('/accounting')} disabled={saving}>
              View Ledger
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="invoice-page-error" role="alert">
          <h3>
            {error.includes('deleted') ? 'Invoice Deleted'
              : error.includes('not exist') ? 'Invoice Not Found'
              : 'Error'}
          </h3>
          <p>{error}</p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <Button variant="outline" size="sm" onClick={() => { clearError(); navigate('/invoices'); }}>
              ← Back to Invoices
            </Button>
            <Button variant="outline" size="sm" onClick={clearError}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {showAiNotice && (
        <div className="ai-prefill-notice">
          <span>🤖 Pre-filled from your request — review and click {isEditing ? 'Update Invoice' : 'Create Invoice'} when ready.</span>
          <button onClick={() => setShowAiNotice(false)}>✕</button>
        </div>
      )}

      {isEditing && <StatusPipeline />}
      {isEditing && <StatusActionBar />}

      <form id="invoice-form" onSubmit={handleSubmit} className="invoice-form">
        <div className="invoice-form-grid">
          <div className="invoice-form-section">
            <CustomerForm
              formData={currentInvoice}
              onFieldChange={handleFieldChange}
              errors={validationErrors}
              disabled={saving}
            />
          </div>

          <div className="invoice-form-section">
            <InvoiceDetailsForm
              formData={currentInvoice}
              onFieldChange={handleFieldChange}
              errors={validationErrors}
              disabled={saving}
            />
          </div>
        </div>

        <div className="invoice-form-section invoice-items-section">
          <LineItemsTable
            lineItems={currentInvoice.line_items}
            onAddItem={addLineItem}
            onUpdateItem={handleLineItemChange}
            onRemoveItem={removeLineItem}
            errors={validationErrors}
            disabled={saving}
          />
        </div>
      </form>
    </div>
  );
};

export default InvoicePage;
