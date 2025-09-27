/**
 * Intent Classification Service
 * Uses AI model for natural language understanding instead of pattern matching
 */

import { pipeline } from '@xenova/transformers';

export class IntentClassifier {
  constructor() {
    this.classifier = null;
    this.isInitialized = false;
    this.intentExamples = {
      'list_invoices': [
        'show invoices',
        'show all invoices',
        'list invoices',
        'display invoices',
        'view invoices',
        'get invoices',
        'invoice list',
        'all invoices',
        'show my invoices',
        'display all invoices',
        'view invoice list'
      ],
      'view_invoice': [
        'show invoice 123',
        'view invoice #456',
        'display invoice 789',
        'get invoice 101',
        'invoice #202',
        'show invoice number 303'
      ],
      'create_invoice': [
        'create invoice',
        'new invoice',
        'add invoice',
        'create new invoice',
        'make invoice',
        'generate invoice',
        'invoice for customer'
      ],
      'list_customers': [
        'show customers',
        'list customers',
        'view customers',
        'customer list',
        'all customers',
        'display customers'
      ],
      'list_products': [
        'show products',
        'list products',
        'view products',
        'product list',
        'all products',
        'display products'
      ],
      'show_reports': [
        'show reports',
        'view reports',
        'display reports',
        'reports',
        'analytics',
        'dashboard'
      ]
    };
  }

  /**
   * Initialize the intent classifier
   * Uses your custom trained DistilBERT model for invoice management intents
   */
  async initialize() {
    if (this.isInitialized) return;

    // First try to load the custom model
    try {
      console.log('🤖 Initializing Custom Intent Classifier...');

      // Construct the correct path to the model
      const modelPath = '/models/invoice-classifier/';
      console.log('📁 Attempting to load model from:', modelPath);

      this.classifier = await pipeline('text-classification', modelPath, {
        quantized: true
        // Remove local_files_only for development
      });

      this.isInitialized = true;
      this.usingCustomModel = true;
      console.log('✅ Custom Intent Classifier initialized successfully');
      console.log('🎯 Model supports intents:', Object.keys(this.getSupportedIntents()));
      return;

    } catch (customError) {
      console.error('❌ Failed to initialize custom model:', customError);
      console.log('🔄 Falling back to pattern matching...');
    }

    // If custom model failed, use improved pattern matching instead of zero-shot
    // (zero-shot has the same path conflicts)
    this.isInitialized = true;
    this.usingCustomModel = false;
    this.classifier = null; // Will use fallback pattern matching
    console.log('⚠️ Using pattern matching fallback');
  }

  /**
   * Get supported intents from your trained model
   */
  getSupportedIntents() {
    return {
      'view_invoice': 0,
      'list_invoices': 1,
      'create_invoice': 2,
      'edit_invoice': 3,
      'list_customers': 4,
      'list_products': 5,
      'show_reports': 6,
      'overdue_invoices': 7,
      'help': 8,
      'create_product_with_data': 9,
      'create_customer_with_data': 10,
      'create_invoice_with_data': 11
    };
  }

  /**
   * Classify user intent from natural language query
   * @param {string} query - User input query
   * @returns {Promise<Object>} Classification result with intent and confidence
   */
  async classifyIntent(query) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      console.log('🔍 Classifying intent for query:', query);

      // Clean and normalize the query
      const normalizedQuery = query.toLowerCase().trim();

      let result, bestIntent, confidence;

      if (this.usingCustomModel && this.classifier) {
        // Use your trained model for classification
        result = await this.classifier(normalizedQuery);
        console.log('🎯 Custom model classification result:', result);

        // Handle both single classification and array results
        const classification = Array.isArray(result) ? result[0] : result;
        bestIntent = classification.label;
        confidence = classification.score;
      } else {
        // Use improved pattern matching fallback
        console.log('🎯 Using pattern matching fallback');
        return this.fallbackClassification(query);
      }

      // Extract additional entities based on intent
      let entities = {};

