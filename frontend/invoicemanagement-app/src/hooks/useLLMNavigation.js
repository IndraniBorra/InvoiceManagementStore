import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useCallback } from 'react';

/**
 * Custom hook for LLM-driven navigation with React Router
 * Provides methods to navigate programmatically based on natural language queries
 */
export const useLLMNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [navigationHistory, setNavigationHistory] = useState([]);

  /**
   * Navigate to a route and track the navigation
   */
  const navigateToRoute = useCallback((route, state = {}, options = {}) => {
    console.log('🚀 === navigateToRoute called ===');
    console.log('📍 From:', location.pathname);
    console.log('📍 To:', route);
    console.log('📍 State:', state);
    console.log('📍 Options:', options);

    try {
      const navigationEntry = {
        id: Date.now(),
        from: location.pathname,
        to: route,
        state,
        timestamp: new Date(),
        source: 'llm'
      };

      console.log('📋 Navigation entry created:', navigationEntry);

      // Add to navigation history
      setNavigationHistory(prev => [...prev.slice(-9), navigationEntry]);
      console.log('📚 Navigation history updated');

      // Perform navigation
      console.log('🚢 Calling React Router navigate...');
      navigate(route, { state, ...options });
      console.log('✅ React Router navigate call completed');

      const result = { success: true, entry: navigationEntry };
      console.log('📍 navigateToRoute returning success:', result);
      return result;
    } catch (error) {
      console.error('❌ Navigation error:', error);
      const result = { success: false, error: error.message };
      console.log('📍 navigateToRoute returning error:', result);
      return result;
    }
  }, [navigate, location.pathname]);

  /**
   * Navigate with data pre-population
   */
  const navigateWithData = useCallback((route, data = {}, options = {}) => {
    const state = {
      ...options.state,
      llmData: data,
      timestamp: Date.now()
    };

    return navigateToRoute(route, state, options);
  }, [navigateToRoute]);

  /**
   * Invoice-specific navigation methods
   */
  const invoiceNavigation = {
    // View single invoice
    viewInvoice: useCallback((invoiceId) => {
      console.log('🎯 === useLLMNavigation.viewInvoice called ===');
      console.log('📋 Received invoiceId:', invoiceId);
      console.log('📋 InvoiceId type:', typeof invoiceId);

      const parsedId = parseInt(invoiceId);
      console.log('📋 Parsed invoice ID:', parsedId);
      const targetRoute = `/invoice/${invoiceId}`;
      console.log('📋 Target route:', targetRoute);

      console.log('🚀 Calling navigateToRoute...');
      const result = navigateToRoute(targetRoute, {
        action: 'view',
        invoiceId: parsedId
      });

      console.log('📍 navigateToRoute returned:', result);
      return result;
    }, [navigateToRoute]),

    // List all invoices
    listInvoices: useCallback((filters = {}) => {
      return navigateWithData('/invoices', { filters }, {
        replace: false
      });
    }, [navigateWithData]),

    // Create new invoice
    createInvoice: useCallback((preData = {}) => {
      console.log('🚀 Creating invoice with prefill data:', preData);

      // Handle both old format (prefill) and new format (direct data)
      const navigationData = {
        action: 'create',
        ...(preData.entities ? {
          // New AI-extracted format
          llmData: preData,
          aiGenerated: true,
          timestamp: Date.now()
        } : {
          // Legacy format
          prefill: preData
        })
      };

      console.log('📋 Navigation data being passed:', navigationData);

      return navigateWithData('/invoice', navigationData);
    }, [navigateWithData]),

    // Edit existing invoice
    editInvoice: useCallback((invoiceId, preData = {}) => {
      return navigateWithData(`/edit-invoice/${invoiceId}`, {
        prefill: preData,
        action: 'edit',
        invoiceId: parseInt(invoiceId)
      });
    }, [navigateWithData]),

    // Show customer invoices
    showCustomerInvoices: useCallback((customerId, customerName = '') => {
      return navigateWithData('/invoices', {
        filters: { 
          customer_id: parseInt(customerId),
          customer_name: customerName 
        },
        highlight: `customer-${customerId}`
      });
    }, [navigateWithData])
  };

  /**
   * Report navigation methods
   */
  const reportNavigation = {
    // Main reports dashboard
    showReports: useCallback((initialView = null) => {
      return navigateWithData('/reports', {
        initialView,
        action: 'view_reports'
      });
    }, [navigateWithData]),

    // Revenue reports
    showRevenue: useCallback((dateRange = null) => {
      return navigateWithData('/reports', {
        initialView: 'revenue',
        dateRange,
        action: 'revenue_report'
      });
    }, [navigateWithData]),

    // Aging reports
    showAging: useCallback((asOfDate = null) => {
      return navigateWithData('/reports', {
        initialView: 'aging',
        asOfDate,
        action: 'aging_report'
      });
    }, [navigateWithData]),

    // Overdue invoices
    showOverdue: useCallback(() => {
      return navigateWithData('/reports', {
        initialView: 'overdue',
        action: 'overdue_report'
      });
    }, [navigateWithData])
  };

  /**
   * Customer and Product navigation
   */
  const entityNavigation = {
    // Show customers
    showCustomers: useCallback((filters = {}) => {
      return navigateWithData('/customer', { filters });
    }, [navigateWithData]),

    // Show products
    showProducts: useCallback((filters = {}) => {
      return navigateWithData('/product', { filters });
    }, [navigateWithData]),

    // Create customer
    createCustomer: useCallback((preData = {}) => {
      console.log('🏗️ Navigating to create customer with data:', preData);

      return navigateWithData('/customer', {
        action: 'create',
        prefill: preData,
        aiGenerated: true,
        conversationReturn: true,
        returnToAssistant: true
      });
    }, [navigateWithData]),

    // Create product
    createProduct: useCallback((preData = {}) => {
      console.log('🏗️ Navigating to create product with data:', preData);

      return navigateWithData('/product', {
        action: 'create',
        prefill: preData,
        aiGenerated: true,
        conversationReturn: true,
        returnToAssistant: true
      });
    }, [navigateWithData])
  };

  /**
   * Get current navigation context
   */
  const getNavigationContext = useCallback(() => {
    return {
      currentPath: location.pathname,
      currentState: location.state,
      history: navigationHistory,
      isLLMNavigation: location.state?.source === 'llm' || location.state?.llmData,
      lastLLMNavigation: navigationHistory
        .filter(entry => entry.source === 'llm')
        .slice(-1)[0] || null
    };
  }, [location, navigationHistory]);

  /**
   * Go back to previous route
   */
  const goBack = useCallback(() => {
    try {
      window.history.back();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, []);

  /**
   * Check if current page can handle LLM data
   */
  const canHandleLLMData = useCallback(() => {
    const llmCompatiblePages = [
      '/invoices',
      '/invoice',
      '/reports',
      '/customer',
      '/product'
    ];

    return llmCompatiblePages.some(page => 
      location.pathname.startsWith(page)
    );
  }, [location.pathname]);

  /**
   * Extract parameters from current URL for context
   */
  const getCurrentPageContext = useCallback(() => {
    const path = location.pathname;
    const params = new URLSearchParams(location.search);
    
    // Parse invoice ID from path
    const invoiceMatch = path.match(/\/invoice\/(\d+)/);
    const editInvoiceMatch = path.match(/\/edit-invoice\/(\d+)/);
    
    return {
      page: path.split('/')[1] || 'home',
      invoiceId: invoiceMatch?.[1] || editInvoiceMatch?.[1] || null,
      isEdit: !!editInvoiceMatch,
      searchParams: Object.fromEntries(params),
      fullPath: path,
      state: location.state || {}
    };
  }, [location]);

  return {
    // Core navigation
    navigateToRoute,
    navigateWithData,
    goBack,
    
    // Specialized navigation
    invoice: invoiceNavigation,
    reports: reportNavigation,
    entities: entityNavigation,
    
    // Context and state
    getNavigationContext,
    getCurrentPageContext,
    canHandleLLMData,
    navigationHistory,
    
    // Current location info
    currentPath: location.pathname,
    currentState: location.state
  };
};

export default useLLMNavigation;