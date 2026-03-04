import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import useLLMNavigation from '../hooks/useLLMNavigation';
import './LLMAssistant.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const LLMAssistant = () => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const conversationHistoryRef = useRef([]);  // multi-turn context for Claude
  const chatContainerRef = useRef(null);
  const navigate = useNavigate();
  const llmNav = useLLMNavigation();
  const messageCounterRef = useRef(0);

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

  // Build a readable assistant summary so Claude understands what it did previously
  const buildAssistantSummary = (data) => {
    const d = data.extracted_data || {};
    if (data.action === 'create_customer_with_data') {
      return `Creating customer: ${[d.customer_name, d.customer_address, d.customer_phone, d.customer_email].filter(Boolean).join(', ')}`;
    }
    if (data.action === 'create_product_with_data') {
      return `Creating product: ${d.product_description || ''}${d.product_price ? ' at $' + d.product_price : ''}`;
    }
    if (data.action === 'create_invoice_with_data') {
      return `Creating invoice for ${d.customer_name || ''} with ${d.product_description || ''} qty ${d.lineitem_qty || 1}`;
    }
    return `Action: ${data.action}`;
  };

  const processQuery = async (query) => {
    if (!query.trim()) return;

    addMessage('user', query);
    setIsLoading(true);

    try {
      const { data } = await axios.post(`${API_BASE}/assistant/query`, {
        query,
        conversation_history: conversationHistoryRef.current,
      });

      const actionLabels = {
        view_invoice:              `view invoice #${data.invoice_id}`,
        list_invoices:             'show all invoices',
        create_invoice:            'create a new invoice',
        edit_invoice:              `edit invoice #${data.invoice_id}`,
        list_customers:            'show customers',
        list_products:             'show products',
        show_reports:              'show reports',
        overdue_invoices:          'show overdue invoices',
        create_customer_with_data: 'create customer with your details',
        create_product_with_data:  'create product with your details',
        create_invoice_with_data:  'create invoice with your details',
        help:                      'show help',
      };

      addMessage('assistant', `I'll help you ${actionLabels[data.action] || data.action}.`);

      // Update multi-turn history (keep last 3 exchanges = 6 messages)
      conversationHistoryRef.current = [
        ...conversationHistoryRef.current,
        { role: 'user', content: query },
        { role: 'assistant', content: buildAssistantSummary(data) },
      ].slice(-6);

      if (['create_customer_with_data', 'create_product_with_data', 'create_invoice_with_data'].includes(data.action)) {
        await executeEntityCreation(data);
      } else if (data.action === 'overdue_invoices') {
        await executeAPIAction(data);
      } else {
        await executeNavigation(data);
      }

    } catch (error) {
      console.error('Assistant error:', error);
      addMessage('system', 'Error connecting to assistant. Is the backend running?');
    } finally {
      setIsLoading(false);
    }
  };

  const executeNavigation = async (action) => {
    try {
      let result;

      switch (action.action) {
        case 'view_invoice':
          result = llmNav.invoice.viewInvoice(action.invoice_id);
          break;
        case 'list_invoices':
          result = llmNav.invoice.listInvoices();
          break;
        case 'create_invoice':
          result = llmNav.invoice.createInvoice();
          break;
        case 'edit_invoice':
          result = llmNav.invoice.editInvoice(action.invoice_id);
          break;
        case 'list_customers':
          result = llmNav.entities.showCustomers();
          break;
        case 'list_products':
          result = llmNav.entities.showProducts();
          break;
        case 'show_reports':
          result = llmNav.reports.showReports('revenue');
          break;
        default:
          result = llmNav.navigateToRoute(action.route || '/');
      }

      if (result?.success) {
        addMessage('system', `✅ Navigating...`);
      } else {
        addMessage('system', `❌ Navigation failed: ${result?.error}`);
      }
    } catch (error) {
      console.error('Navigation error:', error);
      addMessage('system', '❌ Navigation failed. Please try again.');
    }
  };

  const executeEntityCreation = async (action) => {
    try {
      const { extracted_data } = action;
      if (!extracted_data) return executeNavigation(action);

      // ── Customer creation ────────────────────────────────────────────────
      if (action.action === 'create_customer_with_data') {
        addMessage('assistant', `📋 Pre-filling: ${extracted_data.customer_name || ''}`);
        navigate('/customer', { state: { action: action.action, llmData: extracted_data } });
        addMessage('system', '✅ Opening customer form pre-filled...');
        return;
      }

      // ── Product creation ─────────────────────────────────────────────────
      if (action.action === 'create_product_with_data') {
        addMessage('assistant', `📋 Pre-filling: ${extracted_data.product_description || ''} @ $${extracted_data.product_price || 0}`);
        navigate('/product', { state: { action: action.action, llmData: extracted_data } });
        addMessage('system', '✅ Opening product form pre-filled...');
        return;
      }

      // ── Invoice creation: smart search ───────────────────────────────────
      if (action.action === 'create_invoice_with_data') {
        addMessage('system', '🔍 Searching for customer and product...');

        // Search customer by name
        let customer = null;
        if (extracted_data.customer_name) {
          const { data: customers } = await axios.get(`${API_BASE}/customers`);
          customer = customers.find(c =>
            c.customer_name.toLowerCase().includes(extracted_data.customer_name.toLowerCase())
          );
        }

        // Search product by description
        let product = null;
        if (extracted_data.product_description) {
          const { data: products } = await axios.get(`${API_BASE}/products`);
          product = products.find(p =>
            p.product_description.toLowerCase().includes(extracted_data.product_description.toLowerCase())
          );
        }

        const qty = extracted_data.lineitem_qty || 1;

        // Customer not found → go create it, remember invoice intent
        if (!customer) {
          addMessage('assistant',
            `⚠️ Customer "${extracted_data.customer_name}" not found.\nOpening customer creation form — after saving, you'll be returned to invoice creation.`
          );
          navigate('/customer', {
            state: {
              action: 'create_customer_with_data',
              llmData: { customer_name: extracted_data.customer_name },
              returnToInvoice: extracted_data,
            }
          });
          return;
        }

        // Product not found → go create it, remember invoice intent + resolved customer
        if (!product) {
          addMessage('assistant',
            `✅ Found customer: ${customer.customer_name}\n⚠️ Product "${extracted_data.product_description}" not found.\nOpening product creation form — after saving, you'll be returned to invoice creation.`
          );
          navigate('/product', {
            state: {
              action: 'create_product_with_data',
              llmData: {
                product_description: extracted_data.product_description,
                product_price:       extracted_data.product_price,
              },
              returnToInvoice: {
                ...extracted_data,
                customer_id:      customer.customer_id,
                customer_name:    customer.customer_name,
                customer_address: customer.customer_address,
                customer_phone:   customer.customer_phone,
              },
            }
          });
          return;
        }

        // Both found — full pre-fill with IDs and calculated total
        const total = (qty * product.product_price).toFixed(2);
        addMessage('assistant',
          `✅ Found: ${customer.customer_name}\n✅ Found: ${product.product_description}\n💰 ${qty} × $${product.product_price} = $${total}\nOpening invoice form...`
        );
        navigate('/invoice', {
          state: {
            action: 'create_invoice_with_data',
            llmData: {
              customer_id:      customer.customer_id,
              customer_name:    customer.customer_name,
              customer_address: customer.customer_address,
              customer_phone:   customer.customer_phone,
              line_items: [{
                product_id:          product.product_id,
                product_description: product.product_description,
                lineitem_qty:        qty,
                product_price:       product.product_price,
              }],
            },
          }
        });
      }

    } catch (error) {
      console.error('Entity creation error:', error);
      addMessage('system', '❌ Failed to process. Please try manually.');
    }
  };

  const executeAPIAction = async (action) => {
    try {
      if (action.action === 'overdue_invoices') {
        const response = await axios.get(`${API_BASE}/reports/overdue`);
        const data = response.data;

        if (data?.overdue_invoices?.length > 0) {
          const count = data.overdue_invoices.length;
          const total = data.summary?.total_overdue_amount || 0;
          addMessage('api_result',
            `Found ${count} overdue invoice${count !== 1 ? 's' : ''} totaling $${total.toFixed(2)}`,
            { action: 'view_list', route: '/reports' }
          );
          setTimeout(() => navigate('/reports'), 1000);
        } else {
          addMessage('assistant', '✅ No overdue invoices found!');
        }
      }
    } catch (error) {
      console.error('API action error:', error);
      addMessage('system', '❌ Error fetching data. Is the backend running?');
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

  return (
    <div className={`llm-assistant ${isMinimized ? 'minimized' : ''}`}>
      <div className="llm-header">
        <h3>🤖 Invoice Assistant</h3>
        <button
          className="minimize-btn"
          onClick={() => setIsMinimized(!isMinimized)}
          title={isMinimized ? 'Expand' : 'Minimize'}
        >
          ◉
        </button>
      </div>

      {!isMinimized && (
        <>
          <div className="chat-container" ref={chatContainerRef}>
            {messages.length === 0 && (
              <div className="message system">
                <div className="message-content">
                  <pre>Ask me anything! Try: "show invoices", "create customer", "show reports"</pre>
                </div>
              </div>
            )}
            {messages.map((message) => (
              <div key={message.id} className={`message ${message.type}`}>
                <div className="message-header">
                  <span className="message-type">
                    {message.type === 'user'      ? '👤' :
                     message.type === 'assistant' ? '🤖' :
                     message.type === 'system'    ? '⚙️' : '📊'}
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
              placeholder="Ask about invoices, customers, or products..."
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
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
