import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import InvoicePage from './components/InvoicePage';
import AllInvoicesPage from './components/GetInvoices/AllInvoicesPage';
import SingleInvoicePage from './components/GetInvoices/SingleInvoicePage';
import CustomerPage from './components/CustomerPage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/invoice" element={<InvoicePage />} />
        <Route path="*" element={<InvoicePage />} />
        <Route path="/invoices" element={<AllInvoicesPage />} />
        <Route path="/edit-invoice/:id" element={<InvoicePage />} />
        <Route path="/invoice/:id" element={<SingleInvoicePage />} />
        <Route path="/customer" element={<CustomerPage />} />
        <Route path ="/customers" element={<CustomerPage />} />
        <Route path="/customer/:id" element={<CustomerPage />} />

      </Routes>
    </Router>
  );
}

export default App;

