import { useCallback } from 'react';
import { productApi } from '../services/api';
import { useApi, useMutation, useAsyncSearch } from './useApi';

// Hook for managing product data
export const useProducts = () => {
  const {
    data: products,
    loading,
    error,
    refetch
  } = useApi(() => productApi.getAll());

  const {
    mutate: createProduct,
    loading: creating,
    error: createError
  } = useMutation((productData) => productApi.create(productData));

  const {
    mutate: updateProduct,
    loading: updating,
    error: updateError
  } = useMutation(({ id, data }) => productApi.update(id, data));

  const {
    mutate: deleteProduct,
    loading: deleting,
    error: deleteError
  } = useMutation((id) => productApi.remove(id));

  return {
    products: products || [],
    loading,
    error,
    refetch,
    
    // Mutations
    createProduct,
    creating,
    createError,
    
    updateProduct,
    updating,
    updateError,
    
    deleteProduct,
    deleting,
    deleteError
  };
};

// Hook for product search
export const useProductSearch = (delay = 300) => {
  const searchProducts = useCallback(async (query) => {
    if (!query.trim()) return [];
    return productApi.search(query);
  }, []);

  const {
    query,
    setQuery,
    results,
    loading,
    error
  } = useAsyncSearch(searchProducts, delay);

  return {
    query,
    setQuery: setQuery,
    products: results,
    loading,
    error
  };
};

// Hook for single product
export const useProduct = (productId) => {
  const {
    data: product,
    loading,
    error,
    refetch
  } = useApi(
    productId ? () => productApi.getById(productId) : null,
    [productId]
  );

  const {
    data: productUsage,
    loading: usageLoading,
    error: usageError,
    refetch: refetchUsage
  } = useApi(
    productId ? () => productApi.getUsage(productId) : null,
    [productId]
  );

  return {
    product,
    loading,
    error,
    refetch,
    
    usage: productUsage || [],
    usageLoading,
    usageError,
    refetchUsage
  };
};