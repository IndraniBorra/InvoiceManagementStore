import React, { useState, useEffect } from 'react';
import { reportApi } from '../../services/api';
import Button from '../ui/Button';
import '../../styles/components/RevenueWidget.css';

const RevenueWidget = () => {
  const [revenueData, setRevenueData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadRevenueData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await reportApi.getRevenueSummary();
        setRevenueData(data);
      } catch (err) {
        console.error('Error loading revenue data:', err);
        setError('Failed to load revenue data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadRevenueData();
  }, []);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatPercentage = (rate, showSign = true) => {
    const sign = showSign && rate > 0 ? '+' : '';
    return `${sign}${rate}%`;
  };

  if (loading) {
    return (
      <div className="revenue-widget">
        <div className="revenue-loading">
          <div className="spinner" />
          <p>Loading revenue data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="revenue-widget">
        <div className="revenue-error">
          <h3>Error Loading Revenue Data</h3>
          <p>{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!revenueData) {
    return (
      <div className="revenue-widget">
        <div className="revenue-no-data">
          <h3>No Revenue Data Available</h3>
          <p>No revenue data found for the selected period.</p>
        </div>
      </div>
    );
  }

  const { current_month, last_month, growth, amounts, monthly_trends } = revenueData;

  return (
    <div className="revenue-widget">
      <div className="revenue-header">
        <h2>Revenue Dashboard</h2>
        <p>Financial overview and performance metrics</p>
      </div>

      {/* Main Revenue Metrics */}
      <div className="revenue-metrics">
        <div className="metric-card large">
          <div className="metric-content">
            <h3>This Month</h3>
            <p className="metric-value primary">
              {formatCurrency(current_month.revenue)}
            </p>
            <p className="metric-subtitle">
              {current_month.invoice_count} invoices • {current_month.month_name} {current_month.year}
            </p>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-content">
            <h3>Last Month</h3>
            <p className="metric-value">
              {formatCurrency(last_month.revenue)}
            </p>
            <p className="metric-subtitle">
              {last_month.invoice_count} invoices
            </p>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-content">
            <h3>Growth Rate</h3>
            <p className={`metric-value ${growth.is_positive ? 'positive' : 'negative'}`}>
              {formatPercentage(growth.rate)}
            </p>
            <p className="metric-subtitle">
              {formatCurrency(Math.abs(growth.amount))} {growth.is_positive ? 'increase' : 'decrease'}
            </p>
          </div>
        </div>
      </div>

      {/* Paid vs Unpaid Breakdown */}
      <div className="revenue-breakdown">
        <h3>Revenue Breakdown</h3>
        <div className="breakdown-metrics">
          <div className="breakdown-item">
            <div className="breakdown-label">
              <span className="breakdown-indicator paid"></span>
              Paid Invoices
            </div>
            <div className="breakdown-value">
              {formatCurrency(amounts.paid)}
            </div>
            <div className="breakdown-percentage">
              {amounts.total > 0 ? Math.round((amounts.paid / amounts.total) * 100) : 0}%
            </div>
          </div>

          <div className="breakdown-item">
            <div className="breakdown-label">
              <span className="breakdown-indicator unpaid"></span>
              Unpaid Invoices
            </div>
            <div className="breakdown-value">
              {formatCurrency(amounts.unpaid)}
            </div>
            <div className="breakdown-percentage">
              {amounts.total > 0 ? Math.round((amounts.unpaid / amounts.total) * 100) : 0}%
            </div>
          </div>

          <div className="breakdown-total">
            <div className="breakdown-label">
              <strong>Total Revenue</strong>
            </div>
            <div className="breakdown-value">
              <strong>{formatCurrency(amounts.total)}</strong>
            </div>
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="breakdown-bar">
          <div 
            className="breakdown-bar-paid"
            style={{ 
              width: amounts.total > 0 ? `${(amounts.paid / amounts.total) * 100}%` : '0%' 
            }}
          ></div>
          <div 
            className="breakdown-bar-unpaid"
            style={{ 
              width: amounts.total > 0 ? `${(amounts.unpaid / amounts.total) * 100}%` : '0%' 
            }}
          ></div>
        </div>
      </div>

      {/* Monthly Trends */}
      {monthly_trends && monthly_trends.length > 0 && (
        <div className="revenue-trends">
          <h3>6-Month Revenue Trend</h3>
          <div className="trends-chart">
            <div className="chart-bars">
              {monthly_trends.map((month, index) => {
                const maxRevenue = Math.max(...monthly_trends.map(m => m.revenue));
                const heightPercent = maxRevenue > 0 ? (month.revenue / maxRevenue) * 100 : 0;
                
                return (
                  <div key={month.month_key} className="chart-bar-container">
                    <div className="chart-bar-wrapper">
                      <div 
                        className="chart-bar"
                        style={{ height: `${heightPercent}%` }}
                        title={`${month.month} ${month.year}: ${formatCurrency(month.revenue)}`}
                      ></div>
                    </div>
                    <div className="chart-bar-label">
                      <span className="chart-month">{month.month.slice(0, 3)}</span>
                      <span className="chart-year">{month.year}</span>
                    </div>
                    <div className="chart-bar-value">
                      {formatCurrency(month.revenue)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Action Items */}
      <div className="revenue-actions">
        <h3>Quick Actions</h3>
        <div className="action-buttons">
          <Button variant="outline" size="sm">
            📊 View Detailed Report
          </Button>
          <Button variant="outline" size="sm">
            📄 Export to PDF
          </Button>
          <Button variant="outline" size="sm">
            📈 Revenue Forecast
          </Button>
        </div>
      </div>

      <div className="revenue-footer">
        <p className="generated-time">
          Generated on {new Date(revenueData.generated_at).toLocaleString()}
        </p>
      </div>
    </div>
  );
};

export default RevenueWidget;