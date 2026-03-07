/**
 * Search Component Presets
 * 
 * Pre-configured settings for common search use cases.
 * Makes it easy to implement consistent search functionality across the app.
 */

export const SEARCH_PRESETS = {
  /**
   * Customer Search Configuration
   * Used for: Customer selection, customer filtering, customer autocomplete
   */
  CUSTOMERS: {
    fetchUrl: "/customers",
    displayFields: ['customer_name', 'customer_email'],
    searchFields: ['customer_name', 'customer_email', 'customer_phone'],
    valueField: "customer_id",
    showAvatar: true,
    avatarField: "customer_name",
    metaFields: ['customer_email'],
    placeholder: "Search customers...",
    minCharsToSearch: 0,
    maxResults: 50
  },

  /**
   * Product Search Configuration  
   * Used for: Product selection in invoices, product filtering, inventory search
   */
  PRODUCTS: {
    fetchUrl: "/products",
    displayFields: ['product_description'],
    searchFields: ['product_description'],
    valueField: "product_id",
    showAvatar: false,
    metaFields: ['product_price'],
    placeholder: "Search products...",
    minCharsToSearch: 1,
    maxResults: 100
  },

  /**
   * Invoice Search Configuration
   * Used for: Invoice lookup, invoice filtering, invoice references
   */
  INVOICES: {
    fetchUrl: "/invoices",
    displayFields: ['invoice_number', 'customer_name'],
    searchFields: ['invoice_number', 'customer_name'],
    valueField: "invoice_id", 
    showAvatar: false,
    metaFields: ['invoice_status', 'invoice_total'],
    placeholder: "Search invoices...",
    minCharsToSearch: 1,
    maxResults: 50
  },

  /**
   * Customer Search for Reports
   * Optimized for report filtering with additional metadata
   */
  CUSTOMERS_REPORTS: {
    fetchUrl: "/reports/customers/list",
    displayFields: ['customer_name', 'customer_email'],
    searchFields: ['customer_name', 'customer_email'],
    valueField: "customer_id",
    showAvatar: true,
    avatarField: "customer_name", 
    metaFields: ['customer_email'],
    placeholder: "Filter by customer...",
    minCharsToSearch: 0,
    maxResults: 25
  }
};

/**
 * Search Component Size Variants
 */
export const SEARCH_SIZES = {
  sm: {
    containerClassName: 'search-container--sm',
    inputClassName: 'search-input--sm',
    dropdownClassName: 'search-dropdown--sm'
  },
  md: {
    containerClassName: 'search-container--md',
    inputClassName: 'search-input--md', 
    dropdownClassName: 'search-dropdown--md'
  },
  lg: {
    containerClassName: 'search-container--lg',
    inputClassName: 'search-input--lg',
    dropdownClassName: 'search-dropdown--lg'
  }
};

/**
 * Search Component Theme Variants
 */
export const SEARCH_THEMES = {
  default: {
    containerClassName: 'search-theme--default'
  },
  outline: {
    containerClassName: 'search-theme--outline'
  },
  filled: {
    containerClassName: 'search-theme--filled'
  },
  minimal: {
    containerClassName: 'search-theme--minimal'
  }
};

/**
 * Common Custom Actions for Search Components
 */
export const COMMON_ACTIONS = {
  CREATE_CUSTOMER: {
    label: "Create New Customer",
    icon: "➕",
    color: "var(--color-primary)",
    onClick: () => {
      // This will be overridden by the component using it
      console.log("Navigate to create customer");
    }
  },
  
  CREATE_PRODUCT: {
    label: "Add New Product", 
    icon: "🛍️",
    color: "var(--color-success)",
    onClick: () => {
      console.log("Navigate to create product");
    }
  },
  
  CREATE_INVOICE: {
    label: "Create New Invoice",
    icon: "📄", 
    color: "var(--color-info)",
    onClick: () => {
      console.log("Navigate to create invoice");
    }
  }
};

/**
 * Utility function to merge preset with custom props
 */
export const mergeSearchProps = (preset, customProps = {}) => {
  return {
    ...preset,
    ...customProps,
    // Ensure arrays are properly merged
    displayFields: customProps.displayFields || preset.displayFields,
    searchFields: customProps.searchFields || preset.searchFields,
    metaFields: customProps.metaFields || preset.metaFields,
    customActions: [
      ...(preset.customActions || []),
      ...(customProps.customActions || [])
    ]
  };
};