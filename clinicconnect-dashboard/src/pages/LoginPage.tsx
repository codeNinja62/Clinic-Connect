// src/pages/LoginPage.tsx
import React, { useState, useEffect } from 'react'; // Import useEffect
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { auth } from '../firebaseConfig';
import { signInWithEmailAndPassword } from 'firebase/auth';
import type { FirebaseError } from 'firebase/app';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Use useEffect to check for messages/errors from location state when component mounts or location.state changes
  useEffect(() => {
    if (location.state?.message) {
      setError(location.state.message);
      // Clear the message from location state after displaying it to prevent re-showing on refresh
      navigate(location.pathname, { replace: true, state: { ...location.state, message: undefined } });
    }
    if (location.state?.error) {
      setError(location.state.error);
      // Clear the error from location state
      navigate(location.pathname, { replace: true, state: { ...location.state, error: undefined } });
    }
  }, [location.state, location.pathname, navigate]);


  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null); // Clear previous errors on new submission
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log("User logged in successfully:", userCredential.user.uid);
      // Navigate to root, InitialRouteHandler will direct.
      // Clear any location state that might have brought the user here (like an error message)
      navigate('/', { replace: true, state: {} });
    } catch (e: unknown) {
      setLoading(false);
      let displayErrorMessage = "An unexpected error occurred during login. Please try again.";
      
      if (e && typeof e === 'object' && 'code' in e) {
        const firebaseError = e as FirebaseError; 
        console.error("Firebase login error:", firebaseError.code, firebaseError.message);
        
        switch (firebaseError.code) {
          case 'auth/invalid-credential':
            displayErrorMessage = "Invalid email or password. Please check your credentials and try again.";
            break;
          case 'auth/user-not-found':
            displayErrorMessage = "No user found with this email address. Please check the email or sign up.";
            break;
          case 'auth/wrong-password':
             displayErrorMessage = "Invalid password. Please try again.";
            break;
          case 'auth/invalid-email':
            displayErrorMessage = "The email address is not valid. Please use a valid email format.";
            break;
          case 'auth/user-disabled':
            displayErrorMessage = "This account has been disabled. Please contact support.";
            break;
          case 'auth/too-many-requests':
            displayErrorMessage = "Access to this account has been temporarily disabled due to many failed login attempts. You can immediately restore it by resetting your password or you can try again later.";
            break;
          default:
            displayErrorMessage = firebaseError.message || `Login failed. Error: ${firebaseError.code}`;
        }
      } else if (e instanceof Error) {
        console.error("Generic login error:", e.message);
        displayErrorMessage = e.message;
      } else {
        console.error("Unknown login error:", e);
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
            <h1 className="text-2xl font-bold mb-xs">Welcome Back</h1>
            <p className="text-muted">Sign in to continue to your account</p>
          </div>
          
          <div className="card">
            <div className="card-body">
              <form onSubmit={handleLogin}>
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
                  <div className="flex justify-between items-center mb-xs">
                    <label htmlFor="password" className="form-label">Password</label>
                    <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                      Forgot Password?
                    </Link>
                  </div>
                  <input
                    type="password"
                    id="password"
                    className="form-control"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="Enter your password"
                  />
                </div>
                
                {error && <div className="p-sm my-sm bg-error-light text-error text-center rounded-md">{error}</div>}
                
                <button 
                  type="submit" 
                  className={`btn btn-primary btn-block ${loading ? 'btn-loading' : ''}`}
                  disabled={loading}
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
                
                <div className="mt-lg text-center">
                  <p>
                    Don't have an account? <Link to="/signup" className="text-primary font-medium hover:underline">Create account</Link>
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

export default LoginPage;
