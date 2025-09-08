import React from 'react';
import Button from './Button';
import '../../styles/components/ErrorBoundary.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to console and potentially to an error reporting service
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo
    });

    // You can also log the error to an error reporting service here
    if (process.env.NODE_ENV === 'production') {
      // logErrorToService(error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  }

  handleReload = () => {
    window.location.reload();
  }

  handleGoHome = () => {
    window.location.href = '/';
  }

  render() {
    if (this.state.hasError) {
      // Render custom fallback UI
      const { fallback: CustomFallback, showDetails = process.env.NODE_ENV === 'development' } = this.props;
      
      if (CustomFallback) {
        return (
          <CustomFallback
            error={this.state.error}
            errorInfo={this.state.errorInfo}
            onRetry={this.handleRetry}
            onReload={this.handleReload}
            onGoHome={this.handleGoHome}
          />
        );
      }

      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <div className="error-boundary-icon">
              ⚠️
            </div>
            
            <h1 className="error-boundary-title">
              Oops! Something went wrong
            </h1>
            
            <p className="error-boundary-description">
              We encountered an unexpected error. Don't worry, your data is safe.
            </p>
            
            <div className="error-boundary-actions">
              <Button
                variant="primary"
                onClick={this.handleRetry}
              >
                Try Again
              </Button>
              
              <Button
                variant="secondary"
                onClick={this.handleReload}
              >
                Reload Page
              </Button>
              
              <Button
                variant="outline"
                onClick={this.handleGoHome}
              >
                Go Home
              </Button>
            </div>
            
            {showDetails && this.state.error && (
              <details className="error-boundary-details">
                <summary>Error Details (Development Only)</summary>
                <div className="error-boundary-error">
                  <h3>Error:</h3>
                  <pre>{this.state.error.toString()}</pre>
                  
                  {this.state.errorInfo && (
                    <>
                      <h3>Component Stack:</h3>
                      <pre>{this.state.errorInfo.componentStack}</pre>
                    </>
                  )}
                </div>
              </details>
            )}
            
            <div className="error-boundary-help">
              <p>
                If this problem persists, please{' '}
                <a 
                  href="mailto:support@invoicemanager.com" 
                  className="error-boundary-link"
                >
                  contact support
                </a>{' '}
                or{' '}
                <a 
                  href="https://github.com/your-repo/issues" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="error-boundary-link"
                >
                  report this issue
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for easy wrapping
export const withErrorBoundary = (Component, errorBoundaryProps = {}) => {
  const WrappedComponent = (props) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );
  
  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
};

// Hook for error reporting in functional components
export const useErrorHandler = () => {
  return (error, errorInfo = {}) => {
    console.error('Error caught by useErrorHandler:', error, errorInfo);
    
    // In a real app, you might want to trigger the error boundary
    // by throwing the error or using a different error reporting mechanism
    if (process.env.NODE_ENV === 'production') {
      // logErrorToService(error, errorInfo);
    }
  };
};

export default ErrorBoundary;