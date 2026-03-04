import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useInvoice } from '../context/InvoiceContext';
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
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  
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

    return () => {
      // Cleanup on unmount
      clearError();
    };
  }, [id, isEditing, loadInvoice, resetCurrentInvoice, clearError]);

  // Handle AI-populated data from LLM Assistant
  useEffect(() => {
    if (!isEditing && location.state?.llmData && !aiPopulated) {
      const llmData = location.state.llmData;
      const today = new Date().toISOString().split('T')[0];

      // Build full invoice state atomically — avoids resetCurrentInvoice wiping customer fields
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

  // Handle field changes
  const handleFieldChange = (field, value) => {
    updateInvoiceField(field, value);
  };

  // Handle line item changes
  const handleLineItemChange = (index, field, value) => {
    updateLineItem(index, field, value);
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    // If this is an AI-populated invoice, show confirmation dialog first
    if (aiPopulated && !isEditing) {
      setShowConfirmDialog(true);
      return;
    }

    await executeInvoiceCreation();
  };

  // Execute the actual invoice creation
  const executeInvoiceCreation = async () => {
    // Validate form
    if (!validateInvoice()) {
      alert('Please fix the validation errors before submitting.');
      return;
    }

    try {
      const savedInvoice = await saveInvoice(currentInvoice, isEditing);

      // Show success message
      const action = isEditing ? 'updated' : 'created';
      const message = aiPopulated
        ? `🤖 AI-generated invoice #${savedInvoice.id} ${action} successfully!`
        : `Invoice #${savedInvoice.id} ${action} successfully!`;

      alert(message);

      // Navigate to invoices list
      navigate('/invoices');
    } catch (error) {
      // Error is handled by context and displayed in UI
      console.error('Save error:', error);
    }
  };

  // Handle confirmation dialog
  const handleConfirmCreation = async () => {
    setShowConfirmDialog(false);
    await executeInvoiceCreation();
  };

  const handleCancelCreation = () => {
    setShowConfirmDialog(false);
  };

  // Handle cancel
  const handleCancel = () => {
    if (window.confirm('Are you sure you want to cancel? Any unsaved changes will be lost.')) {
      navigate('/invoices');
    }
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
        </div>
      </div>

      {error && (
        <div className="invoice-page-error" role="alert">
          <h3>Error</h3>
          <p>{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={clearError}
          >
            Dismiss
          </Button>
        </div>
      )}

      {showAiNotice && (
        <div className="invoice-page-ai-notice" role="alert">
          <div className="ai-notice-header">
            <span className="ai-notice-icon">🤖</span>
            <h3>AI-Populated Invoice</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAiNotice(false)}
              title="Dismiss notice"
            >
              ✕
            </Button>
          </div>
          <div className="ai-notice-content">
            <p>This invoice has been automatically populated with information extracted from your request.</p>
            <div className="ai-notice-actions">
              <span className="ai-notice-hint">
                💡 Please review all fields and use the "Create New" buttons if any customers or products need to be created first.
              </span>
            </div>
          </div>
        </div>
      )}

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

      {/* AI Invoice Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="confirmation-dialog-overlay">
          <div className="confirmation-dialog">
            <div className="confirmation-dialog-header">
              <h3>🤖 Confirm AI-Generated Invoice</h3>
            </div>
            <div className="confirmation-dialog-content">
              <p>You're about to create an invoice that was automatically populated by AI.</p>

              <div className="confirmation-summary">
                <div className="summary-section">
                  <h4>📋 Invoice Summary:</h4>
                  <ul>
                    <li><strong>Customer:</strong> {currentInvoice.customer_name || 'Not specified'}</li>
                    <li><strong>Total Amount:</strong> ${currentInvoice.invoice_total?.toFixed(2) || '0.00'}</li>
                    <li><strong>Line Items:</strong> {currentInvoice.line_items?.length || 0} item(s)</li>
                    <li><strong>Date:</strong> {currentInvoice.date_issued || 'Today'}</li>
                  </ul>
                </div>

                <div className="confirmation-checklist">
                  <h4>✅ Please confirm you have:</h4>
                  <ul>
                    <li>Reviewed all customer information for accuracy</li>
                    <li>Verified product descriptions and prices</li>
                    <li>Checked quantities and calculations</li>
                    <li>Created any missing customers or products</li>
                  </ul>
                </div>
              </div>

              <div className="confirmation-actions">
                <Button
                  variant="secondary"
                  onClick={handleCancelCreation}
                >
                  ← Review More
                </Button>
                <Button
                  variant="primary"
                  onClick={handleConfirmCreation}
                  disabled={saving}
                >
                  {saving ? 'Creating...' : '✅ Create Invoice'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoicePage;