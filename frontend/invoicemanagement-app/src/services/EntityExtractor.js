/**
 * EntityExtractor Service
 * Extracts structured data from natural language commands for entity creation
 * Supports products, customers, and invoices with intelligent parsing
 */

class EntityExtractor {
  constructor() {
    // Regex patterns for data extraction
    this.patterns = {
      // Price patterns
      price: [
        /(?:price|cost|priced?\s+at|costs?)\s+(?:is\s+)?[\$]?(\d+(?:\.\d{2})?)\s*(?:dollars?|usd|$)?/i,
        /[\$](\d+(?:\.\d{2})?)/,
        /(\d+(?:\.\d{2})?)\s*(?:dollars?|usd|$)/i,
        /at\s+(\d+(?:\.\d{2})?)/i
      ],

      // Quantity patterns
      quantity: [
        /(?:quantity|qty|count)\s+(\d+)/i,
        /(\d+)\s+(?:of|pieces?|items?|units?)/i,
        /(\d+)\s+(?=\w+)/  // number before product name
      ],

      // Email patterns
      email: [
        /email\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
        /email\s+id\s*:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
        /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
      ],

      // Phone patterns
      phone: [
        /phone\s+(?:number\s+)?([0-9-\(\)\s\+]{10,})/i,
        /(?:tel|telephone)\s+([0-9-\(\)\s\+]{10,})/i,
        /(\d{3}[-\.\s]?\d{3}[-\.\s]?\d{4})/,
        /(\(\d{3}\)\s?\d{3}[-\.\s]?\d{4})/
      ],

      // Address patterns
      address: [
        /address\s+(.+?)(?:\s+phone|\s+email|$)/i,
        /(?:at|living\s+at)\s+(.+?)(?:\s+phone|\s+email|$)/i,
        /(\d+\s+[A-Za-z\s]+(?:St|Street|Ave|Avenue|Rd|Road|Ln|Lane|Dr|Drive|Blvd|Boulevard))/i
      ],

      // Name patterns (for customers)
      customerName: [
        /(?:customer|add\s+customer|create\s+customer|register\s+customer)\s+(?:named\s+)?([A-Za-z\s]+?)(?:\s+email|\s+phone|\s+address|\s+at|\s+with|$)/i,
        /(?:customer|add|create|register)\s+([A-Za-z\s]{2,})(?:\s+email|\s+phone|\s+address|$)/i,
        // Handle "customer name Apple" format
        /(?:customer|add\s+customer|create\s+customer|register\s+customer)\s+name\s+([A-Za-z\s]+?)(?:\s+with|\s+email|\s+phone|\s+address|$)/i
      ],

      // Product name and description patterns
      productName: [
        /(?:product|create\s+product|add\s+product|make\s+product)\s+(?:named\s+)?([A-Za-z0-9\s]+?)(?:\s+(?:which|that|with|description|price|cost|priced|at)|$)/i,
        /(?:product|create|add|make)\s+([A-Za-z0-9\s]+?)(?:\s+(?:price|cost|priced|at|description)|$)/i
      ],

      // Description patterns
      description: [
        /description\s+([^,]+?)(?:\s+(?:price|cost|priced|and)|$)/i,
        /(?:which\s+is\s+(?:a\s+)?|that\s+is\s+(?:a\s+)?)([^,]+?)(?:\s+(?:price|cost|priced|and)|$)/i
      ]
    };

    // Common words to clean from extracted data
    this.stopWords = new Set([
      'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
      'for', 'with', 'at', 'to', 'from', 'of', 'in', 'on', 'by'
    ]);
  }

  /**
   * Extract product data from natural language
   * @param {string} text - Natural language input
   * @returns {Object} Extracted product data
   */
  extractProduct(text) {
    const result = {
      product_description: '',
      product_price: '',
      confidence: 0,
      extracted_fields: []
    };

    try {
      // Extract product name/description
      const nameMatch = this.findMatch(text, this.patterns.productName);
      if (nameMatch) {
        result.product_description = this.cleanText(nameMatch);
        result.extracted_fields.push('product_description');
      }

      // Try to get additional description
      const descMatch = this.findMatch(text, this.patterns.description);
      if (descMatch && !result.product_description) {
        result.product_description = this.cleanText(descMatch);
        result.extracted_fields.push('product_description');
      } else if (descMatch) {
        // Combine name and description
        result.product_description += ` - ${this.cleanText(descMatch)}`;
      }

      // Extract price
      const priceMatch = this.findMatch(text, this.patterns.price);
      if (priceMatch) {
        result.product_price = parseFloat(priceMatch);
        result.extracted_fields.push('product_price');
      }

      // Calculate confidence based on extracted fields
      result.confidence = result.extracted_fields.length / 2; // 2 expected fields

      console.log('🔍 Product extraction result:', result);
      return result;

    } catch (error) {
      console.error('❌ Product extraction error:', error);
      return { ...result, error: error.message };
    }
  }

