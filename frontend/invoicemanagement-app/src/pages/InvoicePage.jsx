import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useInvoice } from '../context/InvoiceContext';
import CustomerForm from '../components/forms/CustomerForm';
import InvoiceDetailsForm from '../components/forms/InvoiceDetailsForm';
import LineItemsTable from '../components/tables/LineItemsTable';
import Button from '../components/ui/Button';
import '../styles/components/InvoicePage.css';

const InvoicePage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);
  
  const {
    currentInvoice,
    validationErrors,
    loading,
    saving,
    error,
    
    // Actions
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
    
    // Validate form
    if (!validateInvoice()) {
      alert('Please fix the validation errors before submitting.');
      return;
    }

    try {
      const savedInvoice = await saveInvoice(currentInvoice, isEditing);
      
      // Show success message
      const action = isEditing ? 'updated' : 'created';
      alert(`Invoice #${savedInvoice.id} ${action} successfully!`);
      
      // Navigate to invoices list
      navigate('/invoices');
    } catch (error) {
      // Error is handled by context and displayed in UI
      console.error('Save error:', error);
    }
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