import React from 'react';
import AutoComplete from '../AutoComplete';
import { SEARCH_PRESETS, COMMON_ACTIONS, mergeSearchProps } from './SearchPresets';

/**
 * ProductSearch Component
 * 
 * Pre-configured AutoComplete component for product search functionality.
 * Optimized for product selection in invoices and inventory management.
 */
const ProductSearch = ({ 
  onSelect, 
  size = 'md', 
  variant = 'default',
  showCreateAction = false,
  customActions = [],
  ...customProps 
}) => {
  // Merge preset configuration with custom props
  const searchProps = mergeSearchProps(
    SEARCH_PRESETS.PRODUCTS,
    customProps
  );

  // Prepare custom actions
  const actions = [];
  if (showCreateAction) {
    actions.push({
      ...COMMON_ACTIONS.CREATE_PRODUCT,
      onClick: () => {
        // This can be customized per implementation
        console.log('Navigate to create product');
      }
    });
  }
  actions.push(...customActions);

  // Handle product selection
  const handleProductSelect = (product, productId) => {
    if (onSelect) {
      onSelect(product, productId);
    }
  };

  return (
    <AutoComplete
      {...searchProps}
      size={size}
      variant={variant}
      customActions={actions}
      onSelect={handleProductSelect}
    />
  );
};

export default ProductSearch;