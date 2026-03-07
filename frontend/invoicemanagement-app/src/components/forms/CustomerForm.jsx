import React from 'react';
import { useNavigate } from 'react-router-dom';
import Input from '../ui/Input';
import AutoComplete from '../ui/AutoComplete';
import { useCustomerSearch } from '../../hooks/useCustomers';

const CustomerForm = ({
  formData,
  onFieldChange,
  errors = {},
  disabled = false
}) => {
  const navigate = useNavigate();
  
  return (
    <div className="customer-form">
      <h3>Customer Information</h3>
      
      <AutoComplete
        label="Customer Name"
        required
        fetchUrl="/customers"
        displayFields={['customer_name']}
        searchFields={['customer_name', 'customer_email']}
        metaFields={['customer_email']}
        placeholder="Search for a customer..."
        showAvatar={true}
        avatarField="customer_name"
        value={formData.customer_name}
        error={errors.customer_name}
        disabled={disabled}
        customActions={[
          {
            label: 'Create New Customer',
            icon: '➕',
            color: 'var(--color-success)',
            onClick: () => navigate('/customer')
          }
        ]}
        onSelect={(customer) => {
          if (customer && customer.customer_id) {
            onFieldChange('customer_id', customer.customer_id);
            onFieldChange('customer_name', customer.customer_name);
            onFieldChange('customer_address', customer.customer_address);
            onFieldChange('customer_phone', customer.customer_phone);
          }
        }}
      />
      
      <Input
        label="Address"
        required
        type="text"
        placeholder="Customer address"
        value={formData.customer_address}
        onChange={(e) => onFieldChange('customer_address', e.target.value)}
        error={errors.customer_address}
        disabled={disabled}
      />
      
      <Input
        label="Phone Number"
        required
        type="tel"
        placeholder="10-digit phone number"
        value={formData.customer_phone}
        onChange={(e) => onFieldChange('customer_phone', e.target.value)}
        error={errors.customer_phone}
        disabled={disabled}
        helpText="Enter a 10-digit phone number"
      />
    </div>
  );
};

export default CustomerForm;