import { customerApi, productApi } from './api';

/**
 * Entity Resolution Service for AI-powered invoice creation
 * Matches extracted entities against existing customers and products
 * Uses exact database field names and existing API endpoints
 */

/**
 * Fuzzy string matching utility
 * Returns similarity score between 0 and 1
 */
const calculateSimilarity = (str1, str2) => {
  if (!str1 || !str2) return 0;

  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1;

  // Simple character-based similarity
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1;

  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
};

/**
 * Calculate Levenshtein distance for fuzzy matching
 */
const getEditDistance = (str1, str2) => {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
};

/**
 * Customer Resolution Service
 * Searches existing customers by name and phone using database field names
 */
export class CustomerResolver {
  /**
   * Resolve customer entity against existing customers
   * @param {Object} customerEntity - Extracted customer entity
   * @param {string} customerEntity.customer_name - Customer name
   * @param {string} customerEntity.customer_phone - Customer phone (10 digits)
   * @param {string} customerEntity.customer_address - Customer address
   * @param {string} customerEntity.customer_email - Customer email (optional)
   * @returns {Promise<Object>} Resolution result
   */
  static async resolveCustomer(customerEntity) {
    try {
      console.log('🔍 Resolving customer entity:', customerEntity);
      console.log('👤 Customer name to match:', customerEntity.customer_name);
      console.log('📞 Customer phone to match:', customerEntity.customer_phone);

      // Validate required fields
      if (!customerEntity.customer_name && !customerEntity.customer_phone) {
        return {
          success: false,
          confidence: 0,
          action: 'create_new',
          message: 'Customer name or phone number required for resolution'
        };
      }

      // Search existing customers using the API
      const searchResults = await customerApi.getAll();
      console.log('📊 Customer search results:', searchResults);

      let bestMatch = null;
      let bestScore = 0;
      const threshold = 0.6; // 60% similarity threshold (lowered for better matching)

      // Find best matching customer
      for (const customer of searchResults) {
        let score = 0;
        let matchFactors = 0;

        // Exact phone match (highest priority)
        if (customerEntity.customer_phone && customer.customer_phone) {
          if (customerEntity.customer_phone === customer.customer_phone) {
            score += 1.0;
            matchFactors++;
            console.log(`📞 Exact phone match found: ${customer.customer_name}`);
          }
        }

        // Name similarity (high priority)
        if (customerEntity.customer_name && customer.customer_name) {
          const nameSimilarity = calculateSimilarity(
            customerEntity.customer_name,
            customer.customer_name
          );
          score += nameSimilarity * 0.8;
          matchFactors++;
          console.log(`👤 Name similarity with ${customer.customer_name}: ${nameSimilarity.toFixed(2)}`);
        }

        // Email match (medium priority)
        if (customerEntity.customer_email && customer.customer_email) {
          if (customerEntity.customer_email.toLowerCase() === customer.customer_email.toLowerCase()) {
            score += 0.6;
            matchFactors++;
            console.log(`📧 Email match found: ${customer.customer_email}`);
          }
        }

        // Average the score
        if (matchFactors > 0) {
          score = score / matchFactors;

          if (score > bestScore) {
            bestScore = score;
            bestMatch = customer;
          }
        }
      }

      // Determine action based on best match
      if (bestMatch && bestScore >= threshold) {
        return {
          success: true,
          confidence: bestScore,
          action: 'use_existing',
          customer: bestMatch,
          message: `Found matching customer: ${bestMatch.customer_name} (${(bestScore * 100).toFixed(0)}% confidence)`
        };
      } else if (bestMatch && bestScore >= 0.5) {
        return {
          success: true,
          confidence: bestScore,
          action: 'suggest_existing',
          customer: bestMatch,
          suggestion: bestMatch,
          message: `Similar customer found: ${bestMatch.customer_name} (${(bestScore * 100).toFixed(0)}% confidence). Use existing or create new?`
        };
      } else {
        return {
          success: true,
          confidence: 0,
          action: 'create_new',
          customerData: customerEntity,
          message: 'No matching customer found. A new customer will be created.'
        };
      }

    } catch (error) {
      console.error('❌ Customer resolution error:', error);
      return {
        success: false,
        confidence: 0,
        action: 'create_new',
        error: error.message,
        message: 'Error searching customers. Will create new customer.'
      };
    }
  }

  /**
   * Create new customer using existing API
   * @param {Object} customerData - Customer data with database field names
   * @returns {Promise<Object>} Created customer
   */
  static async createCustomer(customerData) {
    try {
      console.log('➕ Creating new customer:', customerData);

      // Validate required fields according to models.py
      const errors = [];
      if (!customerData.customer_name) errors.push('Customer name is required');
      if (!customerData.customer_address) errors.push('Customer address is required');
      if (!customerData.customer_phone) errors.push('Customer phone is required');

      if (customerData.customer_phone && !/^\d{10}$/.test(customerData.customer_phone)) {
        errors.push('Phone number must be 10 digits');
      }

      if (errors.length > 0) {
        throw new Error(`Validation errors: ${errors.join(', ')}`);
      }

      const newCustomer = await customerApi.create(customerData);
      console.log('✅ Customer created successfully:', newCustomer);

      return {
        success: true,
        customer: newCustomer,
        message: `Customer "${newCustomer.customer_name}" created successfully`
      };

    } catch (error) {
      console.error('❌ Customer creation error:', error);
      return {
        success: false,
        error: error.message,
        message: `Failed to create customer: ${error.message}`
      };
    }
  }
}

/**
 * Product Resolution Service
 * Searches existing products by description using database field names
 */
