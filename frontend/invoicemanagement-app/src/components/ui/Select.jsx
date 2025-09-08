import React, { forwardRef } from 'react';
import '../../styles/components/Select.css';

const Select = forwardRef(({
  label,
  error,
  helpText,
  required = false,
  disabled = false,
  className = '',
  containerClassName = '',
  children,
  placeholder,
  id,
  ...props
}, ref) => {
  const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`;
  const hasError = Boolean(error);
  
  const selectClasses = [
    'select',
    hasError && 'select--error',
    disabled && 'select--disabled',
    className
  ].filter(Boolean).join(' ');

  const containerClasses = [
    'select-container',
    containerClassName
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClasses}>
      {label && (
        <label htmlFor={selectId} className="select-label">
          {label}
          {required && <span className="select-required">*</span>}
        </label>
      )}
      
      <div className="select-wrapper">
        <select
          ref={ref}
          id={selectId}
          className={selectClasses}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={
            [
              error && `${selectId}-error`,
              helpText && `${selectId}-help`
            ].filter(Boolean).join(' ') || undefined
          }
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {children}
        </select>
        <div className="select-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 6L8 10L12 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
      
      {helpText && !error && (
        <p id={`${selectId}-help`} className="select-help">
          {helpText}
        </p>
      )}
      
      {error && (
        <p id={`${selectId}-error`} className="select-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});

Select.displayName = 'Select';

export default Select;