import React from 'react';
import AutoComplete from '../AutoComplete';
import { SEARCH_PRESETS, COMMON_ACTIONS, mergeSearchProps } from './SearchPresets';

/**
 * InvoiceSearch Component
 * 
 * Pre-configured AutoComplete component for invoice search functionality.
 * Used for invoice lookup, filtering, and references.
 */
const InvoiceSearch = ({ 
  onSelect, 
  size = 'md', 
  variant = 'default',
  showCreateAction = false,
  customActions = [],
  ...customProps 
}) => {
  // Merge preset configuration with custom props
  const searchProps = mergeSearchProps(
    SEARCH_PRESETS.INVOICES,
    customProps
  );

  // Prepare custom actions
  const actions = [];
  if (showCreateAction) {
    actions.push({
      ...COMMON_ACTIONS.CREATE_INVOICE,
      onClick: () => {
        // This can be customized per implementation
        console.log('Navigate to create invoice');
      }
    });
  }
  actions.push(...customActions);

  // Handle invoice selection
  const handleInvoiceSelect = (invoice, invoiceId) => {
    if (onSelect) {
      onSelect(invoice, invoiceId);
    }
  };

  return (
    <AutoComplete
      {...searchProps}
      size={size}
      variant={variant}
      customActions={actions}
      onSelect={handleInvoiceSelect}
    />
  );
};

export default InvoiceSearch;