import React, { useState, useEffect, useRef } from 'react';
import api from '../api';
import { useNavigate } from 'react-router-dom';

const CustomerNameSearch = ({ value, onCustomerSelect }) => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);  // Store all customers fetched from API
  const [suggestions, setSuggestions] = useState([]); // Store filtered suggestions based on input
  const [text, setText] = useState(value || '');  // Controlled input value
  const [isDropdownVisible, setDropdownVisible] = useState(false);
  const inputRef = useRef(null); // 

  // Fetch customers on mount
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const response = await api.get('/customers');
        setCustomers(response.data);
        // Initially show all customers as suggestions when dropdown opens
        setSuggestions(response.data);
      } catch (err) {
        console.error("Failed to fetch customers:", err);
      }
    };
    fetchCustomers();
  }, []);


  // can u define onCustomerSelect function to handle customer selection
  

  // Show dropdown on input focus or search button click
  const openDropdown = () => {
    setDropdownVisible(true);
    // Show filtered suggestions based on current text or all if empty
    if (text === ' ') {
      setSuggestions(customers);
      onCustomerSelect({ customer_name: ' ' }); // clear selected customer info
    } else {
      filterSuggestions(text);
    }
  };

  // Hide dropdown on outside click or blur
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target)
      ) {
        setDropdownVisible(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter suggestions based on input text
  const filterSuggestions = (input) => {
    if (input.length > 0) {
      const regex = new RegExp(input, 'i');
      const filtered = customers.filter((c) => regex.test(c.customer_name));
      setSuggestions(filtered);
    } else {
      setSuggestions(customers);
    }
  };

  const onChangeHandler = (e) => {
    const input = e.target.value;
    setText(input);
    filterSuggestions(input);
    setDropdownVisible(true);
    onCustomerSelect({ customer_name: input });
  };

  const onSuggestionClick = (customer) => {
    setText(customer.customer_name);
    setSuggestions([]);
    setDropdownVisible(false);
    onCustomerSelect(customer); 
  };

  // Handle search icon click
  const onSearchClick = () => {
    openDropdown();
    if (text !== '') {
      filterSuggestions(text);
    } else {
      setSuggestions(customers);
    }
  };

  return (
    <div className="customer-search-container" ref={inputRef} style={{ position: 'relative' }}>
      <div className="customer-input-wrapper" style={{ display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          value={text}
          onChange={onChangeHandler}
          onFocus={openDropdown}
          placeholder="Search or Create a customer"
          className="customer-input"
          style={{ flexGrow: 1 }}
        />
        <button
          type="button"
          onClick={onSearchClick}
          aria-label="Search"
          style={{
            cursor: 'pointer',
            background: 'none',
            border: 'none',
            fontSize: '18px',
            padding: '0 8px',
          }}
        >
          🔍
        </button>
      </div>

      {isDropdownVisible && (
        <ul
          className="suggestions-list"
          style={{
            position: 'absolute',
            zIndex: 1000,
            width: '100%',
            maxHeight: '220px', // approx height to show 3 items + new customer option
            overflowY: suggestions.length > 3 ? 'auto' : 'visible',
            backgroundColor: '#fff',
            border: '1px solid #ccc',
            borderRadius: '4px',
            marginTop: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            padding: 0,
            listStyle: 'none',
          }}
        >
          {suggestions.map((cust) => (
            <li
              key={cust.customer_id}
              className="suggestion-item"
              onClick={() => onSuggestionClick(cust)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px',
                cursor: 'pointer',
                borderBottom: '1px solid #eee',
              }}
            >
              <div
                className="suggestion-avatar"
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: '#ccc',
                  color: '#fff',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '10px',
                  flexShrink: 0,
                }}
              >
                {cust.customer_name[0].toUpperCase()}
              </div>
              <div className="suggestion-info" style={{ overflow: 'hidden' }}>
                <div
                  className="suggestion-name"
                  style={{ fontWeight: '600', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}
                >
                  {cust.customer_name}
                </div>
                <div
                  className="suggestion-meta"
                  style={{ fontSize: '12px', color: '#666', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}
                >
                  {cust.customer_email} | {cust.customer_address}
                </div>
              </div>
            </li>
          ))}

          {/* New Customer option always visible */}
          <li
            className="new-customer-btn"
            onClick={() => {
              setDropdownVisible(false);
              navigate('/customer');
            }}
            style={{
              padding: '10px 12px',
              cursor: 'pointer',
              fontWeight: '600',
              color: '#007bff',
              borderTop: '1px solid #eee',
              display: 'flex',
              alignItems: 'center',
              userSelect: 'none',
            }}
          >
            <span style={{ marginRight: '6px', fontSize: '18px', lineHeight: 1 }}>➕</span> New Customer
          </li>
        </ul>
      )}
    </div>
  );
};

export default CustomerNameSearch;