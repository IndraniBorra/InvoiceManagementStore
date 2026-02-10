import { customerApi, productApi } from './api';

/**
 * Entity Resolution Service for AI-powered invoice creation
 * Matches extracted entities against existing customers and products
 * Uses exact database field names and existing API endpoints
 */

/**
 * Enhanced similarity calculation with multiple algorithms
 * Returns similarity score between 0 and 1
 */
const calculateSimilarity = (str1, str2) => {
  if (!str1 || !str2) return 0;

  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1;

  // Calculate multiple similarity metrics
  const levenshteinSim = calculateLevenshteinSimilarity(s1, s2);
  const jaccardSim = calculateJaccardSimilarity(s1, s2);
  const commonWordsSim = calculateCommonWordsSimilarity(s1, s2);

  // Weighted average with emphasis on word-based similarity
  const weightedSimilarity = (
    levenshteinSim * 0.3 +
    jaccardSim * 0.3 +
    commonWordsSim * 0.4
  );

  console.log(`📊 Similarity metrics for "${str1}" vs "${str2}":`, {
    levenshtein: levenshteinSim.toFixed(3),
    jaccard: jaccardSim.toFixed(3),
    commonWords: commonWordsSim.toFixed(3),
    weighted: weightedSimilarity.toFixed(3)
  });

  return weightedSimilarity;
};

/**
 * Original Levenshtein-based similarity
 */
const calculateLevenshteinSimilarity = (str1, str2) => {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1;

  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
};

/**
 * Jaccard similarity based on character n-grams
 */
const calculateJaccardSimilarity = (str1, str2) => {
  const ngrams1 = new Set();
  const ngrams2 = new Set();
  const n = 2; // Use bi-grams

  // Generate n-grams for both strings
  for (let i = 0; i <= str1.length - n; i++) {
    ngrams1.add(str1.substr(i, n));
  }
  for (let i = 0; i <= str2.length - n; i++) {
    ngrams2.add(str2.substr(i, n));
  }

  const intersection = new Set([...ngrams1].filter(x => ngrams2.has(x)));
  const union = new Set([...ngrams1, ...ngrams2]);

  return union.size === 0 ? 0 : intersection.size / union.size;
};

/**
 * Word-based similarity for better semantic matching
 */
const calculateCommonWordsSimilarity = (str1, str2) => {
  const words1 = new Set(str1.split(/\s+/).filter(w => w.length > 1));
  const words2 = new Set(str2.split(/\s+/).filter(w => w.length > 1));

  if (words1.size === 0 && words2.size === 0) return 1;
  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  const jaccardScore = intersection.size / union.size;

  // Boost score if key product terms match
  const productKeywords = ['macbook', 'air', 'pro', 'laptop', 'phone', 'ipad', 'tablet'];
  let keywordBoost = 0;

  for (const keyword of productKeywords) {
    if (str1.includes(keyword) && str2.includes(keyword)) {
      keywordBoost += 0.2; // Significant boost for matching product keywords
    }
  }

  return Math.min(jaccardScore + keywordBoost, 1.0);
};

/**
 * Check if products have meaningful keyword overlap to prevent false positives
 */
const checkProductKeywordOverlap = (str1, str2) => {
  const keywords1 = extractProductKeywords(str1.toLowerCase());
  const keywords2 = extractProductKeywords(str2.toLowerCase());

  // Check for exact keyword matches
  const intersection = keywords1.filter(k => keywords2.includes(k));

  console.log(`🔍 Keyword analysis: "${str1}" vs "${str2}"`);
  console.log(`📝 Keywords 1: [${keywords1.join(', ')}]`);
  console.log(`📝 Keywords 2: [${keywords2.join(', ')}]`);
  console.log(`🎯 Common keywords: [${intersection.join(', ')}]`);

  // Require at least one meaningful keyword match
  return intersection.length > 0;
};

/**
 * Extract meaningful keywords from product descriptions
 */
