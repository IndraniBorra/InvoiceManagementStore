// import React from 'react';
// import InvoicePage from './components/InvoicePage';
// import './App.css';

// function App() {
//   return (
//     <div>
//       <h1>Invoice Management App</h1>
//       <InvoicePage />
//       {/* <InvoiceList /> */}
//     </div>
//   );
// }

// export default App;

// i wanna create a react app with react-router-dom to navigate between InvoicePage and AllInvoicesPage

import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import InvoicePage from './components/InvoicePage';
import AllInvoicesPage from './components/AllInvoicesPage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<InvoicePage />} />
        <Route path="/invoices" element={<AllInvoicesPage />} />
      </Routes>
    </Router>
  );
}

export default App;