  /**
   * Extract customer data from natural language
   * @param {string} text - Natural language input
   * @returns {Object} Extracted customer data
   */
  extractCustomer(text) {
    const result = {
      customer_name: '',
      customer_email: '',
      customer_phone: '',
      customer_address: '',
      confidence: 0,
      extracted_fields: []
    };

    try {
      // Extract customer name
      const nameMatch = this.findMatch(text, this.patterns.customerName);
      if (nameMatch) {
        result.customer_name = this.cleanText(nameMatch);
        result.extracted_fields.push('customer_name');
      }

      // Extract email
      const emailMatch = this.findMatch(text, this.patterns.email);
      if (emailMatch) {
        result.customer_email = emailMatch.toLowerCase();
        result.extracted_fields.push('customer_email');
      }

      // Extract phone
      const phoneMatch = this.findMatch(text, this.patterns.phone);
      if (phoneMatch) {
        result.customer_phone = this.cleanPhone(phoneMatch);
        result.extracted_fields.push('customer_phone');
      }

      // Extract address
      const addressMatch = this.findMatch(text, this.patterns.address);
      if (addressMatch) {
        result.customer_address = this.cleanText(addressMatch);
        result.extracted_fields.push('customer_address');
      }

      // Calculate confidence based on extracted fields
      result.confidence = result.extracted_fields.length / 4; // 4 possible fields

      console.log('🔍 Customer extraction result:', result);
      return result;

    } catch (error) {
      console.error('❌ Customer extraction error:', error);
      return { ...result, error: error.message };
    }
  }

  /**
   * Extract invoice data from natural language
   * @param {string} text - Natural language input
   * @returns {Object} Extracted invoice data
   */
  extractInvoice(text) {
    const result = {
      customer_info: {},
      line_items: [],
      confidence: 0,
      extracted_fields: []
    };

    try {
      // Extract customer information
      const customerMatch = this.findMatch(text, [
        /(?:for\s+customer|customer)\s+([A-Za-z\s]+?)(?:\s+with|\s+product|$)/i,
        /(?:for|to)\s+([A-Za-z\s]+?)(?:\s+with|\s+product|\s+\d+|$)/i
      ]);

      if (customerMatch) {
        result.customer_info.customer_name = this.cleanText(customerMatch);
        result.extracted_fields.push('customer_name');
      }

      // Extract product and quantity information
      const lineItems = this.extractLineItems(text);
      if (lineItems.length > 0) {
        result.line_items = lineItems;
        result.extracted_fields.push('line_items');
      }

      // Calculate confidence
      result.confidence = Math.min(result.extracted_fields.length / 2, 1); // 2 main sections

      console.log('🔍 Invoice extraction result:', result);
      return result;

    } catch (error) {
      console.error('❌ Invoice extraction error:', error);
      return { ...result, error: error.message };
    }
  }

  /**
   * Extract line items from invoice text
   * @param {string} text - Natural language input
   * @returns {Array} Array of line items
   */
  extractLineItems(text) {
    const lineItems = [];

    try {
      // Pattern for "X product Y at Z each" or "quantity Q product P price R"
      const itemPatterns = [
        /(\d+)\s+([A-Za-z0-9\s]+?)\s+at\s+(\d+(?:\.\d{2})?)/gi,
        /(?:with|product)\s+([A-Za-z0-9\s]+?)\s+quantity\s+(\d+)(?:\s+(?:at|price)\s+(\d+(?:\.\d{2})?))?/gi,
        /(\d+)\s+([A-Za-z0-9\s]+?)\s+(?:at|for|price)\s+(\d+(?:\.\d{2})?)/gi
      ];

      for (const pattern of itemPatterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          let quantity, productName, price;

          if (pattern === itemPatterns[1]) {
            // "product NAME quantity Q price R" format
            productName = this.cleanText(match[1]);
            quantity = parseInt(match[2]);
            price = match[3] ? parseFloat(match[3]) : 0;
          } else {
            // "Q NAME at R" format
            quantity = parseInt(match[1]);
            productName = this.cleanText(match[2]);
            price = parseFloat(match[3]);
          }

          if (productName && quantity && price) {
            lineItems.push({
              product_description: productName,
              line_items_qty: quantity,
              product_price: price,
              line_items_total: quantity * price
            });
          }
        }
      }

      // If no line items found, try simpler patterns
      if (lineItems.length === 0) {
        const simplePattern = /(?:with|product)\s+([A-Za-z0-9\s]+?)(?:\s+|$)/i;
        const productMatch = simplePattern.exec(text);

        if (productMatch) {
          const quantity = this.findMatch(text, this.patterns.quantity) || 1;
          const price = this.findMatch(text, this.patterns.price) || 0;

          lineItems.push({
            product_description: this.cleanText(productMatch[1]),
            line_items_qty: parseInt(quantity),
            product_price: parseFloat(price),
            line_items_total: parseInt(quantity) * parseFloat(price)
          });
        }
      }

    } catch (error) {
      console.error('❌ Line items extraction error:', error);
    }

