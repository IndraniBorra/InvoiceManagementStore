// This file is part of Invoice Management App. 

import AutocompleteSearch from "./AutoCompleteSearch";


const LineItem = ({}) => {
  return (
    <div>
        

        <AutocompleteSearch
          fetchUrl="http://localhost:8000/products"
          displayFields={['description']}
          placeholder="Search product"
          onSelect={(selectedProduct) => {
            console.log("Selected Product:", selectedProduct);
          }}
        />

        <input
          type="number"
          placeholder="Quantity"
        //   value={item.qty}
        //   onChange={e => onItemChange(index, 'qty', e.target.value)}
        />

        <input
          type="number"
          placeholder="Price"
        //   value={item.price}
        //   onChange={e => onItemChange(index, 'price', e.target.value)}
        />

        <strong><input
            type="number"
            placeholder="Amount"
            // value={item.qty * item.price}
            // readOnly
        /></strong>

        <button type="button">Remove</button>


    </div>
        
     
  );
};

export default LineItem;
