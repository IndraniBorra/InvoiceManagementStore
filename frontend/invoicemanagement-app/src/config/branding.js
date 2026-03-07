/**
 * Branding Configuration
 * 
 * Centralized configuration for company branding and logo management.
 * Update these values to change branding across the entire application.
 */

export const BRANDING = {
  // Logo Configuration
  logo: {
    // Main logo path (relative to public folder) - corrected path to match actual location
    default: '/assets/app-logo.png',
    // Alternative logo for dark themes (optional)
    dark: '/assets/app-logo-dark.png', // Add this file if you have a dark version
    // Fallback image if logo fails to load
    fallback: '/assets/app-logo.png',
    // Alt text for accessibility
    alt: 'Company Logo'
  },

  // Company Information
  company: {
    name: 'Invoice Management Store',
    shortName: 'IMS',
    tagline: 'Professional Invoice Management Solutions',
    
    // Contact Information (for invoices and reports)
    address: {
      street: '123 Business Street',
      city: 'Your City',
      state: 'State',
      zip: '12345',
      country: 'Country'
    },
    
    contact: {
      phone: '+1 (555) 123-4567',
      email: 'info@invoicestore.com',
      website: 'www.invoicestore.com'
    }
  },

  // Logo Sizes Configuration
  logoSizes: {
    xs: {
      width: '32px',
      height: 'auto',
      className: 'logo-xs'
    },
    sm: {
      width: '64px', 
      height: 'auto',
      className: 'logo-sm'
    },
    md: {
      width: '120px',
      height: 'auto', 
      className: 'logo-md'
    },
    lg: {
      width: '180px',
      height: 'auto',
      className: 'logo-lg'
    },
    xl: {
      width: '240px',
      height: 'auto',
      className: 'logo-xl'
    }
  },

  // Theme Colors (can be used for branding consistency)
  colors: {
    primary: '#007bff',
    secondary: '#6c757d',
    success: '#28a745',
    danger: '#dc3545',
    warning: '#ffc107',
    info: '#17a2b8'
  }
};

/**
 * Helper function to get logo path with fallback
 */
export const getLogoPath = (theme = 'default') => {
  return BRANDING.logo[theme] || BRANDING.logo.default;
};

/**
 * Helper function to get logo size configuration
 */
export const getLogoSize = (size = 'md') => {
  return BRANDING.logoSizes[size] || BRANDING.logoSizes.md;
};

/**
 * Helper function to get company information
 */
export const getCompanyInfo = () => {
  return BRANDING.company;
};

export default BRANDING;