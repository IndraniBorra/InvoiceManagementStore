import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { updatePassword, updateUserAttributes, fetchAuthSession } from 'aws-amplify/auth';
import toast from 'react-hot-toast';

function ProfilePage() {
  const { user } = useAuth();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const defaultTab = params.get('tab') === 'password' ? 'password' : 'profile';

  const [tab, setTab] = useState(defaultTab);
  const [name, setName] = useState(user?.name || '');
  const [nameLoading, setNameLoading] = useState(false);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    setName(user?.name || '');
  }, [user]);

  async function handleNameUpdate(e) {
    e.preventDefault();
    setNameLoading(true);
    try {
      await updateUserAttributes({ userAttributes: { name } });
      // Refresh the session so AuthContext picks up the new name on next load
      await fetchAuthSession({ forceRefresh: true });
      toast.success('Name updated successfully.');
    } catch (err) {
      toast.error(err.message || 'Failed to update name.');
    } finally {
      setNameLoading(false);
    }
  }

  async function handlePasswordChange(e) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    setPwLoading(true);
    try {
      await updatePassword({ oldPassword, newPassword });
      toast.success('Password changed successfully.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(err.message || 'Failed to change password.');
    } finally {
      setPwLoading(false);
    }
  }

  const isAdmin = user?.groups?.includes('admin');

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.avatarLarge}>
            {(user?.name || user?.email || '?')[0].toUpperCase()}
          </div>
          <div>
            <h2 style={styles.displayName}>{user?.name || user?.email}</h2>
            <span style={isAdmin ? styles.badgeAdmin : styles.badgeUser}>
              {isAdmin ? 'Admin' : 'User'}
            </span>
          </div>
        </div>

        <div style={styles.tabs}>
          <button
            style={tab === 'profile' ? styles.tabActive : styles.tab}
            onClick={() => setTab('profile')}
          >
            Profile
          </button>
          <button
            style={tab === 'password' ? styles.tabActive : styles.tab}
            onClick={() => setTab('password')}
          >
            Change Password
          </button>
        </div>

        {tab === 'profile' && (
          <form onSubmit={handleNameUpdate} style={styles.form}>
            <div style={styles.field}>
              <label style={styles.label}>Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={styles.input}
                placeholder="Your name"
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Email</label>
              <input
                type="email"
                value={user?.email || ''}
                readOnly
                style={{ ...styles.input, background: '#f5f6fa', color: '#888' }}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Account ID</label>
              <input
                type="text"
                value={user?.sub ? `${user.sub.slice(0, 8)}...` : ''}
                readOnly
                style={{ ...styles.input, background: '#f5f6fa', color: '#888', fontFamily: 'monospace' }}
              />
            </div>
            <button type="submit" disabled={nameLoading} style={styles.button}>
              {nameLoading ? 'Saving...' : 'Save changes'}
            </button>
          </form>
        )}

        {tab === 'password' && (
          <form onSubmit={handlePasswordChange} style={styles.form}>
            <div style={styles.field}>
              <label style={styles.label}>Current Password</label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
                style={styles.input}
                placeholder="••••••••"
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                style={styles.input}
                placeholder="Min 8 characters"
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                style={styles.input}
                placeholder="••••••••"
              />
            </div>
            <button type="submit" disabled={pwLoading} style={styles.button}>
              {pwLoading ? 'Updating...' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f5f6fa',
    display: 'flex',
    justifyContent: 'center',
    paddingTop: '60px',
  },
  card: {
    background: '#fff',
    borderRadius: '12px',
    boxShadow: '0 2px 16px rgba(0,0,0,0.10)',
    padding: '40px',
    width: '100%',
    maxWidth: '480px',
    height: 'fit-content',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '28px',
  },
  avatarLarge: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    background: '#4f46e5',
    color: '#fff',
    fontSize: '22px',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  displayName: {
    margin: '0 0 6px',
    fontSize: '18px',
    fontWeight: '700',
    color: '#1a1a2e',
  },
  badgeAdmin: {
    display: 'inline-block',
    padding: '2px 10px',
    background: '#4f46e5',
    color: '#fff',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  badgeUser: {
    display: 'inline-block',
    padding: '2px 10px',
    background: '#e5e7eb',
    color: '#555',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  tabs: {
    display: 'flex',
    gap: '4px',
    marginBottom: '24px',
    borderBottom: '2px solid #f0f0f0',
  },
  tab: {
    padding: '8px 16px',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    marginBottom: '-2px',
    fontSize: '14px',
    color: '#888',
    cursor: 'pointer',
  },
  tabActive: {
    padding: '8px 16px',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid #4f46e5',
    marginBottom: '-2px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#4f46e5',
    cursor: 'pointer',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#333',
  },
  input: {
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none',
  },
  button: {
    marginTop: '8px',
    padding: '12px',
    background: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
  },
};

export default ProfilePage;
