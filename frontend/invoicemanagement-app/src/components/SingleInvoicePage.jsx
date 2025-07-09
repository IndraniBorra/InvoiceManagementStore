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
    invoice.items.reduce((sum, item) => sum + item.amount, 0).toFixed(2);

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
              <p>{invoice.address}</p>
              <p><b>PNo:</b> {invoice.phone}</p>
            </div>
            <div className="right-info">
              <img src="/logo.png" alt="Logo" className="logo" />
              <h3>INVOICE</h3>
              <p><strong># INV-{String(invoice.id).padStart(6, '0')}</strong></p>
              <p><strong>Balance Due:</strong></p>
              <h2>${invoice.total.toFixed(2)}</h2>
            </div>
          </div>

          <div className="invoice-details">
            <p><strong>Invoice Date:</strong> {new Date(invoice.date_issued).toLocaleDateString()}</p>
            <p><strong>Terms:</strong> {invoice.terms}</p>
            <p><strong>Due Date:</strong> {invoice.due_date}</p>
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
              {invoice.items.map((item, idx) => (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td>{item.description}</td>
                  <td>{item.qty}</td>
                  {/* <td>{item.price}</td> */}
                  <td>${item.price}</td>
                  <td>${item.amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="totals">
            <p><strong>Sub Total:</strong> ${calculateSubtotal()}</p>
            <p><strong>Total:</strong> ${invoice.total.toFixed(2)}</p>
            <p><strong>Balance Due:</strong> ${invoice.total.toFixed(2)}</p>
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

















