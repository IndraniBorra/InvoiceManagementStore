import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api';
import html2pdf from 'html2pdf.js';
import '../components_css/SingleInvoice.css';

const SingleInvoicePage = () => {
  const invoiceRef = useRef();
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState(null);

  const handleDownloadPDF = () => {
    const element = invoiceRef.current;

    const options = {
      filename: `Invoice-${invoice.id}.pdf`,
      margin: 0.5,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    html2pdf().set(options).from(element).save();
  };

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        const response = await api.get(`/invoice/${id}`);
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
    invoice.line_items.reduce((sum, item) => sum + item.lineitem_total, 0).toFixed(2);

  return (
    <div >
      <div className="download-btn-wrapper">
        <button onClick={handleDownloadPDF} className="download-btn">
          Download Invoice PDF
        </button>
      </div>

    <div ref={invoiceRef} className="invoice-wrapper">
    <div className="invoice-container">


          <div className="invoice-status-tag">{(invoice.invoice_status)}</div>
          <div className="invoice-header">
            <div className="left-info">
              <h2>{invoice.customer_name}</h2>
              <p>{invoice.customer_address}</p>
              <p><b>PNo:</b> {invoice.customer_phone}</p>
            </div>
            <div className="right-info">
              <img src="/logo.png" alt="Logo" className="logo" />
              <h3>INVOICE</h3>
              <p><strong># INV-{String(invoice.id).padStart(6, '0')}</strong></p>
              <p><strong>Balance Due:</strong></p>
              <h2>${invoice.invoice_total.toFixed(2)}</h2>
            </div>
          </div>


          <div className="invoice-details">
            <p><strong>Invoice Date:</strong> {new Date(invoice.date_issued).toLocaleDateString()}</p>
            <p><strong>Terms:</strong> {invoice.invoice_terms}</p>
            <p><strong>Due Date:</strong> {invoice.invoice_due_date}</p>
          </div>

          <table className="invoice-table">
            <thead>
              <tr>
                <th>ItemId</th>
                <th>Description</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>

              {invoice.line_items.map((item, id
              ) => (
                <tr key={id}>
                  <td>{item.product_id}</td>
                  <td>{item.product_description}</td>
                  <td>{item.lineitem_qty}</td>
                  <td>${item.product_price}</td>
                  <td>${item.lineitem_total}</td>
                </tr>
              ))}
              {/* <ul>
                  {invoice.line_items.map((item, idx) => (
                    <li key={idx}>
                      {item.product_id}: ${item.lineitem_total}
                    </li>
                  ))}
                </ul> */}
            </tbody>
          </table>

          <div className="totals">
            <p><strong>Sub Total:</strong> ${calculateSubtotal()}</p>
            <p><strong>Total:</strong> ${invoice.invoice_total.toFixed(2)}</p>
            <p><strong>Balance Due:</strong> ${invoice.invoice_total.toFixed(2)}</p>
          </div>

          <div className="footer-message">
            <p>Thanks for your business.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SingleInvoicePage;

















