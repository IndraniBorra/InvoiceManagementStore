import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import { invoiceApi, handleApiError } from '../services/api';

// Initial state
const initialState = {
  // Current invoice being edited
  currentInvoice: {
    customer_id: null,
    customer_name: '',
    customer_address: '',
    customer_phone: '',
    date_issued: '',
    invoice_terms: 'Due end of the month',
    invoice_due_date: '',
    invoice_status: 'draft',
    invoice_total: 0,
    line_items: [{
      product_id: null,
      product_description: '',
      lineitem_qty: 1,
      product_price: 0,
      line_items_total: 0
    }]
  },
  
  // All invoices
  invoices: [],
  
  // UI state
  loading: false,
  saving: false,
  error: null,
  
  // Form validation
  validationErrors: {},
  
  // Meta
  lastUpdated: null,
  isDirty: false
};

// Action types
const ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  SET_SAVING: 'SET_SAVING',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  
  SET_CURRENT_INVOICE: 'SET_CURRENT_INVOICE',
  UPDATE_INVOICE_FIELD: 'UPDATE_INVOICE_FIELD',
  RESET_CURRENT_INVOICE: 'RESET_CURRENT_INVOICE',
  
  SET_INVOICES: 'SET_INVOICES',
  ADD_INVOICE: 'ADD_INVOICE',
  UPDATE_INVOICE: 'UPDATE_INVOICE',
  REMOVE_INVOICE: 'REMOVE_INVOICE',
  
  ADD_LINE_ITEM: 'ADD_LINE_ITEM',
  UPDATE_LINE_ITEM: 'UPDATE_LINE_ITEM',
  REMOVE_LINE_ITEM: 'REMOVE_LINE_ITEM',
  
  SET_VALIDATION_ERRORS: 'SET_VALIDATION_ERRORS',
  CLEAR_VALIDATION_ERRORS: 'CLEAR_VALIDATION_ERRORS',
  
  SET_DIRTY: 'SET_DIRTY',
  SET_CLEAN: 'SET_CLEAN'
};

