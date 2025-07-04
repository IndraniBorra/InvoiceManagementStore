import React from 'react';


const AllInvoices = ({ invoices_as_props, onEdit }) => {


  return (
    <div style={{ marginTop: '2rem' }}>
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
          {invoices_as_props.map((invoice) => (
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
                <button
                  type='button'
                  onClick={() => {
                    onEdit(invoice);
                    alert(`Editing invoice ${invoice.id}`);
                  }}
                  className="view-btn"
                >
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AllInvoices;