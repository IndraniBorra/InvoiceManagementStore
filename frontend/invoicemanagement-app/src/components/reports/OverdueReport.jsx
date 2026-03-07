import React, { useState, useEffect } from 'react';
import { reportApi } from '../../services/api';
import Button from '../ui/Button';
import Select from '../ui/Select';
import { handleApiError } from '../../services/api';
import '../../styles/components/OverdueReport.css';
import '../../styles/components/ActionButtons.css';

const OverdueReport = () => {
  const [overdueData, setOverdueData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('days_overdue');
  const [sortOrder, setSortOrder] = useState('desc');

  // Sort options
  const sortOptions = [
    { value: 'days_overdue', label: 'Days Overdue' },
    { value: 'total_amount', label: 'Amount' },
    { value: 'customer_name', label: 'Customer Name' },
    { value: 'due_date', label: 'Due Date' },
    { value: 'invoice_date', label: 'Invoice Date' }
  ];

  const orderOptions = [
    { value: 'desc', label: 'High to Low' },
    { value: 'asc', label: 'Low to High' }
  ];

  // Load overdue report
  const loadOverdueReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await reportApi.getOverdueReport();
      
      // Sort the data based on current sort settings
      const sortedInvoices = sortInvoices(data.invoices, sortBy, sortOrder);
      setOverdueData({
        ...data,
        invoices: sortedInvoices
      });
    } catch (err) {
      console.error('Error loading overdue report:', err);
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  };

  // Sort invoices
  const sortInvoices = (invoices, sortField, order) => {
    return [...invoices].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      // Handle different data types
      if (sortField === 'customer_name') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      } else if (sortField.includes('date')) {
        aVal = new Date(aVal);
        bVal = new Date(bVal);
      } else if (typeof aVal === 'number') {
        aVal = Number(aVal);
        bVal = Number(bVal);
      }

      if (order === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  };

  // Handle sort change
  const handleSortChange = (field, order) => {
    setSortBy(field);
    setSortOrder(order);
    
    if (overdueData && overdueData.invoices) {
      const sortedInvoices = sortInvoices(overdueData.invoices, field, order);
      setOverdueData({
        ...overdueData,
        invoices: sortedInvoices
      });
    }
  };

  // Initial load
  useEffect(() => {
    loadOverdueReport();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Get severity class based on days overdue
  const getSeverityClass = (daysOverdue) => {
    if (daysOverdue >= 90) return 'severity-critical';
    if (daysOverdue >= 60) return 'severity-high';
    if (daysOverdue >= 30) return 'severity-medium';
    return 'severity-low';
  };

  // Get priority badge
  const getPriorityBadge = (daysOverdue, amount) => {
    let priority = 'Low';
    let className = 'priority-low';

    if (daysOverdue >= 90 || amount >= 5000) {
      priority = 'Critical';
      className = 'priority-critical';
    } else if (daysOverdue >= 60 || amount >= 2000) {
      priority = 'High';
      className = 'priority-high';
    } else if (daysOverdue >= 30 || amount >= 500) {
      priority = 'Medium';
      className = 'priority-medium';
    }

    return <span className={`priority-badge ${className}`}>{priority}</span>;
  };

  // Export functionality
  const handleExport = async (format) => {
    if (!overdueData) {
      alert('No data to export');
      return;
    }

    try {
      console.log(`Exporting overdue report as ${format}...`);
      
      if (format === 'csv') {
        exportOverdueToCSV();
      } else if (format === 'excel') {
        exportOverdueToExcel();
      } else if (format === 'pdf') {
        exportOverdueToPDF();
      }
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Please try again.');
    }
  };

  // Export overdue report to CSV
  const exportOverdueToCSV = () => {
    const headers = ['Priority', 'Invoice #', 'Customer', 'Invoice Date', 'Due Date', 'Amount', 'Days Overdue', 'Suggested Action'];
    const csvData = [
      'Overdue Invoices Report',
      `Total Overdue: ${overdueData.summary.total_overdue_invoices} invoices`,
      `Total Amount: ${formatCurrency(overdueData.summary.total_overdue_amount)}`,
      `Average Days Overdue: ${overdueData.summary.avg_days_overdue}`,
      '',
      headers.join(','),
      ...overdueData.invoices.map(invoice => [
        invoice.priority,
        `#${invoice.id}`,
        `"${invoice.customer_name}"`,
        invoice.date_issued,
        invoice.due_date,
        invoice.amount,
        invoice.days_overdue,
        `"${invoice.suggested_action}"`
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `overdue-report-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  // Export overdue report to Excel
  const exportOverdueToExcel = () => {
    exportOverdueToCSV(); // Same as CSV
  };

  // Export overdue report to PDF
  const exportOverdueToPDF = () => {
    const htmlContent = `
      <html>
        <head>
          <title>Overdue Invoices Report</title>
          <style>
            body { font-family: Arial, sans-serif; }
            .header { text-align: center; margin-bottom: 20px; }
            .alert { background: #ffebee; padding: 15px; margin-bottom: 20px; border-left: 4px solid #f44336; }
            .summary { display: flex; justify-content: space-around; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .priority-critical { background-color: #ffcdd2; }
            .priority-high { background-color: #ffe0b2; }
            .priority-medium { background-color: #fff9c4; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>Overdue Invoices Report</h2>
            <p>Generated on ${new Date().toLocaleDateString()}</p>
          </div>
          <div class="alert">
            <strong>Collection Alert:</strong> ${overdueData.summary.total_overdue_invoices} invoices totaling 
            ${formatCurrency(overdueData.summary.total_overdue_amount)} are past due.
          </div>
          <div class="summary">
            <div><strong>Critical (90+):</strong> ${formatCurrency(overdueData.summary.critical_amount)}</div>
            <div><strong>High Risk (60-89):</strong> ${formatCurrency(overdueData.summary.high_risk_amount)}</div>
            <div><strong>Medium (30-59):</strong> ${formatCurrency(overdueData.summary.medium_risk_amount)}</div>
            <div><strong>Recent (1-29):</strong> ${formatCurrency(overdueData.summary.low_risk_amount)}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Priority</th>
                <th>Invoice #</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Days Overdue</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${overdueData.invoices.slice(0, 100).map(invoice => `
                <tr class="priority-${invoice.priority.toLowerCase()}">
                  <td>${invoice.priority}</td>
                  <td>#${invoice.id}</td>
                  <td>${invoice.customer_name}</td>
                  <td>${formatCurrency(invoice.amount)}</td>
                  <td>${invoice.days_overdue}</td>
                  <td>${invoice.suggested_action}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.print();
  };

  // Handle quick actions
  const handleSendReminder = (invoice) => {
    // Implement send reminder functionality
    alert(`Sending reminder to ${invoice.customer_name} for Invoice #${invoice.id}\n\nThis will:\n- Send email reminder about overdue payment\n- Update invoice with reminder date\n- Log communication in customer history`);
  };

  const handleMarkAsPaid = (invoiceId) => {
    // Implement mark as paid functionality
    alert(`Mark Invoice #${invoiceId} as paid - This functionality will:\n- Update invoice status to 'paid'\n- Record payment date\n- Update customer payment history`);
  };

  const handleViewInvoice = (invoiceId) => {
    // Navigate to invoice detail page
    window.open(`/invoice/${invoiceId}`, '_blank');
  };

  if (loading) {
    return (
      <div className="overdue-report">
        <div className="report-loading">
          <div className="spinner" />
          <p>Loading overdue invoices...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="overdue-report">
        <div className="report-error" role="alert">
          <h3>Error Loading Overdue Report</h3>
          <p>{error}</p>
          <Button variant="outline" size="sm" onClick={() => loadOverdueReport()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="overdue-report">
      <div className="report-header">
        <h2>Overdue Invoices Report</h2>
        <p>Critical collection priorities and past due accounts</p>
      </div>

      {overdueData && (
        <>
          {/* Alert Summary */}
          <div className="overdue-alert">
            <div className="alert-content">
              <div className="alert-icon">⚠️</div>
              <div className="alert-text">
                <h3>Collection Alert</h3>
                <p>
                  <strong>{overdueData.summary.total_overdue_invoices}</strong> invoices totaling{' '}
                  <strong>{formatCurrency(overdueData.summary.total_overdue_amount)}</strong> are past due.
                  Average overdue period: <strong>{overdueData.summary.avg_days_overdue} days</strong>
                </p>
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="overdue-summary">
            <div className="summary-card critical">
              <div className="summary-content">
                <h4>Critical (90+ days)</h4>
                <p className="summary-value">{formatCurrency(overdueData.summary.critical_amount)}</p>
                <p className="summary-subtitle">{overdueData.summary.critical_count} invoices</p>
              </div>
            </div>

            <div className="summary-card high">
              <div className="summary-content">
                <h4>High Risk (60-89 days)</h4>
                <p className="summary-value">{formatCurrency(overdueData.summary.high_risk_amount)}</p>
                <p className="summary-subtitle">{overdueData.summary.high_risk_count} invoices</p>
              </div>
            </div>

            <div className="summary-card medium">
              <div className="summary-content">
                <h4>Medium (30-59 days)</h4>
                <p className="summary-value">{formatCurrency(overdueData.summary.medium_risk_amount)}</p>
                <p className="summary-subtitle">{overdueData.summary.medium_risk_count} invoices</p>
              </div>
            </div>

            <div className="summary-card low">
              <div className="summary-content">
                <h4>Recent (1-29 days)</h4>
                <p className="summary-value">{formatCurrency(overdueData.summary.low_risk_amount)}</p>
                <p className="summary-subtitle">{overdueData.summary.low_risk_count} invoices</p>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="report-controls">
            <div className="sort-controls">
              <div className="sort-group">
                <label>Sort by</label>
                <Select
                  options={sortOptions}
                  value={sortBy}
                  onChange={(value) => handleSortChange(value, sortOrder)}
                />
              </div>

              <div className="sort-group">
                <label>Order</label>
                <Select
                  options={orderOptions}
                  value={sortOrder}
                  onChange={(value) => handleSortChange(sortBy, value)}
                />
              </div>
            </div>

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
          </div>

          {/* Overdue Invoices List */}
          {overdueData.invoices && overdueData.invoices.length > 0 ? (
            <div className="overdue-list">
              <div className="table-container">
                <table className="overdue-table">
                  <thead>
                    <tr>
                      <th>Priority</th>
                      <th>Invoice #</th>
                      <th>Customer</th>
                      <th>Invoice Date</th>
                      <th>Due Date</th>
                      <th>Amount</th>
                      <th>Days Overdue</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overdueData.invoices.map((invoice) => (
                      <tr key={invoice.id} className={getSeverityClass(invoice.days_overdue)}>
                        <td className="priority-cell">
                          {getPriorityBadge(invoice.days_overdue, invoice.total_amount)}
                        </td>
                        <td className="invoice-number">#{invoice.invoice_number}</td>
                        <td className="customer-name">{invoice.customer_name}</td>
                        <td>{formatDate(invoice.invoice_date)}</td>
                        <td className="due-date">{formatDate(invoice.due_date)}</td>
                        <td className="amount">{formatCurrency(invoice.total_amount)}</td>
                        <td className="days-overdue">
                          <span className={getSeverityClass(invoice.days_overdue)}>
                            {invoice.days_overdue} days
                          </span>
                        </td>
                        <td className="actions">
                          <div className="action-buttons">
                            <Button 
                              variant="outline" 
                              size="xs" 
                              onClick={() => handleSendReminder(invoice)}
                              title="Send payment reminder"
                            >
                              📧 Remind
                            </Button>
                            <Button 
                              variant="outline" 
                              size="xs" 
                              onClick={() => handleViewInvoice(invoice.id)}
                              title="View invoice details"
                            >
                              👁️ View
                            </Button>
                            <Button 
                              variant="success" 
                              size="xs" 
                              onClick={() => handleMarkAsPaid(invoice.id)}
                              title="Mark as paid"
                            >
                              ✅ Paid
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="no-overdue">
              <div className="no-overdue-content">
                <h3>🎉 Great News!</h3>
                <p>No overdue invoices found. All your accounts are current!</p>
                <Button variant="primary" onClick={() => window.location.reload()}>
                  Refresh Data
                </Button>
              </div>
            </div>
          )}

          {/* Collection Tips */}
          <div className="collection-tips">
            <h4>📋 Collection Best Practices</h4>
            <div className="tips-grid">
              <div className="tip-card">
                <h5>1-29 Days Overdue</h5>
                <p>Send friendly payment reminders via email. Most customers pay within this period with gentle prompts.</p>
              </div>
              <div className="tip-card">
                <h5>30-59 Days Overdue</h5>
                <p>Make direct phone contact. Discuss payment arrangements if necessary. Document all communications.</p>
              </div>
              <div className="tip-card">
                <h5>60-89 Days Overdue</h5>
                <p>Send formal demand letters. Consider charging late fees. Evaluate credit terms for future transactions.</p>
              </div>
              <div className="tip-card critical-tip">
                <h5>90+ Days Overdue</h5>
                <p>Consider collection agency or legal action. Review customer's payment history and creditworthiness.</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="report-footer">
            <p className="generated-time">
              Report generated on {formatDate(overdueData.generated_at)}
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default OverdueReport;