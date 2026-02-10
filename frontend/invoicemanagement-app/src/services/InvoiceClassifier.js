import { pipeline, env } from '@xenova/transformers';

// Configure transformers environment for browser compatibility
env.allowLocalModels = true;   // Allow local model loading from /public/models/
env.allowRemoteModels = true;  // Allow downloading from Hugging Face as fallback
env.useBrowserCache = false;   // Disable cache to avoid stale 404 responses

/**
 * Fine-tuned Invoice Command Classifier
 * Uses a custom DistilBERT model trained specifically for invoice management commands
 */
class InvoiceClassifier {
  constructor() {
    this.classifier = null;
    this.isLoading = false;
    this.isLoaded = false;

    // Action mappings from enhanced 12-action fine-tuned model
    this.actionMappings = {
      // Original 9 actions
      'view_invoice': {
        type: 'navigation',
        route: '/invoice/{id}',
        action: 'view_invoice',
        requiresId: true
      },
      'list_invoices': {
        type: 'navigation',
        route: '/invoices',
        action: 'list_invoices',
        requiresId: false
      },
      'create_invoice': {
        type: 'navigation',
        route: '/invoice',
        action: 'create_invoice',
        requiresId: false
      },
      'edit_invoice': {
        type: 'navigation',
        route: '/edit-invoice/{id}',
        action: 'edit_invoice',
        requiresId: true
      },
      'list_customers': {
        type: 'navigation',
        route: '/customer',
        action: 'list_customers',
        requiresId: false
      },
      'list_products': {
        type: 'navigation',
        route: '/product',
        action: 'list_products',
        requiresId: false
      },
      'show_reports': {
        type: 'navigation',
        route: '/reports',
        action: 'show_reports',
        requiresId: false
      },
      'overdue_invoices': {
        type: 'api_call',
        endpoint: '/reports/overdue',
        action: 'overdue_invoices',
        requiresId: false
      },
      'help': {
        type: 'help',
        route: null,
        action: 'help',
        requiresId: false
      },

      // New entity creation actions
      'create_product_with_data': {
        type: 'entity_creation',
        route: '/product',
        action: 'create_product_with_data',
        requiresId: false,
        requiresExtraction: true,
        entityType: 'product'
      },
      'create_customer_with_data': {
        type: 'entity_creation',
        route: '/customer',
        action: 'create_customer_with_data',
        requiresId: false,
        requiresExtraction: true,
        entityType: 'customer'
      },
      'create_invoice_with_data': {
        type: 'entity_creation',
        route: '/invoice',
        action: 'create_invoice_with_data',
        requiresId: false,
        requiresExtraction: true,
        entityType: 'invoice'
      }
    };

    // Confidence thresholds
    this.highConfidenceThreshold = 0.75;
    this.minimumConfidenceThreshold = 0.3;
  }

  /**
   * Initialize the fine-tuned classifier
   */
  async initialize(progressCallback = null) {
    if (this.isLoaded) {
      return { success: true, message: 'Classifier already loaded' };
    }

    if (this.isLoading) {
      return { success: false, message: 'Classifier is already loading' };
    }

    this.isLoading = true;

    try {
      console.log('🤖 Loading fine-tuned invoice classifier...');

      if (progressCallback) {
        progressCallback({ status: 'loading', message: 'Initializing fine-tuned model...' });
      }

      // Check for SharedArrayBuffer support
      if (typeof SharedArrayBuffer === 'undefined') {
        console.warn('⚠️ SharedArrayBuffer not available, model may load slower');
      }

      // Load the fine-tuned model from public/models directory
      const modelPath = '/models/invoice-classifier-oonx';

      console.log(`📂 Loading model from: ${modelPath}`);

      this.classifier = await pipeline(
        'text-classification',
        modelPath,
        {
          local_files_only: true,  // Force local loading only
          quantized: true,
          progress_callback: (data) => {
            console.log('📊 Model loading progress:', data);
            if (progressCallback) {
              if (data.status === 'progress') {
                const percent = Math.round(data.progress * 100);
                progressCallback({
                  status: 'progress',
                  message: `Loading ${data.file}: ${percent}%`,
                  progress: data.progress
                });
              } else if (data.status === 'done') {
                progressCallback({
                  status: 'done',
                  message: `✅ Loaded: ${data.file}`
                });
              }
            }
          }
        }
      );

      this.isLoaded = true;
      this.isLoading = false;

      console.log('✅ Fine-tuned invoice classifier loaded successfully!');

      if (progressCallback) {
        progressCallback({
          status: 'complete',
          message: '🎉 Fine-tuned classifier ready!'
        });
      }

      return { success: true, message: 'Fine-tuned classifier loaded successfully' };

    } catch (error) {
      this.isLoading = false;
      console.error('❌ Failed to load fine-tuned classifier:', error);

      if (progressCallback) {
        progressCallback({
          status: 'error',
          message: `❌ Failed to load model: ${error.message}`
        });
      }

      return {
        success: false,
        message: `Failed to load classifier: ${error.message}`,
        error
      };
    }
  }

