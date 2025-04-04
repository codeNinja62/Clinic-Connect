// src/components/InitialRouteHandler.tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const InitialRouteHandler: React.FC = () => {
  const { currentUser, userProfile, loadingAuth, loadingProfile } = useAuth();
  const location = useLocation();

  if (loadingAuth || loadingProfile) {
    return <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'var(--font-primary)', color: 'var(--color-primary)'}}>Loading Application...</div>;
  }

  if (currentUser && userProfile) {
    // User is logged in and profile is loaded
    const intendedPath = (location.state as { from?: Location })?.from?.pathname || null;
    console.log(`InitialRouteHandler: User authenticated. Role: "${userProfile.role}". Intended path: ${intendedPath}`);

    if (userProfile.role === 'clinic_admin' || userProfile.role === 'doctor') {
      console.log(`InitialRouteHandler: Redirecting staff to "${intendedPath || "/dashboard"}"`);
      return <Navigate to={intendedPath || "/dashboard"} replace />;
    } else if (userProfile.role === 'patient') {
      console.log(`InitialRouteHandler: Redirecting patient to "${intendedPath || "/find-care"}"`);
      return <Navigate to={intendedPath || "/find-care"} replace />;
    } else {
      // Handles 'unknown' role or any other unassigned role
      console.warn(`InitialRouteHandler: Role is "${userProfile.role}". Redirecting to /login due to unhandled role.`);
      return <Navigate to="/login" state={{ from: location, error: "Your account role is not properly configured or recognized. Please login again or contact support." }} replace />;
    }
  } else {
    // No user logged in, or profile somehow didn't load despite auth (should be handled by loadingProfile mostly)
    console.log(`InitialRouteHandler: No currentUser or userProfile. Redirecting to /login. currentUser: ${!!currentUser}, userProfile: ${!!userProfile}`);
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
};

export default InitialRouteHandler;