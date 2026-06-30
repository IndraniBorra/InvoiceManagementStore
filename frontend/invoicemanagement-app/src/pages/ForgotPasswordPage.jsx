import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { resetPassword } from 'aws-amplify/auth';

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await resetPassword({ username: email });
      setSent(true);
    } catch (err) {
      setError(err.message || 'Failed to send reset code. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>Check your email</h1>
          <p style={styles.subtitle}>
            We sent a 6-digit verification code to <strong>{email}</strong>.
            Enter it on the next page to set a new password.
          </p>
          <Link to={`/reset-password?email=${encodeURIComponent(email)}`} style={styles.button}>
            Enter verification code
          </Link>
          <p style={styles.footerText}>
            Didn't receive it? Check your spam folder or{' '}
            <button onClick={() => setSent(false)} style={styles.textButton}>
              try again
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Forgot password?</h1>
        <p style={styles.subtitle}>
          Enter your email and we'll send you a code to reset your password.
        </p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={styles.input}
              placeholder="you@example.com"
            />
          </div>

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Sending...' : 'Send reset code'}
          </button>
        </form>

        <p style={styles.footerText}>
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
    display: 'block',
    textAlign: 'center',
    textDecoration: 'none',
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
  textButton: {
    background: 'none',
    border: 'none',
    color: '#4f46e5',
    cursor: 'pointer',
    fontSize: '13px',
    padding: '0',
  },
};

export default ForgotPasswordPage;
