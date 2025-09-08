// This file is part of Invoice Management App. 

import AutoComplete from "./ui/AutoComplete";


const LineItem = ({}) => {
  return (
    <div>
        

        <AutoComplete
          fetchUrl="/products"
          displayFields={['product_description']}
          searchFields={['product_description']}
          valueField="product_id"
          placeholder="Search product"
          onSelect={(selectedProduct, value) => {
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
