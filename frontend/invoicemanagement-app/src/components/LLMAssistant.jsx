import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { pipeline } from '@xenova/transformers';
import useLLMNavigation from '../hooks/useLLMNavigation';
import './LLMAssistant.css';

const LLMAssistant = () => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [llmGenerator, setLlmGenerator] = useState(null);
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
    addMessage('system', 'Loading SmolLM...');
    
    try {
      // Use a lightweight model that works well in browsers
      const generator = await pipeline('text-generation', 'Xenova/gpt2', {
        quantized: false,
        progress_callback: (data) => {
          if (data.status === 'progress') {
            addMessage('system', `Loading: ${data.file} (${Math.round(data.progress)}%)`);
          }
        }
      });
      
      setLlmGenerator(generator);
      setIsModelLoading(false);
      addMessage('system', 'SmolLM loaded! Ready to help with API calls.');
    } catch (error) {
      console.error('Error loading model:', error);
      setIsModelLoading(false);
      addMessage('system', '❌ Error loading model: ' + error.message + '. Using pattern matching fallback.');
      // Still allow pattern-based functionality even if LLM fails
      setLlmGenerator(null);
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
        requestBody: apiAction.body || 'none'
      });

      addMessage('assistant', `I'll help you ${apiAction.description}`);

      // Execute the appropriate action
      if (apiAction.type === 'navigation') {
        await executeNavigation(apiAction);
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
    console.log('📝 Processing query:', query);
    console.log('🔍 Normalized query:', lowerQuery);
    
    // Use LLM if available, otherwise fall back to pattern matching
    if (llmGenerator) {
      try {
        return await generateFromLLM(lowerQuery);
      } catch (error) {
        console.log('⚠️ LLM failed, falling back to pattern matching:', error.message);
      }
    }
    
    // Fallback to pattern matching for REST API
    console.log('🔧 Using pattern matching for REST API');
    return generateRESTFromPattern(lowerQuery);
  };

  const generateFromLLM = async (query) => {
    if (!llmGenerator) {
      throw new Error('LLM not available');
    }

    // Create a prompt to guide the LLM for invoice operations
    const prompt = `You are an invoice management assistant. Analyze this query and determine the appropriate action:
    
Query: "${query}"

Available actions:
- view_invoice (for specific invoice ID)
- list_invoices (show all invoices)
- create_invoice (create new invoice)
- edit_invoice (edit existing invoice)
- list_customers (show customers)
- list_products (show products)
- show_reports (show reports)
- overdue_invoices (show overdue invoices)

Respond with just the action type:`;

    try {
      const result = await llmGenerator(prompt, {
        max_new_tokens: 10,
        do_sample: false,
        temperature: 0.1
      });
      
      const generatedText = result[0]?.generated_text || '';
      const actionMatch = generatedText.toLowerCase().match(/(view_invoice|list_invoices|create_invoice|edit_invoice|list_customers|list_products|show_reports|overdue_invoices)/);
      
      if (actionMatch) {
        const action = actionMatch[1];
        return generateActionFromLLMResult(action, query);
      } else {
        throw new Error('Could not determine action from LLM');
      }
    } catch (error) {
      throw new Error(`LLM processing failed: ${error.message}`);
    }
  };

  const generateActionFromLLMResult = (action, originalQuery) => {
    // Extract specific details based on the determined action
    const invoiceIdMatch = originalQuery.match(/invoice\s*#?(\d+)/i);
    
    switch (action) {
      case 'view_invoice':
        if (invoiceIdMatch) {
          return {
            type: 'navigation',
            action: 'view_invoice',
            invoiceId: invoiceIdMatch[1],
            route: `/invoice/${invoiceIdMatch[1]}`,
            description: `view invoice #${invoiceIdMatch[1]}`
          };
        }
        break;
      case 'list_invoices':
        return {
          type: 'navigation',
          action: 'list_invoices',
          route: '/invoices',
          description: 'show all invoices'
        };
      case 'create_invoice':
        return {
          type: 'navigation',
          action: 'create_invoice',
          route: '/invoice',
          description: 'create a new invoice'
        };
      case 'edit_invoice':
        if (invoiceIdMatch) {
          return {
            type: 'navigation',
            action: 'edit_invoice',
            invoiceId: invoiceIdMatch[1],
            route: `/edit-invoice/${invoiceIdMatch[1]}`,
            description: `edit invoice #${invoiceIdMatch[1]}`
          };
        }
        break;
      case 'list_customers':
        return {
          type: 'navigation',
          action: 'list_customers',
          route: '/customer',
          description: 'show customers'
        };
      case 'list_products':
        return {
          type: 'navigation',
          action: 'list_products',
          route: '/product',
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
          type: 'api_call',
          action: 'overdue_invoices',
          endpoint: '/reports/overdue',
          description: 'show overdue invoices'
        };
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    
    // Fallback if action couldn't be mapped
    throw new Error('Could not map LLM action to specific operation');
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
    try {
      let result;
      
      // Use specialized navigation methods based on action type
      switch (action.action) {
        case 'view_invoice':
          result = llmNav.invoice.viewInvoice(action.invoiceId);
          break;
        case 'list_invoices':
          result = llmNav.invoice.listInvoices();
          break;
        case 'create_invoice':
          result = llmNav.invoice.createInvoice();
          break;
        case 'edit_invoice':
          result = llmNav.invoice.editInvoice(action.invoiceId);
          break;
        case 'list_customers':
          result = llmNav.entities.showCustomers();
          break;
        case 'list_products':
          result = llmNav.entities.showProducts();
          break;
        case 'show_reports':
        case 'revenue_report':
          result = llmNav.reports.showReports('revenue');
          break;
        default:
          result = llmNav.navigateToRoute(action.route);
      }
      
      if (result.success) {
        addMessage('system', `✅ Navigating to ${action.description}...`);
      } else {
        addMessage('system', `❌ Navigation failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Navigation error:', error);
      addMessage('system', '❌ Navigation failed. Please try again.');
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