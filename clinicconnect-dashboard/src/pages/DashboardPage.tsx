// src/pages/DashboardPage.tsx
import React from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { auth } from '../firebaseConfig';
import { signOut } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
// No direct import of DocumentData or Timestamp needed in this file itself if AuthContext handles it.

// Using our CSS classes from our design system instead of inline styles


const DashboardPage: React.FC = () => {
  const { currentUser, userProfile, loadingAuth, loadingProfile } = useAuth();
  const navigate = useNavigate();
  // No state needed for hover effects as we're using CSS classes


  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login', {replace: true});
    } catch (error) {
      console.error("Error logging out:", error);
      // Handle logout error display if necessary
    }
  };
  if (loadingAuth || loadingProfile) {
    return (
      <div className="page-container loading-container">
        <div className="loading-spinner"></div>
        <p className="loading-text mt-md">Loading user data...</p>
      </div>
    );
  }

  if (!currentUser) { 
      return <Navigate to="/login" replace />;
  }
  
  if (!userProfile) {
      return (
        <div className="page-container text-center py-2xl">
          <div className="card error-card mx-auto" style={{maxWidth: '500px'}}>
            <div className="card-body">
              <div className="text-error mb-md">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
              </div>
              <h3 className="card-title text-error">Profile Error</h3>
              <p className="mb-md">Your user profile is not available or couldn't be loaded. This might be due to an incomplete signup or a temporary issue.</p>
              <p className="mb-lg">Please try logging out and back in. If the problem persists, contact support.</p>
              <button 
                onClick={handleLogout} 
                className="btn btn-danger"
              >
                Logout and Retry Login
              </button>
            </div>
          </div>
        </div>
      );
  }

  const isStaff = userProfile.role === 'clinic_admin' || userProfile.role === 'doctor';

  return (
    <div className="page-container">
      <header className="page-header">
        <h1 className="page-title">ClinicConnect Dashboard</h1>
        <div className="user-menu">
          <span className="username">{userProfile.profile?.displayName || userProfile.email}</span>
          <button
            onClick={handleLogout}
            className="btn btn-secondary btn-sm"
          >
            Logout
          </button>
        </div>
      </header>
      
      <section className="dashboard-welcome">
        <h2 className="dashboard-welcome-title">
          Welcome, {userProfile.profile?.displayName || userProfile.email || currentUser.email}!
        </h2>
        <p className="text-lg mb-sm">
          Your Role: <span className="badge badge-accent">{userProfile.role.replace('_', ' ')}</span>
        </p>

        {userProfile.role === 'clinic_admin' && userProfile.adminSpecificData?.managesClinicId && (
          <div className="info-badge">
            <span className="info-badge-label">Managing Clinic:</span>
            <span className="info-badge-value">{userProfile.adminSpecificData.managesClinicId}</span>
          </div>
        )}
        {userProfile.role === 'doctor' && userProfile.doctorSpecificData?.linkedClinicIds && userProfile.doctorSpecificData.linkedClinicIds.length > 0 && (
          <div className="info-badge">
            <span className="info-badge-label">Associated Clinics:</span>
            <span className="info-badge-value">{userProfile.doctorSpecificData.linkedClinicIds.join(', ')}</span>
          </div>
        )}
      </section>

      {isStaff && (
        <section className="dashboard-section slide-up">
          <h3 className="section-title">Staff Menu</h3>
          <div className="menu-cards">
            <Link to="/dashboard/appointments" className="menu-card">
              <div className="menu-card-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
              </div>
              <div className="menu-card-body">
                <h4 className="menu-card-title">Appointments</h4>
                <p className="menu-card-text">View and manage appointments</p>
              </div>
            </Link>
            
            {userProfile.role === 'clinic_admin' && (
              <div className="menu-card menu-card-disabled">
                <div className="menu-card-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </div>
                <div className="menu-card-body">
                  <h4 className="menu-card-title">Clinic Settings</h4>
                  <p className="menu-card-text">Coming soon</p>
                  <span className="badge badge-pill badge-outline-primary">Coming Soon</span>
                </div>
              </div>
            )}
            
            {userProfile.role === 'doctor' && (
              <div className="menu-card menu-card-disabled">
                <div className="menu-card-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                </div>
                <div className="menu-card-body">
                  <h4 className="menu-card-title">My Schedule</h4>
                  <p className="menu-card-text">Coming soon</p>
                  <span className="badge badge-pill badge-outline-primary">Coming Soon</span>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {!isStaff && userProfile.role === 'patient' && (
        <section className="dashboard-section slide-up">
          <h3 className="section-title">Patient Menu</h3>
          <div className="menu-cards">
            <Link to="/find-care" className="menu-card">
              <div className="menu-card-icon text-primary">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </div>
              <div className="menu-card-body">
                <h4 className="menu-card-title">Find Care</h4>
                <p className="menu-card-text">Find doctors and book appointments</p>
              </div>
            </Link>
            
            <Link to="/my-appointments" className="menu-card">
              <div className="menu-card-icon text-secondary">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
              </div>
              <div className="menu-card-body">
                <h4 className="menu-card-title">My Appointments</h4>
                <p className="menu-card-text">View and manage your appointments</p>
              </div>
            </Link>
            
            <Link to="/my-profile" className="menu-card">
              <div className="menu-card-icon text-tertiary">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
              </div>
              <div className="menu-card-body">
                <h4 className="menu-card-title">My Profile</h4>
                <p className="menu-card-text">Manage your personal information</p>
              </div>
            </Link>
          </div>
        </section>      )}
      
      <footer className="dashboard-footer mt-2xl">
        <p className="text-center text-muted">&copy; {new Date().getFullYear()} ClinicConnect | All rights reserved</p>
      </footer>
    </div>
  );
};

export default DashboardPage;