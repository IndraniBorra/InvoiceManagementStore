import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { pipeline, env } from '@xenova/transformers';
import useLLMNavigation from '../hooks/useLLMNavigation';
import InvoiceClassifier from '../services/InvoiceClassifier';
import EntityExtractor from '../services/EntityExtractor';
import './LLMAssistant.css';

// Configure transformers environment for browser compatibility
env.allowLocalModels = true;   // Allow local model loading from /public/models/
env.allowRemoteModels = true;  // Allow downloading from Hugging Face
env.useBrowserCache = false;   // Disable cache to avoid stale 404 responses

const LLMAssistant = () => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [llmGenerator, setLlmGenerator] = useState(null);
  const [invoiceClassifier, setInvoiceClassifier] = useState(null);
  const [entityExtractor, setEntityExtractor] = useState(null);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const chatContainerRef = useRef(null);
  const navigate = useNavigate();
  const llmNav = useLLMNavigation();
  const messageCounterRef = useRef(0);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const addMessage = useCallback((type, content, metadata = {}) => {
    messageCounterRef.current += 1;
    const newMessage = {
      id: `${Date.now()}-${messageCounterRef.current}`,
      type,
      content,
      timestamp: new Date().toLocaleTimeString(),
      metadata
    };
    setMessages(prev => [...prev, newMessage]);
    return newMessage;
  }, []);

  const initializeLLM = useCallback(async () => {
    console.log('🔄 Initializing Invoice Classification Models...');

    // Initialize fine-tuned invoice classifier
    const classifier = new InvoiceClassifier();
    setInvoiceClassifier(classifier);

    // Initialize entity extractor
    const extractor = new EntityExtractor();
    setEntityExtractor(extractor);
    console.log('✅ EntityExtractor initialized');

    const progressCallback = (data) => {
      if (data.status === 'loading') {
        addMessage('system', '🤖 Loading fine-tuned invoice classifier...');
      } else if (data.status === 'progress') {
        const percent = Math.round((data.progress || 0) * 100);
        addMessage('system', `📈 ${data.message} (${percent}%)`);
      } else if (data.status === 'done') {
        addMessage('system', data.message);
      } else if (data.status === 'complete') {
        addMessage('system', '✅ Fine-tuned classifier ready! High accuracy for invoice commands.');
        setIsModelLoading(false);
      } else if (data.status === 'error') {
        addMessage('system', data.message);
      }
    };

    try {
      const result = await classifier.initialize(progressCallback);

      if (result.success) {
        console.log('✅ Fine-tuned invoice classifier initialized successfully');

        // Also try to initialize the fallback DistilGPT-2 model
        try {
          console.log('🔄 Loading fallback DistilGPT-2 model...');
          addMessage('system', '📥 Loading fallback model for complex queries...');

          const generator = await pipeline('text-generation', 'Xenova/distilgpt2', {
            quantized: true,
            progress_callback: (data) => {
              if (data.status === 'progress') {
                const percent = Math.round(data.progress * 100);
                console.log(`📊 Fallback model progress: ${percent}%`);
              } else if (data.status === 'done') {
                console.log('✅ Fallback model file loaded:', data.file);
              }
            }
          });

          setLlmGenerator(() => generator);
          addMessage('system', '🔄 Fallback model ready for complex queries.');

        } catch (fallbackError) {
          console.log('⚠️ Fallback model failed to load:', fallbackError.message);
          addMessage('system', '⚠️ Fallback model unavailable. Using pattern matching for complex queries.');
        }

      } else {
        console.error('❌ Fine-tuned classifier failed to load:', result.message);
        addMessage('system', `❌ Fine-tuned model failed: ${result.message}`);
        addMessage('system', '🔄 Falling back to pattern matching.');
        setIsModelLoading(false);
      }

    } catch (error) {
      console.error('🚨 Classifier initialization error:', error);
      addMessage('system', `❌ Classifier initialization failed: ${error.message}`);
      addMessage('system', '🔄 Using pattern matching only.');
      setIsModelLoading(false);
    }
  }, [addMessage]);

  // Initialize the LLM model when component mounts
  useEffect(() => {
    initializeLLM();
  }, [initializeLLM]);

  const processQuery = async (query) => {
    if (!query.trim()) return;

    addMessage('user', query);
    
    if (isModelLoading) {
      addMessage('system', 'Model is still loading. Please wait...');
      return;
    }
    
    setIsLoading(true);

    try {
      console.log('🔍 Analyzing natural language query:', query);
      
      // Analyze the query to determine API action
      const apiAction = await determineAPIAction(query);
      
      console.log('⚙️ Query conversion results:', {
        originalQuery: query,
        detectedAction: apiAction.description,
        method: apiAction.method || apiAction.type,
        endpoint: apiAction.route || apiAction.endpoint,
        requestBody: apiAction.body || 'none',
        source: apiAction.source || 'unknown',
        confidence: apiAction.confidence || 'N/A'
      });

      // Show processing method to user
      const sourceEmoji = {
        'fine-tuned-classifier': '🎯',
        'fallback-llm': '🧠',
        'pattern-matching': '🔧'
      };

      const confidenceText = apiAction.confidence
        ? ` (confidence: ${(apiAction.confidence * 100).toFixed(1)}%)`
        : '';

      const sourceText = apiAction.source
        ? ` ${sourceEmoji[apiAction.source] || ''}`
        : '';

      addMessage('assistant', `I'll help you ${apiAction.description}${sourceText}${confidenceText}`);

      // Execute the appropriate action
      if (apiAction.type === 'navigation') {
        await executeNavigation(apiAction);
      } else if (apiAction.type === 'entity_creation') {
        await executeEntityCreation(apiAction);
      } else if (apiAction.type === 'api_call') {
        await executeAPIAction(apiAction);
      } else {
        addMessage('assistant', apiAction.response || 'I\'m not sure how to help with that. Try asking about invoices, customers, or products.');
      }

    } catch (error) {
      console.error('Error processing query:', error);
      addMessage('system', 'Sorry, I encountered an error processing your request.');
    } finally {
      setIsLoading(false);
    }
  };

  const determineAPIAction = async (query) => {
    const lowerQuery = query.toLowerCase();
    console.log('🚀 === STARTING QUERY PROCESSING ===');
    console.log('📝 Original query:', query);
    console.log('🔍 Normalized query:', lowerQuery);
    console.log('🤖 Fine-tuned classifier available:', !!invoiceClassifier?.isLoaded);
    console.log('🤖 Fallback LLM available:', !!llmGenerator);

    // Try fine-tuned classifier first (highest priority)
    if (invoiceClassifier && invoiceClassifier.isLoaded) {
      try {
        console.log('🎯 Attempting fine-tuned classification...');
        const classificationResult = await invoiceClassifier.classifyCommand(query);

        console.log('🎯 Classification result:', {
          action: classificationResult.action,
          confidence: classificationResult.confidence,
          isHighConfidence: classificationResult.isHighConfidence
        });

        // Use classification if confidence is good or if it's high confidence
        if (classificationResult.isHighConfidence || !classificationResult.fallbackToPattern) {
          console.log('✅ Using fine-tuned classification result');

          // Check if this is an entity creation action that requires data extraction
          const entityCreationActions = ['create_product_with_data', 'create_customer_with_data', 'create_invoice_with_data'];

          if (entityCreationActions.includes(classificationResult.action) && entityExtractor) {
            console.log('🔍 Entity creation action detected, extracting data...');

            try {
              const extractedData = entityExtractor.extract(query, classificationResult.action);
              console.log('✅ Entity extraction successful:', extractedData);

              return {
                type: classificationResult.type,
                action: classificationResult.action,
                route: classificationResult.route,
                endpoint: classificationResult.endpoint,
                description: classificationResult.description,
                invoiceId: classificationResult.extractedId,
                confidence: classificationResult.confidence,
                source: 'fine-tuned-classifier',
                extractedData: extractedData,
                requiresExtraction: true
              };
            } catch (extractionError) {
              console.error('❌ Entity extraction failed:', extractionError);
              // Fall back to regular navigation without pre-fill
              return {
                type: classificationResult.type,
                action: classificationResult.action,
                route: classificationResult.route,
                endpoint: classificationResult.endpoint,
                description: classificationResult.description,
                invoiceId: classificationResult.extractedId,
                confidence: classificationResult.confidence,
                source: 'fine-tuned-classifier',
                extractionError: extractionError.message
              };
            }
          } else {
            // Regular action without entity extraction
            return {
              type: classificationResult.type,
              action: classificationResult.action,
              route: classificationResult.route,
              endpoint: classificationResult.endpoint,
              description: classificationResult.description,
              invoiceId: classificationResult.extractedId,
              confidence: classificationResult.confidence,
              source: 'fine-tuned-classifier'
            };
          }
        } else {
          console.log('⚠️ Low confidence from classifier, trying fallbacks...');
        }
      } catch (error) {
        console.log('⚠️ Fine-tuned classification failed:', error.message);
      }
    }

    // Try original LLM approach if available
    if (llmGenerator) {
      try {
        console.log('🧠 Attempting fallback LLM processing...');
        const result = await generateFromLLM(query);
        console.log('✅ Fallback LLM processing successful:', result);
        return { ...result, source: 'fallback-llm' };
      } catch (error) {
        console.log('⚠️ Fallback LLM processing failed:', error.message);
      }
    }

    // Final fallback to pattern matching
    console.log('🔧 Using pattern matching as final fallback...');
    const patternResult = generateRESTFromPattern(lowerQuery, entityExtractor);
    console.log('📊 Pattern matching result:', patternResult);
    return { ...patternResult, source: 'pattern-matching' };
  };

  const generateFromLLM = async (query) => {
    console.log('🧠 === LLM PROCESSING PHASE ===');
    
    if (!llmGenerator) {
      console.log('❌ LLM generator not initialized');
      throw new Error('LLM not available');
    }

    // Validate input
    if (typeof query !== 'string' || !query.trim()) {
      console.error('❌ Invalid query input:', typeof query, query);
      throw new Error('Query must be a non-empty string');
    }

    // Create a structured prompt for the LLM
    const lowerQuery = query.toLowerCase().trim();
    const prompt = `Invoice Management System

User query: "${lowerQuery}"

Choose the best action from these options:
- list_invoices (show all invoices)
- view_invoice (view specific invoice)
- create_invoice (create new invoice)
- list_customers (show customers)
- list_products (show products)

Action:`;

    console.log('📝 LLM input:', { query: lowerQuery, prompt });
    
    try {
      console.log('⚙️ Calling LLM with input:', {
        inputType: typeof prompt,
        inputLength: prompt.length,
        inputPreview: prompt.substring(0, 100)
      });
      
      // Test if generator is callable
      if (typeof llmGenerator !== 'function') {
        throw new Error(`LLM generator is not a function, it's: ${typeof llmGenerator}`);
      }
      
      // Call with minimal parameters to avoid issues
      const result = await llmGenerator(prompt, {
        max_new_tokens: 15,  // Enough tokens for action names
        do_sample: false,
        return_full_text: false,
        temperature: 0.1
      });
      
      console.log('🤖 Raw LLM response:', result);
      
      const generatedText = result[0]?.generated_text || '';
      console.log('📄 Extracted generated text:', `"${generatedText}"`);
      console.log('📄 Generated text length:', generatedText.length);
      console.log('📄 Generated text preview:', generatedText.substring(0, 50));
      
      const actionMatch = generatedText.toLowerCase().match(/(view_invoice|list_invoices|create_invoice|edit_invoice|list_customers|list_products|show_reports|overdue_invoices)/);
      console.log('🔍 Action regex match result:', actionMatch);
      console.log('🔍 Full text for regex:', generatedText.toLowerCase());
      
      if (actionMatch) {
        const action = actionMatch[1];
        console.log('✅ Detected action:', action);
        console.log('🔄 Converting LLM action to navigation structure...');
        
        const navigationResult = generateActionFromLLMResult(action, query);
        console.log('🎯 Final navigation action:', navigationResult);
        
        return navigationResult;
      } else {
        console.log('❌ No valid action found in LLM response');
        throw new Error('Could not determine action from LLM');
      }
    } catch (error) {
      console.error('🚨 LLM processing error:', error);
      throw new Error(`LLM processing failed: ${error.message}`);
    }
  };

  const generateActionFromLLMResult = (action, originalQuery) => {
    console.log('🎯 === ACTION CONVERSION PHASE ===');
    console.log('🔍 Converting action:', action);
    console.log('📄 Original query for context:', originalQuery);
    
    // Extract specific details based on the determined action
    const invoiceIdMatch = originalQuery.match(/invoice\s*#?(\d+)/i);
    console.log('🔢 Invoice ID extraction result:', invoiceIdMatch);
    
    console.log('🔄 Processing action type:', action);
    
    switch (action) {
      case 'view_invoice':
        console.log('👁️ Processing VIEW_INVOICE action');
        if (invoiceIdMatch) {
          const invoiceId = invoiceIdMatch[1];
          console.log('✅ Found invoice ID:', invoiceId);
          const result = {
            type: 'navigation',
            action: 'view_invoice',
            invoiceId: invoiceId,
            route: `/invoice/${invoiceId}`,
            description: `view invoice #${invoiceId}`
          };
          console.log('🎯 Generated view invoice action:', result);
          return result;
        } else {
          console.log('❌ No invoice ID found for view_invoice action');
        }
        break;
      case 'list_invoices':
        console.log('📋 Processing LIST_INVOICES action');
        const listResult = {
          type: 'navigation',
          action: 'list_invoices',
          route: '/invoices',
          description: 'show all invoices'
        };
        console.log('🎯 Generated list invoices action:', listResult);
        return listResult;
      case 'create_invoice':
        console.log('➕ Processing CREATE_INVOICE action');
        const createResult = {
          type: 'navigation',
          action: 'create_invoice',
          route: '/invoice',
          description: 'create a new invoice'
        };
        console.log('🎯 Generated create invoice action:', createResult);
        return createResult;
      case 'edit_invoice':
        console.log('✏️ Processing EDIT_INVOICE action');
        if (invoiceIdMatch) {
          const invoiceId = invoiceIdMatch[1];
          console.log('✅ Found invoice ID for editing:', invoiceId);
          const editResult = {
            type: 'navigation',
            action: 'edit_invoice',
            invoiceId: invoiceId,
            route: `/edit-invoice/${invoiceId}`,
            description: `edit invoice #${invoiceId}`
          };
          console.log('🎯 Generated edit invoice action:', editResult);
          return editResult;
        } else {
          console.log('❌ No invoice ID found for edit_invoice action');
        }
        break;
      case 'list_customers':
        console.log('👥 Processing LIST_CUSTOMERS action');
        const customersResult = {
          type: 'navigation',
          action: 'list_customers',
          route: '/customer',
          description: 'show customers'
        };
        console.log('🎯 Generated list customers action:', customersResult);
        return customersResult;
      case 'list_products':
        console.log('📦 Processing LIST_PRODUCTS action');
        const productsResult = {
          type: 'navigation',
          action: 'list_products',
          route: '/product',
          description: 'show products'
        };
        console.log('🎯 Generated list products action:', productsResult);
        return productsResult;
      case 'show_reports':
        console.log('📊 Processing SHOW_REPORTS action');
        const reportsResult = {
          type: 'navigation',
          action: 'show_reports',
          route: '/reports',
          description: 'show reports'
        };
        console.log('🎯 Generated show reports action:', reportsResult);
        return reportsResult;
      case 'overdue_invoices':
        console.log('⏰ Processing OVERDUE_INVOICES action');
        const overdueResult = {
          type: 'api_call',
          action: 'overdue_invoices',
          endpoint: '/reports/overdue',
          description: 'show overdue invoices'
        };
        console.log('🎯 Generated overdue invoices action:', overdueResult);
        return overdueResult;
      default:
        console.log('❌ Unknown action encountered:', action);
        throw new Error(`Unknown action: ${action}`);
    }
    
    // Fallback if action couldn't be mapped
    console.log('💥 Reached fallback - could not map action');
    throw new Error('Could not map LLM action to specific operation');
  };

  const generateRESTFromPattern = (query, entityExtractor = null) => {
    // Invoice-specific pattern matching
    
    // Single invoice viewing
    const invoiceIdMatch = query.match(/(?:show|view|display|get).*?invoice\s*#?(\d+)/);
    if (invoiceIdMatch) {
      return {
        type: 'navigation',
        action: 'view_invoice',
        invoiceId: invoiceIdMatch[1],
        route: `/invoice/${invoiceIdMatch[1]}`,
        description: `view invoice #${invoiceIdMatch[1]}`
      };
    }

    // All invoices
    if (query.match(/(?:show|list|display|view).*?(?:all\s+)?invoices?(?:\s+list)?/)) {
      return {
        type: 'navigation',
        action: 'list_invoices',
        route: '/invoices',
        description: 'show all invoices'
      };
    }

    // Create new invoice
    if (query.match(/(?:create|new|add).*?invoice/)) {
      return {
        type: 'navigation',
        action: 'create_invoice',
        route: '/invoice',
        description: 'create a new invoice'
      };
    }

    // Edit invoice
    const editInvoiceMatch = query.match(/(?:edit|update|modify).*?invoice\s*#?(\d+)/);
    if (editInvoiceMatch) {
      return {
        type: 'navigation',
        action: 'edit_invoice',
        invoiceId: editInvoiceMatch[1],
        route: `/edit-invoice/${editInvoiceMatch[1]}`,
        description: `edit invoice #${editInvoiceMatch[1]}`
      };
    }

    // Customer operations
    if (query.match(/(?:show|list|display|view).*?customers?/)) {
      return {
        type: 'navigation',
        action: 'list_customers',
        route: '/customer',
        description: 'show customers'
      };
    }

    // Product operations
    if (query.match(/(?:show|list|display|view).*?products?/)) {
      return {
        type: 'navigation',
        action: 'list_products',
        route: '/product',
        description: 'show products'
      };
    }

    // Reports
    if (query.match(/(?:show|view|display).*?reports?/)) {
      return {
        type: 'navigation',
        action: 'show_reports',
        route: '/reports',
        description: 'show reports'
      };
    }

    // Revenue report
    if (query.match(/revenue|sales|financial|earnings/)) {
      return {
        type: 'navigation',
        action: 'revenue_report',
        route: '/reports',
        description: 'show revenue reports'
      };
    }

    // Overdue invoices
    if (query.match(/overdue|late|past.*due/)) {
      return {
        type: 'api_call',
        action: 'overdue_invoices',
        endpoint: '/reports/overdue',
        description: 'show overdue invoices'
      };
    }

    // ENTITY CREATION PATTERNS (PRIORITY: Check these FIRST before general patterns)
    // Create customer patterns
    if (query.match(/(?:create|add|register)\s+(?:a\s+)?(?:new\s+)?customer/i)) {
      const baseAction = {
        type: 'entity_creation',
        action: 'create_customer_with_data',
        route: '/customer',
        description: 'create customer with extracted data'
      };

      // Try to extract customer data if entityExtractor is available
      if (entityExtractor) {
        try {
          console.log('🔍 Extracting customer data from pattern matching...');
          const extractedData = entityExtractor.extract(query, 'create_customer_with_data');
          console.log('✅ Customer data extracted:', extractedData);
          return {
            ...baseAction,
            extractedData
          };
        } catch (error) {
          console.warn('⚠️ Customer data extraction failed:', error.message);
        }
      }

      return baseAction;
    }

    // Create product patterns
    if (query.match(/(?:create|add|make)\s+(?:a\s+)?(?:new\s+)?product/i)) {
      const baseAction = {
        type: 'entity_creation',
        action: 'create_product_with_data',
        route: '/product',
        description: 'create product with extracted data'
      };

      // Try to extract product data if entityExtractor is available
      if (entityExtractor) {
        try {
          console.log('🔍 Extracting product data from pattern matching...');
          const extractedData = entityExtractor.extract(query, 'create_product_with_data');
          console.log('✅ Product data extracted:', extractedData);
          return {
            ...baseAction,
            extractedData
          };
        } catch (error) {
          console.warn('⚠️ Product data extraction failed:', error.message);
        }
      }

      return baseAction;
    }

    // Create invoice patterns
    if (query.match(/(?:create|make|generate)\s+(?:a\s+)?(?:new\s+)?invoice/i)) {
      const baseAction = {
        type: 'entity_creation',
        action: 'create_invoice_with_data',
        route: '/invoice',
        description: 'create invoice with extracted data'
      };

      // Try to extract invoice data if entityExtractor is available
      if (entityExtractor) {
        try {
          console.log('🔍 Extracting invoice data from pattern matching...');
          const extractedData = entityExtractor.extract(query, 'create_invoice_with_data');
          console.log('✅ Invoice data extracted:', extractedData);
          return {
            ...baseAction,
            extractedData
          };
        } catch (error) {
          console.warn('⚠️ Invoice data extraction failed:', error.message);
        }
      }

      return baseAction;
    }

    // Customer search (now safe from create commands)
    const customerMatch = query.match(/(?:invoices?\s+for|show.*customer)\s+([a-zA-Z\s]+)/);
    if (customerMatch) {
      return {
        type: 'api_call',
        action: 'customer_invoices',
        customerName: customerMatch[1].trim(),
        description: `show invoices for ${customerMatch[1].trim()}`
      };
    }

    // Default fallback
    return {
      type: 'help',
      response: `I can help you with:
• "Show all invoices" - View invoice list
• "Show invoice #123" - View specific invoice
• "Create new invoice" - Start creating an invoice
• "Edit invoice #123" - Edit an invoice
• "Show customers" - View customer list
• "Show products" - View product catalog
• "Show reports" - View reports dashboard
• "Show overdue invoices" - View overdue invoices`
    };
  };

  const executeNavigation = async (action) => {
    console.log('🧭 === NAVIGATION EXECUTION PHASE ===');
    console.log('🎯 Executing navigation for action:', action);
    
    try {
      let result;
      
      console.log('🔄 Determining navigation method for action type:', action.action);
      
      // Use specialized navigation methods based on action type
      switch (action.action) {
        case 'view_invoice':
          console.log('👁️ Using llmNav.invoice.viewInvoice with ID:', action.invoiceId);
          result = llmNav.invoice.viewInvoice(action.invoiceId);
          break;
        case 'list_invoices':
          console.log('📋 Using llmNav.invoice.listInvoices');
          result = llmNav.invoice.listInvoices();
          break;
        case 'create_invoice':
          console.log('➕ Using llmNav.invoice.createInvoice');
          result = llmNav.invoice.createInvoice();
          break;
        case 'edit_invoice':
          console.log('✏️ Using llmNav.invoice.editInvoice with ID:', action.invoiceId);
          result = llmNav.invoice.editInvoice(action.invoiceId);
          break;
        case 'list_customers':
          console.log('👥 Using llmNav.entities.showCustomers');
          result = llmNav.entities.showCustomers();
          break;
        case 'list_products':
          console.log('📦 Using llmNav.entities.showProducts');
          result = llmNav.entities.showProducts();
          break;
        case 'show_reports':
        case 'revenue_report':
          console.log('📊 Using llmNav.reports.showReports with revenue view');
          result = llmNav.reports.showReports('revenue');
          break;
        default:
          console.log('🔗 Using fallback llmNav.navigateToRoute with route:', action.route);
          result = llmNav.navigateToRoute(action.route);
      }
      
      console.log('📍 Navigation method result:', result);
      
      if (result.success) {
        console.log('✅ Navigation successful, updating UI...');
        addMessage('system', `✅ Navigating to ${action.description}...`);
      } else {
        console.log('❌ Navigation failed with error:', result.error);
        addMessage('system', `❌ Navigation failed: ${result.error}`);
      }
    } catch (error) {
      console.error('🚨 Navigation execution error:', error);
      addMessage('system', '❌ Navigation failed. Please try again.');
    }
  };

  const executeEntityCreation = async (action) => {
    console.log('🎯 === ENTITY CREATION EXECUTION PHASE ===');
    console.log('✨ Executing entity creation for action:', action);

    try {
      if (!action.extractedData) {
        console.warn('⚠️ No extracted data available, falling back to regular navigation');
        return executeNavigation(action);
      }

      const { extractedData } = action;

      // Show extracted data to user
      if (extractedData.summary) {
        addMessage('assistant', `📋 Extracted: ${extractedData.summary}`);
      }

      // Show validation results
      if (extractedData.validation) {
        if (extractedData.validation.errors.length > 0) {
          addMessage('assistant', `⚠️ Issues found: ${extractedData.validation.errors.join(', ')}`);
        }
        if (extractedData.validation.warnings.length > 0) {
          addMessage('assistant', `💡 Notes: ${extractedData.validation.warnings.join(', ')}`);
        }
      }

      // Navigate to the appropriate form with pre-filled data
      console.log('🚀 Navigating with extracted data to:', action.route);

      navigate(action.route, {
        state: {
          action: action.action,
          extractedData: extractedData,
          originalQuery: extractedData.original_text,
          confidence: extractedData.confidence
        }
      });

      // Provide user feedback
      const entityType = extractedData.type || 'entity';
      addMessage('system', `✅ Opening smart ${entityType} creation form with your data...`);

      console.log('✅ Entity creation navigation successful');

    } catch (error) {
      console.error('🚨 Entity creation execution error:', error);
      addMessage('system', '❌ Failed to open form with extracted data. Falling back to regular form.');

      // Fallback to regular navigation
      try {
        navigate(action.route);
        addMessage('system', '✅ Opened regular form instead.');
      } catch (fallbackError) {
        console.error('🚨 Fallback navigation also failed:', fallbackError);
        addMessage('system', '❌ Navigation failed completely. Please try manually.');
      }
    }
  };

  const executeAPIAction = async (action) => {
    try {
      const baseURL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      
      if (action.action === 'overdue_invoices') {
        const response = await fetch(`${baseURL}/reports/overdue`);
        const data = await response.json();
        
        if (data && data.overdue_invoices && data.overdue_invoices.length > 0) {
          const count = data.overdue_invoices.length;
          const total = data.summary.total_overdue_amount || 0;
          
          addMessage('api_result', 
            `Found ${count} overdue invoice${count !== 1 ? 's' : ''} totaling $${total.toFixed(2)}`,
            { 
              data: data.overdue_invoices,
              action: 'view_list',
              route: '/reports'
            }
          );
          
          // Auto-navigate to reports page
          setTimeout(() => {
            navigate('/reports');
          }, 1000);
        } else {
          addMessage('assistant', '✅ No overdue invoices found!');
        }
      }
      
      if (action.action === 'customer_invoices') {
        // First find the customer
        const customerResponse = await fetch(`${baseURL}/customers?customer_name=${encodeURIComponent(action.customerName)}`);
        const customers = await customerResponse.json();
        
        if (customers.length > 0) {
          const customer = customers[0];
          const result = llmNav.invoice.showCustomerInvoices(customer.customer_id, customer.customer_name);
          if (result.success) {
            addMessage('system', `✅ Showing invoices for ${customer.customer_name}...`);
          } else {
            addMessage('system', `❌ Navigation failed: ${result.error}`);
          }
        } else {
          addMessage('assistant', `❌ Customer "${action.customerName}" not found.`);
        }
      }
      
    } catch (error) {
      console.error('API Error:', error);
      addMessage('system', '❌ Error fetching data. Please check if the backend is running.');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim() && !isLoading) {
      processQuery(inputValue);
      setInputValue('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  return (
    <div className={`llm-assistant ${isMinimized ? 'minimized' : ''}`}>
      <div className="llm-header">
        <h3>🤖 Invoice Assistant</h3>
        <button 
          className="minimize-btn"
          onClick={toggleMinimize}
          title={isMinimized ? 'Expand' : 'Minimize'}
        >
          {isMinimized ? '◉' : '◉'}
        </button>
      </div>

      {!isMinimized && (
        <>
          <div className="chat-container" ref={chatContainerRef}>
            {messages.map((message) => (
              <div key={message.id} className={`message ${message.type}`}>
                <div className="message-header">
                  <span className="message-type">
                    {message.type === 'user' ? '👤' : 
                     message.type === 'assistant' ? '🤖' : 
                     message.type === 'system' ? '⚙️' : '📊'}
                  </span>
                  <span className="timestamp">{message.timestamp}</span>
                </div>
                <div className="message-content">
                  <pre>{message.content}</pre>
                  
                  {message.metadata?.action === 'view_list' && (
                    <button 
                      className="action-btn"
                      onClick={() => navigate(message.metadata.route)}
                    >
                      📋 View in App
                    </button>
                  )}
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="loading-indicator">
                <div className="loading-dots">
                  <span>●</span><span>●</span><span>●</span>
                </div>
              </div>
            )}
          </div>

          <form className="input-container" onSubmit={handleSubmit}>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isModelLoading ? "Loading..." : "Ask about invoices, customers, or products..."}
              disabled={isLoading || isModelLoading}
            />
            <button 
              type="submit" 
              disabled={isLoading || isModelLoading || !inputValue.trim()}
            >
              {isLoading ? '⏳' : '📨'}
            </button>
          </form>
        </>
      )}
    </div>
  );
};

export default LLMAssistant;