import React, { useState, useEffect, useRef, useCallback } from 'react';
import '../../styles/components/AutoComplete.css';
import { SEARCH_SIZES, SEARCH_THEMES } from './search/SearchPresets';

const AutoComplete = ({
  // API Configuration
  fetchUrl,
  
  // Display Configuration
  displayFields = [],
  searchFields = [],
  valueField = 'id',
  
  // UI Configuration
  placeholder = 'Search...',
  label,
  error,
  required = false,
  disabled = false,
  size = 'md', // sm, md, lg
  variant = 'default', // default, outline, filled, minimal
  
  // Behavior Configuration
  minCharsToSearch = 0,
  maxResults = 50,
  clearOnSelect = false,
  allowCustomValue = false,
  
  // Styling
  className = '',
  containerClassName = '',
  dropdownClassName = '',
  
  // Event Handlers
  onSelect,
  onInputChange,
  
  // Value Control
  value = '',
  defaultValue = '',
  
  // Advanced Features
  showAvatar = false,
  avatarField = '',
  metaFields = [],
  customActions = [],
  
  // Accessibility
  id,
  'aria-label': ariaLabel,
}) => {
  // State Management
  const [inputValue, setInputValue] = useState(value || defaultValue);
  const [suggestions, setSuggestions] = useState([]);
  const [allData, setAllData] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  
  // Refs
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const suggestionRefs = useRef([]);
  
  // Generate IDs
  const componentId = id || `autocomplete-${Math.random().toString(36).substr(2, 9)}`;
  const dropdownId = `${componentId}-dropdown`;
  const hasError = Boolean(error);
  
  // Fetch data from API
  const fetchData = useCallback(async () => {
    if (!fetchUrl) return;
    
    setLoading(true);
    setLoadError(null);
    
    try {
      // Use the API client from services
      const { apiClient } = await import('../../services/api');
      const response = await apiClient.get(fetchUrl);
      const data = response.data;
      setAllData(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('AutoComplete fetch error:', err);
      setLoadError(err.response?.data?.message || err.message || 'Failed to load data');
      setAllData([]);
    } finally {
      setLoading(false);
    }
  }, [fetchUrl]);
  
  // Initialize data
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  // Update input value when prop changes
  useEffect(() => {
    setInputValue(value || '');
  }, [value]);
  
  // Calculate dropdown position
  const calculatePosition = useCallback(() => {
    if (!inputRef.current) return;
    
    const inputRect = inputRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    // Calculate available space
    const spaceBelow = viewportHeight - inputRect.bottom;
    const spaceAbove = inputRect.top;
    const maxDropdownHeight = 300; // Max height of dropdown
    
    // Determine position
    const shouldOpenUpward = spaceBelow < maxDropdownHeight && spaceAbove > spaceBelow;
    
    setDropdownPosition({
      top: shouldOpenUpward ? inputRect.top - maxDropdownHeight : inputRect.bottom,
      left: Math.max(8, Math.min(inputRect.left, viewportWidth - Math.max(300, inputRect.width) - 8)),
      width: Math.max(300, inputRect.width),
      maxHeight: shouldOpenUpward ? spaceAbove - 8 : spaceBelow - 8,
      openUpward: shouldOpenUpward
    });
  }, []);
  
  // Filter suggestions based on input
  const filterSuggestions = useCallback((query) => {
    if (!query && minCharsToSearch > 0) {
      setSuggestions(allData.slice(0, maxResults));
      return;
    }
    
    if (query.length < minCharsToSearch) {
      setSuggestions([]);
      return;
    }
    
    const searchInFields = searchFields.length > 0 ? searchFields : displayFields;
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'), 'i');
    
    const filtered = allData.filter(item => {
      return searchInFields.some(field => {
        const value = getNestedValue(item, field);
        return value && regex.test(String(value));
      });
    }).slice(0, maxResults);
    
    setSuggestions(filtered);
    setHighlightedIndex(-1);
  }, [allData, searchFields, displayFields, minCharsToSearch, maxResults]);
  
  // Get nested object value
  const getNestedValue = (obj, path) => {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  };
  
  // Format display text for suggestion
  const formatDisplayText = (item) => {
    return displayFields
      .map(field => getNestedValue(item, field))
      .filter(Boolean)
      .join(' | ');
  };
  
  // Format meta text
  const formatMetaText = (item) => {
    if (metaFields.length === 0) return '';
    return metaFields
      .map(field => getNestedValue(item, field))
      .filter(Boolean)
      .join(' | ');
  };
  
  // Handle input change
  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    
    if (onInputChange) {
      onInputChange(newValue);
    }
    
    filterSuggestions(newValue);
    
    if (newValue.length >= minCharsToSearch) {
      if (!isOpen) {
        calculatePosition();
        setIsOpen(true);
      }
    } else {
      setIsOpen(false);
    }
  };
  
  // Handle input focus
  const handleInputFocus = () => {
    if (disabled) return;
    
    calculatePosition();
    filterSuggestions(inputValue);
    setIsOpen(true);
  };
  
  // Handle suggestion selection
  const handleSuggestionSelect = (item) => {
    const displayText = formatDisplayText(item);
    const valueToSet = clearOnSelect ? '' : displayText;
    
    setInputValue(valueToSet);
    setIsOpen(false);
    setHighlightedIndex(-1);
    
    if (onSelect) {
      onSelect(item, getNestedValue(item, valueField));
    }
  };
  
  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen) return;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : prev);
        break;
        
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          handleSuggestionSelect(suggestions[highlightedIndex]);
        } else if (allowCustomValue && inputValue.trim()) {
          // Allow custom value
          setIsOpen(false);
          if (onSelect) {
            onSelect({ [displayFields[0] || 'value']: inputValue.trim() }, inputValue.trim());
          }
        }
        break;
        
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };
  
  // Handle outside clicks
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        inputRef.current && !inputRef.current.contains(event.target) &&
        dropdownRef.current && !dropdownRef.current.contains(event.target)
      ) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Recalculate position on scroll/resize
  useEffect(() => {
    if (!isOpen) return;
    
    const handleReposition = () => calculatePosition();
    
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    
    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [isOpen, calculatePosition]);
  
  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && suggestionRefs.current[highlightedIndex]) {
      suggestionRefs.current[highlightedIndex].scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      });
    }
  }, [highlightedIndex]);
  
  // Get size and theme configurations
  const sizeConfig = SEARCH_SIZES[size] || SEARCH_SIZES.md;
  const themeConfig = SEARCH_THEMES[variant] || SEARCH_THEMES.default;
  
  // CSS Classes with size and theme support
  const containerClasses = [
    'autocomplete-container',
    sizeConfig.containerClassName,
    themeConfig.containerClassName,
    containerClassName
  ].filter(Boolean).join(' ');
  
  const inputClasses = [
    'autocomplete-input',
    sizeConfig.inputClassName,
    hasError && 'autocomplete-input--error',
    disabled && 'autocomplete-input--disabled',
    className
  ].filter(Boolean).join(' ');
  
  const dropdownClasses = [
    'autocomplete-dropdown',
    sizeConfig.dropdownClassName,
    dropdownPosition.openUpward && 'autocomplete-dropdown--upward',
    dropdownClassName
  ].filter(Boolean).join(' ');
  
  return (
    <>
      <div className={containerClasses}>
        {label && (
          <label htmlFor={componentId} className="autocomplete-label">
            {label}
            {required && <span className="autocomplete-required">*</span>}
          </label>
        )}
        
        <div className="autocomplete-input-wrapper">
          <input
            ref={inputRef}
            id={componentId}
            type="text"
            className={inputClasses}
            value={inputValue}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            aria-label={ariaLabel}
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            aria-owns={isOpen ? dropdownId : undefined}
            aria-activedescendant={
              highlightedIndex >= 0 ? `${componentId}-option-${highlightedIndex}` : undefined
            }
            autoComplete="off"
            spellCheck="false"
          />
          
          {loading && (
            <div className="autocomplete-loading-indicator">
              <div className="spinner" />
            </div>
          )}
        </div>
        
        {error && (
          <div className="autocomplete-error" role="alert">
            {error}
          </div>
        )}
        
        {loadError && (
          <div className="autocomplete-error" role="alert">
            Failed to load data: {loadError}
          </div>
        )}
      </div>
      
      {/* Portal dropdown to avoid positioning issues */}
      {isOpen && (
        <div
          ref={dropdownRef}
          id={dropdownId}
          className={dropdownClasses}
          style={{
            position: 'fixed',
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
            maxHeight: `${dropdownPosition.maxHeight}px`,
            zIndex: 1000
          }}
          role="listbox"
          aria-label={`${suggestions.length} suggestions available`}
        >
          {/* Suggestions */}
          {suggestions.map((item, index) => {
            const isHighlighted = index === highlightedIndex;
            
            return (
              <div
                key={index}
                ref={el => suggestionRefs.current[index] = el}
                id={`${componentId}-option-${index}`}
                className={`autocomplete-suggestion ${isHighlighted ? 'autocomplete-suggestion--highlighted' : ''}`}
                onClick={() => handleSuggestionSelect(item)}
                role="option"
                aria-selected={isHighlighted}
              >
                {showAvatar && avatarField && (
                  <div className="autocomplete-avatar">
                    {String(getNestedValue(item, avatarField) || '?')[0].toUpperCase()}
                  </div>
                )}
                
                <div className="autocomplete-suggestion-content">
                  <div className="autocomplete-suggestion-main">
                    {formatDisplayText(item)}
                  </div>
                  
                  {metaFields.length > 0 && (
                    <div className="autocomplete-suggestion-meta">
                      {formatMetaText(item)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          
          {/* No results */}
          {suggestions.length === 0 && !loading && (
            <div className="autocomplete-no-results">
              {inputValue.length < minCharsToSearch 
                ? `Type at least ${minCharsToSearch} characters to search`
                : 'No results found'
              }
            </div>
          )}
          
          {/* Custom actions */}
          {customActions.map((action, index) => (
            <div
              key={`action-${index}`}
              className="autocomplete-custom-action"
              onClick={() => {
                setIsOpen(false);
                action.onClick();
              }}
              style={{ color: action.color }}
            >
              {action.icon && (
                <span className="autocomplete-action-icon">
                  {action.icon}
                </span>
              )}
              {action.label}
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export default AutoComplete;