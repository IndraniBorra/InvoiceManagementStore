import React from 'react';
import AutoComplete from '../AutoComplete';
import { SEARCH_PRESETS, mergeSearchProps } from './SearchPresets';

/**
 * ReportsCustomerSearch Component
 * 
 * Specialized customer search component for reports filtering.
 * Optimized for report filtering with additional metadata display.
 */
const ReportsCustomerSearch = ({ 
  onSelect, 
  size = 'md', 
  variant = 'default',
  customActions = [],
  ...customProps 
}) => {
  // Merge preset configuration with custom props
  const searchProps = mergeSearchProps(
    SEARCH_PRESETS.CUSTOMERS_REPORTS,
    customProps
  );

  // Handle customer selection
  const handleCustomerSelect = (customer, customerId) => {
    if (onSelect) {
      onSelect(customer, customerId);
    }
  };

  return (
    <AutoComplete
      {...searchProps}
      size={size}
      variant={variant}
      customActions={customActions}
      onSelect={handleCustomerSelect}
    />
  );
};

export default ReportsCustomerSearch;