import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { pipeline, env } from '@xenova/transformers';
import useLLMNavigation from '../hooks/useLLMNavigation';
import { EntityResolver } from '../services/entityResolver';
import { intentClassifier } from '../services/intentClassifier';
import { processCustomerCreationWithEntities, processProductCreationWithEntities, processEnhancedInvoiceCreation, handleConversationalResponse } from '../services/conversationalCreation';
import { classifyFollowUpResponse, correlateQuestionResponse, contextGuards, conversationDebugger, calculateNewCommandConfidence, handleAmbiguousCase, conversationMemory, conversationRecovery } from '../utils/nlpEntityExtractor';
import './LLMAssistant.css';

// Configure transformers environment for browser compatibility
env.allowLocalModels = true;   // Allow local model loading
env.allowRemoteModels = true;  // Allow downloading from Hugging Face as fallback
env.useBrowserCache = false;   // Disable cache to avoid stale 404 responses

const LLMAssistant = () => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [llmGenerator, setLlmGenerator] = useState(null);
  const [isModelLoading, setIsModelLoading] = useState(true);

  // Enhanced conversation state management with Phase 3 entity memory and error safety
  const getDefaultConversationState = () => ({
    isActive: false,
    step: null, // 'customer_resolution', 'product_resolution', 'final_confirmation'
    extractedEntities: null,
    resolution: null,
    resolvedCustomer: null,
    resolvedProducts: [],
    currentProductIndex: 0,
    awaitingUserChoice: false,
    // Phase 2: Conversational awareness fields
    lastQuestion: null, // What the assistant last asked
    expectedResponseTypes: [], // Valid response types for current context
    conversationHistory: [], // Semantic context history
    pendingAction: null, // Action awaiting user response
    contextData: null, // Data associated with current context
    // Phase 3: Enhanced entity memory system (with safe defaults)
    entityMemory: {
      originalRequest: null,        // User's original complete request
      discussedEntities: [],        // All entities mentioned in conversation
      activeEntities: {            // Currently relevant entities
        customer: null,
        product: null,
        invoice: null
      },
      operationContext: {          // Context for current operation
        operation: null,           // 'create_customer', 'create_product', 'create_invoice'
        userGoal: null,           // What user is trying to accomplish
        extractedData: null,      // Original extracted data from user request
        foundSimilar: null,       // Similar entities found during search
        userChoice: null          // User's choice when given options
      },
      sessionData: {
        startTime: Date.now(),
        messageCount: 0,
        successfulOperations: 0,
        lastActivity: Date.now()
      }
    }
  });

  const [conversationState, setConversationState] = useState(() => {
    try {
      return getDefaultConversationState();
    } catch (error) {
      console.error('❌ Error initializing conversation state:', error);
      return {
        isActive: false,
        step: null,
        extractedEntities: null,
        resolution: null,
        resolvedCustomer: null,
        resolvedProducts: [],
        currentProductIndex: 0,
        awaitingUserChoice: false,
        lastQuestion: null,
        expectedResponseTypes: [],
        conversationHistory: [],
        pendingAction: null,
        contextData: null,
        entityMemory: {
          originalRequest: null,
          discussedEntities: [],
          activeEntities: { customer: null, product: null, invoice: null },
          operationContext: { operation: null, userGoal: null, extractedData: null, foundSimilar: null, userChoice: null },
          sessionData: { startTime: Date.now(), messageCount: 0, successfulOperations: 0, lastActivity: Date.now() }
        }
      };
    }
  });

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

  // Conversation state helpers
  const startConversation = useCallback((extractedEntities, resolution) => {
    setConversationState({
      isActive: true,
      step: 'customer_resolution',
      extractedEntities,
      resolution,
      resolvedCustomer: null,
      resolvedProducts: [],
      currentProductIndex: 0,
      awaitingUserChoice: false
    });
  }, []);

  const updateConversationState = useCallback((updates) => {
    setConversationState(prev => ({ ...prev, ...updates }));
  }, []);

  // Phase 3: Enhanced entity memory management utilities with error safety
  const updateEntityMemory = useCallback((updates) => {
    try {
      setConversationState(prev => {
        // Ensure prev.entityMemory exists with safe defaults
        const currentEntityMemory = prev.entityMemory || {
          originalRequest: null,
          discussedEntities: [],
          activeEntities: { customer: null, product: null, invoice: null },
          operationContext: { operation: null, userGoal: null, extractedData: null, foundSimilar: null, userChoice: null },
          sessionData: { startTime: Date.now(), messageCount: 0, successfulOperations: 0, lastActivity: Date.now() }
        };

        const currentSessionData = currentEntityMemory.sessionData || {
          startTime: Date.now(),
          messageCount: 0,
          successfulOperations: 0,
          lastActivity: Date.now()
        };

        return {
          ...prev,
          entityMemory: {
            ...currentEntityMemory,
            ...updates,
            sessionData: {
              ...currentSessionData,
              lastActivity: Date.now(),
              messageCount: (currentSessionData.messageCount || 0) + 1
            }
          }
        };
      });
    } catch (error) {
      console.error('❌ Error updating entity memory:', error);
      // Continue without crashing - entity memory is not critical for basic functionality
    }
  }, []);

  const addDiscussedEntity = useCallback((entityType, entityData) => {
    setConversationState(prev => ({
      ...prev,
      entityMemory: {
        ...prev.entityMemory,
        discussedEntities: [
          ...prev.entityMemory.discussedEntities,
          {
            type: entityType,
            data: entityData,
            timestamp: Date.now(),
            context: prev.step
          }
        ],
        activeEntities: {
          ...prev.entityMemory.activeEntities,
          [entityType]: entityData
        },
        sessionData: {
          ...prev.entityMemory.sessionData,
          lastActivity: Date.now()
        }
      }
    }));
  }, []);

  const buildContextualPrompt = useCallback((userMessage) => {
    try {
      const entityMemory = conversationState?.entityMemory || {};
      const activeEntities = entityMemory.activeEntities || {};
      const operationContext = entityMemory.operationContext || {};
      const sessionData = entityMemory.sessionData || {};

      return `
=== ENHANCED CONVERSATIONAL CONTEXT ===

ORIGINAL USER REQUEST:
${entityMemory.originalRequest || 'None'}

CURRENT OPERATION:
- Type: ${operationContext.operation || 'None'}
- Goal: ${operationContext.userGoal || 'None'}
- User's Original Data: ${operationContext.extractedData ? JSON.stringify(operationContext.extractedData) : 'None'}

SIMILAR ENTITIES FOUND:
${operationContext.foundSimilar ? JSON.stringify(operationContext.foundSimilar) : 'None'}

ACTIVE ENTITIES IN DISCUSSION:
- Customer: ${activeEntities.customer?.name || activeEntities.customer?.customer_name || 'None'}
- Product: ${activeEntities.product?.product_description || 'None'}
- Invoice: ${activeEntities.invoice?.id || 'None'}

CONVERSATION STATE:
- Step: ${conversationState?.step || 'None'}
- Last Question: "${conversationState?.lastQuestion || 'None'}"
- Awaiting Choice: ${conversationState?.awaitingUserChoice || false}

REFERENCE RESOLUTION RULES:
- "it", "that product" → ${activeEntities.product?.product_description || 'the product being discussed'}
- "the customer", "them" → ${activeEntities.customer?.name || activeEntities.customer?.customer_name || 'the customer being discussed'}
- "create new" → Create the original entity user requested: ${operationContext.extractedData ? JSON.stringify(operationContext.extractedData) : 'original request'}
- "use existing" → Use the similar entity found: ${operationContext.foundSimilar ? JSON.stringify(operationContext.foundSimilar) : 'found entity'}

SESSION CONTEXT:
- Messages Exchanged: ${sessionData.messageCount || 0}
- Session Duration: ${sessionData.startTime ? Math.round((Date.now() - sessionData.startTime) / 1000) : 0} seconds
- Successful Operations: ${sessionData.successfulOperations || 0}

CURRENT USER MESSAGE: "${userMessage || ''}"

This is a follow-up message in an active conversation. Use the context above to understand references and provide contextually appropriate responses.
`;
    } catch (error) {
      console.error('❌ Error building contextual prompt:', error);
      return `
=== BASIC CONVERSATIONAL CONTEXT ===

CURRENT USER MESSAGE: "${userMessage || ''}"

This is a conversation message. Please respond appropriately.
`;
    }
  }, [conversationState]);

  // Phase 3: Session persistence utilities
  const saveConversationSession = useCallback(() => {
    try {
      const sessionData = {
        conversationState,
        messages: messages.slice(-20), // Save last 20 messages
        timestamp: Date.now()
      };
      localStorage.setItem('invoiceAssistantSession', JSON.stringify(sessionData));
      console.log('💾 Conversation session saved');
    } catch (error) {
      console.error('❌ Failed to save conversation session:', error);
    }
  }, [conversationState, messages]);

  const restoreConversationSession = useCallback(() => {
    try {
      const saved = localStorage.getItem('invoiceAssistantSession');
      if (saved) {
        const sessionData = JSON.parse(saved);
        const age = Date.now() - sessionData.timestamp;
        const maxAge = 30 * 60 * 1000; // 30 minutes

        if (age < maxAge) {
          console.log('🔄 Restoring conversation session');
          setConversationState(sessionData.conversationState);
          setMessages(sessionData.messages);
          addMessage('system', `Session restored (${Math.round(age / 1000)} seconds ago)`);
          return true;
        } else {
          console.log('⏰ Session expired, starting fresh');
          localStorage.removeItem('invoiceAssistantSession');
        }
      }
    } catch (error) {
      console.error('❌ Failed to restore conversation session:', error);
    }
    return false;
  }, [addMessage]);

  const clearConversationSession = useCallback(() => {
    localStorage.removeItem('invoiceAssistantSession');
    console.log('🗑️ Conversation session cleared');
  }, []);

  const resetConversation = useCallback(() => {
    setConversationState(prevState => ({
      isActive: false,
      step: null,
      extractedEntities: null,
      resolution: null,
      resolvedCustomer: null,
      resolvedProducts: [],
      currentProductIndex: 0,
      awaitingUserChoice: false,
      lastQuestion: null,
      expectedResponseTypes: [],
      conversationHistory: [],
      pendingAction: null,
      contextData: null,
      entityMemory: {
        originalRequest: null,
        discussedEntities: [],
        activeEntities: {
          customer: null,
          product: null,
          invoice: null
        },
        operationContext: {
          operation: null,
          userGoal: null,
          extractedData: null,
          foundSimilar: null,
          userChoice: null
        },
        sessionData: {
          ...(prevState.entityMemory?.sessionData || { startTime: Date.now(), messageCount: 0, successfulOperations: 0 }), // Preserve session data with null safety
          lastActivity: Date.now()
        }
      }
    }));
  }, []);

  const initializeLLM = useCallback(async () => {
    addMessage('system', 'Starting model download...');
    console.log('🔄 Initializing LLM model...');
    
    // Check SharedArrayBuffer availability first
    if (typeof SharedArrayBuffer === 'undefined') {
      console.error('❌ SharedArrayBuffer is not available. COEP/COOP headers may be missing.');
      addMessage('system', '❌ SharedArrayBuffer not available. Browser security requirements not met.');
      setIsModelLoading(false);
      setLlmGenerator(null);
      return;
    } else {
      console.log('✅ SharedArrayBuffer is available');
    }
    
    // Store original fetch outside try block
    const originalFetch = window.fetch;
    
    try {
      console.log('📥 Beginning pipeline creation for text-generation');
      console.log('🎯 Model: Xenova/distilgpt2 (verified available on HuggingFace)');
      console.log('⚙️ Configuration: quantized=true for faster loading');
      
      // Add network error logging by wrapping fetch
      window.fetch = async (url, options) => {
        console.log('🌐 Fetch request:', url);
        try {
          const response = await originalFetch(url, options);
          console.log('📡 Fetch response:', response.status, response.statusText, 'for', url);
          
          if (!response.ok) {
            console.error('❌ Fetch failed:', response.status, response.statusText, 'for', url);
            
            // Check if we're getting HTML instead of expected content
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('text/html')) {
              console.error('🔍 Received HTML response (likely 404 page) instead of model file');
              const htmlPreview = await response.clone().text();
              console.error('📄 HTML content preview:', htmlPreview.substring(0, 300));
            }
          }
          
          return response;
        } catch (fetchError) {
          console.error('🚨 Fetch error for', url, ':', fetchError);
          throw fetchError;
        }
      };
      
      // Load the model with proper configuration
      const generator = await pipeline('text-generation', 'Xenova/distilgpt2', {
        quantized: true,
        progress_callback: (data) => {
          console.log('📊 Download progress:', data);
          
          if (data.status === 'progress') {
            const percent = Math.round(data.progress * 100);
            const size = data.total ? `${(data.total / 1024 / 1024).toFixed(1)}MB` : '';
            addMessage('system', `📈 Loading ${data.file}: ${percent}% ${size}`);
          } else if (data.status === 'done') {
            addMessage('system', `✅ Completed: ${data.file}`);
          }
        }
      });
      
      // Restore original fetch
      window.fetch = originalFetch;
      
      console.log('✅ DistilGPT-2 loaded successfully');
      setLlmGenerator(() => generator);  // Use function form to prevent React from processing generator
      setIsModelLoading(false);
      addMessage('system', '✅ DistilGPT-2 loaded! Ready to help with API calls.');
    } catch (error) {
      // Restore original fetch in case of error  
      window.fetch = originalFetch;
      
      console.error('🚨 Model loading failed:', error);
      
      if (error.message && error.message.includes('Unexpected token')) {
        console.error('🔍 JSON parsing error - received HTML instead of model files');
        addMessage('system', '❌ Model files returned HTML (404). Check console for URLs.');
      } else {
        console.error('🔍 Error:', error.message);
        addMessage('system', `❌ Model loading failed: ${error.message}`);
      }
      
      setIsModelLoading(false);
      addMessage('system', 'Falling back to pattern matching for navigation.');
      setLlmGenerator(null);
    }
  }, [addMessage]);

  // Initialize the LLM model and restore session when component mounts
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Try to restore previous session first
        const saved = localStorage.getItem('invoiceAssistantSession');
        let restored = false;

        if (saved) {
          try {
            const sessionData = JSON.parse(saved);
            const age = Date.now() - sessionData.timestamp;
            const maxAge = 30 * 60 * 1000; // 30 minutes

            if (age < maxAge) {
              console.log('🔄 Restoring conversation session');
              setConversationState(sessionData.conversationState || getDefaultConversationState());
              setMessages(sessionData.messages || []);
              addMessage('system', `Session restored (${Math.round(age / 1000)} seconds ago)`);
              restored = true;
            } else {
              console.log('⏰ Session expired, starting fresh');
              localStorage.removeItem('invoiceAssistantSession');
            }
          } catch (error) {
            console.error('❌ Failed to restore conversation session:', error);
          }
        }

        if (!restored) {
          // Only initialize LLM if no session was restored
          initializeLLM();
        }
      } catch (error) {
        console.error('❌ Failed to initialize app:', error);
        // Continue with LLM initialization as fallback
        initializeLLM();
      }
    };

    initializeApp();
  }, []); // Empty dependencies to run only once on mount

  // Auto-save conversation session when state changes (using ref to avoid circular dependencies)
  const saveTimeoutRef = useRef(null);
  useEffect(() => {
    if (conversationState.isActive || messages.length > 1) {
      // Clear any existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Set new timeout without circular dependency
      saveTimeoutRef.current = setTimeout(() => {
        try {
          const sessionData = {
            conversationState,
            messages: messages.slice(-20), // Save last 20 messages
            timestamp: Date.now()
          };
          localStorage.setItem('invoiceAssistantSession', JSON.stringify(sessionData));
          console.log('💾 Conversation session auto-saved');
        } catch (error) {
          console.error('❌ Failed to auto-save conversation session:', error);
        }
      }, 1000); // Save 1 second after state changes
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [conversationState, messages]);

  const processQuery = async (query) => {
    try {
      if (!query.trim()) return;

      addMessage('user', query);

      if (isModelLoading) {
        addMessage('system', 'Model is still loading. Please wait...');
        return;
      }
    } catch (error) {
      console.error('❌ Critical error in processQuery initialization:', error);
      addMessage('system', '❌ An error occurred. Please try again.');
      return;
    }

    // Phase 2: Proactive Context Recovery Check (with null safety and error handling)
    try {
      if (!conversationState.isActive && conversationState.conversationHistory?.length > 0) {
        const contextLossCheck = conversationRecovery.detectContextLoss(
          conversationState,
          query,
          conversationState.conversationHistory
        );

        if (contextLossCheck.contextLost && contextLossCheck.severity === 'high') {
          conversationDebugger.logDecision(
            'Proactive Context Recovery',
            { contextLoss: contextLossCheck },
            'Attempting to recover lost conversation state'
          );

          const recovery = conversationRecovery.recoverContext(
            contextLossCheck,
            conversationState.conversationHistory,
            addMessage
          );

          if (recovery.success && recovery.restoredState) {
            updateConversationState(recovery.restoredState);
            return; // Let user respond to recovery message
          }
        }
      }
    } catch (error) {
      console.error('❌ Error in context recovery:', error);
      // Continue with normal processing if context recovery fails
    }

    // Enhanced Phase 1 Classification Pipeline
    if (conversationState.isActive && conversationState.awaitingUserChoice) {
      conversationDebugger.debugConversationState(query, null, conversationState, 'initial_check');

      setIsLoading(true);

      try {
        // Step 1: Context Validation Guards
        conversationDebugger.logDecision(
          'Context Validation',
          { conversationActive: conversationState.isActive, awaitingChoice: conversationState.awaitingUserChoice },
          'Proceeding with context validation'
        );

        if (!contextGuards.isInConversation(conversationState)) {
          conversationDebugger.logDecision('Context Guard Failed', { reason: 'not_in_conversation' }, 'Treating as new command');
          resetConversation();
          // Continue to process as new command below
        } else {
          // Step 2: Question-Response Correlation
          const correlation = correlateQuestionResponse(conversationState.lastQuestion, query);
          conversationDebugger.debugContextValidation(query, conversationState, correlation);

          if (!correlation.isValidFollowUp) {
            conversationDebugger.logDecision(
              'Low Correlation Detected',
              { correlationScore: correlation.correlationScore, threshold: 0.6 },
              'Checking if this is a new command'
            );

            // Check if this is actually a new command with high confidence
            const newCommandConfidence = calculateNewCommandConfidence(query, conversationState);
            if (newCommandConfidence > 0.7) {
              conversationDebugger.logDecision(
                'New Command Detected',
                { newCommandConfidence },
                'Resetting conversation and treating as new command'
              );
              resetConversation();
              setIsLoading(false);
              // Continue to process as new command below
            } else {
              conversationDebugger.logDecision(
                'Unclear Response',
                { correlationScore: correlation.correlationScore, newCommandConfidence },
                'Asking for clarification'
              );
              addMessage('assistant', `I'm not sure how to interpret "${query}" in this context. Are you trying to:\n• Use the existing ${conversationState.step === 'product_resolution' ? 'product' : 'customer'}\n• Create a new ${conversationState.step === 'product_resolution' ? 'product' : 'customer'}\n• Start a completely new request?`);
              setIsLoading(false);
              return;
            }
          } else {
            // Step 3: Enhanced Confidence-Based Classification with Phase 2 Integration
            let followUpClassification = classifyFollowUpResponse(
              query,
              conversationState.step === 'customer_resolution' ? 'customer_choice' :
              conversationState.step === 'product_resolution' ? 'product_choice' :
              conversationState.step === 'final_confirmation' ? 'confirmation' :
              'entity_choice'
            );

            // Phase 2: Semantic Analysis for Ambiguous Cases
            if (followUpClassification.confidence < 0.7) {
              conversationDebugger.logDecision(
                'Low Confidence - Applying Semantic Analysis',
                { originalConfidence: followUpClassification.confidence },
                'Running semantic similarity analysis'
              );

              followUpClassification = await handleAmbiguousCase(
                query,
                followUpClassification,
                conversationState
              );
            }

            // Step 4: Context Loss Detection and Recovery
            const contextLossDetection = conversationRecovery.detectContextLoss(
              conversationState,
              query,
              conversationState.conversationHistory
            );

            if (contextLossDetection.contextLost) {
              conversationDebugger.logDecision(
                'Context Loss Detected',
                {
                  reason: contextLossDetection.reason,
                  severity: contextLossDetection.severity
                },
                'Attempting conversation recovery'
              );

              const recovery = conversationRecovery.recoverContext(
                contextLossDetection,
                conversationState.conversationHistory,
                addMessage
              );

              if (recovery.success && recovery.restoredState) {
                updateConversationState(recovery.restoredState);
              }

              setIsLoading(false);
              return;
            }

            // Step 5: Enhanced Memory Management
            const updatedHistory = conversationMemory.addExchange(
              conversationState.conversationHistory,
              {
                userResponse: query,
                classification: followUpClassification,
                context: conversationState.step,
                correlation: correlation
              }
            );

            // Step 6: Debug and Decision Logging
            conversationDebugger.debugConversationState(query, followUpClassification, conversationState, 'phase2_classification_complete');

            if (followUpClassification.confidence >= 0.6) {
              conversationDebugger.logDecision(
                'Enhanced Follow-up Response Classified',
                {
                  intent: followUpClassification.intent,
                  action: followUpClassification.action,
                  confidence: followUpClassification.confidence,
                  enhancedBy: followUpClassification.enhancedBy || 'original_classification',
                  allScores: followUpClassification.allScores,
                  semanticAnalysis: followUpClassification.semanticAnalysis || null
                },
                `Processing as ${followUpClassification.action}`
              );

              // Update conversation state with enhanced history
              updateConversationState({
                conversationHistory: updatedHistory
              });

              // Phase 3: Update entity memory with user choice (with null safety)
              updateEntityMemory({
                operationContext: {
                  ...(conversationState.entityMemory?.operationContext || {}),
                  userChoice: followUpClassification.action
                }
              });

              // Generate contextual prompt for better AI understanding
              const contextualPrompt = buildContextualPrompt(query);
              console.log('🎯 Enhanced contextual prompt generated:', contextualPrompt);

              // Handle the follow-up based on enhanced classification
              await handleClassifiedFollowUpResponse(followUpClassification, query);
            } else {
              // Phase 2: Enhanced Error Handling with Memory Context
              const relevantContext = conversationMemory.getRelevantContext(
                conversationState.conversationHistory,
                conversationState
              );

              const patterns = conversationMemory.extractConversationPatterns(relevantContext);

              let clarificationMessage = "I understand you're responding, but I'm not sure what action to take.";

              // Provide context-aware clarification based on conversation patterns
              if (Object.keys(patterns.commonActions).length > 0) {
                const commonAction = Object.keys(patterns.commonActions)[0];
                if (commonAction === 'create_new') {
                  clarificationMessage += " Based on our conversation, you seem to prefer creating new items. Did you want to create something new?";
                } else if (commonAction === 'use_existing') {
                  clarificationMessage += " Based on our conversation, you seem to prefer using existing items. Did you want to use an existing option?";
                }
              } else {
                clarificationMessage += " Could you please clarify: do you want to use the existing option or create a new one?";
              }

              conversationDebugger.logDecision(
                'Enhanced Low Confidence Classification',
                {
                  confidence: followUpClassification.confidence,
                  threshold: 0.6,
                  conversationPatterns: patterns,
                  relevantContextCount: relevantContext.length
                },
                'Asking context-aware clarification'
              );

              addMessage('assistant', clarificationMessage);
            }
          }
        }
      } catch (error) {
        console.error('❌ Error in enhanced classification pipeline:', error);
        addMessage('system', 'Sorry, there was an error processing your response.');
      } finally {
        setIsLoading(false);
      }

      if (!conversationState.isActive) {
        // Conversation was reset, continue to process as new command
      } else {
        // Response was handled, return
        return;
      }
    }

    setIsLoading(true);

    try {
      console.log('🔍 === NEW INTENT-BASED PROCESSING ===');
      console.log('📝 Analyzing query with Intent Classifier:', query);

      // Use intent classifier for better natural language understanding
      const classification = await intentClassifier.classifyIntent(query);
      console.log('🎯 Intent classification result:', classification);

      // Check if this is an invoice creation with entities
      const isInvoiceCreationWithEntities = classification.intent === 'create_invoice' &&
        query.toLowerCase().match(/(?:for|customer|phone|product|\$)/);

      if (isInvoiceCreationWithEntities) {
        console.log('🎯 Detected invoice creation with entities, starting extraction...');

        // Extract entities from the query
        const entities = extractInvoiceEntities(query);

        // Check if we found meaningful entities
        const hasEntities = (entities.customer && (entities.customer.customer_name || entities.customer.customer_phone)) ||
                           (entities.products && entities.products.length > 0);

        if (hasEntities) {
          console.log('✅ Found meaningful entities, processing with conversational flow...');
          await processInvoiceCreationWithEntities(query, entities);
          setIsLoading(false);
          return;
        } else {
          console.log('❌ No meaningful entities found, falling back to simple creation...');
        }
      }

      // Map intent to action
      const action = intentClassifier.mapIntentToAction(classification);
      console.log('🎯 Mapped action:', action);

      if (action.type === 'navigation') {
        console.log('🧭 Navigation action detected:', action);
        addMessage('assistant', `Navigating to ${action.description}...`);

        const navResult = await executeNavigation(action);
        if (navResult && navResult.success) {
          addMessage('assistant', navResult.message || `Successfully navigated to ${action.description}.`);
        } else if (navResult && navResult.success === false) {
          addMessage('system', navResult.message || navResult.error || 'Navigation failed.');
        } else {
          // Handle case where navResult is undefined or doesn't have expected structure
          addMessage('assistant', `Navigated to ${action.description}.`);
        }
      } else if (action.type === 'conversation') {
        console.log('💬 Conversation action detected:', action);
        await executeConversationalFlow(action, query);
      } else if (action.type === 'help') {
        console.log('❓ Help action detected');
        addMessage('assistant', action.response);
      } else {
        console.log('❓ Unknown action type:', action.type);
        addMessage('system', 'Sorry, I couldn\'t understand that request.');
      }

    } catch (error) {
      console.error('💥 Query processing error:', error);
      addMessage('system', 'Sorry, there was an error processing your request.');
    } finally {
      setIsLoading(false);
    }
  };

  const determineAPIAction = async (query) => {
    const lowerQuery = query.toLowerCase();
    console.log('🚀 === STARTING QUERY PROCESSING ===');
    console.log('📝 Original query:', query);
    console.log('🔍 Normalized query:', lowerQuery);
    console.log('🤖 LLM Generator available:', !!llmGenerator);

    // Check if this looks like an invoice creation request with entities
    const invoiceCreationPatterns = [
      /create.*invoice.*for/i,
      /new.*invoice.*for/i,
      /invoice.*for.*\d+.*\$/i,
      /bill.*for.*at.*\$/i
    ];

    const looksLikeInvoiceCreation = invoiceCreationPatterns.some(pattern => pattern.test(query));

    if (looksLikeInvoiceCreation) {
      console.log('🎯 Detected invoice creation with entities, starting extraction...');

      // Extract entities from the query
      const entities = extractInvoiceEntities(query);

      // Check if we found meaningful entities
      const hasEntities = (entities.customer && (entities.customer.customer_name || entities.customer.customer_phone)) ||
                         (entities.products && entities.products.length > 0);

      if (hasEntities) {
        console.log('✅ Found entities, processing invoice creation with entity resolution...');
        return await processInvoiceCreationWithEntities(query, entities);
      } else {
        console.log('⚠️ No entities found, falling back to standard processing...');
      }
    }

    // Use LLM if available, otherwise fall back to pattern matching
    if (llmGenerator) {
      try {
        console.log('🧠 Attempting LLM processing...');
        const result = await generateFromLLM(query);
        console.log('✅ LLM processing successful:', result);
        return result;
      } catch (error) {
        console.log('⚠️ LLM processing failed:', error.message);
        console.log('🔄 Falling back to pattern matching...');
      }
    } else {
      console.log('🤖 LLM not available, using pattern matching');
    }

    // Fallback to pattern matching for REST API
    console.log('🔧 Executing pattern matching analysis...');
    const patternResult = generateRESTFromPattern(lowerQuery);
    console.log('📊 Pattern matching result:', patternResult);
    return patternResult;
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

  const extractInvoiceEntities = (query) => {
    console.log('🧠 === ENTITY EXTRACTION PHASE ===');
    console.log('📝 Extracting entities from query:', query);

    const entities = {
      customer: null,
      products: [],
      invoiceMetadata: {}
    };

    try {
      // Extract customer information using regex patterns
      // Customer name patterns - supports business names with commas, ampersands, periods, etc.
      const customerNameMatch = query.match(/(?:for|customer|client)\s+([A-Za-z][A-Za-z\s,&.-]{1,80}?)(?:\s+at\s|\s+phone\s|\s+,\s*phone|\s+\d{10}|$)/i);

      // Address patterns
      const addressMatch = query.match(/(?:at|address)\s+([\d\w\s,.-]{5,100}?)(?:\s+phone|\s+,|\s+for\s|\s+\d{10}|$)/i);

      // Phone patterns (10 digits)
      const phoneMatch = query.match(/(?:phone|tel|call)\s*:?\s*(\d{10})/i) || query.match(/(\d{10})/);

      // Email patterns
      const emailMatch = query.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);

      // Build customer entity if we have at least name or phone
      if (customerNameMatch || phoneMatch) {
        entities.customer = {
          customer_name: customerNameMatch ? customerNameMatch[1].trim() : '',
          customer_address: addressMatch ? addressMatch[1].trim() : '',
          customer_phone: phoneMatch ? phoneMatch[1].trim() : '',
          customer_email: emailMatch ? emailMatch[1].trim() : null
        };

        console.log('👤 Extracted customer entity:', entities.customer);
      }

      // Extract product information
      // Pattern: quantity + product + price
      // Examples: "1 USB-C Docking Station at $251.75", "2 Wireless Bluetooth Headphones at $141.02 each"
      const productPatterns = [
        /(\d+)\s+([a-zA-Z][a-zA-Z\s-]{2,50}?)(?:\s+at\s+|\s+for\s+|\s+@\s+)\$(\d+(?:\.\d{2})?)/gi,
        /(\d+)\s+([a-zA-Z][a-zA-Z\s-]{2,50}?)\s+at\s+\$(\d+(?:\.\d{2})?)/gi,
        /(\d+)\s+([a-zA-Z][a-zA-Z\s-]{2,50}?)(?:\s+each\s+|\s+per\s+unit)?\s+at\s+\$(\d+(?:\.\d{2})?)/gi,
        /(\d+)\s+([a-zA-Z][a-zA-Z\s-]{2,50}?)\s+\$(\d+(?:\.\d{2})?)/gi
      ];

      for (const pattern of productPatterns) {
        let match;
        while ((match = pattern.exec(query)) !== null) {
          const [, quantity, description, price] = match;

          const product = {
            product_description: description.trim(),
            lineitem_qty: parseInt(quantity),
            product_price: parseFloat(price)
          };

          // Avoid duplicates by checking if similar product already extracted
          const isDuplicate = entities.products.some(p =>
            p.product_description.toLowerCase() === product.product_description.toLowerCase()
          );

          if (!isDuplicate) {
            entities.products.push(product);
            console.log('📦 Extracted product entity:', product);
          }
        }
      }

      // Extract invoice metadata
      // Date patterns
      const dateMatch = query.match(/(?:date|on|due)\s+(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/i);
      if (dateMatch) {
        entities.invoiceMetadata.date_issued = dateMatch[1];
        console.log('📅 Extracted date:', dateMatch[1]);
      }

      // Terms patterns
      const termsMatch = query.match(/(?:terms|payment)\s+(net\s+\d+|due\s+[\w\s]+)/i);
      if (termsMatch) {
        entities.invoiceMetadata.invoice_terms = termsMatch[1];
        console.log('📋 Extracted terms:', termsMatch[1]);
      }

      console.log('✅ Entity extraction completed:', entities);
      return entities;

    } catch (error) {
      console.error('❌ Entity extraction error:', error);
      return entities; // Return partial results
    }
  };

  const processInvoiceCreationWithEntities = async (query, extractedEntities) => {
    console.log('🏗️ === INVOICE CREATION WITH ENTITIES ===');
    console.log('📋 Processing entities for invoice creation:', extractedEntities);

    try {
      // Check if we have meaningful entities
      const hasCustomer = extractedEntities.customer &&
        (extractedEntities.customer.customer_name || extractedEntities.customer.customer_phone);
      const hasProducts = extractedEntities.products && extractedEntities.products.length > 0;

      if (!hasCustomer && !hasProducts) {
        console.log('⚠️ No meaningful entities extracted, falling back to regular navigation');
        return generateRESTFromPattern(query.toLowerCase());
      }

      addMessage('assistant', '🔍 I found customer and product details in your request. Let me resolve them...');

      // Resolve entities against existing data
      const resolution = await EntityResolver.resolveInvoiceEntities(extractedEntities);
      console.log('🎯 Entity resolution result:', resolution);

      if (!resolution.success) {
        addMessage('system', '❌ Error resolving entities. Creating invoice with manual entry.');
        return {
          type: 'navigation',
          action: 'create_invoice',
          route: '/invoice',
          description: 'create a new invoice (manual entry required)'
        };
      }

      // Build the success message
      let resolutionMessage = '✅ Entity resolution completed:\n';

      if (resolution.customer) {
        if (resolution.customer.action === 'use_existing') {
          resolutionMessage += `👤 Customer: Using ${resolution.customer.customer.customer_name}\n`;
        } else if (resolution.customer.action === 'suggest_existing') {
          resolutionMessage += `👤 Customer: Similar to ${resolution.customer.suggestion.customer_name} (${(resolution.customer.confidence * 100).toFixed(0)}%)\n`;
        } else {
          resolutionMessage += `👤 Customer: Will create new customer\n`;
        }
      }

      resolution.products.forEach((productRes, index) => {
        if (productRes.action === 'use_existing') {
          resolutionMessage += `📦 Product ${index + 1}: Using ${productRes.product.product_description} ($${productRes.product.product_price})\n`;
        } else if (productRes.action === 'suggest_existing') {
          resolutionMessage += `📦 Product ${index + 1}: Similar to ${productRes.suggestion.product_description} (${(productRes.confidence * 100).toFixed(0)}%)\n`;
        } else {
          resolutionMessage += `📦 Product ${index + 1}: Will create new product\n`;
        }
      });

      addMessage('assistant', resolutionMessage);

      // Build prefill data for navigation
      const prefillData = {
        entities: extractedEntities,
        resolution: resolution,
        autoGenerated: true
      };

      // Add customer data if resolved
      if (resolution.customer && resolution.customer.customer) {
        const customer = resolution.customer.customer;
        prefillData.customer_id = customer.customer_id;
        prefillData.customer_name = customer.customer_name;
        prefillData.customer_address = customer.customer_address;
        prefillData.customer_phone = customer.customer_phone;
        prefillData.customer_email = customer.customer_email;
      } else if (extractedEntities.customer) {
        // Use extracted data for new customer
        Object.assign(prefillData, extractedEntities.customer);
      }

      // Add product data
      prefillData.line_items = resolution.products.map(productRes => {
        if (productRes.product) {
          // Use existing product
          return {
            product_id: productRes.product.product_id,
            product_description: productRes.product.product_description,
            lineitem_qty: productRes.lineitem_qty,
            product_price: productRes.product.product_price,
            line_items_total: productRes.lineitem_qty * productRes.product.product_price
          };
        } else {
          // Use extracted data for new product
          const originalProduct = extractedEntities.products.find(p =>
            p.product_description === productRes.productData?.product_description
          );
          return {
            product_id: null,
            product_description: originalProduct?.product_description || '',
            lineitem_qty: originalProduct?.lineitem_qty || 1,
            product_price: originalProduct?.product_price || 0,
            line_items_total: (originalProduct?.lineitem_qty || 1) * (originalProduct?.product_price || 0)
          };
        }
      });

      // Add invoice metadata
      if (extractedEntities.invoiceMetadata) {
        Object.assign(prefillData, extractedEntities.invoiceMetadata);
      }

      // Set default date if not provided
      if (!prefillData.date_issued) {
        prefillData.date_issued = new Date().toISOString().split('T')[0];
      }

      console.log('📋 Built prefill data for invoice:', prefillData);

      // Check if we need to create entities first
      if (resolution.actions.length > 0) {
        addMessage('assistant', '⚠️ Some entities need to be created first. I\'ll guide you through the process.');

        return {
          type: 'guided_creation',
          action: 'create_invoice_with_entities',
          prefillData: prefillData,
          pendingActions: resolution.actions,
          description: 'create invoice with entity creation guidance'
        };
      } else {
        addMessage('assistant', '🚀 All entities resolved! Navigating to invoice creation with prefilled data...');

        return {
          type: 'navigation',
          action: 'create_invoice',
          route: '/invoice',
          prefillData: prefillData,
          description: 'create invoice with AI-extracted data'
        };
      }

    } catch (error) {
      console.error('❌ Invoice creation processing error:', error);
      addMessage('system', '❌ Error processing your request. Creating blank invoice.');

      return {
        type: 'navigation',
        action: 'create_invoice',
        route: '/invoice',
        description: 'create a new invoice (error fallback)'
      };
    }
  };

  const generateRESTFromPattern = (query) => {
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

    // Customer search
    const customerMatch = query.match(/(?:invoices?\s+for|customer)\s+([a-zA-Z\s]+)/);
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
          console.log('➕ Using llmNav.invoice.createInvoice with prefill data:', action.prefillData);
          result = llmNav.invoice.createInvoice(action.prefillData);
          break;
        case 'edit_invoice':
          console.log('✏️ Using llmNav.invoice.editInvoice with ID:', action.invoiceId);
          result = llmNav.invoice.editInvoice(action.invoiceId);
          break;
        case 'list_customers':
          console.log('👥 Using llmNav.entities.showCustomers');
          result = llmNav.entities.showCustomers();
          // Programmatically click the toggle button after navigation
          setTimeout(() => {
            const toggleButton = document.querySelector('.toggle-list-btn');
            if (toggleButton && toggleButton.textContent.includes('All Customers')) {
              console.log('🖱️ Clicking customer toggle button');
              toggleButton.click();
            } else {
              console.log('⚠️ Customer toggle button not found');
            }
          }, 500);
          break;
        case 'list_products':
          console.log('📦 Using llmNav.entities.showProducts');
          result = llmNav.entities.showProducts();
          // Programmatically click the toggle button after navigation
          setTimeout(() => {
            const toggleButton = document.querySelector('.toggle-list-btn');
            if (toggleButton && toggleButton.textContent.includes('All Products')) {
              console.log('🖱️ Clicking product toggle button');
              toggleButton.click();
            } else {
              console.log('⚠️ Product toggle button not found');
            }
          }, 500);
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

      if (result && result.success) {
        console.log('✅ Navigation successful, updating UI...');
        return { success: true, message: `Successfully navigated to ${action.description}.` };
      } else {
        console.log('❌ Navigation failed with error:', result?.error);
        return { success: false, message: result?.error || 'Navigation failed.' };
      }
    } catch (error) {
      console.error('🚨 Navigation execution error:', error);
      return { success: false, message: 'Navigation failed. Please try again.' };
    }
  };

  const executeConversationalFlow = async (action, query) => {
    console.log('🗣️ === ENHANCED CONVERSATIONAL FLOW START ===');
    console.log('📋 Starting conversational flow for action:', action);
    console.log('📝 Query:', query);

    try {
      // Handle different types of conversational flows
      switch (action.action) {
        case 'create_customer_with_entities':
          console.log('👤 Processing customer creation with entities');
          const customerResult = await processCustomerCreationWithEntities(query, addMessage, navigate);

          if (customerResult.success && customerResult.action === 'similar_customer_found') {
            // Update conversation state to handle user response
            updateConversationState({
              isActive: true,
              step: 'customer_resolution',
              awaitingUserChoice: true,
              lastQuestion: `Similar customer found: ${customerResult.suggestion.customer_name}. Use existing or create new?`,
              expectedResponseTypes: ['use_existing', 'create_new'],
              contextData: {
                customer: customerResult.suggestion,
                customerData: customerResult.extractedData
              }
            });
          }
          break;

        case 'create_product_with_entities':
          console.log('📦 Processing product creation with entities');
          const productResult = await processProductCreationWithEntities(query, addMessage, navigate);

          if (productResult.success && productResult.action === 'similar_product_found') {
            // Enhanced Phase 3: Update conversation state with entity memory
            updateConversationState({
              isActive: true,
              step: 'product_resolution',
              awaitingUserChoice: true,
              lastQuestion: `Similar product found: ${productResult.suggestion.product_description} ($${productResult.suggestion.product_price}). Use existing or create new?`,
              expectedResponseTypes: ['use_existing', 'create_new'],
              contextData: {
                product: productResult.suggestion,
                productData: productResult.extractedData,
                quantity: 1
              }
            });

            // Update entity memory with rich context
            updateEntityMemory({
              originalRequest: query,
              operationContext: {
                operation: 'create_product',
                userGoal: 'Create a new product',
                extractedData: productResult.extractedData,
                foundSimilar: productResult.suggestion,
                userChoice: null
              }
            });

            // Add entities to discussion history
            addDiscussedEntity('product', productResult.extractedData);
          }
          break;

        case 'create_invoice_with_entities':
          console.log('🧾 Processing enhanced invoice creation with entities');
          const invoiceResult = await processEnhancedInvoiceCreation(query, addMessage, navigate);

          if (invoiceResult.success && invoiceResult.action === 'needs_creation_confirmation') {
            // Update conversation state to handle user response
            updateConversationState({
              isActive: true,
              step: 'invoice_confirmation',
              awaitingUserChoice: true,
              currentContext: invoiceResult
            });
          }
          break;

        case 'guided_creation':
          // Legacy flow - handle the existing invoice creation with entities
          console.log('🔄 Processing legacy guided creation flow');
          await executeLegacyConversationalFlow(action);
          break;

        default:
          console.log('❓ Unknown conversational action:', action.action);
          addMessage('assistant', 'I\'m not sure how to handle that request. Could you please try rephrasing?');
      }

    } catch (error) {
      console.error('💥 Conversational flow error:', error);
      addMessage('system', 'Sorry, there was an error processing your request.');
    }
  };

  const executeLegacyConversationalFlow = async (action) => {
    console.log('🗣️ === LEGACY CONVERSATIONAL FLOW START ===');
    console.log('📋 Starting legacy conversational flow for action:', action);

    try {
      const { prefillData } = action;

      if (!prefillData || !prefillData.entities || !prefillData.resolution) {
        throw new Error('Invalid prefillData structure');
      }

      const entities = prefillData.entities;
      const resolution = prefillData.resolution;

      console.log('🔍 Entities structure:', JSON.stringify(entities, null, 2));
      console.log('🔍 Resolution structure:', JSON.stringify(resolution, null, 2));

      // Start the conversation
      startConversation(entities, resolution);

      addMessage('assistant', '🔍 I found customer and product details in your request. Let me walk you through this step by step...');

      // Start with customer resolution, passing data directly to avoid state timing issues
      await processCustomerResolutionWithData(entities, resolution);

    } catch (error) {
      console.error('🚨 Conversational flow error:', error);
      console.error('🚨 Error stack:', error.stack);
      addMessage('system', `❌ Error in conversational flow: ${error.message}. Please try manually creating the invoice.`);
      resetConversation();
    }
  };

  const processCustomerResolutionWithData = async (entities, resolution) => {
    console.log('👤 === CUSTOMER RESOLUTION PHASE (with data) ===');
    console.log('📊 Entities:', entities);
    console.log('🔍 Resolution:', resolution);

    const customerRes = resolution.customer;
    const extractedEntities = entities;

    if (!customerRes || !extractedEntities.customer) {
      // Skip to product resolution if no customer
      updateConversationState({ step: 'product_resolution' });
      await processProductResolutionWithData(entities, resolution);
      return;
    }

    const customerData = extractedEntities.customer;

    if (customerRes.action === 'use_existing') {
      // Case 2: Customer Found (Exact Match)
      const customer = customerRes.customer;
      addMessage('assistant', `✅ Great! I found customer '${customer.customer_name}' in our system.
📋 Customer Details:
   • Name: ${customer.customer_name}
   • Phone: ${customer.customer_phone}
   • Address: ${customer.customer_address}
   ${customer.customer_email ? `• Email: ${customer.customer_email}` : ''}

💡 Using this existing customer for your invoice. Moving to products...`, {
        timestamp: Date.now()
      });

      // Store the resolved customer and move to products
      updateConversationState({
        resolvedCustomer: customer,
        step: 'product_resolution'
      });

      setTimeout(() => processProductResolutionWithData(entities, resolution), 1000);

    } else if (customerRes.action === 'create_new') {
      // Case 1: Customer Not Found - Need to Create
      addMessage('assistant', `🤖 I found customer '${customerData.customer_name}' with phone ${customerData.customer_phone}, but they don't exist in our system yet.
📋 I need to create this customer first. Here's what I extracted:
   • Name: ${customerData.customer_name}
   • Phone: ${customerData.customer_phone}
   • Address: ${customerData.customer_address}
   ${customerData.customer_email ? `• Email: ${customerData.customer_email}` : ''}

🔗 I'll take you to create this customer with the details prefilled.`, {
        timestamp: Date.now(),
        button: {
          label: '👉 Create Customer: ' + customerData.customer_name,
          action: 'create_customer',
          data: customerData
        }
      });

      updateConversationState({ awaitingUserChoice: true });

    } else if (customerRes.action === 'similar_found') {
      // Case 3: Similar Customer Found
      const similarCustomer = customerRes.similarCustomer;
      addMessage('assistant', `🤔 I found a similar customer. Is this the same person?
📋 Existing Customer:
   • Name: ${similarCustomer.customer_name}
   • Phone: ${similarCustomer.customer_phone}
   • Address: ${similarCustomer.customer_address}
   ${similarCustomer.customer_email ? `• Email: ${similarCustomer.customer_email}` : ''}

Choose an option:`, {
        timestamp: Date.now(),
        options: [
          {
            label: '✅ Use This Customer',
            action: 'use_similar_customer',
            data: { customer: similarCustomer },
            primary: true
          },
          {
            label: '➕ Create New Customer',
            action: 'create_customer',
            data: customerData,
            primary: false
          }
        ]
      });

      updateConversationState({ awaitingUserChoice: true });
    }
  };

  const processCustomerResolution = async () => {
    console.log('👤 === CUSTOMER RESOLUTION PHASE ===');

    const { resolution, extractedEntities } = conversationState;
    const customerRes = resolution?.customer;

    if (!customerRes || !extractedEntities.customer) {
      // Skip to product resolution if no customer
      updateConversationState({ step: 'product_resolution' });
      await processProductResolution();
      return;
    }

    const customerData = extractedEntities.customer;

    if (customerRes.action === 'use_existing') {
      // Case 2: Customer Found (Exact Match)
      const customer = customerRes.customer;
      addMessage('assistant', `✅ Great! I found customer '${customer.customer_name}' in our system.
📋 Customer Details:
   • Name: ${customer.customer_name}
   • Phone: ${customer.customer_phone}
   • Address: ${customer.customer_address}
   ${customer.customer_email ? `• Email: ${customer.customer_email}` : ''}

💡 Using this existing customer for your invoice. Moving to products...`, {
        action: 'customer_resolved',
        customer: customer
      });

      updateConversationState({
        resolvedCustomer: customer,
        step: 'product_resolution'
      });

      // Small delay for readability then move to products
      setTimeout(() => {
        processProductResolution();
      }, 1500);

    } else if (customerRes.action === 'suggest_existing') {
      // Case 3: Similar Customer Found
      const suggestion = customerRes.suggestion;
      addMessage('assistant', `🤔 I found a similar customer. Is this the same person?
📋 Existing Customer:
   • Name: ${suggestion.customer_name}
   • Phone: ${suggestion.customer_phone}
   • Address: ${suggestion.customer_address}
   ${suggestion.customer_email ? `• Email: ${suggestion.customer_email}` : ''}

Choose an option:`, {
        action: 'customer_choice',
        options: [
          {
            label: '✅ Use This Customer',
            action: 'use_existing_customer',
            data: suggestion
          },
          {
            label: '➕ Create New Customer',
            action: 'create_new_customer',
            data: customerData
          }
        ]
      });

      updateConversationState({ awaitingUserChoice: true });

    } else {
      // Case 1: Customer Not Found
      addMessage('assistant', `🤖 I found customer '${customerData.customer_name}' ${customerData.customer_phone ? `with phone ${customerData.customer_phone}` : ''}, but they don't exist in our system yet.
📋 I need to create this customer first. Here's what I extracted:
   • Name: ${customerData.customer_name}
   ${customerData.customer_phone ? `• Phone: ${customerData.customer_phone}` : ''}
   ${customerData.customer_address ? `• Address: ${customerData.customer_address}` : ''}
   ${customerData.customer_email ? `• Email: ${customerData.customer_email}` : ''}

🔗 I'll take you to create this customer with the details prefilled.`, {
        action: 'create_customer',
        data: customerData,
        button: {
          label: '👉 Create Customer: ' + customerData.customer_name,
          action: 'navigate_create_customer'
        }
      });

      updateConversationState({ awaitingUserChoice: true });
    }
  };

  const processProductResolutionWithData = async (entities, resolution) => {
    console.log('📦 === PRODUCT RESOLUTION PHASE (with data) ===');
    console.log('📊 Entities:', entities);
    console.log('🔍 Resolution:', resolution);

    const currentProductIndex = 0; // Start with first product
    const resolvedProducts = [];

    if (!resolution.products || currentProductIndex >= resolution.products.length) {
      // All products processed, move to final confirmation
      updateConversationState({ step: 'final_confirmation' });
      await processFinalConfirmationWithData(entities, resolution, resolvedProducts);
      return;
    }

    const productRes = resolution.products[currentProductIndex];
    const originalProduct = entities.products[currentProductIndex];

    if (productRes.action === 'use_existing') {
      // Product Found
      const product = productRes.product;
      const lineTotal = (productRes.lineitem_qty * product.product_price).toFixed(2);

      addMessage('assistant', `✅ Found product '${product.product_description}' in our system.
📦 Product Details:
   • Description: ${product.product_description}
   • Current Price: $${product.product_price.toFixed(2)}
   • Quantity for invoice: ${productRes.lineitem_qty}
   • Line Total: $${lineTotal}

Moving to next item...`, {
        action: 'product_resolved',
        product: product,
        quantity: productRes.lineitem_qty
      });

      // Add to resolved products
      const newResolvedProducts = [...resolvedProducts, {
        ...product,
        lineitem_qty: productRes.lineitem_qty,
        line_total: parseFloat(lineTotal)
      }];

      updateConversationState({
        resolvedProducts: newResolvedProducts,
        currentProductIndex: currentProductIndex + 1
      });

      // Move to next product after delay or final confirmation
      setTimeout(() => {
        if (currentProductIndex + 1 >= resolution.products.length) {
          processFinalConfirmationWithData(entities, resolution, newResolvedProducts);
        } else {
          processProductResolution();
        }
      }, 1000);

    } else if (productRes.action === 'create_new') {
      // Product Not Found - Need to Create
      addMessage('assistant', `📦 Product '${originalProduct.product_description}' doesn't exist yet. I'll help you create it:
📦 Product Details:
   • Description: ${originalProduct.product_description}
   • Price: $${originalProduct.product_price.toFixed(2)}
   • Quantity for invoice: ${originalProduct.lineitem_qty}

🔗 I'll take you to create this product with the details prefilled.`, {
        timestamp: Date.now(),
        button: {
          label: '➕ Create Product: ' + originalProduct.product_description,
          action: 'create_product',
          data: originalProduct
        }
      });

      updateConversationState({ awaitingUserChoice: true });

    } else if (productRes.action === 'similar_found') {
      // Similar Product Found
      const similarProduct = productRes.similarProduct;
      addMessage('assistant', `🤔 I found a similar product. Is this what you meant?
📦 Existing Product:
   • Description: ${similarProduct.product_description}
   • Current Price: $${similarProduct.product_price.toFixed(2)}

Choose an option:`, {
        timestamp: Date.now(),
        options: [
          {
            label: '✅ Use This Product',
            action: 'use_existing_product',
            data: { product: similarProduct, quantity: originalProduct.lineitem_qty },
            primary: true
          },
          {
            label: '➕ Create New Product',
            action: 'create_product',
            data: originalProduct,
            primary: false
          }
        ]
      });

      updateConversationState({ awaitingUserChoice: true });
    }
  };

  const processProductResolution = async () => {
    console.log('📦 === PRODUCT RESOLUTION PHASE ===');

    const { resolution, extractedEntities, currentProductIndex, resolvedProducts } = conversationState;

    if (!resolution.products || currentProductIndex >= resolution.products.length) {
      // All products processed, move to final confirmation
      updateConversationState({ step: 'final_confirmation' });
      await processFinalConfirmation();
      return;
    }

    const productRes = resolution.products[currentProductIndex];
    const originalProduct = extractedEntities.products[currentProductIndex];

    if (productRes.action === 'use_existing') {
      // Product Found
      const product = productRes.product;
      const lineTotal = (productRes.lineitem_qty * product.product_price).toFixed(2);

      addMessage('assistant', `✅ Found product '${product.product_description}' in our system.
📦 Product Details:
   • Description: ${product.product_description}
   • Current Price: $${product.product_price.toFixed(2)}
   • Quantity for invoice: ${productRes.lineitem_qty}
   • Line Total: $${lineTotal}

Moving to next item...`, {
        action: 'product_resolved',
        product: product,
        quantity: productRes.lineitem_qty
      });

      // Add to resolved products
      const newResolvedProducts = [...resolvedProducts, {
        ...product,
        lineitem_qty: productRes.lineitem_qty,
        line_total: parseFloat(lineTotal)
      }];

      updateConversationState({
        resolvedProducts: newResolvedProducts,
        currentProductIndex: currentProductIndex + 1
      });

      // Move to next product after delay
      setTimeout(() => {
        processProductResolution();
      }, 1000);

    } else if (productRes.action === 'suggest_existing') {
      // Similar Product Found
      const suggestion = productRes.suggestion;
      addMessage('assistant', `🤔 I found a similar product. Is this what you want?
📦 Existing Product:
   • Description: ${suggestion.product_description}
   • Price: $${suggestion.product_price.toFixed(2)}
   • Quantity for invoice: ${productRes.lineitem_qty}

For: ${originalProduct.product_description} (${originalProduct.lineitem_qty} units @ $${originalProduct.product_price})

Choose an option:`, {
        action: 'product_choice',
        options: [
          {
            label: '✅ Use This Product',
            action: 'use_existing_product',
            data: { product: suggestion, quantity: productRes.lineitem_qty }
          },
          {
            label: '➕ Create New Product',
            action: 'create_new_product',
            data: originalProduct
          }
        ]
      });

      updateConversationState({ awaitingUserChoice: true });

    } else {
      // Product Not Found
      addMessage('assistant', `📦 Product '${originalProduct.product_description}' doesn't exist yet. I'll help you create it:
📦 Product Details:
   • Description: ${originalProduct.product_description}
   • Price: $${originalProduct.product_price.toFixed(2)}
   • Quantity for invoice: ${originalProduct.lineitem_qty}

🔗 I'll take you to create this product with the details prefilled.`, {
        action: 'create_product',
        data: originalProduct,
        button: {
          label: '👉 Create Product: ' + originalProduct.product_description,
          action: 'navigate_create_product'
        }
      });

      updateConversationState({ awaitingUserChoice: true });
    }
  };

  const processFinalConfirmationWithData = async (entities, resolution, resolvedProducts) => {
    console.log('✅ === FINAL CONFIRMATION PHASE (with data) ===');
    console.log('📊 Entities:', entities);
    console.log('🔍 Resolution:', resolution);
    console.log('💰 Resolved Products:', resolvedProducts);

    // Get the resolved customer from conversation state
    const { resolvedCustomer } = conversationState;

    if (!resolvedCustomer) {
      addMessage('system', '❌ Customer resolution incomplete. Please start over.');
      resetConversation();
      return;
    }

    if (!resolvedProducts || resolvedProducts.length === 0) {
      addMessage('system', '❌ Product resolution incomplete. Please start over.');
      resetConversation();
      return;
    }

    const totalAmount = resolvedProducts.reduce((sum, p) => sum + p.line_total, 0);

    addMessage('assistant', `🎉 Perfect! I have everything ready for your invoice:

📋 Invoice Summary:
👤 Customer: ${resolvedCustomer.customer_name} (${resolvedCustomer.customer_phone})
📦 Products:
${resolvedProducts.map(p => `   • ${p.lineitem_qty}x ${p.product_description} @ $${p.product_price.toFixed(2)} = $${p.line_total.toFixed(2)}`).join('\n')}
💰 Total Amount: $${totalAmount.toFixed(2)}
📅 Date: ${new Date().toLocaleDateString()}

✅ Everything looks good?`, {
      timestamp: Date.now(),
      options: [
        {
          label: '🚀 Create Invoice Now',
          action: 'create_invoice_final',
          primary: true
        },
        {
          label: '📝 Review/Edit Details',
          action: 'review_details',
          primary: false
        }
      ]
    });

    updateConversationState({
      awaitingUserChoice: true,
      resolvedProducts: resolvedProducts
    });
  };

  const processFinalConfirmation = async () => {
    console.log('✅ === FINAL CONFIRMATION PHASE ===');

    const { resolvedCustomer, resolvedProducts } = conversationState;

    if (!resolvedCustomer) {
      addMessage('system', '❌ Customer resolution incomplete. Please start over.');
      resetConversation();
      return;
    }

    if (resolvedProducts.length === 0) {
      addMessage('system', '❌ No products resolved. Please start over.');
      resetConversation();
      return;
    }

    // Calculate total
    const totalAmount = resolvedProducts.reduce((sum, product) => sum + product.line_total, 0);

    // Build product list
    const productList = resolvedProducts.map(product =>
      `   • ${product.lineitem_qty}x ${product.product_description} @ $${product.product_price.toFixed(2)} = $${product.line_total.toFixed(2)}`
    ).join('\n');

    addMessage('assistant', `🎉 Perfect! I have everything ready for your invoice:

📋 Invoice Summary:
👤 Customer: ${resolvedCustomer.customer_name} (${resolvedCustomer.customer_phone})
📦 Products:
${productList}
💰 Total Amount: $${totalAmount.toFixed(2)}
📅 Date: ${new Date().toLocaleDateString()}

✅ Everything looks good?`, {
      action: 'final_confirmation',
      invoiceData: {
        customer: resolvedCustomer,
        products: resolvedProducts,
        total: totalAmount
      },
      options: [
        {
          label: '🚀 Create Invoice Now',
          action: 'create_invoice_final',
          primary: true
        },
        {
          label: '📝 Review/Edit Details',
          action: 'review_details'
        }
      ]
    });

    updateConversationState({ awaitingUserChoice: true });
  };

  const handleClassifiedFollowUpResponse = async (classification, originalResponse) => {
    console.log('🎯 === HANDLING CLASSIFIED FOLLOW-UP RESPONSE ===');
    console.log('📋 Classification:', classification);
    console.log('📝 Original response:', originalResponse);
    console.log('🔄 Current step:', conversationState.step);

    try {
      // Update conversation state to indicate we're processing the response
      updateConversationState({
        awaitingUserChoice: false,
        lastQuestion: null
      });

      switch (classification.action) {
        case 'use_existing':
          console.log('✅ User chose to use existing entity');

          if (conversationState.step === 'customer_resolution' && conversationState.contextData?.customer) {
            // Use existing customer
            await handleConversationAction('use_existing_customer', conversationState.contextData?.customer);
          } else if (conversationState.step === 'product_resolution' && conversationState.contextData?.product) {
            // Use existing product
            await handleConversationAction('use_existing_product', {
              product: conversationState.contextData?.product,
              quantity: conversationState.contextData?.quantity || 1
            });
          } else {
            addMessage('system', '❌ Unable to process "use existing" - missing context data.');
          }
          break;

        case 'create_new':
          console.log('➕ User chose to create new entity');

          if (conversationState.step === 'customer_resolution' && conversationState.contextData?.customerData) {
            // Create new customer
            await handleConversationAction('create_new_customer', conversationState.contextData?.customerData);
          } else if (conversationState.step === 'product_resolution' && conversationState.contextData?.productData) {
            // Create new product
            await handleConversationAction('create_new_product', conversationState.contextData?.productData);
          } else {
            addMessage('system', '❌ Unable to process "create new" - missing context data.');
          }
          break;

        case 'confirm':
          console.log('✅ User confirmed the action');

          if (conversationState.step === 'final_confirmation') {
            await handleConversationAction('create_invoice_final');
          } else {
            addMessage('assistant', '✅ Confirmed! Proceeding...');
          }
          break;

        case 'cancel_or_review':
          console.log('📝 User wants to review or cancel');

          if (conversationState.step === 'final_confirmation') {
            await handleConversationAction('review_details');
          } else {
            addMessage('assistant', '🔄 Let me help you review the details...');
          }
          break;

        default:
          console.log('❓ Unknown follow-up action:', classification.action);
          addMessage('assistant', "I understand you're responding, but I'm not sure what action to take. Could you be more specific?");
      }

    } catch (error) {
      console.error('❌ Error handling classified follow-up response:', error);
      addMessage('system', 'Sorry, there was an error processing your response. Please try again.');
    }
  };

  const handleConversationAction = async (actionType, actionData = null) => {
    console.log('🎬 Handling conversation action:', actionType, actionData);

    updateConversationState({ awaitingUserChoice: false });

    switch (actionType) {
      case 'use_existing_customer':
        updateConversationState({
          resolvedCustomer: actionData,
          step: 'product_resolution'
        });
        addMessage('assistant', `✅ Using customer: ${actionData.customer_name}. Moving to products...`);
        setTimeout(() => processProductResolution(), 1000);
        break;

      case 'use_similar_customer':
        updateConversationState({
          resolvedCustomer: actionData.customer,
          step: 'product_resolution'
        });
        addMessage('assistant', `✅ Using similar customer: ${actionData.customer.customer_name}. Moving to products...`);
        setTimeout(() => processProductResolution(), 1000);
        break;

      case 'create_customer':
        addMessage('assistant', `➕ Taking you to create customer: ${actionData.customer_name}`);
        const customerResult = llmNav.entities.createCustomer(actionData);
        if (customerResult.success) {
          addMessage('assistant', '🔗 Please create the customer and return here to continue with the invoice.');
        } else {
          addMessage('system', '❌ Failed to navigate to customer creation.');
        }
        break;

      case 'create_new_customer':
        addMessage('assistant', `➕ I'll take you to create customer: ${actionData.customer_name}`);
        setTimeout(() => {
          const result = llmNav.entities.createCustomer(actionData);
          if (result.success) {
            addMessage('assistant', '🔗 Please create the customer and return here to continue.');
          }
        }, 500);
        break;

      case 'navigate_create_customer':
        const navCustomerResult = llmNav.entities.createCustomer(actionData);
        if (navCustomerResult.success) {
          addMessage('assistant', '🔗 Taking you to create the customer with prefilled details. Return here after creating!');
        }
        break;

      case 'use_existing_product':
        const { product, quantity } = actionData;
        const { resolvedProducts, currentProductIndex } = conversationState;

        const newResolvedProducts = [...resolvedProducts, {
          ...product,
          lineitem_qty: quantity,
          line_total: quantity * product.product_price
        }];

        updateConversationState({
          resolvedProducts: newResolvedProducts,
          currentProductIndex: currentProductIndex + 1
        });

        addMessage('assistant', `✅ Using product: ${product.product_description}. Moving to next item...`);
        setTimeout(() => processProductResolution(), 1000);
        break;

      case 'create_product':
        addMessage('assistant', `➕ Taking you to create product: ${actionData.product_description}`);
        const productResult = llmNav.entities.createProduct(actionData);
        if (productResult.success) {
          addMessage('assistant', '🔗 Please create the product and return here to continue with the invoice.');
        } else {
          addMessage('system', '❌ Failed to navigate to product creation.');
        }
        break;

      case 'create_new_product':
        addMessage('assistant', `➕ I'll take you to create product: ${actionData.product_description}`);
        setTimeout(() => {
          const result = llmNav.entities.createProduct(actionData);
          if (result.success) {
            addMessage('assistant', '🔗 Please create the product and return here to continue.');
          }
        }, 500);
        break;

      case 'navigate_create_product':
        const navProductResult = llmNav.entities.createProduct(actionData);
        if (navProductResult.success) {
          addMessage('assistant', '🔗 Taking you to create the product with prefilled details. Return here after creating!');
        }
        break;

      case 'create_invoice_final':
        await createFinalInvoice();
        break;

      case 'review_details':
        await createInvoiceWithReview();
        break;

      default:
        console.error('🚨 Unknown conversation action:', actionType, 'with data:', actionData);
        addMessage('system', `❌ Unknown action "${actionType}". Please try again or contact support.`);
    }
  };

  const createFinalInvoice = async () => {
    const { resolvedCustomer, resolvedProducts } = conversationState;

    try {
      // Build invoice data
      const invoiceData = {
        customer_id: resolvedCustomer.customer_id,
        customer_name: resolvedCustomer.customer_name,
        customer_address: resolvedCustomer.customer_address,
        customer_phone: resolvedCustomer.customer_phone,
        customer_email: resolvedCustomer.customer_email,
        date_issued: new Date().toISOString().split('T')[0],
        invoice_terms: 'Due end of the month',
        line_items: resolvedProducts.map(product => ({
          product_id: product.product_id,
          product_description: product.product_description,
          lineitem_qty: product.lineitem_qty,
          product_price: product.product_price,
          line_items_total: product.line_total
        })),
        invoice_total: resolvedProducts.reduce((sum, p) => sum + p.line_total, 0)
      };

      addMessage('assistant', '🚀 Creating your invoice now...');

      // Navigate to invoice creation with the data
      const result = llmNav.invoice.createInvoice({
        ...invoiceData,
        autoGenerated: true,
        conversational: true
      });

      if (result.success) {
        addMessage('assistant', '✅ Invoice data prepared! You\'ll be taken to the final review page.');
        resetConversation();
      } else {
        addMessage('system', '❌ Failed to navigate to invoice creation.');
      }

    } catch (error) {
      console.error('❌ Error creating final invoice:', error);
      addMessage('system', '❌ Error creating invoice. Please try manually.');
      resetConversation();
    }
  };

  const createInvoiceWithReview = async () => {
    const { resolvedCustomer, resolvedProducts } = conversationState;

    const invoiceData = {
      customer_id: resolvedCustomer.customer_id,
      customer_name: resolvedCustomer.customer_name,
      customer_address: resolvedCustomer.customer_address,
      customer_phone: resolvedCustomer.customer_phone,
      customer_email: resolvedCustomer.customer_email,
      date_issued: new Date().toISOString().split('T')[0],
      invoice_terms: 'Due end of the month',
      line_items: resolvedProducts.map(product => ({
        product_id: product.product_id,
        product_description: product.product_description,
        lineitem_qty: product.lineitem_qty,
        product_price: product.product_price,
        line_items_total: product.line_total
      })),
      invoice_total: resolvedProducts.reduce((sum, p) => sum + p.line_total, 0)
    };

    addMessage('assistant', '📝 Taking you to review and edit the invoice details...');

    const result = llmNav.invoice.createInvoice({
      ...invoiceData,
      autoGenerated: true,
      conversational: true,
      reviewMode: true
    });

    if (result.success) {
      addMessage('assistant', '✅ You can now review and modify any details before creating the invoice.');
      resetConversation();
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

                  {/* Interactive conversation action buttons */}
                  {message.metadata?.options && (
                    <div className="conversation-actions">
                      {message.metadata.options.map((option, index) => (
                        <button
                          key={index}
                          className={`conversation-action-btn ${option.primary ? 'primary' : 'secondary'}`}
                          onClick={() => handleConversationAction(option.action, option.data)}
                          disabled={!conversationState.awaitingUserChoice}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Single action button */}
                  {message.metadata?.button && (
                    <div className="conversation-actions">
                      <button
                        className="conversation-action-btn primary"
                        onClick={() => handleConversationAction(message.metadata.button.action, message.metadata.button.data)}
                        disabled={!conversationState.awaitingUserChoice}
                      >
                        {message.metadata.button.label}
                      </button>
                    </div>
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