const extractProductKeywords = (description) => {
  const words = description.split(/\s+/);
  const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
  const productTypes = ['laptop', 'phone', 'tablet', 'computer', 'device', 'gadget', 'machine', 'tool', 'equipment'];
  const brands = ['apple', 'macbook', 'iphone', 'ipad', 'samsung', 'google', 'microsoft', 'dell', 'hp', 'lenovo'];
  const descriptors = ['pro', 'air', 'mini', 'max', 'plus', 'ultra', 'premium', 'standard', 'basic', 'advanced'];

  return words
    .filter(word => word.length > 2) // Minimum 3 characters
    .filter(word => !stopWords.includes(word))
    .filter(word => {
      // Include product types, brands, or descriptors
      return productTypes.includes(word) ||
             brands.includes(word) ||
             descriptors.includes(word) ||
             word.length > 4; // Or longer meaningful words
    });
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
      const exactMatchThreshold = 0.8;  // 80% for "use existing"
      const similarityThreshold = 0.6;  // 60% for "suggest existing" (raised from 40%)
      const minimumWordMatch = 0.3;     // Require at least 30% word overlap

      console.log('🔍 === ENHANCED PRODUCT MATCHING ===');
      console.log(`🎯 Looking for: "${productEntity.product_description}" ($${productEntity.product_price || 'N/A'})`);
      console.log(`📊 Total products to check: ${searchResults.length}`);

      // Find best matching product with validation
      for (const product of searchResults) {
        const descSimilarity = calculateSimilarity(
          productEntity.product_description,
          product.product_description
        );

        // Skip products with very low word similarity to prevent false positives
        const wordSimilarity = calculateCommonWordsSimilarity(
          productEntity.product_description.toLowerCase(),
          product.product_description.toLowerCase()
        );

        if (wordSimilarity < minimumWordMatch) {
          console.log(`⏭️ Skipping "${product.product_description}" - insufficient word overlap (${(wordSimilarity * 100).toFixed(1)}%)`);
          continue;
        }

        let score = descSimilarity;

        // Bonus for price match (if provided)
        if (productEntity.product_price && product.product_price) {
          const priceDiff = Math.abs(productEntity.product_price - product.product_price);
          const priceThreshold = product.product_price * 0.15; // 15% price variance allowed

          if (priceDiff <= priceThreshold) {
            score += 0.15; // Moderate bonus for price match
            console.log(`💰 Price match bonus for ${product.product_description} (${priceDiff.toFixed(2)} difference)`);
          } else {
            console.log(`💸 Price mismatch for ${product.product_description} ($${product.product_price} vs $${productEntity.product_price})`);
          }
        }

        console.log(`📦 Product similarity with "${product.product_description}": ${score.toFixed(3)} (word similarity: ${(wordSimilarity * 100).toFixed(1)}%)`);

        if (score > bestScore) {
          bestScore = score;
          bestMatch = product;
        }
      }

      console.log(`🏆 Best match: "${bestMatch?.product_description || 'None'}" with score: ${bestScore.toFixed(3)}`);

      // Enhanced validation: Determine action based on best match with stricter criteria
      if (bestMatch && bestScore >= exactMatchThreshold) {
        console.log('✅ High confidence match - suggesting use existing');
        return {
          success: true,
          confidence: bestScore,
          action: 'use_existing',
          product: bestMatch,
          message: `Found matching product: ${bestMatch.product_description} ($${bestMatch.product_price}) (${(bestScore * 100).toFixed(0)}% confidence)`
        };
      } else if (bestMatch && bestScore >= similarityThreshold) {
        // Additional validation for similarity suggestions
        const hasCommonKeywords = checkProductKeywordOverlap(
          productEntity.product_description,
          bestMatch.product_description
        );

        if (hasCommonKeywords) {
          console.log('⚠️ Moderate confidence match with keyword overlap - suggesting as similar');
          return {
            success: true,
            confidence: bestScore,
            action: 'suggest_existing',
            product: bestMatch,
            suggestion: bestMatch,
            message: `Similar product found: ${bestMatch.product_description} ($${bestMatch.product_price}) (${(bestScore * 100).toFixed(0)}% confidence). Use existing or create new?`
          };
        } else {
          console.log('❌ Moderate confidence but no keyword overlap - creating new');
          return {
            success: true,
            confidence: 0,
            action: 'create_new',
            productData: productEntity,
            message: 'No sufficiently similar product found. A new product will be created.'
          };
        }
      } else {
        console.log('❌ No suitable matches found - creating new');
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
 * Standalone Customer Creation Service
 * Enhanced for conversational customer creation flows
 */
export class StandaloneCustomerCreator {
  /**
   * Create customer with validation and conflict resolution
   * @param {Object} customerData - Customer data from NLP extraction
   * @returns {Promise<Object>} Creation result with validation
   */
  static async createWithValidation(customerData) {
    try {
      console.log('👤 Creating customer with validation:', customerData);

      // Enhanced validation
      const errors = [];
      const warnings = [];

      // Required field validation
      if (!customerData.customer_name && !customerData.customer_phone) {
        errors.push('Either customer name or phone number is required');
      }

      // Phone validation
      if (customerData.customer_phone) {
        const cleanPhone = customerData.customer_phone.replace(/[-.\s]/g, '');
        if (!/^\d{10}$/.test(cleanPhone)) {
          errors.push('Phone number must be exactly 10 digits');
        } else {
          customerData.customer_phone = cleanPhone; // Clean the phone
        }
      }

      // Email validation
      if (customerData.customer_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerData.customer_email)) {
        errors.push('Invalid email format');
      }

      // Address validation (warning only)
      if (!customerData.customer_address) {
        warnings.push('Customer address not provided - will use default');
        customerData.customer_address = 'Address not provided';
      }

      // Name fallback
      if (!customerData.customer_name && customerData.customer_phone) {
        warnings.push('Customer name not provided - using phone as identifier');
        customerData.customer_name = `Customer-${customerData.customer_phone}`;
      }

      if (errors.length > 0) {
        return {
          success: false,
          errors,
          warnings,
          message: `Validation failed: ${errors.join(', ')}`
        };
      }

      // Check for duplicates before creation
      const existingCustomers = await customerApi.getAll();
      const duplicates = existingCustomers.filter(customer =>
        (customerData.customer_phone && customer.customer_phone === customerData.customer_phone) ||
        (customerData.customer_email && customer.customer_email === customerData.customer_email) ||
        (customerData.customer_name && customer.customer_name.toLowerCase() === customerData.customer_name.toLowerCase())
      );

      if (duplicates.length > 0) {
        return {
          success: false,
          conflict: true,
          duplicates,
          message: `Similar customer already exists: ${duplicates[0].customer_name}`,
          suggestion: duplicates[0]
        };
      }

      // Create the customer
      const newCustomer = await customerApi.create(customerData);

      return {
        success: true,
        customer: newCustomer,
        warnings,
        message: `Customer "${newCustomer.customer_name}" created successfully`
      };

    } catch (error) {
      console.error('❌ Standalone customer creation error:', error);
      return {
        success: false,
        error: error.message,
        message: `Failed to create customer: ${error.message}`
      };
    }
  }
}

/**
 * Standalone Product Creation Service
 * Enhanced for conversational product creation flows
 */
export class StandaloneProductCreator {
  /**
   * Create product with validation and conflict resolution
   * @param {Object} productData - Product data from NLP extraction
   * @returns {Promise<Object>} Creation result with validation
   */
  static async createWithValidation(productData) {
    try {
      console.log('📦 Creating product with validation:', productData);

      // Enhanced validation
      const errors = [];
      const warnings = [];

      // Required field validation
      if (!productData.product_description) {
        errors.push('Product description is required');
      }

      if (!productData.product_price || productData.product_price <= 0) {
        errors.push('Product price must be greater than 0');
      }

      // Price validation
      if (productData.product_price && productData.product_price > 100000) {
        warnings.push('Product price is very high - please verify');
      }

      // Description validation
      if (productData.product_description && productData.product_description.length < 3) {
        warnings.push('Product description is very short');
      }

      if (errors.length > 0) {
        return {
          success: false,
          errors,
          warnings,
          message: `Validation failed: ${errors.join(', ')}`
        };
      }

      // Check for duplicates before creation
      const existingProducts = await productApi.getAll();
      const duplicates = existingProducts.filter(product =>
        product.product_description.toLowerCase() === productData.product_description.toLowerCase()
      );

      if (duplicates.length > 0) {
        return {
          success: false,
          conflict: true,
          duplicates,
          message: `Similar product already exists: ${duplicates[0].product_description}`,
          suggestion: duplicates[0]
        };
      }

      // Create the product
      const newProduct = await productApi.create(productData);

      return {
        success: true,
        product: newProduct,
        warnings,
        message: `Product "${newProduct.product_description}" created successfully`
      };

    } catch (error) {
      console.error('❌ Standalone product creation error:', error);
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