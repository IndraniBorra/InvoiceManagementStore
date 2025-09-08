import { useState, useEffect, useCallback } from 'react';
import { handleApiError } from '../services/api';

// Generic API hook for data fetching
export const useApi = (apiCall, dependencies = []) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!apiCall) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await apiCall();
      setData(result);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  useEffect(() => {
    fetchData();
  }, dependencies);

  const refetch = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch,
    setData,
    setError,
    setLoading
  };
};

// Hook for API mutations (POST, PUT, DELETE)
export const useMutation = (mutationFn) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const mutate = useCallback(async (...args) => {
    setLoading(true);
    setError(null);

    try {
      const result = await mutationFn(...args);
      setData(result);
      return result;
    } catch (err) {
      const errorMessage = handleApiError(err);
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [mutationFn]);

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setData(null);
  }, []);

  return {
    mutate,
    loading,
    error,
    data,
    reset
  };
};

// Hook for async search with debouncing
export const useAsyncSearch = (searchFn, delay = 300) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);

    const timeoutId = setTimeout(async () => {
      try {
        const searchResults = await searchFn(query);
        setResults(searchResults);
      } catch (err) {
        setError(handleApiError(err));
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [query, searchFn, delay]);

  return {
    query,
    setQuery,
    results,
    loading,
    error
  };
};

// Hook for local storage with API sync
export const useLocalStorage = (key, initialValue, syncFn = null) => {
  const [value, setValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn(`Error loading ${key} from localStorage:`, error);
      return initialValue;
    }
  });

  const setStoredValue = useCallback((newValue) => {
    try {
      setValue(newValue);
      window.localStorage.setItem(key, JSON.stringify(newValue));
      
      // Optionally sync with API
      if (syncFn) {
        syncFn(newValue).catch(err => {
          console.warn(`Error syncing ${key} to API:`, err);
        });
      }
    } catch (error) {
      console.warn(`Error saving ${key} to localStorage:`, error);
    }
  }, [key, syncFn]);

  const removeStoredValue = useCallback(() => {
    try {
      setValue(initialValue);
      window.localStorage.removeItem(key);
    } catch (error) {
      console.warn(`Error removing ${key} from localStorage:`, error);
    }
  }, [key, initialValue]);

  return [value, setStoredValue, removeStoredValue];
};

// Hook for pagination
export const usePagination = (totalItems, itemsPerPage = 10) => {
  const [currentPage, setCurrentPage] = useState(1);
  
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  
  const goToPage = useCallback((page) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }, [totalPages]);
  
  const goToNextPage = useCallback(() => {
    goToPage(currentPage + 1);
  }, [currentPage, goToPage]);
  
  const goToPreviousPage = useCallback(() => {
    goToPage(currentPage - 1);
  }, [currentPage, goToPage]);
  
  const goToFirstPage = useCallback(() => {
    goToPage(1);
  }, [goToPage]);
  
  const goToLastPage = useCallback(() => {
    goToPage(totalPages);
  }, [goToPage, totalPages]);
  
  return {
    currentPage,
    totalPages,
    startIndex,
    endIndex,
    itemsPerPage,
    goToPage,
    goToNextPage,
    goToPreviousPage,
    goToFirstPage,
    goToLastPage,
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1
  };
};

// Hook for form validation
export const useValidation = (validationSchema) => {
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  const validate = useCallback((values) => {
    const newErrors = {};
    
    Object.keys(validationSchema).forEach(field => {
      const rules = validationSchema[field];
      const value = values[field];
      
      for (const rule of rules) {
        if (rule.required && (!value || value.toString().trim() === '')) {
          newErrors[field] = rule.message || `${field} is required`;
          break;
        }
        
        if (rule.pattern && value && !rule.pattern.test(value)) {
          newErrors[field] = rule.message || `${field} format is invalid`;
          break;
        }
        
        if (rule.minLength && value && value.length < rule.minLength) {
          newErrors[field] = rule.message || `${field} must be at least ${rule.minLength} characters`;
          break;
        }
        
        if (rule.maxLength && value && value.length > rule.maxLength) {
          newErrors[field] = rule.message || `${field} must be no more than ${rule.maxLength} characters`;
          break;
        }
        
        if (rule.min && value && parseFloat(value) < rule.min) {
          newErrors[field] = rule.message || `${field} must be at least ${rule.min}`;
          break;
        }
        
        if (rule.max && value && parseFloat(value) > rule.max) {
          newErrors[field] = rule.message || `${field} must be no more than ${rule.max}`;
          break;
        }
        
        if (rule.custom && value && !rule.custom(value, values)) {
          newErrors[field] = rule.message || `${field} is invalid`;
          break;
        }
      }
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [validationSchema]);

  const markFieldAsTouched = useCallback((field) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  }, []);

  const markAllAsTouched = useCallback((values) => {
    const allFields = Object.keys(values);
    setTouched(allFields.reduce((acc, field) => ({ ...acc, [field]: true }), {}));
  }, []);

  const clearErrors = useCallback(() => {
    setErrors({});
    setTouched({});
  }, []);

  const getFieldError = useCallback((field) => {
    return touched[field] ? errors[field] : null;
  }, [errors, touched]);

  const hasErrors = Object.keys(errors).length > 0;
  const isFieldValid = useCallback((field) => {
    return touched[field] && !errors[field];
  }, [errors, touched]);

  return {
    errors,
    touched,
    hasErrors,
    validate,
    markFieldAsTouched,
    markAllAsTouched,
    clearErrors,
    getFieldError,
    isFieldValid
  };
};