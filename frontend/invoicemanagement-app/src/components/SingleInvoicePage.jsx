import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../services/api';
import Logo from './ui/Logo';
import '../styles/components/SingleInvoicePage.css';
import '../styles/components/Logo.css';

const SingleInvoicePage = () => {
  const invoiceRef = useRef();
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState(null);

  // Debug logging for navigation verification
  console.log('📋 === SingleInvoicePage component loaded ===');
  console.log('📋 Route parameter ID:', id);
  console.log('📋 ID type:', typeof id);
  console.log('📋 Current URL:', window.location.pathname);

  const [downloading, setDownloading] = useState(false);

  const handleDownloadPDF = () => {
    if (!invoice || downloading) return;
    
    setDownloading(true);
    
    try {
      // Create a new window for printing
      const printWindow = window.open('', '_blank');
      
      if (!printWindow) {
        throw new Error('Pop-up blocked. Please allow pop-ups for this site and try again.');
      }

      // Get the invoice content
      const invoiceContent = invoiceRef.current;
      if (!invoiceContent) {
        throw new Error('Invoice content not found');
      }

      // Get all stylesheets from current document
      const stylesheets = Array.from(document.styleSheets)
        .map(styleSheet => {
          try {
            return Array.from(styleSheet.cssRules)
              .map(rule => rule.cssText)
              .join('');
          } catch (e) {
            // Handle CORS issues with external stylesheets
            const link = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
              .find(l => l.href === styleSheet.href);
            return link ? `<link rel="stylesheet" href="${link.href}">` : '';
          }
        })
        .join('');

      // Create the print document
      const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Invoice-${String(invoice.id).padStart(6, '0')}</title>
          <style>
            ${stylesheets}
            /* Additional print-specific styles */
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
              margin: 0; 
              padding: 20px;
              background: white;
            }
            .download-btn-wrapper { display: none !important; }
            .invoice-wrapper { 
              box-shadow: none !important; 
              border: none !important;
              max-width: none !important;
              margin: 0 !important;
            }
            .invoice-container { 
              padding: 0 !important; 
            }
            @page { 
              margin: 0.5in; 
              size: A4;
            }
          </style>
        </head>
        <body>
          ${invoiceContent.outerHTML}
        </body>
        </html>
      `;

      // Write content to new window
      printWindow.document.write(printContent);
      printWindow.document.close();

      // Wait for content to load then print
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
          setDownloading(false);
        }, 500);
      };
      
    } catch (error) {
      console.error('Print failed:', error);
      alert(`Failed to generate PDF: ${error.message}`);
      setDownloading(false);
    }
  };

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        const response = await apiClient.get(`/invoice/${id}`);
        if (!response.data) {
          setError("Invoice not found.");
        } else {
          setInvoice(response.data);
        }
      } catch (err) {
        console.error('Fetch error:', err);
        setError("Invoice not found.");
      }
    };

    fetchInvoice();
  }, [id]);

  if (error) {
    return <div className="invoice-container"><p className="error">{error}</p></div>;
  }

  if (!invoice) {
    return <div className="invoice-container"><p>Loading invoice...</p></div>;
  }

  const calculateSubtotal = () =>
    (invoice.line_items || []).reduce((sum, item) => sum + (item.lineitem_total || 0), 0).toFixed(2);

  // Get status-specific styling
  const getStatusClass = (status) => {
    const statusLower = status?.toLowerCase() || 'draft';
    return `invoice-status-tag status-${statusLower}`;
  };

  // Get status icon
  const getStatusIcon = (status) => {
    const statusLower = status?.toLowerCase() || 'draft';
    const icons = {
      'paid': '✓',
      'overdue': '⚠️',
      'cancelled': '❌',
      'draft': '📝',
      'pending': '⏳',
      'partial': '◐'
    };
    return icons[statusLower] || '📄';
  };

  return (
    <div className="invoice-page">
      <div className="download-btn-wrapper">
        <button 
          onClick={handleDownloadPDF} 
          className={`download-btn ${downloading ? 'downloading' : ''}`}
          disabled={downloading}
        >
          {downloading ? (
            <>
              <div className="spinner-small"></div>
              Generating PDF...
            </>
          ) : (
            <>
              📄 Download PDF
            </>
          )}
        </button>
      </div>

      <div ref={invoiceRef} className="invoice-wrapper">
        <div className="invoice-container">
          
          {/* Header Section */}
          <div className="invoice-header">
            {/* Status Ribbon */}
            <div className="status-ribbon">
              {invoice.invoice_status?.toUpperCase() || 'DRAFT'}
            </div>

            {/* Customize Button */}
            <div className="customize-btn-wrapper">
              <button className="customize-btn">
                Customize ▼
              </button>
            </div>

            {/* Company Info - Left Side */}
            <div className="company-section">
              <h2 className="company-name">SmartInvoice</h2>
              <p className="company-address">Texas, U.S.A</p>
              <p className="company-email">induborra09@gmail.com</p>
            </div>

            {/* Invoice Info - Right Side */}
            <div className="invoice-info-section">
              <h1 className="invoice-title">INVOICE</h1>
              <p className="invoice-number"># INV-{String(invoice.id).padStart(6, '0')}</p>
              <div className="balance-due-main">
                <span className="balance-label">Balance Due</span>
                <span className="balance-amount">${invoice.invoice_total.toFixed(2)}</span>
              </div>
              
              {/* Invoice Metadata */}
              <div className="invoice-metadata">
                <div className="meta-row">
                  <span className="meta-label">Invoice Date:</span>
                  <span className="meta-value">{new Date(invoice.date_issued).toLocaleDateString()}</span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">Terms:</span>
                  <span className="meta-value">{invoice.invoice_terms}</span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">Due Date:</span>
                  <span className="meta-value">{invoice.invoice_due_date}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Recipient Information */}
          <div className="recipient-section">
            <h3 className="recipient-name">{invoice.customer?.customer_name || invoice.customer_name || 'N/A'}</h3>
            <p className="recipient-address">{invoice.customer?.customer_address || invoice.customer_address || 'N/A'}</p>
            <p className="recipient-phone">{invoice.customer?.customer_phone || invoice.customer_phone || 'N/A'}</p>
          </div>

          {/* Invoice Table */}
          <div className="invoice-table-wrapper">
            <table className="invoice-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.line_items?.map((item, index) => (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    <td>{item.product?.product_description || item.product_description || `Product #${item.product_id || 'N/A'}`}</td>
                    <td>{item.lineitem_qty || 0} pcs</td>
                    <td>${item.product?.product_price || item.product_price || 0}</td>
                    <td>${item.lineitem_total || 0}</td>
                  </tr>
                )) || (
                  <tr>
                    <td colSpan="5" style={{textAlign: 'center', padding: '20px'}}>No line items available</td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Table Totals */}
            <div className="table-totals">
              <div className="total-row subtotal-row">
                <span className="total-label">Subtotal</span>
                <span className="total-value">{calculateSubtotal()}</span>
              </div>
              <div className="total-row main-total-row">
                <span className="total-label">Total</span>
                <span className="total-value">${invoice.invoice_total.toFixed(2)}</span>
              </div>
              <div className="total-row balance-due-row">
                <span className="total-label">Balance Due</span>
                <span className="total-value">${invoice.invoice_total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="invoice-footer">
            <p>Thanks for your business.</p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default SingleInvoicePage;

















