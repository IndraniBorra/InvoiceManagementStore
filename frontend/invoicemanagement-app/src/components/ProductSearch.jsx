import React, { useState, useEffect, useRef} from 'react';
import (useNavigate) from 'react-router-dom';
import api from '../api';


const ProductSearch = ({ value, onProductselect}) => {
    const navigate = useNavigate();
    const [products, setProducts] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [text, setText] = useState(value || '');
    const [isDropdownVisible, setDropdownVisible] = useState(false);
    const inputRef = useRef(null);

    useEffect(()=>{
        const fetchProducts = async () => {
            try {
                const response = await api.get('/products');
                setProducts(response.data);
                setSuggestions(response.data);
            } catch (err) {
                console.error("Failed to fetch products:", err);
            }
        }
    }, [inputRef]);

    const openDropdown = () => {
        setDropdownVisible(true);
        if (text.trim() === ' ') {
            setSuggestions(products);
            onProductselect({ name: '' }); // clear selected product info
        } else {
            filterSuggestions(text);
        }
    }
}

