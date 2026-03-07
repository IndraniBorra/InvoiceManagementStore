/**
 * Conversational Creation Service
 * Handles AI-powered creation flows for customers, products, and invoices
 * with intelligent entity resolution and user confirmation
 */

import { extractCustomerEntities, extractProductEntities, extractInvoiceEntities, validateExtractedEntities } from '../utils/nlpEntityExtractor';
import { CustomerResolver, ProductResolver, EntityResolver } from './entityResolver';

/**
 * Process customer creation from natural language with conversational flow
 * @param {string} query - Natural language query
 * @param {Function} addMessage - Function to add messages to chat
 * @param {Function} navigate - Navigation function
 * @returns {Promise<Object>} Process result
 */
export const processCustomerCreationWithEntities = async (query, addMessage, navigate) => {
  console.log('👤 === CONVERSATIONAL CUSTOMER CREATION ===');
  console.log('📝 Processing customer creation:', query);

  try {
    // Extract customer entities from query
    const customerEntity = extractCustomerEntities(query);
    console.log('🎯 Extracted customer entity:', customerEntity);

    // Validate extracted entities
    const validation = validateExtractedEntities(customerEntity, 'customer');
    console.log('✅ Validation result:', validation);

    // Check if we have minimal required information
    if (!customerEntity.customer_name && !customerEntity.customer_phone) {
      console.log('❌ Missing customer name and phone from query:', query);
      console.log('📊 Extracted so far:', customerEntity);

      addMessage('assistant', `I couldn't find a customer name or phone number in "${query}". Please provide at least one, like "Create customer John Smith with phone 5551234567".`);
      return {
        success: false,
        reason: 'insufficient_data',
        message: 'Need customer name or phone number',
        originalQuery: query,
        extractedData: customerEntity,
        needsRetry: true,
        retryType: 'customer_basic_info'
      };
    }

    // Success case - show what was extracted
    console.log('✅ Successfully extracted customer entity:', customerEntity);
    const extractedInfo = [];
    if (customerEntity.customer_name) extractedInfo.push(`name: "${customerEntity.customer_name}"`);
    if (customerEntity.customer_phone) extractedInfo.push(`phone: ${customerEntity.customer_phone}`);
    if (customerEntity.customer_email) extractedInfo.push(`email: ${customerEntity.customer_email}`);
    if (customerEntity.customer_address) extractedInfo.push(`address: "${customerEntity.customer_address}"`);

    addMessage('assistant', `✅ I found customer with ${extractedInfo.join(', ')}. Let me check if this customer already exists...`);

    // Resolve customer against existing database
    const resolution = await CustomerResolver.resolveCustomer(customerEntity);
    console.log('🔍 Customer resolution result:', resolution);

    if (resolution.action === 'use_existing') {
      addMessage('assistant', `✅ ${resolution.message}`);
      addMessage('assistant', 'This customer already exists in the system. Would you like to view their details or create a new customer instead?');

      return {
        success: true,
        action: 'existing_customer_found',
        customer: resolution.customer,
        message: 'Customer already exists'
      };
    } else if (resolution.action === 'suggest_existing') {
      addMessage('assistant', `🤔 ${resolution.message}`);

      return {
        success: true,
        action: 'similar_customer_found',
        suggestion: resolution.suggestion,
        extractedData: customerEntity,
        message: 'Similar customer found, awaiting user choice'
      };
    } else {
      // Create new customer
      addMessage('assistant', '✨ Creating new customer with the provided information...');

      // Fill in missing required fields with defaults or prompts
      const customerData = { ...customerEntity };

      // Handle missing required fields
      const missingFields = [];
      if (!customerData.customer_name) {
        customerData.customer_name = `Customer-${customerData.customer_phone}`;
        missingFields.push('name (using phone as identifier)');
      }
      if (!customerData.customer_address) {
        customerData.customer_address = 'Address not provided';
        missingFields.push('address');
      }
      if (!customerData.customer_phone) {
        addMessage('assistant', 'I need a phone number to create this customer. Could you provide one?');
        return {
          success: false,
          reason: 'missing_phone',
          message: 'Phone number required'
        };
      }

      if (missingFields.length > 0) {
        addMessage('assistant', `⚠️ Note: Some fields are missing (${missingFields.join(', ')}). You can update these later.`);
      }

      // Create the customer
      const createResult = await CustomerResolver.createCustomer(customerData);

      if (createResult.success) {
        addMessage('assistant', `🎉 ${createResult.message}`);
        addMessage('assistant', 'The customer has been created successfully! You can now use them for invoices.');

        return {
          success: true,
          action: 'customer_created',
          customer: createResult.customer,
          message: 'Customer created successfully'
        };
      } else {
        addMessage('assistant', `❌ Failed to create customer: ${createResult.message}`);

        return {
          success: false,
          reason: 'creation_failed',
          error: createResult.error,
          message: createResult.message
        };
      }
    }

  } catch (error) {
    console.error('❌ Customer creation processing error:', error);
    addMessage('assistant', 'Sorry, there was an error processing your customer creation request.');

    return {
      success: false,
      reason: 'processing_error',
      error: error.message,
      message: 'Error processing request'
    };
  }
};

