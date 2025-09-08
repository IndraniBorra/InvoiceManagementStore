import React from 'react';
import { useNavigate } from 'react-router-dom';
import AutoComplete from '../AutoComplete';
import { SEARCH_PRESETS, COMMON_ACTIONS, mergeSearchProps } from './SearchPresets';

/**
 * CustomerSearch Component
 * 
 * Pre-configured AutoComplete component for customer search functionality.
 * Provides consistent customer search behavior across the application.
 */
const CustomerSearch = ({ 
  onSelect, 
  size = 'md', 
  variant = 'default',
  showCreateAction = true,
  customActions = [],
  ...customProps 
}) => {
  const navigate = useNavigate();

  // Merge preset configuration with custom props
  const searchProps = mergeSearchProps(
    SEARCH_PRESETS.CUSTOMERS,
    customProps
  );

  // Prepare custom actions
  const actions = [];
  if (showCreateAction) {
    actions.push({
      ...COMMON_ACTIONS.CREATE_CUSTOMER,
      onClick: () => navigate('/customer')
    });
  }
  actions.push(...customActions);

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
      customActions={actions}
      onSelect={handleCustomerSelect}
    />
  );
};

export default CustomerSearch;