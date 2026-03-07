import React, { forwardRef } from 'react';
import '../../styles/components/Input.css';

const Input = forwardRef(({
  label,
  error,
  helpText,
  required = false,
  disabled = false,
  className = '',
  containerClassName = '',
  type = 'text',
  id,
  ...props
}, ref) => {
  const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
  const hasError = Boolean(error);
  
  const inputClasses = [
    'input',
    hasError && 'input--error',
    disabled && 'input--disabled',
    className
  ].filter(Boolean).join(' ');

  const containerClasses = [
    'input-container',
    containerClassName
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClasses}>
      {label && (
        <label htmlFor={inputId} className="input-label">
          {label}
          {required && <span className="input-required">*</span>}
        </label>
      )}
      
      <input
        ref={ref}
        id={inputId}
        type={type}
        className={inputClasses}
        disabled={disabled}
        aria-invalid={hasError}
        aria-describedby={
          [
            error && `${inputId}-error`,
            helpText && `${inputId}-help`
          ].filter(Boolean).join(' ') || undefined
        }
        {...props}
      />
      
      {helpText && !error && (
        <p id={`${inputId}-help`} className="input-help">
          {helpText}
        </p>
      )}
      
      {error && (
        <p id={`${inputId}-error`} className="input-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;