/**
 * Process product creation from natural language with conversational flow
 * @param {string} query - Natural language query
 * @param {Function} addMessage - Function to add messages to chat
 * @param {Function} navigate - Navigation function
 * @returns {Promise<Object>} Process result
 */
export const processProductCreationWithEntities = async (query, addMessage, navigate) => {
  console.log('📦 === CONVERSATIONAL PRODUCT CREATION ===');
  console.log('📝 Processing product creation:', query);

  try {
    // Extract product entities from query
    const productEntity = extractProductEntities(query);
    console.log('🎯 Extracted product entity:', productEntity);

    // Validate extracted entities
    const validation = validateExtractedEntities(productEntity, 'product');
    console.log('✅ Validation result:', validation);

    // Check if we have required information with detailed feedback
    if (!productEntity.product_description) {
      console.log('❌ Missing product description from query:', query);
      addMessage('assistant', `I couldn't find a product name in "${query}". Please specify the product name clearly, like "Create product Gaming Laptop priced at $999".`);
      return {
        success: false,
        reason: 'missing_description',
        message: 'Product description required',
        originalQuery: query,
        extractedData: productEntity
      };
    }

    if (!productEntity.product_price || productEntity.product_price <= 0) {
      console.log('❌ Missing or invalid product price from query:', query);
      console.log('📊 Extracted so far:', productEntity);

      const helpMessage = productEntity.product_description
        ? `I found the product "${productEntity.product_description}" but couldn't find the price. Please specify the price, like "${productEntity.product_description} priced at $999".`
        : `I need a valid price to create this product. Please specify the price clearly.`;

      addMessage('assistant', helpMessage);
      return {
        success: false,
        reason: 'missing_price',
        message: 'Valid product price required',
        originalQuery: query,
        extractedData: productEntity,
        needsRetry: true,
        retryType: 'product_price'
      };
    }

    // Success case - show what was extracted
    console.log('✅ Successfully extracted product entity:', productEntity);
    addMessage('assistant', `✅ I found: "${productEntity.product_description}" priced at $${productEntity.product_price}. Let me check if a similar product already exists...`);

    // Resolve product against existing database
    const resolution = await ProductResolver.resolveProduct(productEntity);
    console.log('🔍 Product resolution result:', resolution);

    if (resolution.action === 'use_existing') {
      addMessage('assistant', `✅ ${resolution.message}`);
      addMessage('assistant', 'This product already exists in the system. Would you like to view its details or create a new product instead?');

      return {
        success: true,
        action: 'existing_product_found',
        product: resolution.product,
        message: 'Product already exists'
      };
    } else if (resolution.action === 'suggest_existing') {
      addMessage('assistant', `🤔 ${resolution.message}`);

      return {
        success: true,
        action: 'similar_product_found',
        suggestion: resolution.suggestion,
        extractedData: productEntity,
        message: 'Similar product found, awaiting user choice'
      };
    } else {
      // Create new product
      addMessage('assistant', '✨ Creating new product with the provided information...');

      const createResult = await ProductResolver.createProduct(productEntity);

      if (createResult.success) {
        addMessage('assistant', `🎉 ${createResult.message}`);
        addMessage('assistant', 'The product has been created successfully! You can now use it in invoices.');

        return {
          success: true,
          action: 'product_created',
          product: createResult.product,
          message: 'Product created successfully'
        };
      } else {
        addMessage('assistant', `❌ Failed to create product: ${createResult.message}`);

        return {
          success: false,
          reason: 'creation_failed',
          error: createResult.error,
          message: createResult.message
        };
      }
    }

  } catch (error) {
    console.error('❌ Product creation processing error:', error);
    addMessage('assistant', 'Sorry, there was an error processing your product creation request.');

    return {
      success: false,
      reason: 'processing_error',
      error: error.message,
      message: 'Error processing request'
    };
  }
};

/**
 * Enhanced invoice creation with better entity handling
 * @param {string} query - Natural language query
 * @param {Function} addMessage - Function to add messages to chat
 * @param {Function} navigate - Navigation function
 * @returns {Promise<Object>} Process result
 */
