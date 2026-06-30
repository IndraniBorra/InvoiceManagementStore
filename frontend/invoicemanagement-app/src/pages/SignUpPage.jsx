import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../services/api';

function SignUpPage() {
  const { signUp, confirmSignUp } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRegister(e) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      await signUp(name, email, password);
      setStep(2);
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await confirmSignUp(email, code);
      // Auto-assign "user" role via backend
      await apiClient.post('/users/confirm-signup', { email });
      navigate('/login?signup=success');
    } catch (err) {
      setError(err.message || 'Verification failed. Please check your code.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>SmartInvoice</h1>

        {step === 1 ? (
          <>
            <p style={styles.subtitle}>Create your account</p>
            {error && <div style={styles.error}>{error}</div>}
            <form onSubmit={handleRegister} style={styles.form}>
              <div style={styles.field}>
                <label style={styles.label}>Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  style={styles.input}
                  placeholder="Jane Smith"
                />
              </div>
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
              <div style={styles.field}>
                <label style={styles.label}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  style={styles.input}
                  placeholder="Min 8 characters"
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  style={styles.input}
                  placeholder="••••••••"
                />
              </div>
              <button type="submit" disabled={loading} style={styles.button}>
                {loading ? 'Creating account...' : 'Create account'}
              </button>
            </form>
          </>
        ) : (
          <>
            <p style={styles.subtitle}>Check your email</p>
            <p style={styles.hint}>
              We sent a verification code to <strong>{email}</strong>. Enter it below to confirm your account.
            </p>
            {error && <div style={styles.error}>{error}</div>}
            <form onSubmit={handleVerify} style={styles.form}>
              <div style={styles.field}>
                <label style={styles.label}>Verification Code</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  autoComplete="one-time-code"
                  style={styles.input}
                  placeholder="123456"
                />
              </div>
              <button type="submit" disabled={loading} style={styles.button}>
                {loading ? 'Verifying...' : 'Verify email'}
              </button>
            </form>
            <p style={styles.resend}>
              Didn't receive it?{' '}
              <button
                style={styles.linkButton}
                onClick={() => setStep(1)}
              >
                Go back
              </button>
            </p>
          </>
        )}

        <p style={styles.footerLink}>
          Already have an account?{' '}
          <a href="/login" style={styles.link}>Sign in</a>
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
    margin: '0 0 20px',
    color: '#666',
    fontSize: '14px',
  },
  hint: {
    margin: '0 0 20px',
    color: '#555',
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
  resend: {
    marginTop: '14px',
    textAlign: 'center',
    fontSize: '13px',
    color: '#555',
  },
  linkButton: {
    background: 'none',
    border: 'none',
    color: '#4f46e5',
    cursor: 'pointer',
    fontSize: '13px',
    padding: 0,
  },
  footerLink: {
    marginTop: '20px',
    textAlign: 'center',
    fontSize: '13px',
    color: '#555',
  },
  link: {
    color: '#4f46e5',
    textDecoration: 'none',
  },
};

export default SignUpPage;
