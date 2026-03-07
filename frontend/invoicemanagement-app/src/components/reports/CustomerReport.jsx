import React, { useState, useEffect } from 'react';
import { reportApi } from '../../services/api';
import Button from '../ui/Button';
import AutoComplete from '../ui/AutoComplete';
import { handleApiError } from '../../services/api';
import '../../styles/components/CustomerReport.css';

const CustomerReport = () => {
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedCustomerName, setSelectedCustomerName] = useState('');
  const [customerReport, setCustomerReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);


  // Load customer report
  const loadCustomerReport = async (customerId) => {
    if (!customerId) {
      setCustomerReport(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const report = await reportApi.getCustomerReport(customerId);
      setCustomerReport(report);
    } catch (err) {
      console.error('Error loading customer report:', err);
      setError(handleApiError(err));
      setCustomerReport(null);
    } finally {
      setLoading(false);
    }
  };

  // Handle customer selection
  const handleCustomerSelect = (customer, customerId) => {
    setSelectedCustomer(customerId);
    setSelectedCustomerName(customer.customer_name);
    loadCustomerReport(customerId);
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  // Format date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Get status badge class
  const getStatusBadgeClass = (status) => {
    const statusClasses = {
      draft: 'status-draft',
      sent: 'status-sent',
      paid: 'status-paid',
      overdue: 'status-overdue',
      cancelled: 'status-cancelled'
    };
    return `status-badge ${statusClasses[status] || 'status-default'}`;
  };

  // Export functionality
  const handleExport = async (format) => {
    if (!selectedCustomer || !customerReport) {
      alert('Please select a customer first');
      return;
    }

    try {
      console.log(`Exporting customer report as ${format}...`);
      
      if (format === 'csv') {
        exportCustomerToCSV();
      } else if (format === 'excel') {
        exportCustomerToExcel();
      } else if (format === 'pdf') {
        exportCustomerToPDF();
      }
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Please try again.');
    }
  };

  // Export customer report to CSV
  const exportCustomerToCSV = () => {
    const headers = ['Invoice #', 'Date', 'Due Date', 'Amount', 'Status', 'Days to Pay'];
    const csvData = [
      `Customer Report: ${customerReport.customer.name}`,
      `Total Invoices: ${customerReport.summary.total_invoices}`,
      `Total Amount: ${formatCurrency(customerReport.summary.total_amount)}`,
      `Outstanding: ${formatCurrency(customerReport.summary.outstanding_amount)}`,
      '',
      headers.join(','),
      ...customerReport.invoices.map(invoice => [
        invoice.invoice_number,
        invoice.invoice_date,
        invoice.due_date,
        invoice.total_amount,
        invoice.status,
        invoice.days_to_pay || 'N/A'
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `customer-report-${customerReport.customer.name.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  // Export customer report to Excel
  const exportCustomerToExcel = () => {
    exportCustomerToCSV(); // Same as CSV but with .xlsx extension
  };

  // Export customer report to PDF
  const exportCustomerToPDF = () => {
    const htmlContent = `
      <html>
        <head>
          <title>Customer Report - ${customerReport.customer.name}</title>
          <style>
            body { font-family: Arial, sans-serif; }
            .header { text-align: center; margin-bottom: 20px; }
            .summary { margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>Customer Report</h2>
            <h3>${customerReport.customer.name}</h3>
            <p>${customerReport.customer.email}</p>
          </div>
          <div class="summary">
            <p><strong>Total Invoices:</strong> ${customerReport.summary.total_invoices}</p>
            <p><strong>Total Amount:</strong> ${formatCurrency(customerReport.summary.total_amount)}</p>
            <p><strong>Outstanding:</strong> ${formatCurrency(customerReport.summary.outstanding_amount)}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Due Date</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${customerReport.invoices.map(invoice => `
                <tr>
                  <td>${invoice.invoice_number}</td>
                  <td>${formatDate(invoice.invoice_date)}</td>
                  <td>${formatDate(invoice.due_date)}</td>
                  <td>${formatCurrency(invoice.total_amount)}</td>
                  <td>${invoice.status}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <p><small>Generated on ${new Date().toLocaleDateString()}</small></p>
        </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.print();
  };


  return (
    <div className="customer-report">
      <div className="report-header">
        <h2>Customer Reports</h2>
        <p>Detailed invoice and payment history by customer</p>
      </div>

      {/* Customer Selection */}
      <div className="customer-selector">
        <div className="selector-group">
          <label>Select Customer</label>
          <AutoComplete
            fetchUrl="/reports/customers/list"
            displayFields={['customer_name', 'customer_email']}
            searchFields={['customer_name', 'customer_email']}
            valueField="customer_id"
            placeholder="Choose a customer to view their report..."
            value={selectedCustomerName}
            onSelect={handleCustomerSelect}
            onInputChange={(value) => {
              if (!value) {
                setSelectedCustomer('');
                setSelectedCustomerName('');
                setCustomerReport(null);
              }
            }}
            label=""
            minCharsToSearch={0}
          />
        </div>

        {customerReport && (
          <div className="export-actions">
            <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
              📄 CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('excel')}>
              📊 Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('pdf')}>
              🖨️ PDF
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="report-error" role="alert">
          <p>{error}</p>
          <Button variant="outline" size="sm" onClick={() => loadCustomerReport(selectedCustomer)}>
            Retry
          </Button>
        </div>
      )}

      {loading ? (
        <div className="report-loading">
          <div className="spinner" />
          <p>Loading customer report...</p>
        </div>
      ) : customerReport ? (
        <div className="customer-report-content">
          {/* Customer Summary */}
          <div className="customer-summary">
            <div className="summary-header">
              <div className="customer-info">
                <h3>{customerReport.customer.name}</h3>
                <p>{customerReport.customer.email}</p>
                {customerReport.customer.phone && (
                  <p>{customerReport.customer.phone}</p>
                )}
              </div>
              <div className="customer-avatar">
                {customerReport.customer.name.charAt(0).toUpperCase()}
              </div>
            </div>

            <div className="summary-metrics">
              <div className="metric-card">
                <div className="metric-content">
                  <h4>Total Invoices</h4>
                  <p className="metric-value">{customerReport.summary.total_invoices}</p>
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-content">
                  <h4>Total Amount</h4>
                  <p className="metric-value">{formatCurrency(customerReport.summary.total_amount)}</p>
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-content">
                  <h4>Amount Paid</h4>
                  <p className="metric-value">{formatCurrency(customerReport.summary.paid_amount)}</p>
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-content">
                  <h4>Outstanding</h4>
                  <p className="metric-value outstanding">{formatCurrency(customerReport.summary.outstanding_amount)}</p>
                </div>
              </div>
            </div>

            {/* Payment Behavior */}
            <div className="payment-behavior">
              <h4>Payment Behavior</h4>
              <div className="behavior-metrics">
                <div className="behavior-item">
                  <span className="behavior-label">Average Payment Time:</span>
                  <span className="behavior-value">
                    {customerReport.payment_behavior.avg_payment_days} days
                  </span>
                </div>
                <div className="behavior-item">
                  <span className="behavior-label">Payment Pattern:</span>
                  <span className={`behavior-value ${customerReport.payment_behavior.pattern.toLowerCase()}`}>
                    {customerReport.payment_behavior.pattern}
                  </span>
                </div>
                <div className="behavior-item">
                  <span className="behavior-label">On-time Payment Rate:</span>
                  <span className="behavior-value">
                    {customerReport.payment_behavior.on_time_rate}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Invoice History */}
          <div className="invoice-history">
            <h4>Invoice History</h4>
            
            {customerReport.invoices && customerReport.invoices.length > 0 ? (
              <div className="table-container">
                <table className="invoices-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Date</th>
                      <th>Due Date</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Days to Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerReport.invoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td className="invoice-number">#{invoice.invoice_number}</td>
                        <td>{formatDate(invoice.invoice_date)}</td>
                        <td>{formatDate(invoice.due_date)}</td>
                        <td className="amount">{formatCurrency(invoice.total_amount)}</td>
                        <td>
                          <span className={getStatusBadgeClass(invoice.status)}>
                            {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                          </span>
                        </td>
                        <td className="days-to-pay">
                          {invoice.days_to_pay !== null ? (
                            <span className={invoice.days_to_pay > 0 ? 'late' : 'early'}>
                              {invoice.days_to_pay > 0 ? '+' : ''}{invoice.days_to_pay} days
                            </span>
                          ) : (
                            <span className="pending">Pending</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="no-invoices">
                <p>No invoices found for this customer</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        !loading && selectedCustomer === '' && (
          <div className="no-selection">
            <div className="no-selection-content">
              <h3>👤 Select a Customer</h3>
              <p>Choose a customer from the dropdown above to view their detailed report including:</p>
              <ul>
                <li>Invoice history and payment status</li>
                <li>Payment behavior and patterns</li>
                <li>Outstanding amounts and aging</li>
                <li>Total revenue from customer</li>
              </ul>
            </div>
          </div>
        )
      )}
    </div>
  );
};

export default CustomerReport;