export const processEnhancedInvoiceCreation = async (query, addMessage, navigate) => {
  console.log('🧾 === ENHANCED CONVERSATIONAL INVOICE CREATION ===');
  console.log('📝 Processing invoice creation:', query);

  try {
    // Extract invoice entities from query
    const entities = extractInvoiceEntities(query);
    console.log('🎯 Extracted invoice entities:', entities);

    // Validate extracted entities
    const validation = validateExtractedEntities(entities, 'invoice');
    console.log('✅ Validation result:', validation);

    // Check if we have minimal required information
    if (!entities.customer || (!entities.customer.customer_name && !entities.customer.customer_phone)) {
      addMessage('assistant', 'I need customer information to create an invoice. Could you provide a customer name or phone number?');
      return {
        success: false,
        reason: 'missing_customer',
        message: 'Customer information required'
      };
    }

    if (!entities.products || entities.products.length === 0) {
      addMessage('assistant', 'I need product information to create an invoice. Could you specify what products to include?');
      return {
        success: false,
        reason: 'missing_products',
        message: 'Product information required'
      };
    }

    addMessage('assistant', '🔍 I found customer and product details. Let me resolve them against existing data...');

    // Use existing entity resolution logic
    const resolution = await EntityResolver.resolveInvoiceEntities(entities);
    console.log('🔍 Entity resolution result:', resolution);

    if (!resolution.success) {
      addMessage('assistant', `❌ Error resolving entities: ${resolution.errors.join(', ')}`);
      return {
        success: false,
        reason: 'resolution_failed',
        errors: resolution.errors,
        message: 'Failed to resolve entities'
      };
    }

    // Build summary message
    let summaryMessage = '📋 Invoice Summary:\n';

    if (resolution.customer) {
      const customer = resolution.customer.customer || resolution.customer.suggestion;
      summaryMessage += `👤 Customer: ${customer.customer_name}`;
      if (customer.customer_phone) summaryMessage += ` (${customer.customer_phone})`;
      summaryMessage += '\n';
    }

    summaryMessage += '📦 Products:\n';
    resolution.products.forEach((productResult, index) => {
      const product = productResult.product || productResult.suggestion;
      if (product) {
        summaryMessage += `  • ${productResult.lineitem_qty}x ${product.product_description} @ $${product.product_price} = $${(productResult.lineitem_qty * product.product_price).toFixed(2)}\n`;
      }
    });

    // Calculate total
    const total = resolution.products.reduce((sum, productResult) => {
      const product = productResult.product || productResult.suggestion;
      return sum + (productResult.lineitem_qty * (product?.product_price || 0));
    }, 0);

    summaryMessage += `💰 Total: $${total.toFixed(2)}`;

    addMessage('assistant', summaryMessage);

    // Check if any entities need to be created
    const needsCreation = resolution.actions.length > 0;

    if (needsCreation) {
      const creationMessages = resolution.actions.map(action => action.message);
      addMessage('assistant', `⚠️ Some entities need to be created:\n${creationMessages.join('\n')}`);
      addMessage('assistant', 'Shall I proceed with creating these entities and the invoice?');

      return {
        success: true,
        action: 'needs_creation_confirmation',
        resolution: resolution,
        entities: entities,
        summary: summaryMessage,
        message: 'Awaiting confirmation for entity creation'
      };
    } else {
      addMessage('assistant', '✅ All entities found! Proceeding to invoice creation...');

      // Navigate to invoice creation with resolved data
      const invoiceData = {
        customer: resolution.customer.customer || resolution.customer.suggestion,
        products: resolution.products.map(p => ({
          ...p.product || p.suggestion,
          lineitem_qty: p.lineitem_qty
        }))
      };

      // Navigate to invoice page with pre-filled data
      if (navigate) {
        navigate('/invoice', {
          state: {
            llmData: { entities: invoiceData },
            aiGenerated: true,
            action: 'create'
          }
        });
      }

      return {
        success: true,
        action: 'navigate_to_invoice',
        invoiceData: invoiceData,
        message: 'Navigating to invoice creation'
      };
    }

  } catch (error) {
    console.error('❌ Enhanced invoice creation processing error:', error);
    addMessage('assistant', 'Sorry, there was an error processing your invoice creation request.');

    return {
      success: false,
      reason: 'processing_error',
      error: error.message,
      message: 'Error processing request'
    };
  }
};

/**
 * Handle user confirmations and choices in conversational flows
 * @param {string} response - User response
 * @param {Object} context - Conversation context
 * @param {Function} addMessage - Function to add messages
 * @param {Function} navigate - Navigation function
 * @returns {Promise<Object>} Response handling result
 */
