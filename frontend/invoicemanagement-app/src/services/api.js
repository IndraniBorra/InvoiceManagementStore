import axios from 'axios';

// Create axios instance with base configuration
const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8000',
  timeout: 45000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Log request in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`🚀 ${config.method?.toUpperCase()} ${config.url}`);
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    // Log response in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`✅ ${response.status} ${response.config.method?.toUpperCase()} ${response.config.url}`);
    }
    
    return response;
  },
  (error) => {
    // Log error in development
    if (process.env.NODE_ENV === 'development') {
      console.error(`❌ ${error.response?.status || 'Network Error'} ${error.config?.method?.toUpperCase()} ${error.config?.url}`, error.response?.data);
    }
    
    // Handle common errors
    if (error.response?.status === 401) {
      // Handle unauthorized - redirect to login
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    
    return Promise.reject(error);
  }
);

// Generic API service
class ApiService {
  constructor(baseEndpoint) {
    this.baseEndpoint = baseEndpoint;
  }
  
  // Generic GET request
  async get(endpoint = '', params = {}) {
    const response = await apiClient.get(`${this.baseEndpoint}${endpoint}`, { params });
    return response.data;
  }
  
  // Generic POST request
  async post(endpoint = '', data = {}) {
    const response = await apiClient.post(`${this.baseEndpoint}${endpoint}`, data);
    return response.data;
  }
  
  // Generic PUT request
  async put(endpoint = '', data = {}) {
    const response = await apiClient.put(`${this.baseEndpoint}${endpoint}`, data);
    return response.data;
  }
  
  // Generic PATCH request
  async patch(endpoint = '', data = {}) {
    const response = await apiClient.patch(`${this.baseEndpoint}${endpoint}`, data);
    return response.data;
  }
  
  // Generic DELETE request
  async delete(endpoint = '') {
    const response = await apiClient.delete(`${this.baseEndpoint}${endpoint}`);
    return response.data;
  }
  
  // Get by ID
  async getById(id) {
    return this.get(`/${id}`);
  }
  
  // Create new resource
  async create(data) {
    return this.post('', data);
  }
  
  // Update resource
  async update(id, data) {
    return this.put(`/${id}`, data);
  }
  
  // Delete resource
  async remove(id) {
    return this.delete(`/${id}`);
  }
  
  // Get all with optional filtering and pagination
  async getAll(filters = {}) {
    return this.get('', filters);
  }
}

// Specific service instances
export const invoiceService = new ApiService('/invoice');
export const customerService = new ApiService('/customers');
export const productService = new ApiService('/products');

// Enhanced invoice service with specific methods
class InvoiceApiService extends ApiService {
  constructor() {
    super('/invoice');
  }
  
  // Get invoice with full details (including line items)
  async getInvoiceDetails(id) {
    return this.get(`/${id}`);
  }
  
  // Update invoice status
  async updateStatus(id, status) {
    return this.patch(`/${id}`, { invoice_status: status });
  }
  
  // Generate invoice PDF
  async generatePDF(id) {
    const response = await apiClient.get(`/invoice/${id}/pdf`, {
      responseType: 'blob'
    });
    return response.data;
  }
  
  // Get invoice summary/analytics
  async getSummary() {
    return this.get('/summary');
  }
}

export const invoiceApi = new InvoiceApiService();

// Enhanced customer service
class CustomerApiService extends ApiService {
  constructor() {
    super('/customers'); // For GET operations (plural)
  }

  // Override create method to use singular endpoint
  async create(data) {
    const response = await apiClient.post('/customer', data); // Singular for POST
    return response.data;
  }

  // Search customers by name or email
  async search(query) {
    return this.get('', { search: query });
  }

  // Get customer invoices
  async getInvoices(customerId) {
    return this.get(`/${customerId}/invoices`);
  }
}

export const customerApi = new CustomerApiService();

// Enhanced product service
class ProductApiService extends ApiService {
  constructor() {
    super('/products'); // For GET operations (plural)
  }

  // Override create method to use singular endpoint
  async create(data) {
    const response = await apiClient.post('/product', data); // Singular for POST
    return response.data;
  }

  // Search products by description
  async search(query) {
    return this.get('', { search: query });
  }

  // Get product usage analytics
  async getUsage(productId) {
    return this.get(`/${productId}/usage`);
  }
}

export const productApi = new ProductApiService();

// Enhanced report service
class ReportApiService extends ApiService {
  constructor() {
    super('/reports');
  }
  
  // Revenue Summary Dashboard
  async getRevenueSummary() {
    return this.get('/revenue-summary');
  }
  
  // All Invoices Report
  async getAllInvoicesReport(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        params.append(key, value);
      }
    });
    return this.get(`/invoices?${params.toString()}`);
  }
  
  // Customer Report
  async getCustomerReport(customerId) {
    return this.get(`/customer/${customerId}`);
  }
  
  // Invoice Aging Report
  async getAgingReport(asOfDate = null) {
    const params = asOfDate ? `?as_of_date=${asOfDate}` : '';
    return this.get(`/aging${params}`);
  }
  
  // Overdue Invoices Report
  async getOverdueReport() {
    return this.get('/overdue');
  }
  
  // Get customers list for dropdowns
  async getCustomersForReports() {
    return this.get('/customers/list');
  }
  
  // Get summary statistics
  async getSummaryStats() {
    return this.get('/summary-stats');
  }
}

export const reportApi = new ReportApiService();

// Utility functions for error handling
export const handleApiError = (error) => {
  if (error.response?.data?.detail) {
    // FastAPI validation errors
    if (Array.isArray(error.response.data.detail)) {
      return error.response.data.detail
        .map(err => `${err.loc.join('.')}: ${err.msg}`)
        .join('\n');
    }
    return error.response.data.detail;
  }
  
  if (error.response?.data?.message) {
    return error.response.data.message;
  }
  
  if (error.message) {
    return error.message;
  }
  
  return 'An unexpected error occurred';
};

// Export the configured axios instance for direct use if needed
export { apiClient };

// Export default as the original api for backward compatibility
export default apiClient;