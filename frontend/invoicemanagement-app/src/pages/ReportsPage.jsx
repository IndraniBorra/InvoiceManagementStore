import React, { useState, useEffect } from 'react';
import { reportApi } from '../services/api';
import Button from '../components/ui/Button';
import ErrorBoundary from '../components/ui/ErrorBoundary';
import RevenueWidget from '../components/reports/RevenueWidget';
import AllInvoicesReport from '../components/reports/AllInvoicesReport';
import CustomerReport from '../components/reports/CustomerReport';
import AgingReport from '../components/reports/AgingReport';
import OverdueReport from '../components/reports/OverdueReport';
import '../styles/components/ReportsPage.css';

const REPORT_TABS = [
  { key: 'dashboard', label: '📊 Dashboard', component: 'RevenueWidget' },
  { key: 'invoices', label: '📋 All Invoices', component: 'AllInvoicesReport' },
  { key: 'customers', label: '👤 Customers', component: 'CustomerReport' },
  { key: 'aging', label: '⏰ Aging', component: 'AgingReport' },
  { key: 'overdue', label: '⚠️ Overdue', component: 'OverdueReport' }
];

const ReportsPage = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [summaryStats, setSummaryStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load summary statistics for the header cards
  useEffect(() => {
    const loadSummaryStats = async () => {
      try {
        setLoading(true);
        const stats = await reportApi.getSummaryStats();
        setSummaryStats(stats);
      } catch (err) {
        console.error('Error loading summary stats:', err);
        setError('Failed to load summary statistics');
      } finally {
        setLoading(false);
      }
    };

    loadSummaryStats();
  }, []);

  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
  };

  const renderActiveReport = () => {
    switch (activeTab) {
      case 'dashboard':
        return <RevenueWidget />;
      case 'invoices':
        return <AllInvoicesReport />;
      case 'customers':
        return <CustomerReport />;
      case 'aging':
        return <AgingReport />;
      case 'overdue':
        return <OverdueReport />;
      default:
        return <RevenueWidget />;
    }
  };

  if (loading) {
    return (
      <div className="reports-page">
        <div className="reports-loading">
          <div className="spinner" />
          <p>Loading reports...</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="reports-page">
        <div className="reports-header">
          <h1>📊 Reports Center</h1>
          <p>Business intelligence and analytics for your invoice management system</p>
        </div>

        {error && (
          <div className="reports-error" role="alert">
            <h3>Error</h3>
            <p>{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </div>
        )}

        {/* Summary Cards */}
        {summaryStats && (
          <div className="summary-cards">
            <div className="summary-card">
              <div className="summary-card-icon">💰</div>
              <div className="summary-card-content">
                <h3>Total Revenue</h3>
                <p className="summary-card-value">
                  ${summaryStats.total_revenue.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </p>
              </div>
            </div>

            <div className="summary-card">
              <div className="summary-card-icon">📄</div>
              <div className="summary-card-content">
                <h3>Total Invoices</h3>
                <p className="summary-card-value">
                  {summaryStats.total_invoices.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="summary-card">
              <div className="summary-card-icon">⚠️</div>
              <div className="summary-card-content">
                <h3>Outstanding</h3>
                <p className="summary-card-value">
                  ${summaryStats.outstanding_amount.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </p>
              </div>
            </div>

            <div className="summary-card">
              <div className="summary-card-icon">👥</div>
              <div className="summary-card-content">
                <h3>Total Customers</h3>
                <p className="summary-card-value">
                  {summaryStats.total_customers.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Report Tabs */}
        <div className="report-tabs">
          {REPORT_TABS.map((tab) => (
            <button
              key={tab.key}
              className={`report-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => handleTabChange(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Active Report Content */}
        <div className="report-content">
          {renderActiveReport()}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default ReportsPage;