export const handleConversationalResponse = async (response, context, addMessage, navigate) => {
  console.log('💬 === HANDLING CONVERSATIONAL RESPONSE ===');
  console.log('📝 User response:', response);
  console.log('🎯 Context:', context);

  const lowerResponse = response.toLowerCase().trim();

  try {
    switch (context.action) {
      case 'similar_customer_found':
        if (lowerResponse.includes('use existing') || lowerResponse.includes('yes') || lowerResponse === 'existing') {
          addMessage('assistant', `✅ Using existing customer: ${context.suggestion.customer_name}`);
          return {
            success: true,
            action: 'use_existing_customer',
            customer: context.suggestion
          };
        } else if (lowerResponse.includes('create new') || lowerResponse.includes('no') || lowerResponse === 'new') {
          addMessage('assistant', '✨ Creating new customer...');
          const createResult = await CustomerResolver.createCustomer(context.extractedData);

          if (createResult.success) {
            addMessage('assistant', `🎉 ${createResult.message}`);
            return {
              success: true,
              action: 'new_customer_created',
              customer: createResult.customer
            };
          } else {
            addMessage('assistant', `❌ Failed to create customer: ${createResult.message}`);
            return { success: false, error: createResult.error };
          }
        } else {
          addMessage('assistant', 'Please specify whether you want to "use existing" customer or "create new" customer.');
          return {
            success: false,
            reason: 'unclear_response',
            message: 'Please specify "use existing" or "create new"'
          };
        }
        break;

      case 'similar_product_found':
        if (lowerResponse.includes('use existing') || lowerResponse.includes('yes') || lowerResponse === 'existing') {
          addMessage('assistant', `✅ Using existing product: ${context.suggestion.product_description}`);
          return {
            success: true,
            action: 'use_existing_product',
            product: context.suggestion
          };
        } else if (lowerResponse.includes('create new') || lowerResponse.includes('no') || lowerResponse === 'new') {
          addMessage('assistant', '✨ Creating new product...');
          const createResult = await ProductResolver.createProduct(context.extractedData);

          if (createResult.success) {
            addMessage('assistant', `🎉 ${createResult.message}`);
            return {
              success: true,
              action: 'new_product_created',
              product: createResult.product
            };
          } else {
            addMessage('assistant', `❌ Failed to create product: ${createResult.message}`);
            return { success: false, error: createResult.error };
          }
        } else {
          addMessage('assistant', 'Please specify whether you want to "use existing" product or "create new" product.');
          return {
            success: false,
            reason: 'unclear_response',
            message: 'Please specify "use existing" or "create new"'
          };
        }
        break;

      case 'needs_creation_confirmation':
        if (lowerResponse.includes('yes') || lowerResponse.includes('proceed') || lowerResponse.includes('continue')) {
          addMessage('assistant', '✨ Creating required entities and proceeding with invoice...');

          // Create missing entities
          for (const action of context.resolution.actions) {
            if (action.type === 'create_customer') {
              const createResult = await CustomerResolver.createCustomer(action.data);
              if (createResult.success) {
                addMessage('assistant', `✅ Customer created: ${createResult.customer.customer_name}`);
              }
            } else if (action.type === 'create_product') {
              const createResult = await ProductResolver.createProduct(action.data);
              if (createResult.success) {
                addMessage('assistant', `✅ Product created: ${createResult.product.product_description}`);
              }
            }
          }

          addMessage('assistant', '🧾 Proceeding to invoice creation...');

          // Navigate to invoice creation
          if (navigate) {
            navigate('/invoice', {
              state: {
                llmData: context.entities,
                aiGenerated: true,
                action: 'create'
              }
            });
          }

          return {
            success: true,
            action: 'entities_created_navigate_invoice',
            message: 'Entities created, navigating to invoice'
          };
        } else {
          addMessage('assistant', 'Okay, I\'ll cancel the invoice creation. Let me know if you need anything else!');
          return {
            success: true,
            action: 'cancelled',
            message: 'User cancelled operation'
          };
        }
        break;

      default:
        addMessage('assistant', 'I\'m not sure how to handle that response. Could you please clarify?');
        return {
          success: false,
          reason: 'unknown_context',
          message: 'Unknown conversation context'
        };
    }

  } catch (error) {
    console.error('❌ Conversational response handling error:', error);
    addMessage('assistant', 'Sorry, there was an error processing your response.');
    return {
      success: false,
      reason: 'processing_error',
      error: error.message
    };
  }
};

export default {
  processCustomerCreationWithEntities,
  processProductCreationWithEntities,
  processEnhancedInvoiceCreation,
  handleConversationalResponse
};