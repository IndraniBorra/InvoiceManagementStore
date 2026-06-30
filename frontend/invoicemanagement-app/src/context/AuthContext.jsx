import React, { createContext, useContext, useEffect, useState } from 'react';
import { Amplify } from 'aws-amplify';
import {
  signIn,
  signOut,
  getCurrentUser,
  fetchAuthSession,
  signUp as amplifySignUp,
  confirmSignUp as amplifyConfirmSignUp,
} from 'aws-amplify/auth';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: process.env.REACT_APP_COGNITO_POOL_ID,
      userPoolClientId: process.env.REACT_APP_COGNITO_CLIENT_ID,
    },
  },
});

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    _loadSession();
  }, []);

  async function _loadSession() {
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken;
      if (idToken) {
        const payload = idToken.payload;
        const userData = {
          sub: payload.sub,
          email: payload.email,
          name: payload.name || payload.email,
          groups: payload['cognito:groups'] || [],
        };
        setUser(userData);
        localStorage.setItem('authToken', idToken.toString());
      } else {
        setUser(null);
        localStorage.removeItem('authToken');
      }
    } catch {
      setUser(null);
      localStorage.removeItem('authToken');
    } finally {
      setLoading(false);
    }
  }

  async function login(email, password) {
    await signIn({ username: email, password });
    await _loadSession();
  }

  async function logout() {
    await signOut();
    setUser(null);
    localStorage.removeItem('authToken');
  }

  async function signUp(name, email, password) {
    await amplifySignUp({
      username: email,
      password,
      options: { userAttributes: { email, name } },
    });
  }

  async function confirmSignUp(email, code) {
    await amplifyConfirmSignUp({ username: email, confirmationCode: code });
  }

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    isAdmin: user?.groups?.includes('admin') ?? false,
    login,
    logout,
    signUp,
    confirmSignUp,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
