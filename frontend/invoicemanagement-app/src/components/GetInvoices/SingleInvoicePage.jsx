import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../api';
import './SingleInvoice.css';

const SingleInvoicePage = () => {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState(null);

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
    <div className="invoice-container">
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
              <td>${(item.amount / item.qty).toFixed(2)}</td>
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
  );
};

export default SingleInvoicePage;

















// import React, { useEffect, useState } from 'react';
// import { useParams } from 'react-router-dom';
// import api from '../../api'; 

// const SingleInvoice = () => {
//   const { id } = useParams();
//   const [invoice, setInvoice] = useState(null);
//   const [loading, setLoading] = useState(true);  // Track loading state
//   const [error, setError] = useState(null);      // Track error

//   useEffect(() => {
//     const fetchInvoice = async () => {
//       try {
//         const response = await api.get(`/invoice/${id}`);
//         if (response.data) {
//           setInvoice(response.data);
//           setError(null);
//         } else {
//           setError('Invoice not found.');
//         }
//       } catch (err) {
//         console.error('Error fetching invoice:', err);
//         setError('Invoice not found.');
//       } finally {
//         setLoading(false);
//       }
//     };

//     fetchInvoice();
//   }, [id]);

//   if (loading) return <div><p>Loading invoice...</p></div>;

//   if (error) return <div style={{ color: 'red' }}><p>{error}</p></div>;

//   return (
//     <div className="single-invoice">
//       <h2>Invoice #{invoice.id}</h2>
//       <p><strong>Date:</strong> {new Date(invoice.date_issued).toLocaleDateString()}</p>
//       <p><strong>Customer:</strong> {invoice.customer_name}</p>
//       <p><strong>Total Amount:</strong> ${invoice.total}</p>
//       <h3>Items</h3>
//       <ul>
//         {invoice.items.map((item, index) => (
//           <li key={index}>
//             {item.description} - ${item.amount.toFixed(2)}
//           </li>
//         ))}
//       </ul>
//     </div>
//   );
// };

// export default SingleInvoice;












// const SingleInvoice = () => {
//   const { id } = useParams();
//   const [invoice, setInvoice] = useState(null);

//   useEffect(() => {
//     const fetchInvoice = async () => {
//       try {

//         const response = await api.get(`invoice/${id}`);
//         if (!response.data) {console.error('Failed to fetch invoice data');} 
//         else {setInvoice(response.data);}
//       } 
//       catch (error) {
//         console.error('Error fetching invoice:', error);
//        }
//     };

//     fetchInvoice();
//   }, []);


//   return (
//     !invoice ? (
//       <div className="loading">
//         <p>Loading invoice...</p>
//       </div>
//     ) : (
//       <div className="single-invoice">
//         <h2>Invoice #{invoice.id}</h2>
//         <p><strong>Date:</strong> {new Date(invoice.date_issued).toLocaleDateString()}</p>
//         <p><strong>Customer:</strong> {invoice.customer_name}</p>
//         <p><strong>Total Amount:</strong> ${invoice.total}</p>
//         <h3>Items</h3>
//         <ul>
//           {invoice.items.map(item => (
//             <li key={item.id}>
//               {item.description} - ${item.amount.toFixed(2)}
//             </li>
//           ))}
//         </ul>
//       </div>
//     )
//   );
// }

// export default SingleInvoice;






