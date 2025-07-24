import React, {useEffect, useState} from 'react';
import api from '../api';
import '../components_css/ProductPage.css'; // Import your CSS styles

const ProductPage = () => {
    const [products, setProducts] = useState([]); // State to hold products to show in the table format
    const [showList, setShowList] = useState(false); // State to toggle between form and list view
    const [formData, setFormData] = useState({      // State to hold form data
        product_description: '',
        product_price: '',

    });
    
    const [editingId, setEditingId] = useState(null);
    
    const fetchProducts = async () => {
        try {
        const res = await api.get('/products');
        setProducts(res.data);
        } catch (err) {
        console.error('Error fetching products:', err);
        }
    };
    
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
            const response = await api.put(`/product/${editingId}`, formData);
            alert(`Product ID: ${response.data.product_id} updated successfully!`);
        } else {
            const response = await api.post('/product', formData);
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
    };
    return(
        <div className="container">
            <header className="header">
                <h2> Product Management</h2>
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
                            )))}
                        </tbody>
                    </table>
                </section>
            )}
        </div>
    );
};

export default ProductPage;
