import React, { useState, useEffect } from 'react';
import { reportApi } from '../../services/api';
import Button from '../ui/Button';
import Select from '../ui/Select';
import Input from '../ui/Input';
import AutoComplete from '../ui/AutoComplete';
import { handleApiError } from '../../services/api';
import '../../styles/components/AllInvoicesReport.css';
import '../../styles/components/ActionButtons.css';

const AllInvoicesReport = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0
  });

  // Filter state
  const [filters, setFilters] = useState({
    customer_name: '',
    status: '',
    date_from: '',
    date_to: '',
    min_amount: '',
    max_amount: ''
  });

  // Available filter options
  const statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'draft', label: 'Draft' },
    { value: 'sent', label: 'Sent' },
    { value: 'paid', label: 'Paid' },
    { value: 'overdue', label: 'Overdue' },
    { value: 'cancelled', label: 'Cancelled' }
  ];

  const limitOptions = [
    { value: '10', label: '10 per page' },
    { value: '25', label: '25 per page' },
    { value: '50', label: '50 per page' },
    { value: '100', label: '100 per page' }
  ];

  // Load invoices data
  const loadInvoices = async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      
      const params = {
        page,
        limit: pagination.limit,
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, value]) => value && value.trim() !== '')
        )
      };

      const response = await reportApi.getAllInvoicesReport(params);
      
      setInvoices(response.invoices || []);
      setPagination({
        page: response.pagination?.page || 1,
        limit: response.pagination?.limit || 25,
        total: response.pagination?.total || 0,
        totalPages: response.pagination?.total_pages || 0
      });
    } catch (err) {
      console.error('Error loading invoices:', err);
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadInvoices();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle filter changes
  const handleFilterChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Apply filters
  const handleApplyFilters = () => {
    setPagination(prev => ({ ...prev, page: 1 }));
    loadInvoices(1);
  };

  // Clear filters
  const handleClearFilters = () => {
    setFilters({
      customer_name: '',
      status: '',
      date_from: '',
      date_to: '',
      min_amount: '',
      max_amount: ''
    });
    setPagination(prev => ({ ...prev, page: 1 }));
    loadInvoices(1);
  };

  // Handle pagination
  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
    loadInvoices(newPage);
  };

  const handleLimitChange = (newLimit) => {
    setPagination(prev => ({ ...prev, limit: parseInt(newLimit), page: 1 }));
    loadInvoices(1);
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
    try {
      console.log(`Exporting invoices as ${format}...`);
      
      if (format === 'csv') {
        exportToCSV();
      } else if (format === 'excel') {
        exportToExcel();
      } else if (format === 'pdf') {
        exportToPDF();
      }
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Please try again.');
    }
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Invoice #', 'Customer', 'Date', 'Due Date', 'Amount', 'Status'];
    const csvData = [
      headers.join(','),
      ...invoices.map(invoice => [
        invoice.invoice_number,
        `"${invoice.customer_name}"`,
        invoice.invoice_date,
        invoice.due_date,
        invoice.total_amount,
        invoice.status
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `invoices-report-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  // Export to Excel (CSV format with .xlsx extension)
  const exportToExcel = () => {
    const headers = ['Invoice #', 'Customer', 'Date', 'Due Date', 'Amount', 'Status'];
    const csvData = [
      headers.join(','),
      ...invoices.map(invoice => [
        invoice.invoice_number,
        `"${invoice.customer_name}"`,
        invoice.invoice_date,
        invoice.due_date,
        invoice.total_amount,
        invoice.status
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvData], { type: 'application/vnd.ms-excel' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `invoices-report-${new Date().toISOString().split('T')[0]}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  // Export to PDF (simplified HTML to PDF)
  const exportToPDF = () => {
    const htmlContent = `
      <html>
        <head>
          <title>Invoices Report</title>
          <style>
            body { font-family: Arial, sans-serif; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
          </style>
        </head>
        <body>
          <h2>All Invoices Report</h2>
          <p>Generated on ${new Date().toLocaleDateString()}</p>
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Due Date</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${invoices.map(invoice => `
                <tr>
                  <td>${invoice.invoice_number}</td>
                  <td>${invoice.customer_name}</td>
                  <td>${formatDate(invoice.invoice_date)}</td>
                  <td>${formatDate(invoice.due_date)}</td>
                  <td>${formatCurrency(invoice.total_amount)}</td>
                  <td>${invoice.status}</td>
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

  // Handle view invoice action
  const handleViewInvoice = (invoiceId) => {
    // Navigate to invoice detail page
    window.open(`/invoice/${invoiceId}`, '_blank');
  };

  // Handle quick actions
  const handleMarkAsPaid = (invoiceId) => {
    alert(`Mark Invoice #${invoiceId} as paid - This functionality will:\n- Update invoice status to 'paid'\n- Record payment date\n- Refresh the report`);
  };

  const handleSendReminder = (invoice) => {
    alert(`Send reminder to ${invoice.customer_name} for Invoice #${invoice.invoice_number}`);
  };

  const handleDuplicateInvoice = (invoiceId) => {
    alert(`Duplicate Invoice #${invoiceId} - This will create a new invoice with the same details`);
  };

  if (loading && invoices.length === 0) {
    return (
      <div className="all-invoices-report">
        <div className="report-loading">
          <div className="spinner" />
          <p>Loading invoices...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="all-invoices-report">
      <div className="report-header">
        <h2>All Invoices Report</h2>
        <p>Comprehensive view of all invoices with filtering and export capabilities</p>
      </div>

      {/* Filters */}
      <div className="filter-section">
        <div className="filter-row">
          <div className="filter-group">
            <label>Customer Name</label>
            <AutoComplete
              fetchUrl="/reports/customers/list"
              displayFields={['customer_name', 'customer_email']}
              searchFields={['customer_name', 'customer_email']}
              valueField="customer_name"
              placeholder="Search by customer name..."
              value={filters.customer_name}
              onSelect={(customer, value) => {
                handleFilterChange('customer_name', customer.customer_name);
              }}
              onInputChange={(value) => {
                handleFilterChange('customer_name', value);
              }}
              allowCustomValue={true}
              minCharsToSearch={0}
            />
          </div>

          <div className="filter-group">
            <label>Status</label>
            <Select
              options={statusOptions}
              value={filters.status}
              onChange={(value) => handleFilterChange('status', value)}
            />
          </div>

          <div className="filter-group">
            <label>Date From</label>
            <Input
              type="date"
              value={filters.date_from}
              onChange={(e) => handleFilterChange('date_from', e.target.value)}
            />
          </div>

          <div className="filter-group">
            <label>Date To</label>
            <Input
              type="date"
              value={filters.date_to}
              onChange={(e) => handleFilterChange('date_to', e.target.value)}
            />
          </div>
        </div>

        <div className="filter-row">
          <div className="filter-group">
            <label>Min Amount ($)</label>
            <Input
              type="number"
              placeholder="0.00"
              min="0"
              step="0.01"
              value={filters.min_amount}
              onChange={(e) => handleFilterChange('min_amount', e.target.value)}
            />
          </div>

          <div className="filter-group">
            <label>Max Amount ($)</label>
            <Input
              type="number"
              placeholder="No limit"
              min="0"
              step="0.01"
              value={filters.max_amount}
              onChange={(e) => handleFilterChange('max_amount', e.target.value)}
            />
          </div>

          <div className="filter-actions">
            <Button variant="primary" onClick={handleApplyFilters}>
              Apply Filters
            </Button>
            <Button variant="outline" onClick={handleClearFilters}>
              Clear
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="report-error" role="alert">
          <p>{error}</p>
          <Button variant="outline" size="sm" onClick={() => loadInvoices()}>
            Retry
          </Button>
        </div>
      )}

      {/* Results Summary */}
      <div className="results-summary">
        <div className="results-info">
          <p>
            Showing {invoices.length} of {pagination.total.toLocaleString()} invoices
            {Object.values(filters).some(v => v) && ' (filtered)'}
          </p>
        </div>

        <div className="results-actions">
          <Select
            options={limitOptions}
            value={pagination.limit.toString()}
            onChange={handleLimitChange}
          />
          
          <div className="export-buttons">
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
      </div>

      {/* Data Table */}
      <div className="table-container">
        <table className="invoices-table">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Customer</th>
              <th>Date</th>
              <th>Due Date</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" className="loading-cell">
                  <div className="table-loading">
                    <div className="spinner" />
                    <span>Loading...</span>
                  </div>
                </td>
              </tr>
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan="7" className="no-data-cell">
                  <div className="no-data">
                    <p>No invoices found matching your criteria</p>
                    <Button variant="outline" size="sm" onClick={handleClearFilters}>
                      Clear Filters
                    </Button>
                  </div>
                </td>
              </tr>
            ) : (
              invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="invoice-number">#{invoice.invoice_number}</td>
                  <td className="customer-name">{invoice.customer_name}</td>
                  <td>{formatDate(invoice.invoice_date)}</td>
                  <td>{formatDate(invoice.due_date)}</td>
                  <td className="amount">{formatCurrency(invoice.total_amount)}</td>
                  <td>
                    <span className={getStatusBadgeClass(invoice.status)}>
                      {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                    </span>
                  </td>
                  <td className="actions">
                    <div className="action-buttons">
                      <Button variant="outline" size="xs" onClick={() => handleViewInvoice(invoice.id)} title="View details">
                        👁️
                      </Button>
                      {invoice.status !== 'paid' && (
                        <Button variant="success" size="xs" onClick={() => handleMarkAsPaid(invoice.id)} title="Mark as paid">
                          ✅
                        </Button>
                      )}
                      {invoice.status === 'overdue' && (
                        <Button variant="warning" size="xs" onClick={() => handleSendReminder(invoice)} title="Send reminder">
                          📧
                        </Button>
                      )}
                      <Button variant="outline" size="xs" onClick={() => handleDuplicateInvoice(invoice.id)} title="Duplicate">
                        📋
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="pagination">
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page === 1}
            onClick={() => handlePageChange(pagination.page - 1)}
          >
            Previous
          </Button>

          <div className="page-info">
            <span>
              Page {pagination.page} of {pagination.totalPages}
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page === pagination.totalPages}
            onClick={() => handlePageChange(pagination.page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
};

export default AllInvoicesReport;