import { useCallback } from 'react';
import { customerApi } from '../services/api';
import { useApi, useMutation, useAsyncSearch } from './useApi';

// Hook for managing customer data
export const useCustomers = () => {
  const {
    data: customers,
    loading,
    error,
    refetch
  } = useApi(() => customerApi.getAll());

  const {
    mutate: createCustomer,
    loading: creating,
    error: createError
  } = useMutation((customerData) => customerApi.create(customerData));

  const {
    mutate: updateCustomer,
    loading: updating,
    error: updateError
  } = useMutation(({ id, data }) => customerApi.update(id, data));

  const {
    mutate: deleteCustomer,
    loading: deleting,
    error: deleteError
  } = useMutation((id) => customerApi.remove(id));

  return {
    customers: customers || [],
    loading,
    error,
    refetch,
    
    // Mutations
    createCustomer,
    creating,
    createError,
    
    updateCustomer,
    updating,
    updateError,
    
    deleteCustomer,
    deleting,
    deleteError
  };
};

// Hook for customer search
export const useCustomerSearch = (delay = 300) => {
  const searchCustomers = useCallback(async (query) => {
    if (!query.trim()) return [];
    return customerApi.search(query);
  }, []);

  const {
    query,
    setQuery,
    results,
    loading,
    error
  } = useAsyncSearch(searchCustomers, delay);

  return {
    query,
    setQuery: setQuery,
    customers: results,
    loading,
    error
  };
};

// Hook for single customer
export const useCustomer = (customerId) => {
  const {
    data: customer,
    loading,
    error,
    refetch
  } = useApi(
    customerId ? () => customerApi.getById(customerId) : null,
    [customerId]
  );

  const {
    data: customerInvoices,
    loading: invoicesLoading,
    error: invoicesError,
    refetch: refetchInvoices
  } = useApi(
    customerId ? () => customerApi.getInvoices(customerId) : null,
    [customerId]
  );

  return {
    customer,
    loading,
    error,
    refetch,
    
    invoices: customerInvoices || [],
    invoicesLoading,
    invoicesError,
    refetchInvoices
  };
};