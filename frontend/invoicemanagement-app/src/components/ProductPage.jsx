import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import '../styles/components/InvoicePage.css'; // Using shared styles

const ProductPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [products, setProducts] = useState([]);
    const [showList, setShowList] = useState(false);
    const [formData, setFormData] = useState({
        product_description: '',
        product_price: '',
    });
    const [editingId, setEditingId] = useState(null);
    // Capture returnToInvoice once on mount; cleared after use so stale history can't retrigger it
    const returnToInvoiceRef = useRef(location.state?.returnToInvoice || null);

    // Auto-fill form from LLM Assistant (create)
    useEffect(() => {
        const data = location.state?.llmData || location.state?.extractedData;
        if (data && location.state?.action === 'create_product_with_data') {
            setFormData({
                product_description: data.product_description || '',
                product_price: data.product_price ? data.product_price.toString() : '',
            });
        }
    }, [location.state]);

    // Pre-fill edit form from LLM Assistant (update)
    useEffect(() => {
        if (location.state?.action === 'update_product_with_data' && location.state?.editProductId) {
            const data = location.state.llmData || {};
            setEditingId(location.state.editProductId);
            setFormData({
                product_description: data.product_description || '',
                product_price: data.product_price != null ? data.product_price.toString() : '',
            });
            setShowList(true);
        }
    }, [location.state]);

    // Auto-open list when navigated from LLM "show products"
    useEffect(() => {
        if (location.state?.showList) {
            setShowList(true);
        }
    }, [location.state]);

    useEffect(() => {
        if (showList) {
            fetchProducts();
        }
    }, [showList]);

    const fetchProducts = async () => {
        try {
            const res = await apiClient.get('/products');
            setProducts(res.data);
        } catch (err) {
            console.error('Error fetching products:', err);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const {product_description, product_price} = formData;

        if (!product_description.trim() || !product_price) {
            alert("All fields are required.");
            return;
        }
        if (isNaN(product_price) || parseFloat(product_price) <= 0) {
            alert("Price must be a positive number.");
            return;
        }
        if (!editingId && products.some(p => p.product_description.trim().toLowerCase() === product_description.trim().toLowerCase())) {
            alert("Product with this description already exists!");
            return;
        }

        try {
            if (editingId) {
                const response = await apiClient.put(`/product/${editingId}`, {
                    product_description: product_description.trim(),
                    product_price: parseFloat(product_price),
                });
                alert(`Product ID: ${response.data.product_id} updated successfully!`);
                resetForm();
                fetchProducts();
            } else {
                const response = await apiClient.post('/product', {
                    product_description: product_description.trim(),
                    product_price: parseFloat(product_price),
                });
                const newProduct = response.data;
                const returnIntent = returnToInvoiceRef.current;
                if (returnIntent) {
                    returnToInvoiceRef.current = null; // consume once — prevent stale retrigger

                    // Normalize to line_items array
                    const items = returnIntent.line_items?.length > 0
                        ? returnIntent.line_items
                        : [{ product_id: null, product_description: returnIntent.product_description || '', lineitem_qty: returnIntent.lineitem_qty || 1, product_price: 0 }];

                    // Fill the first unresolved slot with the newly created product
                    let filled = false;
                    const updatedItems = items.map(item => {
                        if (!filled && item.product_id === null) {
                            filled = true;
                            return { product_id: newProduct.product_id, product_description: newProduct.product_description, lineitem_qty: item.lineitem_qty || 1, product_price: newProduct.product_price };
                        }
                        return item;
                    });

                    const customerInfo = {
                        customer_id:      returnIntent.customer_id      || null,
                        customer_name:    returnIntent.customer_name    || '',
                        customer_address: returnIntent.customer_address || '',
                        customer_phone:   returnIntent.customer_phone   || '',
                    };

                    const nextUnresolved = updatedItems.find(item => item.product_id === null);
                    if (nextUnresolved) {
                        alert(`Product "${newProduct.product_description}" created! Now let's create product "${nextUnresolved.product_description}".`);
                        navigate('/product', {
                            state: {
                                action: 'create_product_with_data',
                                llmData: {
                                    product_description: nextUnresolved.product_description,
                                    product_price:       nextUnresolved.product_price || '',
                                },
                                returnToInvoice: { ...customerInfo, line_items: updatedItems },
                            },
                        });
                    } else {
                        alert(`Product "${newProduct.product_description}" created! Taking you back to invoice creation.`);
                        navigate('/invoice', {
                            state: {
                                action: 'create_invoice_with_data',
                                llmData: { ...customerInfo, line_items: updatedItems },
                            },
                        });
                    }
                    return;
                }
                alert(`Product ID: ${newProduct.product_id} created successfully!`);
                resetForm();
                fetchProducts();
            }
        } catch (err) {
            if (err.response?.data?.detail) {
                alert(`Error: ${err.response.data.detail}`);
            } else {
                console.error('Error submitting form:', err);
                alert('Failed to submit form. Please try again.');
            }
        }
    };

    const handleEdit = (product) => {
        setFormData({
            product_description: product.product_description,
            product_price: product.product_price,
        });
        setEditingId(product.product_id);
        setShowList(true);
    };

    const resetForm = () => {
        setFormData({ product_description: '', product_price: '' });
        setEditingId(null);
    };

    return (
        <div className="container">
            <header className="header">
                <h2>Product Management</h2>
                <button className="btn toggle-list-btn" onClick={() => setShowList(!showList)}>
                    ☰ All Products
                </button>
            </header>

            <form className="product-form" onSubmit={handleSubmit}>
                <div className="form-group">
                    <input
                        type="text"
                        placeholder="Product Description *"
                        value={formData.product_description}
                        onChange={(e) => setFormData({ ...formData, product_description: e.target.value })}
                        required
                    />
                    <input
                        type="number"
                        placeholder="Product Price *"
                        value={formData.product_price}
                        onChange={(e) => setFormData({ ...formData, product_price: e.target.value })}
                        required
                    />
                    <div className="form-actions">
                        <button type="submit" className="btn submit-btn">
                            {editingId ? 'Update Product' : 'Create Product'}
                        </button>
                        {editingId && (
                            <button type="button" className="btn cancel-btn" onClick={resetForm}>
                                Cancel Edit
                            </button>
                        )}
                    </div>
                </div>
            </form>

            {showList && (
                <section className="product-list">
                    <h3>All Products</h3>
                    <table className="product-table">
                        <thead>
                            <tr>
                                <th>Prod ID</th>
                                <th>Description</th>
                                <th>Price</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {products.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="no-data">No products found.</td>
                                </tr>
                            ) : (
                                products.map((product) => (
                                    <tr key={product.product_id}>
                                        <td>{product.product_id}</td>
                                        <td>{product.product_description}</td>
                                        <td>${product.product_price}</td>
                                        <td>
                                            <button className="btn edit-btn" onClick={() => handleEdit(product)}>
                                                Edit
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </section>
            )}
        </div>
    );
};

export default ProductPage;
