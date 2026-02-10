import React, {useEffect, useState} from 'react';
import { useLocation } from 'react-router-dom';
import { apiClient } from '../services/api';
import '../styles/components/InvoicePage.css'; // Using shared styles

const ProductPage = () => {
    const location = useLocation();
    const [products, setProducts] = useState([]); // State to hold products to show in the table format
    const [showList, setShowList] = useState(false); // State to toggle between form and list view
    const [formData, setFormData] = useState({      // State to hold form data
        product_description: '',
        product_price: '',
    });

    const [editingId, setEditingId] = useState(null);

    // Pre-fill data from LLM Assistant
    const [preFilledData, setPreFilledData] = useState(null);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [extractedInfo, setExtractedInfo] = useState(null);
    
    const fetchProducts = async () => {
        try {
        const res = await apiClient.get('/products');
        setProducts(res.data);
        } catch (err) {
        console.error('Error fetching products:', err);
        }
    };
    
    // Handle pre-filled data from LLM Assistant
    useEffect(() => {
        if (location.state?.extractedData && location.state?.action === 'create_product_with_data') {
            const extracted = location.state.extractedData;
            console.log('🎯 ProductPage: Received pre-filled data:', extracted);

            setExtractedInfo({
                originalCommand: extracted.original_text,
                summary: extracted.summary,
                confidence: extracted.confidence,
                source: 'LLM Assistant'
            });

            setPreFilledData({
                product_description: extracted.product_description || '',
                product_price: extracted.product_price ? extracted.product_price.toString() : ''
            });

            setShowConfirmation(true);
        }
    }, [location.state]);

    useEffect(() => {
        if (showList) {
            fetchProducts();
        }
    }, [showList]);
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        const {product_description, product_price} = formData;

        // Basic checks
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
            const response = await apiClient.put(`/product/${editingId}`, formData);
            alert(`Product ID: ${response.data.product_id} updated successfully!`);
        } else {
            const response = await apiClient.post('/product', formData);
            alert(`Product ID: ${response.data.product_id} created successfully!`);
        }
        resetForm();
        fetchProducts();
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
        setFormData({
            product_description: '',
            product_price: '',
        });
        setEditingId(null);
        setPreFilledData(null);
        setShowConfirmation(false);
        setExtractedInfo(null);
    };

    // Handle confirmation of pre-filled data
    const handleConfirmPreFill = () => {
        if (preFilledData) {
            setFormData(preFilledData);
            setShowConfirmation(false);
        }
    };

    // Handle rejection of pre-filled data
    const handleRejectPreFill = () => {
        setPreFilledData(null);
        setShowConfirmation(false);
        setExtractedInfo(null);
    };
    return(
        <div className="container">
            <header className="header">
                <h2> Product Management</h2>
                <button className="btn toggle-list-btn" onClick={() => setShowList(!showList)}>
                    ☰ All Products
                </button>
            </header>

            {/* Pre-fill Confirmation Dialog */}
            {showConfirmation && extractedInfo && (
                <div className="confirmation-dialog" style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 1000
                }}>
                    <div className="confirmation-content" style={{
                        backgroundColor: 'white',
                        padding: '20px',
                        borderRadius: '8px',
                        maxWidth: '500px',
                        width: '90%',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                    }}>
                        <h3>🎯 Smart Product Creation</h3>
                        <div className="extracted-info">
                            <p><strong>Original Command:</strong> "{extractedInfo.originalCommand}"</p>
                            <p><strong>Extracted Data:</strong> {extractedInfo.summary}</p>
                            <p><strong>Confidence:</strong> {(extractedInfo.confidence * 100).toFixed(1)}%</p>
                            <p><strong>Source:</strong> {extractedInfo.source}</p>
                        </div>

                        {preFilledData && (
                            <div className="preview-data">
                                <h4>Preview Product Data:</h4>
                                <ul>
                                    <li><strong>Description:</strong> {preFilledData.product_description}</li>
                                    <li><strong>Price:</strong> ${preFilledData.product_price}</li>
                                </ul>
                            </div>
                        )}

                        <div className="confirmation-actions">
                            <button
                                className="btn confirm-btn"
                                onClick={handleConfirmPreFill}
                                style={{backgroundColor: '#28a745', color: 'white', marginRight: '10px'}}
                            >
                                ✅ Use This Data
                            </button>
                            <button
                                className="btn reject-btn"
                                onClick={handleRejectPreFill}
                                style={{backgroundColor: '#dc3545', color: 'white'}}
                            >
                                ❌ Start Fresh
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                            )))}
                        </tbody>
                    </table>
                </section>
            )}
        </div>
    );
};

export default ProductPage;