  /**
   * Classify a user command and return structured action
   */
  async classifyCommand(query) {
    if (!this.isLoaded || !this.classifier) {
      throw new Error('Classifier not initialized. Call initialize() first.');
    }

    if (!query || typeof query !== 'string') {
      throw new Error('Query must be a non-empty string');
    }

    try {
      console.log('🔍 Classifying command:', query);

      // Get classification results
      const results = await this.classifier(query.trim());

      if (!results || !Array.isArray(results) || results.length === 0) {
        throw new Error('No classification results returned');
      }

      // Sort by confidence score
      const sortedResults = results.sort((a, b) => b.score - a.score);
      const topResult = sortedResults[0];

      console.log('🎯 Classification results:', {
        query,
        topPrediction: topResult.label,
        confidence: topResult.score,
        allResults: sortedResults.slice(0, 3)
      });

      // Extract potential invoice ID from query
      const idMatch = query.match(/\b(\d+)\b/);
      const extractedId = idMatch ? idMatch[1] : null;

      // Get action configuration
      const actionConfig = this.actionMappings[topResult.label];

      if (!actionConfig) {
        throw new Error(`Unknown action: ${topResult.label}`);
      }

      // Validate ID requirement
      if (actionConfig.requiresId && !extractedId) {
        console.warn('⚠️ Action requires ID but none found:', topResult.label);
        return {
          action: topResult.label,
          confidence: topResult.score,
          isHighConfidence: topResult.score >= this.highConfidenceThreshold,
          error: 'ID required but not found',
          extractedId: null,
          route: null,
          allResults: sortedResults,
          fallbackToPattern: true
        };
      }

      // Generate route with ID if needed
      let route = actionConfig.route;
      if (route && extractedId && actionConfig.requiresId) {
        route = route.replace('{id}', extractedId);
      }

      return {
        action: topResult.label,
        confidence: topResult.score,
        isHighConfidence: topResult.score >= this.highConfidenceThreshold,
        type: actionConfig.type,
        route: route,
        endpoint: actionConfig.endpoint || null,
        extractedId: extractedId,
        description: this.generateDescription(topResult.label, extractedId),
        allResults: sortedResults,
        fallbackToPattern: topResult.score < this.minimumConfidenceThreshold
      };

    } catch (error) {
      console.error('🚨 Classification error:', error);
      throw new Error(`Classification failed: ${error.message}`);
    }
  }

  /**
   * Generate human-readable description
   */
  generateDescription(action, id = null, extractedData = null) {
    const descriptions = {
      // Original actions
      'view_invoice': id ? `view invoice #${id}` : 'view specific invoice',
      'list_invoices': 'show all invoices',
      'create_invoice': 'create a new invoice',
      'edit_invoice': id ? `edit invoice #${id}` : 'edit specific invoice',
      'list_customers': 'show customers',
      'list_products': 'show products',
      'show_reports': 'show reports',
      'overdue_invoices': 'show overdue invoices',
      'help': 'show help',

      // New entity creation actions
      'create_product_with_data': extractedData ?
        `create product "${extractedData.product_description}" at $${extractedData.product_price}` :
        'create product with extracted data',
      'create_customer_with_data': extractedData ?
        `create customer "${extractedData.customer_name}"` :
        'create customer with extracted data',
      'create_invoice_with_data': extractedData ?
        `create invoice for "${extractedData.customer_info?.customer_name || 'customer'}"` :
        'create invoice with extracted data'
    };

    return descriptions[action] || action;
  }

  /**
   * Test the classifier with sample queries
   */
  async runTests() {
    if (!this.isLoaded) {
      console.error('❌ Classifier not loaded. Call initialize() first.');
      return;
    }

    const testQueries = [
      // Original action tests
      'view invoice 123',
      'view invoice #456',
      'show all invoices',
      'list invoices',
      'create new invoice',
      'edit invoice 789',
      'show customers',
      'display products',
      'show reports',
      'overdue invoices',

      // New entity creation action tests
      'create product WaterBottle price 5 dollars',
      'add product Laptop description gaming laptop cost 1200',
      'make product Coffee Mug priced at 15 USD',
      'add customer John Smith email john@example.com phone 555-1234',
      'create customer Sarah Johnson address 123 Main St',
      'register customer Mike Wilson email mike@test.com',
      'create invoice for customer John with product Laptop quantity 2 at 1000 each',
      'make invoice for Sarah 5 Coffee Mugs at 15 dollars each',
      'new invoice customer Mike product WaterBottle qty 10 price 5'
    ];

    console.log('🧪 Testing fine-tuned classifier:');
    console.log('=' .repeat(60));

    for (const query of testQueries) {
      try {
        const result = await this.classifyCommand(query);
        console.log(`Query: "${query}"`);
        console.log(`  → ${result.action} (confidence: ${result.confidence.toFixed(3)})`);
        console.log(`  → Route: ${result.route || 'N/A'}`);
        console.log(`  → High confidence: ${result.isHighConfidence ? '✅' : '❌'}`);
        console.log();
      } catch (error) {
        console.error(`❌ Error testing "${query}":`, error.message);
      }
    }
  }

  /**
   * Get classifier status
   */
  getStatus() {
    return {
      isLoaded: this.isLoaded,
      isLoading: this.isLoading,
      supportedActions: Object.keys(this.actionMappings),
      thresholds: {
        highConfidence: this.highConfidenceThreshold,
        minimum: this.minimumConfidenceThreshold
      }
    };
  }
}

export default InvoiceClassifier;