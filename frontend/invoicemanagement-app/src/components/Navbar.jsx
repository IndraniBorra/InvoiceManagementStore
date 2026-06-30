import React, { useRef, useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/components/Navbar.css';

const PUBLIC_LINKS = [
  { to: '/',         label: 'Dashboard' },
  { to: '/invoices', label: 'Invoices'  },
  { to: '/customer', label: 'Customers' },
  { to: '/product',  label: 'Products'  },
  { to: '/reports',  label: 'Reports'   },
];

const ADMIN_LINKS = [
  { to: '/ap',          label: 'Payables'    },
  { to: '/accounting',  label: 'Accounting'  },
  { to: '/forecasting', label: 'Forecasting' },
];

function getInitials(nameOrEmail) {
  if (!nameOrEmail) return '?';
  const parts = nameOrEmail.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return nameOrEmail[0].toUpperCase();
}

const Navbar = () => {
  const navigate = useNavigate();
  const { isAdmin, user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  const visibleLinks = isAdmin ? [...PUBLIC_LINKS, ...ADMIN_LINKS] : PUBLIC_LINKS;
  const initials = getInitials(user?.name || user?.email);

  useEffect(() => {
    function handleOutsideClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  async function handleLogout() {
    setOpen(false);
    await logout();
    navigate('/login');
  }

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <button className="navbar-brand" onClick={() => navigate('/')}>
          SmartInvoice
        </button>

        <nav className="navbar-links">
          {visibleLinks.map(({ to, label }) => (
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

        <div style={styles.rightSection}>
          <button
            className="navbar-cta"
            onClick={() => navigate('/invoice')}
          >
            + New Invoice
          </button>

          <div ref={dropdownRef} style={styles.avatarWrapper}>
            <button
              style={styles.avatar}
              onClick={() => setOpen((prev) => !prev)}
              aria-label="Profile menu"
            >
              {initials}
            </button>

            {open && (
              <div style={styles.dropdown}>
                <div style={styles.dropdownHeader}>
                  <span style={styles.dropdownName}>{user?.name || user?.email}</span>
                  <span style={styles.dropdownRole}>
                    {isAdmin ? 'Admin' : 'User'}
                  </span>
                </div>
                <hr style={styles.divider} />
                <button
                  style={styles.dropdownItem}
                  onClick={() => { setOpen(false); navigate('/profile'); }}
                >
                  My Profile
                </button>
                <button
                  style={styles.dropdownItem}
                  onClick={() => { setOpen(false); navigate('/profile?tab=password'); }}
                >
                  Change Password
                </button>
                {isAdmin && (
                  <button
                    style={styles.dropdownItem}
                    onClick={() => { setOpen(false); navigate('/admin/users'); }}
                  >
                    Manage Users
                  </button>
                )}
                <hr style={styles.divider} />
                <button
                  style={{ ...styles.dropdownItem, color: '#c0392b' }}
                  onClick={handleLogout}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

const styles = {
  rightSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: '#4f46e5',
    color: '#fff',
    border: 'none',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    right: 0,
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    minWidth: '200px',
    zIndex: 1000,
    overflow: 'hidden',
  },
  dropdownHeader: {
    padding: '12px 16px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  dropdownName: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#1a1a2e',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  dropdownRole: {
    fontSize: '11px',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  divider: {
    margin: '4px 0',
    border: 'none',
    borderTop: '1px solid #f0f0f0',
  },
  dropdownItem: {
    display: 'block',
    width: '100%',
    padding: '10px 16px',
    background: 'none',
    border: 'none',
    textAlign: 'left',
    fontSize: '14px',
    color: '#333',
    cursor: 'pointer',
  },
};

export default Navbar;
