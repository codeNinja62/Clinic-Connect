// src/components/ProtectedRoute.tsx
import React from 'react';
import { Navigate, useLocation, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebaseConfig';
import { signOut } from 'firebase/auth';

interface ProtectedRouteProps {
  element: React.ReactElement;
  allowedRoles: string[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ element, allowedRoles }) => {
  const { currentUser, userProfile, loadingAuth, loadingProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (loadingAuth || loadingProfile) {
    return <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'var(--font-primary)', color: 'var(--color-primary)'}}>Authenticating & Loading Profile...</div>;
  }

  if (!currentUser) {
    console.log(`ProtectedRoute: No currentUser. Attempted path: ${location.pathname}. Redirecting to /login.`);
    return <Navigate to="/login" state={{ from: location, message: "Please login to continue." }} replace />;
  }

  if (!userProfile) {
    // This state (currentUser exists, but userProfile is null after loadingProfile is false)
    // indicates a problem with profile creation in Firestore or a severe fetching error.
    console.warn(`ProtectedRoute: User ${currentUser.uid} authenticated, but userProfile is null (and not loading). Path: ${location.pathname}. This is a critical issue.`);
    return (
        <div className="page-container" style={{ textAlign: 'center', paddingTop: '4rem' }}>
            <div className="card" style={{maxWidth: '500px', margin: 'auto'}}>
                <h3 style={{color: 'var(--color-error)'}}>User Profile Error</h3>
                <p>Your user profile could not be loaded. This may prevent access to the application.</p>
                <p>Please try logging out and signing in again. If the issue persists, contact support.</p>
                <button 
                  onClick={async () => {
                    try {
                      await signOut(auth);
                      navigate('/login', { state: { message: "Logged out due to profile error. Please try logging in." }, replace: true });
                    } catch (error) {
                      console.error("Error signing out from ProtectedRoute (profile error state):", error);
                      navigate('/login', { state: { message: "Error during logout. Please try logging in." }, replace: true });
                    }
                  }} 
                  className="btn btn-danger"
                  style={{marginTop: '1rem'}}
                >
                    Logout and Try Again
                </button>
            </div>
        </div>
    );
  }

  // At this point, currentUser and userProfile are expected to be available.
  console.log(`ProtectedRoute: Checking access for path "${location.pathname}". User role: "${userProfile.role}". Allowed roles: [${allowedRoles.join(', ')}].`);

  if (allowedRoles.includes(userProfile.role)) {
    console.log(`ProtectedRoute: Access GRANTED for role "${userProfile.role}" to path "${location.pathname}".`);
    return element;
  } else {
    console.warn(`ProtectedRoute: Access DENIED for role "${userProfile.role}" to path "${location.pathname}". Allowed: [${allowedRoles.join(', ')}].`);
    
    let redirectTo = "/login"; // Default fallback
    let accessDeniedMessage = `Your role (${userProfile.role.replace('_', ' ')}) does not permit access to this page.`;

    if (userProfile.role === 'patient') {
      redirectTo = "/find-care";
    } else if (userProfile.role === 'clinic_admin' || userProfile.role === 'doctor') {
      redirectTo = "/dashboard";
    }
    // If role is 'unknown' or unhandled, it will redirect to login, which is fine.

    return (
        <div className="page-container" style={{ textAlign: 'center', paddingTop: '4rem' }}>
            <div className="card" style={{maxWidth: '600px', margin: 'auto'}}>
                <h2 style={{color: 'var(--color-error)', marginBottom: '1rem'}}>Access Denied</h2>
                <p style={{fontSize: '1.1rem', color: 'var(--color-text-secondary)'}}>
                    You do not have permission to view the page at <strong>{location.pathname}</strong>.
                </p>
                <p style={{color: 'var(--color-text-muted)', marginBottom: '1.5rem'}}>
                    {accessDeniedMessage}
                    <br />
                    Required role(s): {allowedRoles.join(', ').replace(/_/g, ' ')}.
                </p>
                <Link to={redirectTo} className="btn btn-primary">
                    Go to Your Main Page
                </Link>
                <p style={{marginTop: '2rem'}}>
                    <button 
                        onClick={async () => {
                            try {
                                await signOut(auth);
                                navigate('/login', { replace: true, state: { message: "You have been logged out." } });
                            } catch (error) {
                                console.error("Error signing out from Access Denied page:", error);
                                navigate('/login', { replace: true, state: { message: "Error during logout. Please log in again." } });
                            }
                        }} 
                        className="btn btn-link" 
                        style={{fontSize: '0.9rem'}}
                    >
                        Logout and try a different account
                    </button>
                </p>
            </div>
        </div>
    );
  }
};

export default ProtectedRoute;