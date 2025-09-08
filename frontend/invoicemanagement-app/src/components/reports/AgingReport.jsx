import React, { useState, useEffect } from 'react';
import { reportApi } from '../../services/api';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { handleApiError } from '../../services/api';
import '../../styles/components/AgingReport.css';

const AgingReport = () => {
  const [agingData, setAgingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);

  // Load aging report
  const loadAgingReport = async (dateFilter = null) => {
    try {
      setLoading(true);
      setError(null);
      const data = await reportApi.getAgingReport(dateFilter);
      setAgingData(data);
    } catch (err) {
      console.error('Error loading aging report:', err);
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadAgingReport(asOfDate);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle date change
  const handleDateChange = (newDate) => {
    setAsOfDate(newDate);
    loadAgingReport(newDate);
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

  // Get aging bucket class
  const getAgingBucketClass = (bucket) => {
    const bucketClasses = {
      'current': 'aging-current',
      '1-15': 'aging-1-15',
      '16-30': 'aging-16-30',
      '31-45': 'aging-31-45',
      '46-60': 'aging-46-60',
      '60+': 'aging-60-plus'
    };
    return bucketClasses[bucket] || 'aging-default';
  };

  // Export functionality
  const handleExport = async (format) => {
    if (!agingData) {
      alert('No data to export');
      return;
    }

    try {
      console.log(`Exporting aging report as ${format}...`);
      
      if (format === 'csv') {
        exportAgingToCSV();
      } else if (format === 'excel') {
        exportAgingToExcel();
      } else if (format === 'pdf') {
        exportAgingToPDF();
      }
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Please try again.');
    }
  };

  // Export aging report to CSV
  const exportAgingToCSV = () => {
    const headers = ['Invoice #', 'Customer', 'Invoice Date', 'Due Date', 'Amount', 'Days Outstanding', 'Aging Bucket'];
    const csvData = [
      `Invoice Aging Report - ${formatDate(agingData.as_of_date)}`,
      `Total Outstanding: ${formatCurrency(agingData.summary.total_outstanding)}`,
      `Total Invoices: ${agingData.summary.total_invoices}`,
      '',
      'Aging Buckets:',
      ...agingData.aging_buckets.map(bucket => `${bucket.bucket},${formatCurrency(bucket.total_amount)},${bucket.invoice_count} invoices,${bucket.percentage}%`),
      '',
      headers.join(','),
      ...agingData.invoices.map(invoice => [
        `#${invoice.id}`,
        `"${invoice.customer_name}"`,
        invoice.invoice_date,
        invoice.due_date,
        invoice.total_amount,
        invoice.days_outstanding,
        invoice.aging_bucket
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `aging-report-${asOfDate}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  // Export aging report to Excel
  const exportAgingToExcel = () => {
    exportAgingToCSV(); // Same as CSV
  };

  // Export aging report to PDF
  const exportAgingToPDF = () => {
    const htmlContent = `
      <html>
        <head>
          <title>Invoice Aging Report</title>
          <style>
            body { font-family: Arial, sans-serif; }
            .header { text-align: center; margin-bottom: 20px; }
            .summary { margin-bottom: 20px; display: flex; justify-content: space-around; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>Invoice Aging Report</h2>
            <p>As of ${formatDate(agingData.as_of_date)}</p>
          </div>
          <div class="summary">
            <div><strong>Total Outstanding:</strong> ${formatCurrency(agingData.summary.total_outstanding)}</div>
            <div><strong>Total Invoices:</strong> ${agingData.summary.total_invoices}</div>
            <div><strong>Average Days:</strong> ${agingData.summary.avg_days_outstanding}</div>
          </div>
          <h3>Aging Buckets</h3>
          <table>
            <thead>
              <tr><th>Bucket</th><th>Amount</th><th>Count</th><th>Percentage</th></tr>
            </thead>
            <tbody>
              ${agingData.aging_buckets.map(bucket => `
                <tr>
                  <td>${bucket.bucket}</td>
                  <td>${formatCurrency(bucket.total_amount)}</td>
                  <td>${bucket.invoice_count}</td>
                  <td>${bucket.percentage}%</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <h3>Outstanding Invoices</h3>
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Days Outstanding</th>
                <th>Bucket</th>
              </tr>
            </thead>
            <tbody>
              ${agingData.invoices.slice(0, 50).map(invoice => `
                <tr>
                  <td>#${invoice.id}</td>
                  <td>${invoice.customer_name}</td>
                  <td>${formatCurrency(invoice.total_amount)}</td>
                  <td>${invoice.days_outstanding}</td>
                  <td>${invoice.aging_bucket}</td>
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

  if (loading) {
    return (
      <div className="aging-report">
        <div className="report-loading">
          <div className="spinner" />
          <p>Loading aging report...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="aging-report">
        <div className="report-error" role="alert">
          <h3>Error Loading Aging Report</h3>
          <p>{error}</p>
          <Button variant="outline" size="sm" onClick={() => loadAgingReport(asOfDate)}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="aging-report">
      <div className="report-header">
        <h2>Invoice Aging Report</h2>
        <p>Outstanding invoices categorized by age (15, 30, 45, 60+ days)</p>
      </div>

      {/* Report Controls */}
      <div className="report-controls">
        <div className="control-group">
          <label>As of Date</label>
          <Input
            type="date"
            value={asOfDate}
            onChange={(e) => handleDateChange(e.target.value)}
          />
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

      {agingData && (
        <>
          {/* Summary Cards */}
          <div className="aging-summary">
            <div className="summary-card total">
              <div className="summary-content">
                <h3>Total Outstanding</h3>
                <p className="summary-value">{formatCurrency(agingData.summary.total_outstanding)}</p>
                <p className="summary-subtitle">{agingData.summary.total_invoices} invoices</p>
              </div>
            </div>

            <div className="summary-card average">
              <div className="summary-content">
                <h3>Average Days Outstanding</h3>
                <p className="summary-value">{agingData.summary.avg_days_outstanding} days</p>
              </div>
            </div>

            <div className="summary-card oldest">
              <div className="summary-content">
                <h3>Oldest Invoice</h3>
                <p className="summary-value">{agingData.summary.oldest_days} days</p>
                <p className="summary-subtitle">#{agingData.summary.oldest_invoice}</p>
              </div>
            </div>

            <div className="summary-card at-risk">
              <div className="summary-content">
                <h3>At Risk (60+ days)</h3>
                <p className="summary-value">{formatCurrency(agingData.summary.at_risk_amount)}</p>
                <p className="summary-subtitle">{agingData.summary.at_risk_count} invoices</p>
              </div>
            </div>
          </div>

          {/* Aging Buckets */}
          <div className="aging-buckets">
            <h3>Aging Breakdown</h3>
            <div className="buckets-grid">
              {agingData.aging_buckets.map((bucket) => (
                <div key={bucket.bucket} className={`bucket-card ${getAgingBucketClass(bucket.bucket)}`}>
                  <div className="bucket-header">
                    <h4>{bucket.bucket} Days</h4>
                    <span className="bucket-count">{bucket.invoice_count} invoices</span>
                  </div>
                  <div className="bucket-amount">
                    {formatCurrency(bucket.total_amount)}
                  </div>
                  <div className="bucket-percentage">
                    {bucket.percentage}% of total
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Visual Chart */}
          <div className="aging-chart">
            <h3>Aging Distribution</h3>
            <div className="chart-container">
              <div className="chart-bars">
                {agingData.aging_buckets.map((bucket) => {
                  const maxAmount = Math.max(...agingData.aging_buckets.map(b => b.total_amount));
                  const heightPercent = maxAmount > 0 ? (bucket.total_amount / maxAmount) * 100 : 0;
                  
                  return (
                    <div key={bucket.bucket} className="chart-bar-container">
                      <div className="chart-bar-wrapper">
                        <div 
                          className={`chart-bar ${getAgingBucketClass(bucket.bucket)}`}
                          style={{ height: `${heightPercent}%` }}
                          title={`${bucket.bucket} Days: ${formatCurrency(bucket.total_amount)} (${bucket.invoice_count} invoices)`}
                        ></div>
                      </div>
                      <div className="chart-bar-label">
                        <span className="chart-bucket">{bucket.bucket}</span>
                        <span className="chart-amount">{formatCurrency(bucket.total_amount)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Detailed Invoice List */}
          {agingData.invoices && agingData.invoices.length > 0 && (
            <div className="aging-details">
              <h3>Outstanding Invoices Detail</h3>
              <div className="table-container">
                <table className="aging-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Customer</th>
                      <th>Invoice Date</th>
                      <th>Due Date</th>
                      <th>Amount</th>
                      <th>Days Outstanding</th>
                      <th>Aging Bucket</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agingData.invoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td className="invoice-number">#{invoice.invoice_number}</td>
                        <td className="customer-name">{invoice.customer_name}</td>
                        <td>{formatDate(invoice.invoice_date)}</td>
                        <td>{formatDate(invoice.due_date)}</td>
                        <td className="amount">{formatCurrency(invoice.total_amount)}</td>
                        <td className="days-outstanding">
                          <span className={invoice.days_outstanding > 60 ? 'severe' : invoice.days_outstanding > 30 ? 'warning' : 'normal'}>
                            {invoice.days_outstanding} days
                          </span>
                        </td>
                        <td>
                          <span className={`aging-badge ${getAgingBucketClass(invoice.aging_bucket)}`}>
                            {invoice.aging_bucket}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="report-footer">
            <p className="generated-time">
              Report generated on {formatDate(agingData.generated_at)} as of {formatDate(asOfDate)}
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default AgingReport;