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
    console.log('🔄 === FALLBACK CLASSIFICATION START ===');
    console.log('📝 Original query:', `"${query}"`);

    const lowerQuery = query.toLowerCase().trim();
    console.log('📝 Lowercase query:', `"${lowerQuery}"`);

    // IMPORTANT: Check specific patterns before general ones!

    // Specific invoice viewing with ID (check this FIRST)
    const viewInvoicePattern = /(?:show|view|display|get).*?invoice.*?[#\s]*(\d+)|invoice\s*[#]*(\d+)/;
    console.log('🔍 Testing view_invoice pattern:', viewInvoicePattern);
    const viewInvoiceMatch = lowerQuery.match(viewInvoicePattern);
    console.log('🔍 view_invoice match result:', viewInvoiceMatch);

    if (viewInvoiceMatch) {
      const invoiceIdMatch = query.match(/(?:invoice|#)\s*(\d+)/i) || query.match(/(\d+)/);
      console.log('🔍 Invoice ID extraction:', invoiceIdMatch);
      const result = {
        intent: 'view_invoice',
        confidence: 0.9,
        entities: invoiceIdMatch ? { invoiceId: invoiceIdMatch[1] } : {},
        originalQuery: query,
        method: 'fallback'
      };
      console.log('✅ CLASSIFIED AS: view_invoice', result);
      return result;
    }

    // Invoice listing patterns - check AFTER specific invoice patterns
    // More specific patterns to avoid false matches with singular invoice requests
    const listInvoicesPattern = /(?:show|list|display|view|get)\s+(?:all\s+)?invoices(?:\s+list)?$|(?:show|list|display|view|get)\s+invoices\s*$|^(?:all\s+)?invoices\s*$|^my\s+invoices?$|(?:show|list|display|view|get)\s+all\s+invoices?/;
    console.log('🔍 Testing list_invoices pattern:', listInvoicesPattern);
    const listInvoicesMatch = lowerQuery.match(listInvoicesPattern);
    console.log('🔍 list_invoices match result:', listInvoicesMatch);

    if (listInvoicesMatch) {
      const result = {
        intent: 'list_invoices',
        confidence: 0.9,
        entities: {},
        originalQuery: query,
        method: 'fallback'
      };
      console.log('✅ CLASSIFIED AS: list_invoices', result);
      return result;
    }

    // Enhanced invoice creation with entities detection
    if (lowerQuery.match(/(?:create|new|make|generate).*?invoice.*?(?:for|customer|phone|\$|at)/)) {
      return {
        intent: 'create_invoice_with_data',
        confidence: 0.95,
        entities: {},
        originalQuery: query,
        method: 'fallback'
      };
    }

    // Simple invoice creation
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

    // Customer creation with data
    if (lowerQuery.match(/(?:create|add|new)\s+customer.*?(?:email|phone|address|with)/)) {
      return {
        intent: 'create_customer_with_data',
        confidence: 0.95,
        entities: {},
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

    // Product creation with data - enhanced patterns to catch various price formats
    if (lowerQuery.match(/(?:create|add|new)\s+(?:a\s+)?(?:new\s+)?product.*?(?:with.*?(?:price|cost|\$|priced)|(?:price|cost|priced).*?(?:tag|at|of)|\$\d+|for\s*\$|\d+\$|costs?\s*\$|\d+\s+dollars?)/)) {
      console.log('✅ Matched create_product_with_data pattern');
      return {
        intent: 'create_product_with_data',
        confidence: 0.95,
        entities: {},
        originalQuery: query,
        method: 'fallback'
      };
    }

    // Simple product creation (fallback - no price data)
    if (lowerQuery.match(/(?:create|add|new)\s+(?:a\s+)?(?:new\s+)?product(?:\s+[\w\s]+)?$|(?:create|add|new).*?product(?!\s*.*(?:price|cost|\$|priced|for))/)) {
      console.log('✅ Matched simple create_product pattern');
      return {
        intent: 'create_product',
        confidence: 0.8,
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
    console.log('❓ No patterns matched - returning unknown intent');
    const result = {
      intent: 'unknown',
      confidence: 0.0,
      entities: {},
      originalQuery: query,
      method: 'fallback'
    };
    console.log('❓ CLASSIFIED AS: unknown', result);
    return result;
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
        return {
          type: 'conversation',
          action: 'create_customer_with_entities',
          description: 'create customer from natural language'
        };

      case 'create_product_with_data':
        return {
          type: 'conversation',
          action: 'create_product_with_entities',
          description: 'create product from natural language'
        };

      case 'create_product':
        return {
          type: 'navigation',
          action: 'create_product',
          route: '/product',
          description: 'create new product'
        };

      case 'create_invoice_with_data':
        return {
          type: 'conversation',
          action: 'create_invoice_with_entities',
          description: 'create invoice from natural language'
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