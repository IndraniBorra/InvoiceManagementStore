import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import '../styles/components/Navbar.css';

const NAV_LINKS = [
  { to: '/',          label: 'Dashboard' },
  { to: '/invoices',  label: 'Invoices'  },
  { to: '/customer',  label: 'Customers' },
  { to: '/product',   label: 'Products'  },
  { to: '/reports',   label: 'Reports'   },
  { to: '/ap',        label: 'Payables'  },
];

const Navbar = () => {
  const navigate = useNavigate();

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <button className="navbar-brand" onClick={() => navigate('/')}>
          SmartInvoice
        </button>

        <nav className="navbar-links">
          {NAV_LINKS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `navbar-link${isActive ? ' navbar-link--active' : ''}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <button
          className="navbar-cta"
          onClick={() => navigate('/invoice')}
        >
          + New Invoice
        </button>
      </div>
    </header>
  );
};

export default Navbar;
