import React, { useState } from 'react';
import { BRANDING, getLogoPath, getLogoSize } from '../../config/branding';

/**
 * Logo Component
 * 
 * Reusable logo component with size variants, error handling, and accessibility features.
 * Uses centralized branding configuration for consistency across the application.
 */
const Logo = ({
  size = 'md',
  theme = 'default',
  className = '',
  style = {},
  onClick,
  clickable = false,
  showFallback = true,
  ...props
}) => {
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Get logo configuration
  const logoPath = getLogoPath(theme);
  const sizeConfig = getLogoSize(size);
  
  // Handle image load error
  const handleImageError = () => {
    if (showFallback && !imageError) {
      setImageError(true);
      setIsLoading(false);
    }
  };

  // Handle image load success
  const handleImageLoad = () => {
    setIsLoading(false);
    setImageError(false);
  };

  // Build CSS classes
  const logoClasses = [
    'logo',
    sizeConfig.className,
    clickable && 'logo-clickable',
    isLoading && 'logo-loading',
    imageError && 'logo-error',
    className
  ].filter(Boolean).join(' ');

  // Combine styles
  const logoStyle = {
    width: sizeConfig.width,
    height: sizeConfig.height,
    ...style
  };

  // Handle click events
  const handleClick = (e) => {
    if (clickable && onClick) {
      onClick(e);
    }
  };

  // Render fallback if image failed to load
  if (imageError && showFallback) {
    return (
      <div 
        className={`logo-fallback ${logoClasses}`}
        style={logoStyle}
        onClick={handleClick}
        role={clickable ? 'button' : 'img'}
        aria-label={BRANDING.logo.alt}
        tabIndex={clickable ? 0 : -1}
        {...props}
      >
        <span className="logo-fallback-text">
          {BRANDING.company.shortName}
        </span>
      </div>
    );
  }

  return (
    <img
      src={logoPath}
      alt={BRANDING.logo.alt}
      className={logoClasses}
      style={logoStyle}
      onError={handleImageError}
      onLoad={handleImageLoad}
      onClick={handleClick}
      role={clickable ? 'button' : 'img'}
      tabIndex={clickable ? 0 : -1}
      loading="lazy"
      {...props}
    />
  );
};

export default Logo;