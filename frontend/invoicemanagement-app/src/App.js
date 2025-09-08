import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { InvoiceProvider } from './context/InvoiceContext';
import ErrorBoundary from './components/ui/ErrorBoundary';

// Import all styles
import './styles/globals.css';
import './styles/components/Button.css';
import './styles/components/Input.css';
import './styles/components/Select.css';
import './styles/components/AutoComplete.css';
import './styles/components/LineItemsTable.css';
import './styles/components/InvoicePage.css';
import './styles/components/ErrorBoundary.css';
import './styles/components/ReportsPage.css';
import './styles/components/RevenueWidget.css';
import './styles/components/AllInvoicesReport.css';
import './styles/components/CustomerReport.css';
import './styles/components/AgingReport.css';
import './styles/components/OverdueReport.css';

// Import pages
import InvoicePage from './pages/InvoicePage';
import ReportsPage from './pages/ReportsPage';

// Import old components for backward compatibility during transition
import AllInvoicesPage from './components/AllInvoicesPage';
import SingleInvoicePage from './components/SingleInvoicePage';
import CustomerPage from './components/CustomerPage';
import ProductPage from './components/ProductPage';

// Main App component
const App = () => {
  return (
    <ErrorBoundary>
      <InvoiceProvider>
        <Router>
          <div className="app">
            <Routes>
              {/* Invoice Routes - Using new architecture */}
              <Route path="/invoice" element={<InvoicePage />} />
              <Route path="/edit-invoice/:id" element={<InvoicePage />} />
              
              {/* Reports Routes - New architecture */}
              <Route path="/reports" element={<ReportsPage />} />
              
              {/* Legacy routes - Will be migrated gradually */}
              <Route path="/invoices" element={<AllInvoicesPage />} />
              <Route path="/invoice/:id" element={<SingleInvoicePage />} />
              
              {/* Customer Routes - Legacy */}
              <Route path="/customer" element={<CustomerPage />} />
              <Route path="/customers" element={<CustomerPage />} />
              <Route path="/customer/:id" element={<CustomerPage />} />
              
              {/* Product Routes - Legacy */}
              <Route path="/product" element={<ProductPage />} />
              <Route path="/products" element={<ProductPage />} />
              <Route path="/product/:id" element={<ProductPage />} />

              {/* Default/Fallback Route */}
              <Route path="*" element={<InvoicePage />} />
            </Routes>
          </div>
        </Router>
      </InvoiceProvider>
    </ErrorBoundary>
  );
};

export default App;