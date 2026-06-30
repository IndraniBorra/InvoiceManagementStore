import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/api';
import toast from 'react-hot-toast';

function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await apiClient.get('/users');
      setUsers(res.data);
    } catch (err) {
      toast.error('Failed to load users.');
    } finally {
      setLoading(false);
    }
  }

  async function toggleEnable(sub, enabled) {
    try {
      await apiClient.post(`/users/${sub}/disable`, { enable: !enabled });
      toast.success(enabled ? 'User disabled.' : 'User enabled.');
      setUsers((prev) =>
        prev.map((u) => (u.sub === sub ? { ...u, enabled: !enabled } : u))
      );
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update user.');
    }
  }

  async function changeRole(sub, currentRole) {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    try {
      await apiClient.post(`/users/${sub}/role`, { role: newRole });
      toast.success(`Role changed to ${newRole}.`);
      setUsers((prev) =>
        prev.map((u) => (u.sub === sub ? { ...u, role: newRole } : u))
      );
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to change role.');
    }
  }

  async function deleteUser(sub, email) {
    if (!window.confirm(`Delete user ${email}? This cannot be undone.`)) return;
    try {
      await apiClient.delete(`/users/${sub}`);
      toast.success('User deleted.');
      setUsers((prev) => prev.filter((u) => u.sub !== sub));
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete user.');
    }
  }

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      u.email?.toLowerCase().includes(q) ||
      u.name?.toLowerCase().includes(q)
    );
  });

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.topBar}>
          <h1 style={styles.title}>Manage Users</h1>
          <input
            type="search"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={styles.searchInput}
          />
        </div>

        {loading ? (
          <div style={styles.center}>Loading users...</div>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.thead}>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th}>Role</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Created</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={styles.empty}>No users found.</td>
                  </tr>
                ) : (
                  filtered.map((u) => (
                    <tr key={u.sub} style={styles.tr}>
                      <td style={styles.td}>{u.name || '—'}</td>
                      <td style={styles.td}>{u.email}</td>
                      <td style={styles.td}>
                        <span style={u.role === 'admin' ? styles.badgeAdmin : styles.badgeUser}>
                          {u.role}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={u.enabled ? styles.statusEnabled : styles.statusDisabled}>
                          {u.enabled ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td style={styles.td}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td style={styles.td}>
                        <div style={styles.actions}>
                          <button
                            style={styles.actionBtn}
                            onClick={() => toggleEnable(u.sub, u.enabled)}
                          >
                            {u.enabled ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            style={styles.actionBtn}
                            onClick={() => changeRole(u.sub, u.role)}
                          >
                            {u.role === 'admin' ? 'Demote' : 'Promote'}
                          </button>
                          <button
                            style={{ ...styles.actionBtn, color: '#c0392b' }}
                            onClick={() => deleteUser(u.sub, u.email)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f5f6fa',
    padding: '32px 24px',
  },
  container: {
    maxWidth: '1100px',
    margin: '0 auto',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '24px',
    gap: '16px',
    flexWrap: 'wrap',
  },
  title: {
    margin: 0,
    fontSize: '22px',
    fontWeight: '700',
    color: '#1a1a2e',
  },
  searchInput: {
    padding: '9px 14px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    minWidth: '260px',
  },
  tableWrapper: {
    background: '#fff',
    borderRadius: '12px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    overflow: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  thead: {
    background: '#f8f9fb',
  },
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    borderBottom: '1px solid #f0f0f0',
  },
  tr: {
    borderBottom: '1px solid #f5f5f5',
  },
  td: {
    padding: '14px 16px',
    fontSize: '14px',
    color: '#333',
    verticalAlign: 'middle',
  },
  badgeAdmin: {
    display: 'inline-block',
    padding: '2px 10px',
    background: '#4f46e5',
    color: '#fff',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '600',
  },
  badgeUser: {
    display: 'inline-block',
    padding: '2px 10px',
    background: '#e5e7eb',
    color: '#555',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '600',
  },
  statusEnabled: {
    display: 'inline-block',
    padding: '2px 10px',
    background: '#f0fff4',
    color: '#276749',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '600',
    border: '1px solid #9ae6b4',
  },
  statusDisabled: {
    display: 'inline-block',
    padding: '2px 10px',
    background: '#fff0f0',
    color: '#c0392b',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '600',
    border: '1px solid #f5c6cb',
  },
  actions: {
    display: 'flex',
    gap: '8px',
  },
  actionBtn: {
    padding: '5px 12px',
    background: 'none',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '12px',
    color: '#4f46e5',
    cursor: 'pointer',
    fontWeight: '500',
  },
  center: {
    textAlign: 'center',
    padding: '60px',
    color: '#888',
    fontSize: '14px',
  },
  empty: {
    textAlign: 'center',
    padding: '40px',
    color: '#aaa',
    fontSize: '14px',
  },
};

export default AdminUsersPage;
