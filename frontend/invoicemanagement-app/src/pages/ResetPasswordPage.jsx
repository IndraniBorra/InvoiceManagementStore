import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { confirmResetPassword } from 'aws-amplify/auth';

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const emailFromUrl = searchParams.get('email') || '';

  const [email, setEmail] = useState(emailFromUrl);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      await confirmResetPassword({
        username: email,
        confirmationCode: code,
        newPassword,
      });
      navigate('/login?reset=success');
    } catch (err) {
      setError(err.message || 'Failed to reset password. Please check your code and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Set new password</h1>
        <p style={styles.subtitle}>
          Enter the 6-digit code we sent to your email and choose a new password.
        </p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          {!emailFromUrl && (
            <div style={styles.field}>
              <label style={styles.label}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={styles.input}
                placeholder="you@example.com"
              />
            </div>
          )}

          <div style={styles.field}>
            <label style={styles.label}>Verification code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
              required
              maxLength={6}
              style={styles.input}
              placeholder="123456"
              autoComplete="one-time-code"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              style={styles.input}
              placeholder="Min. 8 characters"
              autoComplete="new-password"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              style={styles.input}
              placeholder="Repeat new password"
              autoComplete="new-password"
            />
          </div>

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Resetting...' : 'Reset password'}
          </button>
        </form>

        <p style={styles.footerText}>
          <Link to="/forgot-password" style={styles.link}>Resend code</Link>
          {' · '}
          <Link to="/login" style={styles.link}>Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f5f6fa',
  },
  card: {
    background: '#fff',
    borderRadius: '12px',
    boxShadow: '0 2px 16px rgba(0,0,0,0.10)',
    padding: '40px',
    width: '100%',
    maxWidth: '400px',
  },
  title: {
    margin: '0 0 4px',
    fontSize: '24px',
    fontWeight: '700',
    color: '#1a1a2e',
  },
  subtitle: {
    margin: '0 0 24px',
    color: '#666',
    fontSize: '14px',
    lineHeight: '1.5',
  },
  error: {
    background: '#fff0f0',
    color: '#c0392b',
    border: '1px solid #f5c6cb',
    borderRadius: '6px',
    padding: '10px 14px',
    marginBottom: '16px',
    fontSize: '14px',
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
  footerText: {
    marginTop: '20px',
    textAlign: 'center',
    fontSize: '13px',
    color: '#666',
  },
  link: {
    color: '#4f46e5',
    textDecoration: 'none',
  },
};

export default ResetPasswordPage;
