import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { InvoiceProvider } from './context/InvoiceContext';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
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
import './styles/components/SingleInvoicePage.css';
import './styles/components/Logo.css';
import './styles/components/Navbar.css';
import './styles/components/DashboardPage.css';
import './styles/components/APModule.css';
import './styles/components/AccountingPage.css';
import './styles/components/ForecastingPage.css';

// Import pages
import InvoicePage from './pages/InvoicePage';
import ReportsPage from './pages/ReportsPage';
import DashboardPage from './pages/DashboardPage';
import APDashboard from './pages/APDashboard';
import APInvoiceList from './pages/APInvoiceList';
import APInvoiceDetail from './pages/APInvoiceDetail';
import APVendors from './pages/APVendors';
import AccountingPage from './pages/AccountingPage';
import ForecastingPage from './pages/ForecastingPage';

// Import old components for backward compatibility during transition
import AllInvoicesPage from './components/AllInvoicesPage';
import SingleInvoicePage from './components/SingleInvoicePage';
import CustomerPage from './components/CustomerPage';
import ProductPage from './components/ProductPage';

// Import LLM Assistant
import LLMAssistant from './components/LLMAssistant';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';

// Main App component
const App = () => {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <InvoiceProvider>
          <Router>
            <div className="app">
              <Routes>
                {/* Public route */}
                <Route path="/login" element={<LoginPage />} />

                {/* All other routes require auth — Navbar + LLM Assistant shown inside */}
                <Route
                  path="*"
                  element={
                    <ProtectedRoute>
                      <>
                        <Navbar />
                        <Routes>
                          {/* Dashboard - Home */}
                          <Route path="/" element={<DashboardPage />} />

                          {/* Invoice Routes */}
                          <Route path="/invoice" element={<InvoicePage />} />
                          <Route path="/edit-invoice/:id" element={<InvoicePage />} />

                          {/* Reports Routes */}
                          <Route path="/reports" element={<ReportsPage />} />

                          {/* Legacy routes */}
                          <Route path="/invoices" element={<AllInvoicesPage />} />
                          <Route path="/invoice/:id" element={<SingleInvoicePage />} />

                          {/* Customer Routes */}
                          <Route path="/customer" element={<CustomerPage />} />
                          <Route path="/customers" element={<CustomerPage />} />
                          <Route path="/customer/:id" element={<CustomerPage />} />

                          {/* Product Routes */}
                          <Route path="/product" element={<ProductPage />} />
                          <Route path="/products" element={<ProductPage />} />
                          <Route path="/product/:id" element={<ProductPage />} />

                          {/* Admin-only: Accounts Payable */}
                          <Route path="/ap" element={<ProtectedRoute adminOnly><APDashboard /></ProtectedRoute>} />
                          <Route path="/ap/invoices" element={<ProtectedRoute adminOnly><APInvoiceList /></ProtectedRoute>} />
                          <Route path="/ap/invoice/:id" element={<ProtectedRoute adminOnly><APInvoiceDetail /></ProtectedRoute>} />
                          <Route path="/ap/vendors" element={<ProtectedRoute adminOnly><APVendors /></ProtectedRoute>} />

                          {/* Admin-only: Accounting Ledger */}
                          <Route path="/accounting" element={<ProtectedRoute adminOnly><AccountingPage /></ProtectedRoute>} />

                          {/* Admin-only: Forecasting & Insights */}
                          <Route path="/forecasting" element={<ProtectedRoute adminOnly><ForecastingPage /></ProtectedRoute>} />

                          {/* Default/Fallback */}
                          <Route path="*" element={<DashboardPage />} />
                        </Routes>
                        <LLMAssistant />
                      </>
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </div>
          </Router>
        </InvoiceProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
};

export default App;