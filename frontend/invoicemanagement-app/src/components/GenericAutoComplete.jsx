// components/GenericAutoComplete.jsx
import React, { useState, useEffect, useRef } from 'react';
import api from '../api';
import '../components_css/GenericAutoComplete.css';

const GenericAutoComplete = ({
  fetchUrl,                    // API endpoint
  displayFields = [],          // Fields to show in dropdown
  searchFields = [],           // Fields to search in (defaults to displayFields)
  placeholder = "Search...",   // Input placeholder
  onSelect,                    // Selection callback
  value = '',                  // Initial/controlled value
  showAvatar = false,          // Show avatar circles
  avatarField = '',            // Field for avatar text
  metaFields = [],             // Fields to show as metadata
  customActions = [],          // Custom action buttons
  maxHeight = '220px',         // Dropdown max height
  minCharsToSearch = 0,        // Minimum characters to start search
  className = '',              // Custom CSS class
  disabled = false,            // Disable component
  clearOnSelect = false,       // Clear input after selection
}) => {
  const [data, setData] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [text, setText] = useState(value);
  const [isDropdownVisible, setDropdownVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  // Fetch data on mount
  useEffect(() => {
    if (!fetchUrl) return;
    
    setLoading(true);
    setError(null);
    
    api.get(fetchUrl)
      .then(response => {
        setData(response.data);
        setSuggestions(response.data);
      })
      .catch(err => {
        console.error(`Failed to fetch data from ${fetchUrl}:`, err);
        setError('Failed to load data');
      })
      .finally(() => setLoading(false));
  }, [fetchUrl]);

  // Update text when value prop changes
  useEffect(() => {
    setText(value);
  }, [value]);

  // Handle outside clicks
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (inputRef.current && !inputRef.current.contains(event.target)) {
        setDropdownVisible(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter suggestions based on input
  const filterSuggestions = (input) => {
    if (!input || input.length < minCharsToSearch) {
      setSuggestions(data);
      return;
    }

    const searchIn = searchFields.length > 0 ? searchFields : displayFields;
    const regex = new RegExp(input, 'i');
    
    const filtered = data.filter(item =>
      searchIn.some(field => {
        const fieldValue = getNestedValue(item, field);
        return fieldValue && regex.test(fieldValue.toString());
      })
    );
    
    setSuggestions(filtered);
  };

  // Get nested object value (e.g., "user.profile.name")
  const getNestedValue = (obj, path) => {
    return path.split('.').reduce((o, p) => o && o[p], obj);
  };

  // Format display text
  const getDisplayText = (item) => {
    return displayFields
      .map(field => getNestedValue(item, field))
      .filter(Boolean)
      .join(' | ');
  };

  // Handle input changes
  const handleInputChange = (e) => {
    const input = e.target.value;
    setText(input);
    filterSuggestions(input);
    setDropdownVisible(true);
    
    // Call onSelect with partial data for real-time updates
    if (onSelect && !clearOnSelect) {
      const partialData = {};
      displayFields.forEach(field => {
        partialData[field] = input;
      });
      onSelect(partialData, false); // false indicates partial selection
    }
  };

  // Handle input focus
  const handleInputFocus = () => {
    if (!disabled) {
      setDropdownVisible(true);
      filterSuggestions(text);
    }
  };

  // Handle suggestion selection
  const handleSuggestionClick = (item) => {
    const displayText = getDisplayText(item);
    setText(clearOnSelect ? '' : displayText);
    setDropdownVisible(false);
    
    if (onSelect) {
      onSelect(item, true); // true indicates complete selection
    }
  };

  // Handle search button click
  const handleSearchClick = () => {
    if (!disabled) {
      setDropdownVisible(true);
      filterSuggestions(text);
    }
  };

  return (
    <div 
      className={`generic-autocomplete ${className}`} 
      ref={inputRef}
    >
      {/* Input Section */}
      <div className="autocomplete-input-wrapper">
        <input
          type="text"
          value={text}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          placeholder={placeholder}
          disabled={disabled}
          className={`autocomplete-input ${disabled ? 'disabled' : ''}`}
        />
        <button
          type="button"
          onClick={handleSearchClick}
          disabled={disabled}
          aria-label="Search"
          className={`autocomplete-search-btn ${disabled ? 'disabled' : ''}`}
        >
          🔍
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="autocomplete-loading">
          Loading...
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="autocomplete-error">
          {error}
        </div>
      )}

      {/* Dropdown */}
      {isDropdownVisible && !loading && !error && (
        <ul
          className="autocomplete-suggestions"
          style={{ maxHeight }}
        >
          {/* Suggestions */}
          {suggestions.map((item, index) => (
            <li
              key={index}
              onClick={() => handleSuggestionClick(item)}
              className="autocomplete-suggestion"
            >
              {/* Avatar */}
              {showAvatar && avatarField && (
                <div className="suggestion-avatar">
                  {getNestedValue(item, avatarField)?.[0]?.toUpperCase() || '?'}
                </div>
              )}

              {/* Content */}
              <div className="suggestion-content">
                <div className="suggestion-main">
                  {getDisplayText(item)}
                </div>
                
                {/* Meta fields */}
                {metaFields.length > 0 && (
                  <div className="suggestion-meta">
                    {metaFields
                      .map(field => getNestedValue(item, field))
                      .filter(Boolean)
                      .join(' | ')
                    }
                  </div>
                )}
              </div>
            </li>
          ))}

          {/* No results */}
          {suggestions.length === 0 && (
            <li className="autocomplete-no-results">
              No results found
            </li>
          )}

          {/* Custom Actions */}
          {customActions.map((action, index) => (
            <li
              key={`action-${index}`}
              onClick={() => {
                setDropdownVisible(false);
                action.onClick();
              }}
              className="autocomplete-custom-action"
              style={{ color: action.color || '#007bff' }}
            >
              {action.icon && (
                <span className="action-icon">
                  {action.icon}
                </span>
              )}
              {action.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default GenericAutoComplete;