// Reducer function
const invoiceReducer = (state, action) => {
  switch (action.type) {
    case ACTIONS.SET_LOADING:
      return { ...state, loading: action.payload };
      
    case ACTIONS.SET_SAVING:
      return { ...state, saving: action.payload };
      
    case ACTIONS.SET_ERROR:
      return { ...state, error: action.payload, loading: false, saving: false };
      
    case ACTIONS.CLEAR_ERROR:
      return { ...state, error: null };
      
    case ACTIONS.SET_CURRENT_INVOICE:
      return {
        ...state,
        currentInvoice: { ...state.currentInvoice, ...action.payload },
        isDirty: false,
        lastUpdated: new Date().toISOString()
      };
      
    case ACTIONS.UPDATE_INVOICE_FIELD:
      return {
        ...state,
        currentInvoice: {
          ...state.currentInvoice,
          [action.payload.field]: action.payload.value
        },
        isDirty: true
      };
      
    case ACTIONS.RESET_CURRENT_INVOICE:
      return {
        ...state,
        currentInvoice: { ...initialState.currentInvoice },
        validationErrors: {},
        isDirty: false
      };
      
    case ACTIONS.SET_INVOICES:
      return { ...state, invoices: action.payload };
      
    case ACTIONS.ADD_INVOICE:
      return {
        ...state,
        invoices: [action.payload, ...state.invoices]
      };
      
    case ACTIONS.UPDATE_INVOICE:
      return {
        ...state,
        invoices: state.invoices.map(invoice =>
          invoice.id === action.payload.id ? action.payload : invoice
        )
      };
      
    case ACTIONS.REMOVE_INVOICE:
      return {
        ...state,
        invoices: state.invoices.filter(invoice => invoice.id !== action.payload)
      };
      
    case ACTIONS.ADD_LINE_ITEM:
      return {
        ...state,
        currentInvoice: {
          ...state.currentInvoice,
          line_items: [
            ...state.currentInvoice.line_items,
            {
              product_id: null,
              product_description: '',
              lineitem_qty: 1,
              product_price: 0,
              line_items_total: 0
            }
          ]
        },
        isDirty: true
      };
      
    case ACTIONS.UPDATE_LINE_ITEM: {
      const { index, field, value } = action.payload;
      const updatedLineItems = [...state.currentInvoice.line_items];
      updatedLineItems[index] = {
        ...updatedLineItems[index],
        [field]: value
      };
      
      // Recalculate line item total if qty or price changed
      if (field === 'lineitem_qty' || field === 'product_price') {
        const qty = field === 'lineitem_qty' ? value : updatedLineItems[index].lineitem_qty;
        const price = field === 'product_price' ? value : updatedLineItems[index].product_price;
        updatedLineItems[index].line_items_total = (qty || 0) * (price || 0);
      }
      
      // Recalculate invoice total
      const invoiceTotal = updatedLineItems.reduce(
        (total, item) => total + (item.line_items_total || 0),
        0
      );
      
      return {
        ...state,
        currentInvoice: {
          ...state.currentInvoice,
          line_items: updatedLineItems,
          invoice_total: invoiceTotal
        },
        isDirty: true
      };
    }
      
    case ACTIONS.REMOVE_LINE_ITEM: {
      if (state.currentInvoice.line_items.length <= 1) {
        return state; // Don't remove if it's the last item
      }
      
      const updatedLineItems = state.currentInvoice.line_items.filter(
        (_, index) => index !== action.payload
      );
      
      const invoiceTotal = updatedLineItems.reduce(
        (total, item) => total + (item.line_items_total || 0),
        0
      );
      
      return {
        ...state,
        currentInvoice: {
          ...state.currentInvoice,
          line_items: updatedLineItems,
          invoice_total: invoiceTotal
        },
        isDirty: true
      };
    }
      
    case ACTIONS.SET_VALIDATION_ERRORS:
      return { ...state, validationErrors: action.payload };
      
    case ACTIONS.CLEAR_VALIDATION_ERRORS:
      return { ...state, validationErrors: {} };
      
    case ACTIONS.SET_DIRTY:
      return { ...state, isDirty: true };
      
    case ACTIONS.SET_CLEAN:
      return { ...state, isDirty: false };
      
    default:
      return state;
  }
};

// Create context
const InvoiceContext = createContext();

