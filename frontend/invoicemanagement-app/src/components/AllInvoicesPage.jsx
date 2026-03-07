import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { apiClient } from '../services/api'; // Modern API client
import '../App.css';


const AllInvoicesPage = () => {

  const [invoices, setInvoices] = useState([]);

  const fetchInvoices = async () => {
    try {
      const response = await apiClient.get('/invoices');
      // console.log('Fetched Invoices:', response.data);
      setInvoices(response.data);
      console.log('Invoices set:', response.data);
    } catch (error) {
      console.error('Failed to fetch invoices', error);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);



  return (
    <div className="container" style={{ marginTop: '2rem' }}>
      <h2>All Invoices</h2>
      <table className="table table-bordered table-striped">
        <thead>
          <tr>
            <th>Invoice ID</th>
            <th>Customer</th>
            <th>Phone</th>
            <th>Address</th>
            <th>Date Issued</th>
            <th>Total</th>
            <th>Items</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id}>
              <td>{invoice.id}</td>
              <td>{invoice.customer?.customer_name || 'N/A'}</td>
              <td>{invoice.customer?.customer_phone || 'N/A'}</td>
              <td>{invoice.customer?.customer_address || 'N/A'}</td>
              <td>{invoice.date_issued}</td>
              <td>${invoice.invoice_total}</td>
              <td>
                <ul>
                  {invoice.line_items?.map((item, idx) => (
                    <li key={idx}>
                      {item.product?.product_description || `Product #${item.product_id}`}: ${item.lineitem_total}
                    </li>
                  )) || <li>No items</li>}
                </ul>
              </td>
              <td>
                <Link to={`/edit-invoice/${invoice.id}`}>
                  <button className="view-btn">Edit</button>
                </Link>
                <Link to={`/invoice/${invoice.id}`}>
                   <button className="view-btn">View</button>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AllInvoicesPage;
