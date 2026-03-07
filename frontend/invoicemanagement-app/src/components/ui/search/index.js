/**
 * Search Components Barrel File
 * 
 * Provides convenient imports for all search-related components
 */

// Core search component
export { default as AutoComplete } from '../AutoComplete';

// Specialized search components
export { default as CustomerSearch } from './CustomerSearch';
export { default as ProductSearch } from './ProductSearch';
export { default as InvoiceSearch } from './InvoiceSearch';
export { default as ReportsCustomerSearch } from './ReportsCustomerSearch';

// Configuration and utilities
export {
  SEARCH_PRESETS,
  SEARCH_SIZES,
  SEARCH_THEMES,
  COMMON_ACTIONS,
  mergeSearchProps
} from './SearchPresets';