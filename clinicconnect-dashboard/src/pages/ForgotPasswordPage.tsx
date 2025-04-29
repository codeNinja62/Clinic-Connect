// src/pages/ForgotPasswordPage.tsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth } from '../firebaseConfig'; // Your Firebase auth instance
import { sendPasswordResetEmail } from 'firebase/auth';
import type { FirebaseError } from 'firebase/app';

const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handlePasswordReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setLoading(true);

    if (!email) {
      setError("Please enter your email address.");
      setLoading(false);
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      setMessage(`Password reset email sent to ${email}. Please check your inbox (and spam folder).`);
      setLoading(false);
      // Optionally, redirect after a delay or leave the user on the page
      // setTimeout(() => navigate('/login'), 5000); 
    } catch (e: unknown) {
      setLoading(false);
      let displayErrorMessage = "An unexpected error occurred. Please try again.";
      if (e && typeof e === 'object' && 'code' in e) {
        const firebaseError = e as FirebaseError;
        console.error("Firebase password reset error:", firebaseError.code, firebaseError.message);
        switch (firebaseError.code) {
          case 'auth/invalid-email':
            displayErrorMessage = "The email address is not valid.";
            break;
          case 'auth/user-not-found':
            displayErrorMessage = "No user found with this email address. Please check the email or sign up.";
            break;
          // Add other specific error codes as needed
          default:
            displayErrorMessage = firebaseError.message || `Failed to send reset email. Error: ${firebaseError.code}`;
        }
      } else if (e instanceof Error) {
        console.error("Generic password reset error:", e.message);
        displayErrorMessage = e.message;
      } else {
        console.error("Unknown password reset error:", e);
      }
      setError(displayErrorMessage);
    }
  };

  // Reusing styles from LoginPage for consistency
  const pageStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '2rem',
    backgroundColor: 'var(--color-background-grey)'
  };

  const formContainerStyle: React.CSSProperties = {
    backgroundColor: 'var(--color-background-light)',
    padding: '2rem 2.5rem',
    borderRadius: 'var(--border-radius)',
    boxShadow: 'var(--box-shadow-lg)',
    width: '100%',
    maxWidth: '420px',
  };
  
  const inputGroupStyle: React.CSSProperties = {
    marginBottom: '1.25rem'
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '0.5rem',
    fontWeight: 500,
    color: 'var(--color-text-dark)'
  };

  return (
    <div style={pageStyle}>
      <div style={formContainerStyle}>
        <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'var(--color-primary)' }}>
          Reset Your Password
        </h2>
        <p style={{textAlign: 'center', color: 'var(--color-text-muted)', marginBottom: '2rem', fontSize: '0.95rem'}}>
          Enter the email address associated with your account, and we'll send you a link to reset your password.
        </p>
        <form onSubmit={handlePasswordReset}>
          <div style={inputGroupStyle}>
            <label htmlFor="email" style={labelStyle}>Email Address</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="your.email@example.com"
            />
          </div>
          
          {message && <p style={{ color: 'var(--color-success)', textAlign: 'center', marginBottom: '1rem', fontSize: '0.9rem', backgroundColor: 'var(--color-success-light, #d1e7dd)', padding: '0.75rem', borderRadius: 'var(--border-radius-sm)' }}>{message}</p>}
          {error && <p style={{ color: 'var(--color-error)', textAlign: 'center', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</p>}
          
          <button 
            type="submit" 
            disabled={loading} 
            className="btn-primary" // Using primary button style
            style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', marginTop: '0.5rem' }}
          >
            {loading ? 'Sending Email...' : 'Send Password Reset Email'}
          </button>
        </form>
        <p style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.9rem' }}>
          Remember your password? <Link to="/login" style={{color: 'var(--color-accent)', fontWeight: 500}}>Login here</Link>
        </p>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