    return lineItems;
  }

  /**
   * Find first match from array of patterns
   * @param {string} text - Text to search
   * @param {Array} patterns - Array of regex patterns
   * @returns {string|null} First match found
   */
  findMatch(text, patterns) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return null;
  }

  /**
   * Clean extracted text
   * @param {string} text - Text to clean
   * @returns {string} Cleaned text
   */
  cleanText(text) {
    if (!text) return '';

    return text
      .trim()
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .replace(/^(a|an|the)\s+/i, '')  // Remove leading articles
      .replace(/\s+(a|an|the)\s+/gi, ' ')  // Remove middle articles
      .split(' ')
      .filter(word => word.length > 0 && !this.stopWords.has(word.toLowerCase()))
      .join(' ')
      .replace(/^\w/, c => c.toUpperCase());  // Capitalize first letter
  }

  /**
   * Clean phone number
   * @param {string} phone - Phone number to clean
   * @returns {string} Cleaned phone number
   */
  cleanPhone(phone) {
    if (!phone) return '';

    // Remove all non-digit characters except + at the beginning
    const cleaned = phone.replace(/[^\d+]/g, '');

    // Format as (XXX) XXX-XXXX if 10 digits
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }

    return cleaned;
  }

  /**
   * Validate extracted data
   * @param {Object} data - Extracted data
   * @param {string} type - Data type (product, customer, invoice)
   * @returns {Object} Validation result
   */
  validateExtraction(data, type) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: []
    };

    try {
      switch (type) {
        case 'product':
          if (!data.product_description) {
            validation.errors.push('Product name/description is required');
            validation.isValid = false;
          }
          if (!data.product_price || data.product_price <= 0) {
            validation.errors.push('Valid product price is required');
            validation.isValid = false;
          }
          break;

        case 'customer':
          if (!data.customer_name) {
            validation.errors.push('Customer name is required');
            validation.isValid = false;
          }
          if (data.customer_email && !this.isValidEmail(data.customer_email)) {
            validation.warnings.push('Email format may be invalid');
          }
          if (data.customer_phone && data.customer_phone.length < 10) {
            validation.warnings.push('Phone number may be incomplete');
          }
          break;

        case 'invoice':
          if (!data.customer_info.customer_name) {
            validation.errors.push('Customer information is required');
            validation.isValid = false;
          }
          if (!data.line_items || data.line_items.length === 0) {
            validation.errors.push('At least one line item is required');
            validation.isValid = false;
          }
          break;
      }

    } catch (error) {
      validation.errors.push(`Validation error: ${error.message}`);
      validation.isValid = false;
    }

    return validation;
  }

  /**
   * Validate email format
   * @param {string} email - Email to validate
   * @returns {boolean} True if valid
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Generate human-readable summary of extracted data
   * @param {Object} data - Extracted data
   * @param {string} type - Data type
   * @returns {string} Summary text
   */
  generateSummary(data, type) {
    try {
      switch (type) {
        case 'product':
          return `Product: ${data.product_description || 'Unknown'} - Price: $${data.product_price || '0.00'}`;

        case 'customer':
          const parts = [];
          if (data.customer_name) parts.push(`Name: ${data.customer_name}`);
          if (data.customer_email) parts.push(`Email: ${data.customer_email}`);
          if (data.customer_phone) parts.push(`Phone: ${data.customer_phone}`);
          if (data.customer_address) parts.push(`Address: ${data.customer_address}`);
          return parts.join(', ') || 'No customer data extracted';

        case 'invoice':
          const customerName = data.customer_info.customer_name || 'Unknown Customer';
          const itemCount = data.line_items.length;
          const total = data.line_items.reduce((sum, item) => sum + (item.line_items_total || 0), 0);
          return `Invoice for ${customerName} with ${itemCount} item(s) - Total: $${total.toFixed(2)}`;

        default:
          return 'Data extracted successfully';
      }
    } catch (error) {
      return `Summary generation error: ${error.message}`;
    }
  }

  /**
   * Main extraction method - automatically detects type
   * @param {string} text - Natural language input
   * @param {string} action - Action type from classifier
   * @returns {Object} Extracted data with metadata
   */
  extract(text, action) {
    const startTime = Date.now();

    try {
      let result = {};
      let type = '';

      // Determine extraction type based on action
      switch (action) {
        case 'create_product_with_data':
          type = 'product';
          result = this.extractProduct(text);
          break;

        case 'create_customer_with_data':
          type = 'customer';
          result = this.extractCustomer(text);
          break;

        case 'create_invoice_with_data':
          type = 'invoice';
          result = this.extractInvoice(text);
          break;

        default:
          throw new Error(`Unsupported extraction action: ${action}`);
      }

      // Add metadata
      result.type = type;
      result.action = action;
      result.original_text = text;
      result.extraction_time = Date.now() - startTime;
      result.summary = this.generateSummary(result, type);
      result.validation = this.validateExtraction(result, type);

      console.log(`✅ EntityExtractor: Extracted ${type} data in ${result.extraction_time}ms`);
      console.log('📋 Summary:', result.summary);

      return result;

    } catch (error) {
      console.error('❌ EntityExtractor error:', error);
      return {
        type: 'unknown',
        action,
        original_text: text,
        error: error.message,
        extraction_time: Date.now() - startTime,
        confidence: 0
      };
    }
  }
}

export default EntityExtractor;