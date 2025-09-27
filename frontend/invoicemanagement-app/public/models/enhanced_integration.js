
// Enhanced Invoice Management LLM Integration - 12 Actions with Entity Creation
import { pipeline } from '@xenova/transformers';

class InvoiceCommandClassifier {
  constructor() {
    this.classifier = null;
    this.actionMappings = {
      // Original 9 actions
      'view_invoice': { route: '/invoice/{id}', action: 'view_invoice', requiresId: true },
      'list_invoices': { route: '/invoices', action: 'list_invoices', requiresId: false },
      'create_invoice': { route: '/invoice', action: 'create_invoice', requiresId: false },
      'edit_invoice': { route: '/edit-invoice/{id}', action: 'edit_invoice', requiresId: true },
      'list_customers': { route: '/customer', action: 'list_customers', requiresId: false },
      'list_products': { route: '/product', action: 'list_products', requiresId: false },
      'show_reports': { route: '/reports', action: 'show_reports', requiresId: false },
      'overdue_invoices': { route: '/reports', action: 'overdue_invoices', requiresId: false },
      'help': { route: null, action: 'help', requiresId: false },
      
      // New entity creation actions
      'create_product_with_data': { 
        route: '/product', 
        action: 'create_product_with_data', 
        requiresId: false,
        requiresExtraction: true,
        entityType: 'product'
      },
      'create_customer_with_data': { 
        route: '/customer', 
        action: 'create_customer_with_data', 
        requiresId: false,
        requiresExtraction: true,
        entityType: 'customer'
      },
      'create_invoice_with_data': { 
        route: '/invoice', 
        action: 'create_invoice_with_data', 
        requiresId: false,
        requiresExtraction: true,
        entityType: 'invoice'
      }
    };
  }

  async initialize() {
    console.log('🤖 Loading enhanced 12-action invoice classifier...');
    this.classifier = await pipeline(
      'text-classification',
      './invoice-classifier-onnx',
      {
        quantized: true,
        progress_callback: (data) => {
          console.log('📊 Loading progress:', data);
        }
      }
    );
    console.log('✅ Enhanced classifier loaded with entity creation!');
  }

  async classifyCommand(query) {
    if (!this.classifier) {
      throw new Error('Classifier not initialized');
    }

    const results = await this.classifier(query);
    const topResult = results[0];

    // Extract ID if present
    const idMatch = query.match(/\b(\d+)\b/);
    const extractedId = idMatch ? idMatch[1] : null;

    // Get action mapping
    const actionConfig = this.actionMappings[topResult.label];

    if (!actionConfig) {
      console.warn('Unknown action:', topResult.label);
      return null;
    }

    // Handle entity creation actions
    if (actionConfig.requiresExtraction) {
      console.log('🎯 Entity creation detected, extracting data...');
      // This would integrate with your EntityExtractor service
      return {
        action: topResult.label,
        confidence: topResult.score,
        route: actionConfig.route,
        entityType: actionConfig.entityType,
        extractedId,
        requiresExtraction: true,
        allResults: results
      };
    }

    return {
      action: topResult.label,
      confidence: topResult.score,
      route: actionConfig?.route?.replace('{id}', extractedId) || null,
      extractedId,
      requiresExtraction: false,
      allResults: results
    };
  }

  // Test the enhanced classifier
  async runTests() {
    const testQueries = [
      // Original action tests
      'view invoice 123',
      'list all invoices', 
      'create new invoice',
      'show customers',
      'help me',
      
      // New entity creation action tests
      'create product WaterBottle price 5 dollars',
      'add customer John Smith email john@example.com phone 555-1234',
      'create invoice for customer Sarah with 2 laptops at 1000 each',
      'make product Coffee Mug priced at 15 USD',
      'register customer Mike Wilson address 123 Main St',
      'new invoice for David with 5 water bottles at 5 dollars each'
    ];

    console.log('🧪 Testing Enhanced 12-Action Classifier:');
    console.log('=' + '='.repeat(60));

    for (const query of testQueries) {
      try {
        const result = await this.classifyCommand(query);
        console.log(`Query: "${query}"`);
        console.log(`  → ${result.action} (confidence: ${result.confidence.toFixed(3)})`);
        console.log(`  → Route: ${result.route || 'N/A'}`);
        console.log(`  → Entity Creation: ${result.requiresExtraction ? '✅' : '❌'}`);
        console.log();
      } catch (error) {
        console.error(`❌ Error testing "${query}":`, error.message);
      }
    }
  }
}

// Enhanced usage example with entity creation:
// const classifier = new InvoiceCommandClassifier();
// await classifier.initialize();
// 
// const result = await classifier.classifyCommand('create product Laptop price 1000 dollars');
// if (result.requiresExtraction) {
//   // Use EntityExtractor to parse the natural language data
//   const extractedData = await entityExtractor.extractProductData(query);
//   // Navigate to product page with pre-filled data
//   navigate(result.route, { state: { extractedData, action: result.action } });
// } else {
//   // Standard navigation
//   navigate(result.route);
// }
