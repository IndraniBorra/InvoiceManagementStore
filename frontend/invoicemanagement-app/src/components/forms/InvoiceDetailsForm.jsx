import React from 'react';
import Input from '../ui/Input';
import Select from '../ui/Select';

const PAYMENT_TERMS = [
  'Due end of the month',
  'Net 15',
  'Net 30',
  'Net 45',
  'Net 60',
  'Due on Receipt',
  'Due end of next month',
  'Custom'
];

const InvoiceDetailsForm = ({
  formData,
  onFieldChange,
  errors = {},
  disabled = false
}) => {
  return (
    <div className="invoice-details-form">
      <h3>Invoice Details</h3>
      
      <Input
        label="Issue Date"
        required
        type="date"
        value={formData.date_issued}
        onChange={(e) => onFieldChange('date_issued', e.target.value)}
        error={errors.date_issued}
        disabled={disabled}
      />
      
      <Select
        label="Payment Terms"
        required
        value={formData.invoice_terms}
        onChange={(e) => onFieldChange('invoice_terms', e.target.value)}
        error={errors.invoice_terms}
        disabled={disabled}
        placeholder="Select payment terms"
      >
        {PAYMENT_TERMS.map(term => (
          <option key={term} value={term}>
            {term}
          </option>
        ))}
      </Select>
      
      <Input
        label="Due Date"
        type="date"
        value={formData.invoice_due_date}
        disabled={true}
        helpText="Automatically calculated based on issue date and payment terms"
      />
      
      <div className="invoice-status-info">
        <p className="text-sm">
          <strong>Status:</strong> {formData.invoice_status || 'Draft'}
        </p>
      </div>
    </div>
  );
};

export default InvoiceDetailsForm;