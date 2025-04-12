// src/pages/SignupPage.tsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth } from '../firebaseConfig'; 
import { createUserWithEmailAndPassword } from 'firebase/auth';
import type { FirebaseError } from 'firebase/app';

const SignupPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password should be at least 6 characters long.");
      return;
    }
    
    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      console.log("User signed up successfully:", userCredential.user.uid);
      // User is automatically signed in. AuthContext will pick this up.
      // createNewUserDocument Cloud Function will trigger.
      navigate('/', { replace: true }); // Navigate to root, InitialRouteHandler will direct
    } catch (e: unknown) {
      setLoading(false);
      let displayErrorMessage = "An unexpected error occurred during signup. Please try again.";
      
      if (e && typeof e === 'object' && 'code' in e) {
        const firebaseError = e as FirebaseError;
        console.error("Firebase signup error:", firebaseError.code, firebaseError.message);

        switch (firebaseError.code) {
          case 'auth/email-already-in-use':
            displayErrorMessage = "This email address is already in use. Please try logging in or use a different email.";
            break;
          case 'auth/invalid-email':
            displayErrorMessage = "The email address is not valid.";
            break;
          case 'auth/weak-password':
            displayErrorMessage = "The password is too weak. Please choose a stronger password (at least 6 characters).";
            break;
          default:
            displayErrorMessage = firebaseError.message || `Signup failed. Error: ${firebaseError.code}`;
        }
      } else if (e instanceof Error) {
        console.error("Generic signup error:", e.message);
        displayErrorMessage = e.message;
      } else {
        console.error("Unknown signup error:", e);
      }
      setError(displayErrorMessage);
    }
  };
  return (
    <div className="auth-layout">
      <div className="auth-image" style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?q=80&w=1600&auto=format&fit=crop")' }}>
        <div className="auth-image-overlay"></div>
      </div>
      <div className="auth-form scale-in">
        <div className="auth-form-inner">
          <div className="mb-xl text-center">
            <div className="app-logo-text mx-auto mb-md">ClinicConnect</div>
            <h1 className="text-2xl font-bold mb-xs">Create Account</h1>
            <p className="text-muted">Join ClinicConnect for better healthcare access</p>
          </div>
          
          <div className="card">
            <div className="card-body">
              <form onSubmit={handleSignup}>
                <div className="form-group">
                  <label htmlFor="email" className="form-label">Email Address</label>
                  <input
                    type="email"
                    id="email"
                    className="form-control"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="your.email@example.com"
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="password" className="form-label">Password</label>
                  <input
                    type="password"
                    id="password"
                    className="form-control"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder="Choose a strong password (min. 6 characters)"
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="confirmPassword" className="form-label">Confirm Password</label>
                  <input
                    type="password"
                    id="confirmPassword"
                    className="form-control"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder="Re-enter your password"
                  />
                </div>
                
                {error && <div className="p-sm my-sm bg-error-light text-error text-center rounded-md">{error}</div>}
                
                <button 
                  type="submit" 
                  className={`btn btn-success btn-block ${loading ? 'btn-loading' : ''}`}
                  disabled={loading}
                >
                  {loading ? 'Creating Account...' : 'Create Account'}
                </button>
                
                <div className="mt-lg text-center">
                  <p>
                    Already have an account? <Link to="/login" className="text-primary font-medium hover:underline">Sign In</Link>
                  </p>
                </div>
              </form>
            </div>
          </div>
            <p className="text-center text-muted mt-lg text-sm">
            &copy; {new Date().getFullYear()} ClinicConnect | All rights reserved
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;