      if (bestIntent === 'view_invoice') {
        // Extract invoice ID
        const invoiceIdMatch = query.match(/(?:invoice|#)\s*(\d+)/i);
        if (invoiceIdMatch) {
          entities.invoiceId = invoiceIdMatch[1];
        }
      }

      return {
        intent: bestIntent,
        confidence: confidence,
        entities: entities,
        originalQuery: query,
        modelUsed: this.usingCustomModel ? 'custom' : 'zero-shot'
      };

    } catch (error) {
      console.error('❌ Custom model classification failed:', error);

      // Fallback to simple pattern matching
      return this.fallbackClassification(query);
    }
  }

  /**
   * Fallback classification using comprehensive pattern matching
   * @param {string} query - User query
   * @returns {Object} Classification result
   */
  fallbackClassification(query) {
    console.log('🔄 Using enhanced fallback pattern matching');

    const lowerQuery = query.toLowerCase().trim();

    // Invoice listing patterns - most common request
    if (lowerQuery.match(/(?:show|list|display|view|get).*?(?:all\s+)?invoices?(?:\s+list)?|(?:all\s+)?invoices?\s*$|my\s+invoices?/)) {
      return {
        intent: 'list_invoices',
        confidence: 0.9,
        entities: {},
        originalQuery: query,
        method: 'fallback'
      };
    }

    // Specific invoice viewing with ID
    if (lowerQuery.match(/(?:show|view|display|get).*?invoice.*?[#\s]*(\d+)|invoice\s*[#]*(\d+)/)) {
      const invoiceIdMatch = query.match(/(?:invoice|#)\s*(\d+)/i) || query.match(/(\d+)/);
      return {
        intent: 'view_invoice',
        confidence: 0.9,
        entities: invoiceIdMatch ? { invoiceId: invoiceIdMatch[1] } : {},
        originalQuery: query,
        method: 'fallback'
      };
    }

    // Invoice creation
    if (lowerQuery.match(/(?:create|new|add|make|generate).*?invoice|invoice.*?(?:create|new|add|make)/)) {
      return {
        intent: 'create_invoice',
        confidence: 0.9,
        entities: {},
        originalQuery: query,
        method: 'fallback'
      };
    }

    // Invoice editing
    if (lowerQuery.match(/(?:edit|modify|update|change).*?invoice.*?(\d+)|invoice.*?(\d+).*?(?:edit|modify|update|change)/)) {
      const invoiceIdMatch = query.match(/(?:invoice|#)\s*(\d+)/i) || query.match(/(\d+)/);
      return {
        intent: 'edit_invoice',
        confidence: 0.9,
        entities: invoiceIdMatch ? { invoiceId: invoiceIdMatch[1] } : {},
        originalQuery: query,
        method: 'fallback'
      };
    }

    // Customer listing
    if (lowerQuery.match(/(?:show|list|display|view|get).*?(?:all\s+)?customers?(?:\s+list)?|(?:all\s+)?customers?\s*$|my\s+customers?/)) {
      return {
        intent: 'list_customers',
        confidence: 0.9,
        entities: {},
        originalQuery: query,
        method: 'fallback'
      };
    }

    // Product listing
    if (lowerQuery.match(/(?:show|list|display|view|get).*?(?:all\s+)?products?(?:\s+list)?|(?:all\s+)?products?\s*$|my\s+products?/)) {
      return {
        intent: 'list_products',
        confidence: 0.9,
        entities: {},
        originalQuery: query,
        method: 'fallback'
      };
    }

    // Reports
    if (lowerQuery.match(/(?:show|view|display|get).*?reports?|reports?\s*$|analytics|dashboard/)) {
      return {
        intent: 'show_reports',
        confidence: 0.9,
        entities: {},
        originalQuery: query,
        method: 'fallback'
      };
    }

    // Overdue invoices
    if (lowerQuery.match(/overdue.*?invoices?|invoices?.*?overdue|late.*?invoices?|past.*?due/)) {
      return {
        intent: 'overdue_invoices',
        confidence: 0.9,
        entities: {},
        originalQuery: query,
        method: 'fallback'
      };
    }

    // Help requests
    if (lowerQuery.match(/help|what.*?can.*?do|commands?|options?/)) {
      return {
        intent: 'help',
        confidence: 0.9,
        entities: {},
        originalQuery: query,
        method: 'fallback'
      };
    }

    // Unknown intent
    return {
      intent: 'unknown',
      confidence: 0.0,
      entities: {},
      originalQuery: query,
      method: 'fallback'
    };
  }

  /**
   * Map classified intent to application action
   * @param {Object} classification - Result from classifyIntent
   * @returns {Object} Action object for the application
   */
  mapIntentToAction(classification) {
    const { intent, entities, confidence } = classification;

    // Require minimum confidence threshold (lower for custom model)
    if (confidence < 0.2) {
      return {
        type: 'help',
        response: 'I\'m not sure what you want to do. Try saying "show invoices" or "create invoice".'
      };
    }

    switch (intent) {
      case 'list_invoices':
        return {
          type: 'navigation',
          action: 'list_invoices',
          route: '/invoices',
          description: 'show all invoices'
        };

      case 'view_invoice':
        if (entities.invoiceId) {
          return {
            type: 'navigation',
            action: 'view_invoice',
            invoiceId: entities.invoiceId,
            route: `/invoice/${entities.invoiceId}`,
            description: `view invoice #${entities.invoiceId}`
          };
        } else {
          return {
            type: 'help',
            response: 'Please specify an invoice number, like "show invoice 123".'
          };
        }

      case 'create_invoice':
        return {
          type: 'navigation',
          action: 'create_invoice',
          route: '/invoice',
          description: 'create new invoice'
        };

      case 'edit_invoice':
        if (entities.invoiceId) {
          return {
            type: 'navigation',
            action: 'edit_invoice',
            invoiceId: entities.invoiceId,
            route: `/invoice/${entities.invoiceId}`,
            description: `edit invoice #${entities.invoiceId}`
          };
        } else {
          return {
            type: 'help',
            response: 'Please specify an invoice number to edit, like "edit invoice 123".'
          };
        }

      case 'list_customers':
        return {
          type: 'navigation',
          action: 'list_customers',
          route: '/customers',
          description: 'show customers'
        };

      case 'list_products':
        return {
          type: 'navigation',
          action: 'list_products',
          route: '/products',
          description: 'show products'
        };

      case 'show_reports':
        return {
          type: 'navigation',
          action: 'show_reports',
          route: '/reports',
          description: 'show reports'
        };

      case 'overdue_invoices':
        return {
          type: 'navigation',
          action: 'list_invoices',
          route: '/invoices?filter=overdue',
          description: 'show overdue invoices'
        };

      case 'create_customer_with_data':
      case 'create_product_with_data':
      case 'create_invoice_with_data':
        // These are handled by the existing entity extraction logic
        return {
          type: 'conversation',
          action: 'guided_creation',
          description: 'start guided creation process'
        };

      case 'help':
        return {
          type: 'help',
          response: `I can help you with:
• "Show invoices" - View invoice list
• "Show invoice #123" - View specific invoice
• "Create invoice" - Start creating an invoice
• "Edit invoice #123" - Edit an existing invoice
• "Show customers" - View customer list
• "Show products" - View product catalog
• "Show reports" - View reports dashboard
• "Show overdue invoices" - View overdue invoices`
        };

      default:
        return {
          type: 'help',
          response: `I can help you with:
• "Show invoices" - View invoice list
• "Show invoice #123" - View specific invoice
• "Create invoice" - Start creating an invoice
• "Show customers" - View customer list
• "Show products" - View product catalog
• "Show reports" - View reports dashboard`
        };
    }
  }
}

// Create singleton instance
export const intentClassifier = new IntentClassifier();