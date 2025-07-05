import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import InvoicePage from './components/InvoicePage';
import AllInvoicesPage from './components/GetInvoices/AllInvoicesPage';
import SingleInvoicePage from './components/GetInvoices/SingleInvoicePage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/invoice" element={<InvoicePage />} />
        <Route path="*" element={<InvoicePage />} />
        <Route path="/invoices" element={<AllInvoicesPage />} />
        <Route path="/invoice/:id" element={<SingleInvoicePage />} />
      </Routes>
    </Router>
  );
}

export default App;

