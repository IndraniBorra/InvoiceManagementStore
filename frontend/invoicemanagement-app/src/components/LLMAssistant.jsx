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
    if (data.action === 'update_customer_with_data') {
      const changes = [
        d.new_customer_name ? `name → ${d.new_customer_name}` : null,
        d.customer_phone    ? `phone → ${d.customer_phone}`   : null,
        d.customer_address  ? `address → ${d.customer_address}` : null,
        d.customer_email    ? `email → ${d.customer_email}`   : null,
      ].filter(Boolean).join(', ');
      return `Updating customer: ${d.customer_name || ''} (${changes})`;
    }
    if (data.action === 'create_product_with_data') {
      return `Creating product: ${d.product_description || ''}${d.product_price ? ' at $' + d.product_price : ''}`;
    }
    if (data.action === 'update_product_with_data') {
      const changes = [
        d.new_product_description ? `name → ${d.new_product_description}` : null,
        d.product_price != null ? `price → $${d.product_price}` : null,
      ].filter(Boolean).join(', ');
      return `Updating product: ${d.product_description || ''} (${changes})`;
    }
    if (data.action === 'create_invoice_with_data') {
      if (d.line_items?.length > 0) {
        const names = d.line_items.map(i => i.product_description).filter(Boolean).join(', ');
        return `Creating invoice for ${d.customer_name || ''} with: ${names}`;
      }
      return `Creating invoice for ${d.customer_name || ''} with ${d.product_description || ''} qty ${d.lineitem_qty || 1}`;
    }
    if (data.action === 'add_line_item_to_invoice') {
      return `Adding ${d.product_description || 'item'} qty ${d.lineitem_qty || 1} to invoice #${data.invoice_id}`;
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
        update_customer_with_data: 'update customer with new values',
        create_product_with_data:  'create product with your details',
        update_product_with_data:  'update product with new values',
        create_invoice_with_data:  'create invoice with your details',
        add_line_item_to_invoice:  `add line item to invoice #${data.invoice_id}`,
        invoice_edit_guidance:     `help with invoice #${data.invoice_id}`,
        delete_invoice:            `delete invoice #${data.invoice_id}`,
        help:                      'show help',
      };

      addMessage('assistant', `I'll help you ${actionLabels[data.action] || data.action}.`);

      // Update multi-turn history (keep last 3 exchanges = 6 messages)
      conversationHistoryRef.current = [
        ...conversationHistoryRef.current,
        { role: 'user', content: query },
        { role: 'assistant', content: buildAssistantSummary(data) },
      ].slice(-6);

      if (data.action === 'delete_invoice') {
        addMessage('confirmation',
          `⚠️ Permanently delete Invoice #${data.invoice_id}?\nThis removes the invoice and all its line items. This cannot be undone.`,
          { action: 'confirm_delete', invoiceId: data.invoice_id }
        );
      } else if (['create_customer_with_data', 'update_customer_with_data', 'create_product_with_data', 'update_product_with_data', 'create_invoice_with_data', 'add_line_item_to_invoice', 'invoice_edit_guidance'].includes(data.action)) {
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

  const handleDeleteConfirm = async (invoiceId) => {
    addMessage('system', `🗑️ Deleting invoice #${invoiceId}...`);
    try {
      await axios.delete(`${API_BASE}/invoice/${invoiceId}`);
      addMessage('assistant', `✅ Invoice #${invoiceId} deleted successfully.`);
    } catch (error) {
      const msg = error.response?.data?.detail || error.message;
      addMessage('system', `❌ Failed to delete: ${msg}`);
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

      // ── Customer update ───────────────────────────────────────────────────
      if (action.action === 'update_customer_with_data') {
        const { data: customers } = await axios.get(`${API_BASE}/customers`);
        const customer = customers.find(c =>
          c.customer_name.toLowerCase().includes(extracted_data.customer_name.toLowerCase())
        );

        if (!customer) {
          addMessage('assistant', `⚠️ Customer "${extracted_data.customer_name}" not found. Check the name and try again.`);
          return;
        }

        addMessage('assistant', `✅ Found: ${customer.customer_name}\n📋 Pre-filling edit form with new values...`);
        navigate('/customer', {
          state: {
            action: 'update_customer_with_data',
            editCustomerId: customer.customer_id,
            llmData: {
              customer_name:    extracted_data.new_customer_name || customer.customer_name,
              customer_address: extracted_data.customer_address  || customer.customer_address,
              customer_phone:   extracted_data.customer_phone    || customer.customer_phone,
              customer_email:   extracted_data.customer_email    || customer.customer_email,
            },
          }
        });
        addMessage('system', '✅ Opening customer edit form — review and click Update Customer.');
        return;
      }

      // ── Product creation ─────────────────────────────────────────────────
      if (action.action === 'create_product_with_data') {
        addMessage('assistant', `📋 Pre-filling: ${extracted_data.product_description || ''} @ $${extracted_data.product_price || 0}`);
        navigate('/product', { state: { action: action.action, llmData: extracted_data } });
        addMessage('system', '✅ Opening product form pre-filled...');
        return;
      }

      // ── Product update ───────────────────────────────────────────────────
      if (action.action === 'update_product_with_data') {
        const { data: products } = await axios.get(`${API_BASE}/products`);
        const product = products.find(p =>
          p.product_description.toLowerCase().includes(extracted_data.product_description.toLowerCase())
        );

        if (!product) {
          addMessage('assistant', `⚠️ Product "${extracted_data.product_description}" not found. Check the name and try again.`);
          return;
        }

        const newDescription = extracted_data.new_product_description || product.product_description;
        const newPrice = extracted_data.product_price ?? product.product_price;

        addMessage('assistant', `✅ Found: ${product.product_description}\n📋 Pre-filling edit form with new values...`);
        navigate('/product', {
          state: {
            action: 'update_product_with_data',
            editProductId: product.product_id,
            llmData: {
              product_description: newDescription,
              product_price: newPrice,
            },
          }
        });
        addMessage('system', '✅ Opening product edit form — review and click Update Product.');
        return;
      }

      // ── Add line item to existing invoice ────────────────────────────────
      if (action.action === 'add_line_item_to_invoice') {
        const invoiceId = action.invoice_id;
        let pendingLineItem = {
          product_id:          null,
          product_description: extracted_data.product_description || '',
          lineitem_qty:        extracted_data.lineitem_qty || 1,
          product_price:       extracted_data.product_price || 0,
        };

        if (extracted_data.product_description) {
          const { data: products } = await axios.get(`${API_BASE}/products`);
          const product = products.find(p =>
            p.product_description.toLowerCase().includes(
              extracted_data.product_description.toLowerCase()
            )
          );
          if (product) {
            pendingLineItem.product_id    = product.product_id;
            pendingLineItem.product_price = extracted_data.product_price ?? product.product_price;
            addMessage('assistant', `✅ Found: ${product.product_description} @ $${product.product_price}`);
          } else {
            addMessage('assistant',
              `⚠️ Product "${extracted_data.product_description}" not found — you can fill in the price manually.\nOpening invoice anyway...`
            );
          }
        }

        addMessage('system', `📝 Opening invoice #${invoiceId} in edit mode...`);
        navigate(`/edit-invoice/${invoiceId}`, {
          state: { action: 'add_line_item_to_invoice', pendingLineItem }
        });
        return;
      }

      // ── Warning: changing customer/product via an invoice is not supported ─
      if (action.action === 'invoice_edit_guidance') {
        addMessage('assistant',
          `⚠️ Customer and product records can't be changed directly through an invoice.\n\n` +
          `Here's what you can do instead:\n` +
          `• "update customer [name] phone to ..." — updates the customer record\n` +
          `• "update product [name] price to ..." — updates the product record\n` +
          `• "add [product] qty N to invoice #${action.invoice_id}" — adds a new line item\n` +
          `• "edit invoice #${action.invoice_id}" — opens the invoice to edit quantities/dates`
        );
        return;
      }

      // ── Invoice creation: smart search ───────────────────────────────────
      if (action.action === 'create_invoice_with_data') {
        addMessage('system', '🔍 Searching for customer and products...');

        // Search customer by name
        let customer = null;
        if (extracted_data.customer_name) {
          const { data: customers } = await axios.get(`${API_BASE}/customers`);
          customer = customers.find(c =>
            c.customer_name.toLowerCase().includes(extracted_data.customer_name.toLowerCase())
          );
        }

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

        // Normalize to an array of items (supports both single and multi-product)
        const rawItems = extracted_data.line_items?.length > 0
          ? extracted_data.line_items
          : extracted_data.product_description
            ? [{ product_description: extracted_data.product_description, lineitem_qty: extracted_data.lineitem_qty || 1, product_price: extracted_data.product_price }]
            : [];

        // Search all products in one request, then match each item
        const { data: products } = await axios.get(`${API_BASE}/products`);
        const resolvedItems = rawItems.map(item => {
          const product = products.find(p =>
            p.product_description.toLowerCase().includes((item.product_description || '').toLowerCase())
          );
          if (product) {
            return {
              product_id:          product.product_id,
              product_description: product.product_description,
              lineitem_qty:        item.lineitem_qty || 1,
              product_price:       item.product_price ?? product.product_price,
            };
          }
          return {
            product_id:          null,
            product_description: item.product_description || '',
            lineitem_qty:        item.lineitem_qty || 1,
            product_price:       item.product_price || 0,
            notFound:            true,
          };
        });

        // Build status message
        let msg = `✅ Found: ${customer.customer_name}\n`;
        resolvedItems.forEach(i => {
          if (i.notFound) {
            msg += `⚠️ "${i.product_description}" not found — fill in manually.\n`;
          } else {
            const lineTotal = (i.lineitem_qty * i.product_price).toFixed(2);
            msg += `✅ Found: ${i.product_description} — ${i.lineitem_qty} × $${i.product_price} = $${lineTotal}\n`;
          }
        });
        msg += 'Opening invoice form...';
        addMessage('assistant', msg.trim());

        // Strip internal notFound flag before passing to the form
        const lineItems = resolvedItems.length > 0
          ? resolvedItems.map(({ notFound, ...item }) => item)
          : [{ product_id: null, product_description: '', lineitem_qty: 1, product_price: 0 }];

        navigate('/invoice', {
          state: {
            action: 'create_invoice_with_data',
            llmData: {
              customer_id:      customer.customer_id,
              customer_name:    customer.customer_name,
              customer_address: customer.customer_address,
              customer_phone:   customer.customer_phone,
              line_items:       lineItems,
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
                    {message.type === 'user'         ? '👤' :
                     message.type === 'assistant'    ? '🤖' :
                     message.type === 'system'       ? '⚙️' :
                     message.type === 'confirmation' ? '⚠️' : '📊'}
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
                  {message.metadata?.action === 'confirm_delete' && (
                    <div className="confirm-buttons">
                      <button
                        className="confirm-btn confirm-btn--danger"
                        onClick={() => handleDeleteConfirm(message.metadata.invoiceId)}
                      >
                        🗑️ Yes, Delete
                      </button>
                      <button
                        className="confirm-btn confirm-btn--cancel"
                        onClick={() => addMessage('system', '↩️ Delete cancelled.')}
                      >
                        Cancel
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
