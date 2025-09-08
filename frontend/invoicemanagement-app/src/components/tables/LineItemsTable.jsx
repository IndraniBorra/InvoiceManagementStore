import React from 'react';
import Button from '../ui/Button';
import AutoComplete from '../ui/AutoComplete';
import Input from '../ui/Input';
import '../../styles/components/LineItemsTable.css';

const LineItemsTable = ({
  lineItems,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  errors = {},
  disabled = false
}) => {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  const calculateTotal = () => {
    return lineItems.reduce((total, item) => {
      return total + (item.line_items_qty * item.product_price || 0);
    }, 0);
  };

  return (
    <div className="line-items-table">
      <div className="line-items-header">
        <h3>Line Items</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={onAddItem}
          disabled={disabled}
        >
          + Add Item
        </Button>
      </div>

      <div className="line-items-table-wrapper">
        <table className="line-items-data-table">
          <thead>
            <tr>
              <th>Product Details</th>
              <th>Quantity</th>
              <th>Price</th>
              <th>Amount</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item, index) => (
              <tr key={index}>
                <td className="product-cell">
                  <AutoComplete
                    fetchUrl="/products"
                    displayFields={['product_description']}
                    searchFields={['product_description']}
                    metaFields={['product_price']}
                    placeholder="Search products..."
                    value={item.product_description}
                    minCharsToSearch={1}
                    disabled={disabled}
                    className="product-autocomplete"
                    onSelect={(product) => {
                      if (product && product.product_id) {
                        // Complete product selection
                        onUpdateItem(index, 'product_id', product.product_id);
                        onUpdateItem(index, 'product_description', product.product_description);
                        onUpdateItem(index, 'product_price', product.product_price);
                      } else if (product && product.product_description) {
                        // Partial typing - just update description
                        onUpdateItem(index, 'product_description', product.product_description);
                      }
                    }}
                  />
                  {errors[`item_desc_${index}`] && (
                    <div className="error-text">
                      {errors[`item_desc_${index}`]}
                    </div>
                  )}
                </td>

                <td className="quantity-cell">
                  <Input
                    type="number"
                    placeholder="Qty"
                    value={item.line_items_qty}
                    onChange={(e) => {
                      const qty = parseFloat(e.target.value) || 0;
                      onUpdateItem(index, 'line_items_qty', qty);
                    }}
                    error={errors[`item_qty_${index}`]}
                    disabled={disabled}
                    containerClassName="quantity-input-container"
                    min="0"
                    step="1"
                  />
                </td>

                <td className="price-cell">
                  <Input
                    type="number"
                    placeholder="Price"
                    value={item.product_price}
                    onChange={(e) => {
                      const price = parseFloat(e.target.value) || 0;
                      onUpdateItem(index, 'product_price', price);
                    }}
                    error={errors[`item_price_${index}`]}
                    disabled={disabled}
                    containerClassName="price-input-container"
                    min="0"
                    step="0.01"
                  />
                </td>

                <td className="amount-cell">
                  <div className="amount-display">
                    {formatCurrency(item.line_items_qty * item.product_price)}
                  </div>
                </td>

                <td className="action-cell">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => onRemoveItem(index)}
                    disabled={disabled || lineItems.length <= 1}
                    className="remove-item-btn"
                    title={lineItems.length <= 1 ? "At least one item is required" : "Remove item"}
                  >
                    🗑️
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="line-items-summary">
        <div className="total-amount">
          <strong>Total: {formatCurrency(calculateTotal())}</strong>
        </div>
      </div>
    </div>
  );
};

export default LineItemsTable;