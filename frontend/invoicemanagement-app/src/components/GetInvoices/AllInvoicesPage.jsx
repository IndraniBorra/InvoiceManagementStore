import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import api from '../../api'; // Making sure this points to my axios setup
import '../../App.css';


const AllInvoicesPage = () => {
  
  const [invoices, setInvoices] = useState([]);

  const fetchInvoices = async () => {
    try {
      const response = await api.get('/invoices');
      // console.log('Fetched Invoices:', response.data);
      setInvoices(response.data);
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
              <td>{invoice.customer_name}</td>
              <td>{invoice.phone}</td>
              <td>{invoice.address}</td>
              <td>{invoice.date_issued}</td>
              <td>${invoice.total}</td>
              <td>
                <ul>
                  {invoice.items.map((item, idx) => (
                    <li key={idx}>
                      {item.description}: ${item.amount}
                    </li>
                  ))}
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