// Provider component
export const InvoiceProvider = ({ children }) => {
  const [state, dispatch] = useReducer(invoiceReducer, initialState);
  
  // Action creators
  const setLoading = useCallback((loading) => {
    dispatch({ type: ACTIONS.SET_LOADING, payload: loading });
  }, []);
  
  const setSaving = useCallback((saving) => {
    dispatch({ type: ACTIONS.SET_SAVING, payload: saving });
  }, []);
  
  const setError = useCallback((error) => {
    dispatch({ type: ACTIONS.SET_ERROR, payload: error });
  }, []);
  
  const clearError = useCallback(() => {
    dispatch({ type: ACTIONS.CLEAR_ERROR });
  }, []);
  
  const setCurrentInvoice = useCallback((invoice) => {
    dispatch({ type: ACTIONS.SET_CURRENT_INVOICE, payload: invoice });
  }, []);
  
  const updateInvoiceField = useCallback((field, value) => {
    dispatch({ type: ACTIONS.UPDATE_INVOICE_FIELD, payload: { field, value } });
  }, []);
  
  const resetCurrentInvoice = useCallback(() => {
    dispatch({ type: ACTIONS.RESET_CURRENT_INVOICE });
  }, []);
  
  const addLineItem = useCallback(() => {
    dispatch({ type: ACTIONS.ADD_LINE_ITEM });
  }, []);
  
  const updateLineItem = useCallback((index, field, value) => {
    dispatch({ type: ACTIONS.UPDATE_LINE_ITEM, payload: { index, field, value } });
  }, []);
  
  const removeLineItem = useCallback((index) => {
    dispatch({ type: ACTIONS.REMOVE_LINE_ITEM, payload: index });
  }, []);
  
  const setValidationErrors = useCallback((errors) => {
    dispatch({ type: ACTIONS.SET_VALIDATION_ERRORS, payload: errors });
  }, []);
  
  const clearValidationErrors = useCallback(() => {
    dispatch({ type: ACTIONS.CLEAR_VALIDATION_ERRORS });
  }, []);
  
  // API actions
  const loadInvoices = useCallback(async () => {
    setLoading(true);
    clearError();
    
    try {
      const invoices = await invoiceApi.getAll();
      dispatch({ type: ACTIONS.SET_INVOICES, payload: invoices });
    } catch (error) {
      setError(handleApiError(error));
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, setError]);
  
  const loadInvoice = useCallback(async (id) => {
    setLoading(true);
    clearError();
    
    try {
      const invoice = await invoiceApi.getById(id);
      
      // Transform backend data to frontend format
      // API returns: customer nested under invoice.customer, line items under invoice.line_items,
      // and fields named invoice_terms/invoice_due_date/invoice_status/invoice_total (not terms/due_date/status/total)
      const cust = invoice.customer || {};
      const transformedInvoice = {
        id:               invoice.id,
        customer_id:      invoice.customer_id,
        customer_name:    cust.customer_name    || '',
        customer_address: cust.customer_address || '',
        customer_phone:   cust.customer_phone   || '',
        customer_email:   cust.customer_email   || '',
        date_issued:      invoice.date_issued,
        invoice_terms:    invoice.invoice_terms    || 'Due end of the month',
        invoice_due_date: invoice.invoice_due_date || '',
        invoice_status:   invoice.invoice_status   || 'draft',
        invoice_total:    invoice.invoice_total    || 0,
        line_items: invoice.line_items?.map(item => ({
          product_id:          item.product_id || null,
          product_description: item.product?.product_description || '',
          lineitem_qty:        item.lineitem_qty || 1,
          product_price:       item.product?.product_price || 0,
          line_items_total:    item.lineitem_qty * (item.product?.product_price || 0),
        })) || [{ product_id: null, product_description: '', lineitem_qty: 1, product_price: 0, line_items_total: 0 }]
      };
      
      setCurrentInvoice(transformedInvoice);
      return transformedInvoice;
    } catch (error) {
      setError(handleApiError(error));
      return null;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, setError, setCurrentInvoice]);
  
  const saveInvoice = useCallback(async (invoiceData, isUpdate = false) => {
    setSaving(true);
    clearError();
    clearValidationErrors();
    
    try {
      let savedInvoice;
      
      if (isUpdate && invoiceData.id) {
        savedInvoice = await invoiceApi.update(invoiceData.id, invoiceData);
        dispatch({ type: ACTIONS.UPDATE_INVOICE, payload: savedInvoice });
      } else {
        savedInvoice = await invoiceApi.create(invoiceData);
        dispatch({ type: ACTIONS.ADD_INVOICE, payload: savedInvoice });
      }
      
      dispatch({ type: ACTIONS.SET_CLEAN });
      return savedInvoice;
    } catch (error) {
      const errorMessage = handleApiError(error);
      setError(errorMessage);
      throw error;
    } finally {
      setSaving(false);
    }
  }, [setSaving, clearError, clearValidationErrors, setError]);
  
  const deleteInvoice = useCallback(async (id) => {
    setLoading(true);
    clearError();
    
    try {
      await invoiceApi.remove(id);
      dispatch({ type: ACTIONS.REMOVE_INVOICE, payload: id });
    } catch (error) {
      setError(handleApiError(error));
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, setError]);
  
  // Validation
  const validateInvoice = useCallback((invoiceData = state.currentInvoice) => {
    const errors = {};
    
    if (!invoiceData.customer_id) {
      errors.customer_id = 'Please select a customer from the search results.';
    }
    if (!invoiceData.customer_name) {
      errors.customer_name = 'Customer name is required.';
    }
    if (!invoiceData.customer_address) {
      errors.customer_address = 'Address is required.';
    }
    if (!invoiceData.customer_phone) {
      errors.customer_phone = 'Phone number is required.';
    } else if (!/^\d{10}$/.test(invoiceData.customer_phone)) {
      errors.customer_phone = 'Phone number must be 10 digits.';
    }
    if (!invoiceData.date_issued) {
      errors.date_issued = 'Issue date is required.';
    }
    if (!invoiceData.invoice_terms) {
      errors.invoice_terms = 'Terms are required.';
    }
    
    // Validate line items
    invoiceData.line_items.forEach((item, index) => {
      if (item.lineitem_qty <= 0) {
        errors[`item_qty_${index}`] = 'Quantity must be greater than 0.';
      }
      if (!item.product_description) {
        errors[`item_desc_${index}`] = 'Description is required.';
      }
      if (item.product_price <= 0) {
        errors[`item_price_${index}`] = 'Price must be greater than 0.';
      }
    });
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [state.currentInvoice, setValidationErrors]);
  
  // Calculate due date
  const calculateDueDate = useCallback((issued, terms) => {
    if (!issued) return '';
    
    const date = new Date(issued);
    const termsMap = {
      'Due on Receipt': 0,
      'Net 15': 15,
      'Net 30': 30,
      'Net 45': 45,
      'Net 60': 60,
      'Due end of the month': 0,
      'Due end of next month': 0
    };
    
    if (terms === 'Due end of the month') {
      const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
      nextMonth.setDate(nextMonth.getDate() + 32);
      const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 0);
      return lastDay.toISOString().split('T')[0];
    } else if (terms === 'Due end of next month') {
      const nextMonth = new Date(date.getFullYear(), date.getMonth() + 2, 1);
      nextMonth.setDate(nextMonth.getDate() + 32);
      const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 0);
      return lastDay.toISOString().split('T')[0];
    } else {
      const daysToAdd = termsMap[terms] || 0;
      date.setDate(date.getDate() + daysToAdd);
      return date.toISOString().split('T')[0];
    }
  }, []);
  
  // Auto-calculate due date when terms or date changes
  useEffect(() => {
    if (state.currentInvoice.date_issued && state.currentInvoice.invoice_terms) {
      const dueDate = calculateDueDate(state.currentInvoice.date_issued, state.currentInvoice.invoice_terms);
      if (dueDate !== state.currentInvoice.invoice_due_date) {
        updateInvoiceField('invoice_due_date', dueDate);
      }
    }
  }, [state.currentInvoice.date_issued, state.currentInvoice.invoice_terms, calculateDueDate, updateInvoiceField]);
  
  const value = {
    // State
    ...state,
    
    // Actions
    setLoading,
    setSaving,
    setError,
    clearError,
    setCurrentInvoice,
    updateInvoiceField,
    resetCurrentInvoice,
    addLineItem,
    updateLineItem,
    removeLineItem,
    setValidationErrors,
    clearValidationErrors,
    
    // API Actions
    loadInvoices,
    loadInvoice,
    saveInvoice,
    deleteInvoice,
    
    // Utilities
    validateInvoice,
    calculateDueDate
  };
  
  return (
    <InvoiceContext.Provider value={value}>
      {children}
    </InvoiceContext.Provider>
  );
};

// Hook to use the context
export const useInvoice = () => {
  const context = useContext(InvoiceContext);
  if (!context) {
    throw new Error('useInvoice must be used within an InvoiceProvider');
  }
  return context;
};

export default InvoiceContext;