export class ProductResolver {
  /**
   * Resolve product entity against existing products
   * @param {Object} productEntity - Extracted product entity
   * @param {string} productEntity.product_description - Product description
   * @param {number} productEntity.product_price - Expected price (optional)
   * @returns {Promise<Object>} Resolution result
   */
  static async resolveProduct(productEntity) {
    try {
      console.log('🔍 Resolving product entity:', productEntity);
      console.log('📦 Product description to match:', productEntity.product_description);
      console.log('💰 Product price to match:', productEntity.product_price);

      if (!productEntity.product_description) {
        return {
          success: false,
          confidence: 0,
          action: 'create_new',
          message: 'Product description required for resolution'
        };
      }

      // Search existing products using the API
      const searchResults = await productApi.getAll();
      console.log('📊 Product search results:', searchResults);

      let bestMatch = null;
      let bestScore = 0;
      const threshold = 0.5; // 50% similarity threshold for products (lowered for better matching)

      // Find best matching product
      for (const product of searchResults) {
        const descSimilarity = calculateSimilarity(
          productEntity.product_description,
          product.product_description
        );

        let score = descSimilarity;

        // Bonus for price match (if provided)
        if (productEntity.product_price && product.product_price) {
          const priceDiff = Math.abs(productEntity.product_price - product.product_price);
          const priceThreshold = product.product_price * 0.1; // 10% price variance allowed

          if (priceDiff <= priceThreshold) {
            score += 0.2; // Bonus for price match
            console.log(`💰 Price match bonus for ${product.product_description}`);
          }
        }

        console.log(`📦 Product similarity with "${product.product_description}": ${score.toFixed(2)}`);

        if (score > bestScore) {
          bestScore = score;
          bestMatch = product;
        }
      }

      // Determine action based on best match
      if (bestMatch && bestScore >= threshold) {
        return {
          success: true,
          confidence: bestScore,
          action: 'use_existing',
          product: bestMatch,
          message: `Found matching product: ${bestMatch.product_description} ($${bestMatch.product_price}) (${(bestScore * 100).toFixed(0)}% confidence)`
        };
      } else if (bestMatch && bestScore >= 0.4) {
        return {
          success: true,
          confidence: bestScore,
          action: 'suggest_existing',
          product: bestMatch,
          suggestion: bestMatch,
          message: `Similar product found: ${bestMatch.product_description} ($${bestMatch.product_price}) (${(bestScore * 100).toFixed(0)}% confidence). Use existing or create new?`
        };
      } else {
        return {
          success: true,
          confidence: 0,
          action: 'create_new',
          productData: productEntity,
          message: 'No matching product found. A new product will be created.'
        };
      }

    } catch (error) {
      console.error('❌ Product resolution error:', error);
      return {
        success: false,
        confidence: 0,
        action: 'create_new',
        error: error.message,
        message: 'Error searching products. Will create new product.'
      };
    }
  }

  /**
   * Create new product using existing API
   * @param {Object} productData - Product data with database field names
   * @returns {Promise<Object>} Created product
   */
  static async createProduct(productData) {
    try {
      console.log('➕ Creating new product:', productData);

      // Validate required fields according to models.py
      const errors = [];
      if (!productData.product_description) errors.push('Product description is required');
      if (!productData.product_price || productData.product_price <= 0) {
        errors.push('Product price must be greater than 0');
      }

      if (errors.length > 0) {
        throw new Error(`Validation errors: ${errors.join(', ')}`);
      }

      const newProduct = await productApi.create(productData);
      console.log('✅ Product created successfully:', newProduct);

      return {
        success: true,
        product: newProduct,
        message: `Product "${newProduct.product_description}" created successfully`
      };

    } catch (error) {
      console.error('❌ Product creation error:', error);
      return {
        success: false,
        error: error.message,
        message: `Failed to create product: ${error.message}`
      };
    }
  }
}

/**
 * Main Entity Resolution Service
 * Orchestrates customer and product resolution for invoice creation
 */
export class EntityResolver {
  /**
   * Resolve all entities for invoice creation
   * @param {Object} entities - Extracted entities from LLM
   * @param {Object} entities.customer - Customer entity
   * @param {Array} entities.products - Array of product entities with quantities
   * @returns {Promise<Object>} Complete resolution result
   */
  static async resolveInvoiceEntities(entities) {
    console.log('🚀 Starting entity resolution for invoice:', entities);

    const resolution = {
      customer: null,
      products: [],
      actions: [],
      errors: [],
      success: true
    };

    try {
      // Resolve customer
      if (entities.customer) {
        const customerResult = await CustomerResolver.resolveCustomer(entities.customer);
        resolution.customer = customerResult;

        if (customerResult.action === 'create_new') {
          resolution.actions.push({
            type: 'create_customer',
            data: entities.customer,
            message: customerResult.message
          });
        }
      }

      // Resolve products
      if (entities.products && Array.isArray(entities.products)) {
        for (const productEntity of entities.products) {
          const productResult = await ProductResolver.resolveProduct(productEntity);

          // Add quantity information from original entity
          productResult.lineitem_qty = productEntity.lineitem_qty || 1;

          resolution.products.push(productResult);

          if (productResult.action === 'create_new') {
            resolution.actions.push({
              type: 'create_product',
              data: productEntity,
              message: productResult.message
            });
          }
        }
      }

      console.log('✅ Entity resolution completed:', resolution);
      return resolution;

    } catch (error) {
      console.error('❌ Entity resolution failed:', error);
      resolution.success = false;
      resolution.errors.push(error.message);
      return resolution;
    }
  }
}

export default EntityResolver;