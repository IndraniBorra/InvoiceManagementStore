// AutoComplete Component
// This component provides an autocomplete input field that fetches suggestions from a given API endpoint.(like customer names , lineitems etc.) 


// components/AutocompleteSearch.jsx
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import '../components_css/AutoCompleteSearch.css'; // Assuming you have some styles for the autocomplete

const AutocompleteSearch = ({ fetchUrl, displayFields = [], placeholder = "Search...", onSelect }) => {
  const [data, setData] = useState([]);
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    axios.get(fetchUrl)
      .then(res => {
        setData(res.data);
        console.log("Data fetched successfully:", res.data);
      })
      .catch(err => console.error("Error fetching data:", err));
  }, [fetchUrl]);


  useEffect(() => {
    const handler = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleChange = (e) => {
    const input = e.target.value;
    setText(input);

    if (!input.trim()) {
      setSuggestions(data);
      setShowDropdown(true);
      return;
    }

    const regex = new RegExp(input, 'i');
    const filtered = data.filter(item => 
      displayFields.some(field => regex.test(item[field] || ""))
    );
    setSuggestions(filtered);
    setShowDropdown(true);
  };
  
  const handleInputClick = () => {
    if (data.length > 0) {
      setSuggestions(data); // Show all items when clicking
        setShowDropdown(true);
      }
    };

  const handleSelect = (item) => {
    setText(displayFields.map(f => item[f]).join(" | "));
    setShowDropdown(false);
    if (onSelect) onSelect(item);
  };

  return (
    <div className="autocomplete-container" ref={containerRef}>
      <input
        type="text"
        placeholder={placeholder}
        value={text}
        onChange={handleChange}
        onClick={handleInputClick}
      />
      {showDropdown && suggestions.length > 0 && (
        <ul className="suggestions-list">
          {suggestions.map((item, index) => (
            <li key={index} onClick={() => handleSelect(item)}>
              {displayFields.map((field, i) => (
                <span key={i} className="field">{item[field]}</span>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AutocompleteSearch;
