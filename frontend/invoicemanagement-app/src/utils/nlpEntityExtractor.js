/**
 * Enhanced NLP Entity Extraction System
 * Supports natural language parsing for customers, products, and invoices
 * Uses regex patterns and intelligent parsing for robust entity extraction
 */

/**
 * Extract customer entities from natural language queries
 * @param {string} query - Natural language query
 * @returns {Object} Extracted customer entity
 */
export const extractCustomerEntities = (query) => {
  console.log('👤 === CUSTOMER ENTITY EXTRACTION ===');
  console.log('📝 Extracting customer from query:', query);

  const customerEntity = {
    customer_name: null,
    customer_email: null,
    customer_phone: null,
    customer_address: null
  };

  try {
    // Customer name patterns - enhanced for business names and complex names
    const namePatterns = [
      // "Create customer John Smith" or "Add customer TechCorp"
      /(?:create|add|new)\s+customer\s+([A-Za-z][A-Za-z\s,&.\-']{1,80}?)(?:\s+(?:with|,|at|phone|email)|$)/i,
      // "Customer John Smith with email..."
      /customer\s+([A-Za-z][A-Za-z\s,&.\-']{1,80}?)(?:\s+(?:with|,|at|phone|email)|$)/i,
      // "For customer John Smith"
      /for\s+customer\s+([A-Za-z][A-Za-z\s,&.\-']{1,80}?)(?:\s+(?:with|,|at|phone|email)|$)/i
    ];

    for (const pattern of namePatterns) {
      const nameMatch = query.match(pattern);
      if (nameMatch) {
        customerEntity.customer_name = nameMatch[1].trim();
        console.log('✅ Found customer name:', customerEntity.customer_name);
        break;
      }
    }

    // Email patterns
    const emailPatterns = [
      /email\s*:?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i
    ];

    for (const pattern of emailPatterns) {
      const emailMatch = query.match(pattern);
      if (emailMatch) {
        customerEntity.customer_email = emailMatch[1].toLowerCase();
        console.log('✅ Found customer email:', customerEntity.customer_email);
        break;
      }
    }

    // Phone patterns (10 digits)
    const phonePatterns = [
      /phone\s*:?\s*(\d{10})/i,
      /tel\s*:?\s*(\d{10})/i,
      /(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/,
      /(\d{10})/
    ];

    for (const pattern of phonePatterns) {
      const phoneMatch = query.match(pattern);
      if (phoneMatch) {
        // Clean the phone number to ensure 10 digits
        const cleanPhone = phoneMatch[1].replace(/[-.\s]/g, '');
        if (cleanPhone.length === 10) {
          customerEntity.customer_phone = cleanPhone;
          console.log('✅ Found customer phone:', customerEntity.customer_phone);
          break;
        }
      }
    }

    // Address patterns
    const addressPatterns = [
      /(?:at|address)\s+([\d\w\s,.\-#]{5,100}?)(?:\s+(?:phone|email|with|,|$))/i,
      /(?:address|located at)\s*:?\s*([\d\w\s,.\-#]{5,100}?)(?:\s+(?:phone|email|with|,|$))/i
    ];

    for (const pattern of addressPatterns) {
      const addressMatch = query.match(pattern);
      if (addressMatch) {
        customerEntity.customer_address = addressMatch[1].trim();
        console.log('✅ Found customer address:', customerEntity.customer_address);
        break;
      }
    }

    console.log('🎯 Final customer entity:', customerEntity);
    return customerEntity;

  } catch (error) {
    console.error('❌ Customer entity extraction error:', error);
    return customerEntity; // Return partial results
  }
};

/**
 * Extract product entities from natural language queries
 * @param {string} query - Natural language query
 * @returns {Object} Extracted product entity
 */
export const extractProductEntities = (query) => {
  console.log('📦 === PRODUCT ENTITY EXTRACTION ===');
  console.log('📝 Extracting product from query:', query);

  const productEntity = {
    product_description: null,
    product_price: null
  };

  try {
    // Product description patterns
    const descriptionPatterns = [
      // "Add a new product MacBook Air with price tag of 999$" - handle "with price" format
      /(?:create|add|new)\s+(?:a\s+new\s+)?product\s+([A-Za-z][A-Za-z\s\-_0-9]{1,100}?)\s+with\s+price(?:\s+tag)?/i,
      // "Create product Wireless Headphones priced at..." - improved stopping words
      /(?:create|add|new)\s+(?:a\s+new\s+)?product\s+([A-Za-z][A-Za-z\s\-_0-9]{1,100}?)(?:\s+(?:priced?|for|at|\$|cost|with\s+price))/i,
      // "Product Gaming Laptop for $1299" - improved stopping words
      /product\s+([A-Za-z][A-Za-z\s\-_0-9]{1,100}?)(?:\s+(?:priced?|for|at|\$|cost|with|price|tag))/i,
      // "Add Gaming Laptop priced at..." - improved stopping words
      /(?:add|create|new)\s+([A-Za-z][A-Za-z\s\-_0-9]{1,100}?)(?:\s+(?:priced?|for|at|\$|cost|with|price|tag))/i,
      // Fallback: extract product name from beginning until price indicators
      /(?:create|add|new)\s+(?:a\s+new\s+)?(?:product\s+)?([A-Za-z][A-Za-z\s\-_0-9]{1,100}?)(?:\s+(?:with|at|for|priced?|cost|\$|\d))/i
    ];

    for (const pattern of descriptionPatterns) {
      const descMatch = query.match(pattern);
      if (descMatch) {
        productEntity.product_description = descMatch[1].trim();
        console.log('✅ Found product description:', productEntity.product_description);
        break;
      }
    }

    // Price patterns
    const pricePatterns = [
      // "price tag of 999$" - specific pattern for the failing case
      /price\s+tag\s+of\s+(\d+(?:\.\d{1,2})?)\$?/i,
      // "999$" - number followed by dollar sign
      /(\d+(?:\.\d{1,2})?)\$/,
      // "with price tag of 999"
      /with\s+price\s+tag\s+of\s+(\d+(?:\.\d{1,2})?)/i,
      // "priced at $149.99" or "price $149.99"
      /(?:priced?\s+at|price|for|cost)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i,
      // "$149.99"
      /\$(\d+(?:\.\d{1,2})?)/,
      // "149.99 dollars"
      /(\d+(?:\.\d{1,2})?)\s*(?:dollars?|usd|bucks?)/i
    ];

    for (const pattern of pricePatterns) {
      const priceMatch = query.match(pattern);
      if (priceMatch) {
        const price = parseFloat(priceMatch[1]);
        if (price > 0) {
          productEntity.product_price = price;
          console.log('✅ Found product price:', productEntity.product_price);
          break;
        }
      }
    }

    console.log('🎯 Final product entity:', productEntity);
    return productEntity;

  } catch (error) {
    console.error('❌ Product entity extraction error:', error);
    return productEntity; // Return partial results
  }
};

/**
 * Enhanced invoice entity extraction with better patterns
 * @param {string} query - Natural language query
 * @returns {Object} Extracted entities for invoice creation
 */
export const extractInvoiceEntities = (query) => {
  console.log('🧾 === ENHANCED INVOICE ENTITY EXTRACTION ===');
  console.log('📝 Extracting invoice entities from query:', query);

  const entities = {
    customer: null,
    products: [],
    invoiceMetadata: {}
  };

  try {
    // Extract customer information using enhanced patterns
    const customerEntity = extractCustomerEntities(query);

    // Only include customer if we have meaningful data
    if (customerEntity.customer_name || customerEntity.customer_phone || customerEntity.customer_email) {
      entities.customer = customerEntity;
      console.log('✅ Customer entity included in invoice');
    }

    // Extract product information with quantities
    const productMatches = [
      // "5 laptops at $800 each"
      ...query.matchAll(/(\d+)\s+([A-Za-z][A-Za-z\s\-_0-9]{1,50}?)\s+(?:at|for|@)\s*\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:each|per|apiece)?/gi),
      // "$800 laptops quantity 5"
      ...query.matchAll(/\$?\s*(\d+(?:\.\d{1,2})?)\s+([A-Za-z][A-Za-z\s\-_0-9]{1,50}?)\s+(?:quantity|qty|x)\s*(\d+)/gi),
      // "laptops $800 x 5"
      ...query.matchAll(/([A-Za-z][A-Za-z\s\-_0-9]{1,50}?)\s+\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:x|×)\s*(\d+)/gi)
    ];

    for (const match of productMatches) {
      let quantity, description, price;

      // Different match patterns have different capture group orders
      if (match[0].includes(' at ') || match[0].includes(' for ') || match[0].includes(' @ ')) {
        // Pattern: "5 laptops at $800 each"
        quantity = parseInt(match[1]);
        description = match[2].trim();
        price = parseFloat(match[3]);
      } else if (match[0].includes('quantity') || match[0].includes('qty')) {
        // Pattern: "$800 laptops quantity 5"
        price = parseFloat(match[1]);
        description = match[2].trim();
        quantity = parseInt(match[3]);
      } else {
        // Pattern: "laptops $800 x 5"
        description = match[1].trim();
        price = parseFloat(match[2]);
        quantity = parseInt(match[3]);
      }

      if (quantity > 0 && price > 0 && description) {
        entities.products.push({
          product_description: description,
          lineitem_qty: quantity,
          product_price: price
        });
        console.log(`✅ Found product: ${quantity}x ${description} @ $${price}`);
      }
    }

    // If no structured products found, try simpler patterns
    if (entities.products.length === 0) {
      const simplePatches = [
        // "for 5 widgets at $25"
        ...query.matchAll(/for\s+(\d+)\s+([A-Za-z][A-Za-z\s\-_0-9]{1,50}?)\s+at\s*\$?\s*(\d+(?:\.\d{1,2})?)/gi),
        // "10 items $12.50 each"
        ...query.matchAll(/(\d+)\s+([A-Za-z][A-Za-z\s\-_0-9]{1,50}?)\s+\$?\s*(\d+(?:\.\d{1,2})?)\s*each/gi)
      ];

      for (const match of simplePatches) {
        const quantity = parseInt(match[1]);
        const description = match[2].trim();
        const price = parseFloat(match[3]);

        if (quantity > 0 && price > 0 && description) {
          entities.products.push({
            product_description: description,
            lineitem_qty: quantity,
            product_price: price
          });
          console.log(`✅ Found simple product: ${quantity}x ${description} @ $${price}`);
        }
      }
    }

    console.log('🎯 Final invoice entities:', entities);
    return entities;

  } catch (error) {
    console.error('❌ Invoice entity extraction error:', error);
    return entities; // Return partial results
  }
};

/**
 * Detect the type of creation query
 * @param {string} query - Natural language query
 * @returns {string} Creation type: 'customer', 'product', 'invoice', or 'unknown'
 */
export const detectCreationType = (query) => {
  const lowerQuery = query.toLowerCase();

  // Customer creation patterns
  if (lowerQuery.match(/(?:create|add|new)\s+customer/i) ||
      lowerQuery.match(/customer\s+[A-Za-z].*(?:email|phone|address)/i)) {
    return 'customer';
  }

  // Product creation patterns
  if (lowerQuery.match(/(?:create|add|new)\s+product/i) ||
      lowerQuery.match(/product\s+[A-Za-z].*(?:price|cost|\$)/i)) {
    return 'product';
  }

  // Invoice creation patterns
  if (lowerQuery.match(/(?:create|new|make)\s+invoice/i) ||
      lowerQuery.match(/invoice\s+for/i) ||
      lowerQuery.match(/bill\s+(?:customer|for)/i)) {
    return 'invoice';
  }

  return 'unknown';
};

/**
 * Calculate confidence score for "use existing" intent
 * @param {string} response - User's response
 * @returns {number} Confidence score (0-1)
 */
const calculateUseExistingConfidence = (response) => {
  const lowerResponse = response.toLowerCase().trim();
  let confidence = 0;

  // High confidence indicators
  if (/^(?:use|choose|select|pick|take)\s+(?:this|that|existing|the\s+existing)/i.test(lowerResponse)) {
    confidence += 0.9;
  } else if (/^(?:yes|ok|okay|sure|yep|yeah),?\s*(?:use|choose|select|pick|take)/i.test(lowerResponse)) {
    confidence += 0.85;
  } else if (/^(?:use|choose|select|pick|take)\s+(?:it|that one|this one)/i.test(lowerResponse)) {
    confidence += 0.8;
  } else if (/^(?:existing|the\s+existing)$/i.test(lowerResponse)) {
    confidence += 0.75;
  } else if (/^(?:yes|ok|okay|sure|yep|yeah)$/i.test(lowerResponse)) {
    confidence += 0.7;
  }

  // Additional indicators
  if (/use/i.test(lowerResponse)) confidence += 0.3;
  if (/existing/i.test(lowerResponse)) confidence += 0.4;
  if (/this|that/i.test(lowerResponse)) confidence += 0.2;

  return Math.min(confidence, 1.0);
};

/**
 * Calculate confidence score for "create new" intent
 * @param {string} response - User's response
 * @returns {number} Confidence score (0-1)
 */
const calculateCreateNewConfidence = (response) => {
  const lowerResponse = response.toLowerCase().trim();
  let confidence = 0;

  // High confidence indicators for "create new" responses
  if (/^(?:create|add|make)\s+(?:new|a\s+new)/i.test(lowerResponse)) {
    confidence += 0.9;
  } else if (/^(?:add|create|make)\s+(?:as\s+)?new(?:\s+(?:customer|product|entity))?/i.test(lowerResponse)) {
    confidence += 0.85;
  } else if (/^(?:create|add)\s+new\s+(?:customer|product|one)/i.test(lowerResponse)) {
    confidence += 0.9; // "create new product" specifically
  } else if (/^(?:new|create|add)$/i.test(lowerResponse)) {
    confidence += 0.75;
  } else if (/^(?:no|nope|nah),?\s*(?:create|add|make|new)/i.test(lowerResponse)) {
    confidence += 0.8;
  } else if (/^(?:no|nope|nah)$/i.test(lowerResponse)) {
    confidence += 0.6; // Simple negative = create new
  }

  // Additional indicators
  if (/create/i.test(lowerResponse)) confidence += 0.4;
  if (/new/i.test(lowerResponse)) confidence += 0.3;
  if (/add/i.test(lowerResponse)) confidence += 0.3;

  return Math.min(confidence, 1.0);
};

/**
 * Calculate confidence score for new command intent
 * @param {string} response - User's response
 * @param {Object} context - Conversation context
 * @returns {number} Confidence score (0-1)
 */
export const calculateNewCommandConfidence = (response, context = {}) => {
  const lowerResponse = response.toLowerCase().trim();
  let confidence = 0;

  // Strong indicators of new commands (with entity names)
  if (/(?:create|add|new)\s+(?:customer|product|invoice)\s+[a-zA-Z]/i.test(lowerResponse)) {
    confidence += 0.9; // "create product MacBook" style
  } else if (/(?:show|list|view|display)\s+(?:all\s+)?(?:customers|products|invoices)/i.test(lowerResponse)) {
    confidence += 0.9; // "show all products" style
  }

  // Medium indicators
  if (/^(?:create|add|new|show|list|view)/i.test(lowerResponse) && lowerResponse.length > 15) {
    confidence += 0.7; // Long commands are likely new
  }

  // Reduce confidence if in active conversation
  if (context.isActive && context.awaitingUserChoice) {
    confidence *= 0.3; // Heavily reduce if we're expecting a follow-up
  }

  return Math.min(confidence, 1.0);
};

/**
 * Calculate confidence score for confirmation responses
 * @param {string} response - User's response
 * @returns {Object} Confidence scores for positive and negative confirmations
 */
const calculateConfirmationConfidence = (response) => {
  const lowerResponse = response.toLowerCase().trim();

  const positive = (() => {
    let confidence = 0;
    if (/^(?:yes|ok|okay|sure|yep|yeah|correct|right|good|perfect|proceed|continue|go\s+ahead)/i.test(lowerResponse)) {
      confidence += 0.85;
    } else if (/^(?:create|make|proceed|continue|go)/i.test(lowerResponse)) {
      confidence += 0.8;
    } else if (/^(?:looks?\s+good|sounds?\s+good|that'?s?\s+right)/i.test(lowerResponse)) {
      confidence += 0.8;
    }
    return Math.min(confidence, 1.0);
  })();

  const negative = (() => {
    let confidence = 0;
    if (/^(?:no|nope|nah|cancel|stop|abort|never\s+mind)/i.test(lowerResponse)) {
      confidence += 0.85;
    } else if (/^(?:review|edit|change|modify)/i.test(lowerResponse)) {
      confidence += 0.8;
    } else if (/^(?:let\s+me\s+review|i\s+want\s+to\s+review)/i.test(lowerResponse)) {
      confidence += 0.8;
    }
    return Math.min(confidence, 1.0);
  })();

  return { positive, negative };
};

/**
 * Enhanced follow-up response classification with confidence scoring
 * @param {string} response - User's follow-up response
 * @param {string} expectedContext - Expected context ('entity_choice', 'confirmation', etc.)
 * @returns {Object} Classification result with confidence scores
 */
export const classifyFollowUpResponse = (response, expectedContext = null) => {
  console.log('🔄 === ENHANCED FOLLOW-UP CLASSIFICATION ===');
  console.log('📝 Response:', response);
  console.log('🎯 Expected context:', expectedContext);

  const classification = {
    isFollowUp: false,
    intent: 'unknown',
    confidence: 0,
    action: null,
    allScores: {},
    parameters: {}
  };

  try {
    // Calculate confidence scores for all possible intents
    const scores = {
      useExisting: calculateUseExistingConfidence(response),
      createNew: calculateCreateNewConfidence(response),
      newCommand: calculateNewCommandConfidence(response, { isActive: true, awaitingUserChoice: true })
    };

    // Add confirmation scores if in confirmation context
    if (expectedContext === 'confirmation' || expectedContext === 'final_confirmation') {
      const confirmationScores = calculateConfirmationConfidence(response);
      scores.confirmPositive = confirmationScores.positive;
      scores.confirmNegative = confirmationScores.negative;
    }

    classification.allScores = scores;

    // Find highest confidence score
    const maxScore = Math.max(...Object.values(scores));
    const bestIntent = Object.keys(scores).find(key => scores[key] === maxScore);

    console.log('📊 Confidence scores:', scores);
    console.log('🎯 Best intent:', bestIntent, 'with confidence:', maxScore);

    // Set classification based on highest confidence
    if (maxScore >= 0.6) {
      classification.isFollowUp = true;
      classification.confidence = maxScore;

      switch (bestIntent) {
        case 'useExisting':
          classification.intent = 'use_existing_entity';
          classification.action = 'use_existing';
          break;
        case 'createNew':
          classification.intent = 'create_new_entity';
          classification.action = 'create_new';
          break;
        case 'confirmPositive':
          classification.intent = 'confirm_positive';
          classification.action = 'confirm';
          break;
        case 'confirmNegative':
          classification.intent = 'confirm_negative';
          classification.action = 'cancel_or_review';
          break;
        case 'newCommand':
          classification.isFollowUp = false;
          classification.intent = 'new_command';
          classification.action = 'new_command';
          break;
      }

      console.log('✅ Classification result:', {
        intent: classification.intent,
        action: classification.action,
        confidence: classification.confidence
      });
    } else {
      console.log('❓ Low confidence classification, treating as unclear');
      classification.intent = 'unclear';
      classification.confidence = maxScore;
    }

    return classification;

  } catch (error) {
    console.error('❌ Follow-up response classification error:', error);
    return classification;
  }
};

/**
 * Extract question type from assistant's question
 * @param {string} question - The question asked by the assistant
 * @returns {string} Question type
 */
const extractQuestionType = (question) => {
  if (!question) return 'unknown';

  const lowerQuestion = question.toLowerCase();

  if (lowerQuestion.includes('use existing or create new')) {
    return 'entity_choice';
  } else if (lowerQuestion.includes('everything looks good') || lowerQuestion.includes('create invoice now')) {
    return 'final_confirmation';
  } else if (lowerQuestion.includes('similar') && lowerQuestion.includes('found')) {
    return 'similarity_choice';
  } else if (lowerQuestion.includes('confirm') || lowerQuestion.includes('proceed')) {
    return 'confirmation';
  }

  return 'general';
};

/**
 * Extract response type from user's response
 * @param {string} response - User's response
 * @returns {string} Response type
 */
const extractResponseType = (response) => {
  if (!response) return 'unknown';

  const lowerResponse = response.toLowerCase().trim();

  if (/(?:use|choose|select|pick|take).*(?:existing|this|that)/i.test(lowerResponse)) {
    return 'use_existing';
  } else if (/(?:create|add|make|new)/i.test(lowerResponse)) {
    return 'create_new';
  } else if (/^(?:yes|ok|okay|sure|yep|yeah|proceed|continue)/i.test(lowerResponse)) {
    return 'positive_confirmation';
  } else if (/^(?:no|nope|nah|cancel|review)/i.test(lowerResponse)) {
    return 'negative_confirmation';
  }

  return 'general';
};

/**
 * Calculate correlation between question and response
 * @param {string} questionType - Type of question asked
 * @param {string} responseType - Type of response given
 * @returns {number} Correlation score (0-1)
 */
const calculateCorrelation = (questionType, responseType) => {
  const correlationMatrix = {
    'entity_choice': {
      'use_existing': 0.9,
      'create_new': 0.9,
      'positive_confirmation': 0.6,
      'negative_confirmation': 0.6,
      'general': 0.3
    },
    'similarity_choice': {
      'use_existing': 0.9,
      'create_new': 0.9,
      'positive_confirmation': 0.7,
      'negative_confirmation': 0.7,
      'general': 0.3
    },
    'final_confirmation': {
      'positive_confirmation': 0.9,
      'negative_confirmation': 0.9,
      'use_existing': 0.4,
      'create_new': 0.4,
      'general': 0.3
    },
    'confirmation': {
      'positive_confirmation': 0.9,
      'negative_confirmation': 0.9,
      'use_existing': 0.4,
      'create_new': 0.4,
      'general': 0.3
    },
    'general': {
      'use_existing': 0.5,
      'create_new': 0.5,
      'positive_confirmation': 0.5,
      'negative_confirmation': 0.5,
      'general': 0.5
    }
  };

  return correlationMatrix[questionType]?.[responseType] || 0.2;
};

/**
 * Correlate question and response to determine if response is contextually appropriate
 * @param {string} question - The question that was asked
 * @param {string} response - The user's response
 * @returns {Object} Correlation result with score and validity
 */
export const correlateQuestionResponse = (question, response) => {
  console.log('🔗 === QUESTION-RESPONSE CORRELATION ===');
  console.log('❓ Question:', question);
  console.log('💬 Response:', response);

  try {
    const questionType = extractQuestionType(question);
    const responseType = extractResponseType(response);
    const correlationScore = calculateCorrelation(questionType, responseType);

    const result = {
      questionType,
      responseType,
      correlationScore,
      isHighCorrelation: correlationScore >= 0.7,
      isValidFollowUp: correlationScore >= 0.6
    };

    console.log('📊 Correlation result:', result);
    return result;

  } catch (error) {
    console.error('❌ Question-response correlation error:', error);
    return {
      questionType: 'unknown',
      responseType: 'unknown',
      correlationScore: 0.5,
      isHighCorrelation: false,
      isValidFollowUp: false
    };
  }
};

/**
 * Simple semantic similarity using word overlap and common patterns
 * @param {string} text1 - First text
 * @param {string} text2 - Second text
 * @returns {number} Similarity score (0-1)
 */
const calculateSemanticSimilarity = (text1, text2) => {
  if (!text1 || !text2) return 0;

  const normalize = (text) => text.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const words1 = new Set(normalize(text1).split(/\s+/));
  const words2 = new Set(normalize(text2).split(/\s+/));

  // Calculate Jaccard similarity (intersection over union)
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  const jaccardSimilarity = intersection.size / union.size;

  // Boost score for common entity-related keywords
  const entityKeywords = ['use', 'existing', 'create', 'new', 'add', 'make', 'choose', 'select', 'product', 'customer'];
  const entityOverlap = [...intersection].filter(word => entityKeywords.includes(word)).length;
  const entityBoost = Math.min(entityOverlap * 0.2, 0.4);

  return Math.min(jaccardSimilarity + entityBoost, 1.0);
};

/**
 * Enhanced semantic classification for edge cases
 * @param {string} response - User's response
 * @param {Array} expectedTypes - Expected response types
 * @param {Object} context - Conversation context
 * @returns {Object} Semantic classification result
 */
export const semanticClassification = (response, expectedTypes = [], context = {}) => {
  console.log('🧠 === SEMANTIC SIMILARITY ANALYSIS ===');
  console.log('💬 Response:', response);
  console.log('🎯 Expected types:', expectedTypes);

  const semanticResults = {
    bestMatch: null,
    maxScore: 0,
    allScores: {},
    confidence: 0
  };

  try {
    // Reference phrases for different response types
    const referencePhases = {
      'use_existing': [
        'use the existing one',
        'choose this product',
        'select the current customer',
        'pick the existing option',
        'go with what you found'
      ],
      'create_new': [
        'create a new product',
        'add new customer',
        'make a new one',
        'create something new',
        'add as new item'
      ],
      'positive_confirmation': [
        'yes proceed',
        'looks good create',
        'that sounds right',
        'go ahead with it',
        'yes continue'
      ],
      'negative_confirmation': [
        'no review first',
        'let me check again',
        'want to modify',
        'need to change',
        'not quite right'
      ]
    };

    // Calculate similarity scores for each expected type
    expectedTypes.forEach(expectedType => {
      const phrases = referencePhases[expectedType] || [];
      let maxSimilarity = 0;

      phrases.forEach(phrase => {
        const similarity = calculateSemanticSimilarity(response, phrase);
        maxSimilarity = Math.max(maxSimilarity, similarity);
      });

      semanticResults.allScores[expectedType] = maxSimilarity;

      if (maxSimilarity > semanticResults.maxScore) {
        semanticResults.maxScore = maxSimilarity;
        semanticResults.bestMatch = expectedType;
      }
    });

    // Calculate overall confidence
    semanticResults.confidence = semanticResults.maxScore;

    console.log('📊 Semantic similarity scores:', semanticResults.allScores);
    console.log('🎯 Best match:', semanticResults.bestMatch, 'with score:', semanticResults.maxScore);

    return semanticResults;

  } catch (error) {
    console.error('❌ Semantic classification error:', error);
    return semanticResults;
  }
};

/**
 * Handle ambiguous cases with semantic fallback
 * @param {string} response - User's response
 * @param {Object} classification - Initial classification result
 * @param {Object} context - Conversation context
 * @returns {Object} Enhanced classification with semantic analysis
 */
export const handleAmbiguousCase = async (response, classification, context) => {
  console.log('🤔 === HANDLING AMBIGUOUS CASE ===');
  console.log('📝 Response:', response);
  console.log('📊 Initial classification confidence:', classification.confidence);

  if (classification.confidence >= 0.7) {
    console.log('✅ High confidence, no semantic analysis needed');
    return classification;
  }

  // Determine expected response types based on context
  let expectedTypes = [];
  if (context.step === 'customer_resolution' || context.step === 'product_resolution') {
    expectedTypes = ['use_existing', 'create_new'];
  } else if (context.step === 'final_confirmation') {
    expectedTypes = ['positive_confirmation', 'negative_confirmation'];
  }

  if (expectedTypes.length === 0) {
    console.log('❓ No expected types for semantic analysis');
    return classification;
  }

  console.log('🔍 Running semantic analysis for expected types:', expectedTypes);
  const semanticResult = semanticClassification(response, expectedTypes, context);

  // Combine original classification with semantic analysis
  if (semanticResult.maxScore > 0.6 && semanticResult.maxScore > classification.confidence) {
    console.log('✅ Semantic analysis improved classification');

    return {
      ...classification,
      intent: semanticResult.bestMatch,
      action: semanticResult.bestMatch === 'use_existing' ? 'use_existing' :
              semanticResult.bestMatch === 'create_new' ? 'create_new' :
              semanticResult.bestMatch === 'positive_confirmation' ? 'confirm' :
              semanticResult.bestMatch === 'negative_confirmation' ? 'cancel_or_review' :
              classification.action,
      confidence: semanticResult.maxScore,
      semanticAnalysis: semanticResult,
      enhancedBy: 'semantic_similarity'
    };
  } else {
    console.log('❌ Semantic analysis did not improve classification');
    return {
      ...classification,
      semanticAnalysis: semanticResult,
      enhancedBy: 'original_classification'
    };
  }
};

/**
 * Context validation guards to prevent invalid state transitions
 */
export const contextGuards = {
  /**
   * Check if conversation is active and awaiting user choice
   * @param {Object} context - Conversation context
   * @returns {boolean} True if in conversation
   */
  isInConversation: (context) => {
    return context && context.isActive && context.awaitingUserChoice;
  },

  /**
   * Check if response is valid for entity choice context
   * @param {string} response - User's response
   * @param {Object} context - Conversation context
   * @returns {boolean} True if valid entity choice response
   */
  isValidEntityChoice: (response, context) => {
    if (!context || context.step !== 'customer_resolution' && context.step !== 'product_resolution') {
      return false;
    }

    const lowerResponse = response.toLowerCase();
    return lowerResponse.includes('use') || lowerResponse.includes('create') ||
           lowerResponse.includes('existing') || lowerResponse.includes('new');
  },

  /**
   * Check if response is valid for confirmation context
   * @param {string} response - User's response
   * @param {Object} context - Conversation context
   * @returns {boolean} True if valid confirmation response
   */
  isValidConfirmation: (response, context) => {
    if (!context || context.step !== 'final_confirmation') {
      return false;
    }

    const lowerResponse = response.toLowerCase();
    return lowerResponse.includes('yes') || lowerResponse.includes('no') ||
           lowerResponse.includes('ok') || lowerResponse.includes('proceed') ||
           lowerResponse.includes('review') || lowerResponse.includes('create');
  },

  /**
   * Validate that user response makes sense for the current conversation step
   * @param {string} response - User's response
   * @param {Object} context - Full conversation context
   * @returns {Object} Validation result
   */
  validateContextContinuity: (response, context) => {
    if (!context || !context.isActive) {
      return { isValid: false, reason: 'no_active_conversation' };
    }

    if (!context.awaitingUserChoice) {
      return { isValid: false, reason: 'not_awaiting_response' };
    }

    if (!context.lastQuestion) {
      return { isValid: false, reason: 'no_previous_question' };
    }

    // Use question-response correlation for validation
    const correlation = correlateQuestionResponse(context.lastQuestion, response);

    if (correlation.isValidFollowUp) {
      return { isValid: true, correlationScore: correlation.correlationScore };
    } else {
      return {
        isValid: false,
        reason: 'low_correlation',
        correlationScore: correlation.correlationScore,
        questionType: correlation.questionType,
        responseType: correlation.responseType
      };
    }
  }
};

/**
 * Conversation Memory Window Management
 * Implements sliding window of recent exchanges for context
 */
export const conversationMemory = {
  maxWindowSize: 5,
  decayConstant: 300000, // 5 minutes in milliseconds

  /**
   * Add exchange to conversation memory
   * @param {Array} currentHistory - Current conversation history
   * @param {Object} exchange - New exchange to add
   * @returns {Array} Updated conversation history
   */
  addExchange: (currentHistory, exchange) => {
    const updatedHistory = [...currentHistory, {
      ...exchange,
      timestamp: Date.now(),
      relevanceScore: 1.0 // Start with max relevance
    }];

    // Keep only recent exchanges
    if (updatedHistory.length > conversationMemory.maxWindowSize) {
      return updatedHistory.slice(-conversationMemory.maxWindowSize);
    }

    return updatedHistory;
  },

  /**
   * Calculate relevance score based on time decay and context
   * @param {Object} exchange - Conversation exchange
   * @param {number} currentTime - Current timestamp
   * @returns {number} Relevance score (0-1)
   */
  calculateRelevance: (exchange, currentTime = Date.now()) => {
    const timeDelta = currentTime - exchange.timestamp;
    const timeRelevance = Math.exp(-timeDelta / conversationMemory.decayConstant);

    // Boost relevance for successful exchanges
    const successBoost = exchange.classification?.confidence > 0.8 ? 1.2 : 1.0;

    // Boost relevance for similar context
    const contextBoost = exchange.context ? 1.1 : 1.0;

    return Math.min(timeRelevance * successBoost * contextBoost, 1.0);
  },

  /**
   * Get relevant context from conversation history
   * @param {Array} conversationHistory - Full conversation history
   * @param {Object} currentContext - Current conversation context
   * @returns {Array} Relevant exchanges
   */
  getRelevantContext: (conversationHistory, currentContext) => {
    const currentTime = Date.now();

    return conversationHistory
      .map(exchange => ({
        ...exchange,
        relevanceScore: conversationMemory.calculateRelevance(exchange, currentTime)
      }))
      .filter(exchange => exchange.relevanceScore > 0.1) // Filter out very old/irrelevant
      .sort((a, b) => b.relevanceScore - a.relevanceScore) // Sort by relevance
      .slice(0, 3); // Keep top 3 most relevant
  },

  /**
   * Extract patterns from conversation history for better classification
   * @param {Array} relevantHistory - Relevant conversation exchanges
   * @returns {Object} Conversation patterns
   */
  extractConversationPatterns: (relevantHistory) => {
    const patterns = {
      commonActions: {},
      preferredResponses: {},
      contextContinuity: 0
    };

    relevantHistory.forEach(exchange => {
      // Track common actions
      if (exchange.classification?.action) {
        patterns.commonActions[exchange.classification.action] =
          (patterns.commonActions[exchange.classification.action] || 0) + 1;
      }

      // Track preferred response patterns
      if (exchange.userResponse && exchange.classification?.intent) {
        const responseKey = exchange.userResponse.toLowerCase().substring(0, 10);
        patterns.preferredResponses[responseKey] = exchange.classification.intent;
      }
    });

    // Calculate context continuity
    if (relevantHistory.length > 1) {
      const contextMatches = relevantHistory.reduce((matches, exchange, index) => {
        if (index > 0 && exchange.context === relevantHistory[index - 1].context) {
          return matches + 1;
        }
        return matches;
      }, 0);
      patterns.contextContinuity = contextMatches / (relevantHistory.length - 1);
    }

    return patterns;
  }
};

/**
 * Multi-turn Conversation Recovery System
 */
export const conversationRecovery = {
  /**
   * Detect when conversation has gone off-track
   * @param {Object} currentState - Current conversation state
   * @param {string} userInput - User's input
   * @param {Array} conversationHistory - Recent conversation history
   * @returns {Object} Context loss detection result
   */
  detectContextLoss: (currentState, userInput, conversationHistory) => {
    console.log('🔍 === CONTEXT LOSS DETECTION ===');

    const detection = {
      contextLost: false,
      reason: null,
      severity: 'low', // low, medium, high
      recoverySuggestion: null
    };

    try {
      // Check 1: No conversation state but expecting response
      if (!currentState.isActive && conversationHistory.length > 0) {
        const lastExchange = conversationHistory[conversationHistory.length - 1];
        if (lastExchange.timestamp > Date.now() - 60000) { // Within last minute
          detection.contextLost = true;
          detection.reason = 'state_lost_recent_exchange';
          detection.severity = 'high';
          detection.recoverySuggestion = 'restore_from_last_exchange';
        }
      }

      // Check 2: User input doesn't match any expected patterns
      if (currentState.isActive && currentState.awaitingUserChoice) {
        const correlation = correlateQuestionResponse(currentState.lastQuestion, userInput);
        if (correlation.correlationScore < 0.3) {
          detection.contextLost = true;
          detection.reason = 'very_low_correlation';
          detection.severity = 'medium';
          detection.recoverySuggestion = 'clarify_intent';
        }
      }

      // Check 3: Conversation has been inactive for too long
      if (currentState.isActive && conversationHistory.length > 0) {
        const lastExchange = conversationHistory[conversationHistory.length - 1];
        if (lastExchange.timestamp < Date.now() - 300000) { // 5 minutes ago
          detection.contextLost = true;
          detection.reason = 'conversation_timeout';
          detection.severity = 'low';
          detection.recoverySuggestion = 'restart_flow';
        }
      }

      console.log('🔍 Context loss detection result:', detection);
      return detection;

    } catch (error) {
      console.error('❌ Context loss detection error:', error);
      return { ...detection, contextLost: true, reason: 'detection_error' };
    }
  },

  /**
   * Attempt to recover lost conversation context
   * @param {Object} lostState - Information about lost context
   * @param {Array} conversationHistory - Conversation history
   * @param {Function} addMessage - Function to add messages
   * @returns {Object} Recovery result
   */
  recoverContext: (lostState, conversationHistory, addMessage) => {
    console.log('🔧 === CONVERSATION RECOVERY ===');
    console.log('💔 Lost state:', lostState);

    const recovery = {
      success: false,
      action: null,
      restoredState: null,
      message: null
    };

    try {
      switch (lostState.recoverySuggestion) {
        case 'restore_from_last_exchange':
          const lastExchange = conversationHistory[conversationHistory.length - 1];
          if (lastExchange && lastExchange.context) {
            recovery.success = true;
            recovery.action = 'restore_state';
            recovery.restoredState = {
              isActive: true,
              step: lastExchange.context,
              awaitingUserChoice: true,
              lastQuestion: lastExchange.correlation?.questionType || 'previous question'
            };
            recovery.message = `I notice we were discussing ${lastExchange.context}. Let me continue from where we left off.`;
            addMessage('assistant', recovery.message);
          }
          break;

        case 'clarify_intent':
          recovery.success = true;
          recovery.action = 'ask_clarification';
          recovery.message = "I'm having trouble understanding your response in this context. Could you please clarify what you'd like to do?";
          addMessage('assistant', recovery.message);
          break;

        case 'restart_flow':
          recovery.success = true;
          recovery.action = 'restart';
          recovery.message = "It's been a while since our last interaction. Would you like to start fresh or continue with your previous request?";
          addMessage('assistant', recovery.message);
          break;

        default:
          recovery.success = false;
          recovery.action = 'manual_intervention';
          recovery.message = "I'm having trouble following our conversation. Could you please repeat your request?";
          addMessage('assistant', recovery.message);
      }

      console.log('🔧 Recovery result:', recovery);
      return recovery;

    } catch (error) {
      console.error('❌ Conversation recovery error:', error);
      return {
        success: false,
        action: 'error',
        message: "I'm having technical difficulties. Please try starting a new conversation."
      };
    }
  },

  /**
   * Graceful conversation restart with context preservation
   * @param {Array} conversationHistory - Previous conversation history
   * @param {Function} addMessage - Function to add messages
   * @returns {Object} Restart information
   */
  gracefulRestart: (conversationHistory, addMessage) => {
    console.log('🔄 === GRACEFUL CONVERSATION RESTART ===');

    // Extract useful context from previous conversation
    const relevantHistory = conversationMemory.getRelevantContext(conversationHistory, {});
    const patterns = conversationMemory.extractConversationPatterns(relevantHistory);

    let contextSummary = '';
    if (Object.keys(patterns.commonActions).length > 0) {
      const mostCommonAction = Object.keys(patterns.commonActions)
        .reduce((a, b) => patterns.commonActions[a] > patterns.commonActions[b] ? a : b);

      if (mostCommonAction === 'create_new') {
        contextSummary = "I notice you were working on creating something new. ";
      } else if (mostCommonAction === 'use_existing') {
        contextSummary = "I see you were selecting from existing options. ";
      }
    }

    const restartMessage = `${contextSummary}Let's start fresh! What would you like to do?`;
    addMessage('assistant', restartMessage);

    return {
      success: true,
      preservedContext: patterns,
      message: restartMessage
    };
  }
};

/**
 * Enhanced debugging utilities for conversation state
 */
export const conversationDebugger = {
  /**
   * Log comprehensive conversation state for debugging
   * @param {string} userInput - User's input
   * @param {Object} classification - Classification result
   * @param {Object} context - Conversation context
   * @param {string} stage - Processing stage
   */
  debugConversationState: (userInput, classification, context, stage = 'classification') => {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      stage,
      userInput,
      conversationState: {
        isActive: context?.isActive || false,
        step: context?.step || 'none',
        awaitingUserChoice: context?.awaitingUserChoice || false,
        lastQuestion: context?.lastQuestion || 'none',
        expectedResponseTypes: context?.expectedResponseTypes || []
      },
      classification: {
        intent: classification?.intent || 'unknown',
        action: classification?.action || 'none',
        confidence: classification?.confidence || 0,
        isFollowUp: classification?.isFollowUp || false,
        allScores: classification?.allScores || {}
      }
    };

    console.log('🔍 === CONVERSATION DEBUG ===');
    console.log('📊 Debug Info:', JSON.stringify(debugInfo, null, 2));
    console.log('🎯 Key Decision Points:', {
      'Conversation Active': debugInfo.conversationState.isActive,
      'Awaiting Response': debugInfo.conversationState.awaitingUserChoice,
      'Classification Confidence': debugInfo.classification.confidence,
      'Classified as Follow-up': debugInfo.classification.isFollowUp
    });

    return debugInfo;
  },

  /**
   * Track decision making process for troubleshooting
   * @param {string} decision - Decision point
   * @param {Object} factors - Factors influencing the decision
   * @param {string} outcome - Decision outcome
   */
  logDecision: (decision, factors, outcome) => {
    console.log(`🎯 DECISION: ${decision}`);
    console.log('📋 Factors:', factors);
    console.log('✅ Outcome:', outcome);
  },

  /**
   * Log context validation results
   * @param {string} response - User response
   * @param {Object} context - Conversation context
   * @param {Object} validation - Validation result
   */
  debugContextValidation: (response, context, validation) => {
    console.log('🛡️ === CONTEXT VALIDATION DEBUG ===');
    console.log('💬 User Response:', response);
    console.log('📊 Context:', {
      step: context?.step,
      lastQuestion: context?.lastQuestion,
      awaitingChoice: context?.awaitingUserChoice
    });
    console.log('✅ Validation Result:', validation);
  }
};

/**
 * Validate extracted entities
 * @param {Object} entities - Extracted entities
 * @param {string} type - Entity type ('customer', 'product', 'invoice')
 * @returns {Object} Validation result
 */
export const validateExtractedEntities = (entities, type) => {
  const validation = {
    isValid: false,
    errors: [],
    warnings: []
  };

  try {
    switch (type) {
      case 'customer':
        if (!entities.customer_name && !entities.customer_phone) {
          validation.errors.push('Customer name or phone number is required');
        }
        if (entities.customer_phone && !/^\d{10}$/.test(entities.customer_phone)) {
          validation.errors.push('Phone number must be exactly 10 digits');
        }
        if (entities.customer_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entities.customer_email)) {
          validation.errors.push('Invalid email format');
        }
        if (!entities.customer_address) {
          validation.warnings.push('Customer address not provided');
        }
        break;

      case 'product':
        if (!entities.product_description) {
          validation.errors.push('Product description is required');
        }
        if (!entities.product_price || entities.product_price <= 0) {
          validation.errors.push('Product price must be greater than 0');
        }
        break;

      case 'invoice':
        if (!entities.customer || (!entities.customer.customer_name && !entities.customer.customer_phone)) {
          validation.errors.push('Customer information is required for invoice');
        }
        if (!entities.products || entities.products.length === 0) {
          validation.errors.push('At least one product is required for invoice');
        }
        break;

      default:
        validation.errors.push('Unknown entity type');
    }

    validation.isValid = validation.errors.length === 0;

  } catch (error) {
    validation.errors.push(`Validation error: ${error.message}`);
  }

  return validation;
};

export default {
  extractCustomerEntities,
  extractProductEntities,
  extractInvoiceEntities,
  detectCreationType,
  validateExtractedEntities,
  classifyFollowUpResponse,
  correlateQuestionResponse,
  contextGuards,
  conversationDebugger,
  // Phase 2 enhancements
  semanticClassification,
  handleAmbiguousCase,
  conversationMemory,
  conversationRecovery
};