// src/App.tsx
import React from 'react'; // Added React for JSX in NotFoundPage
import { Routes, Route, Link } from 'react-router-dom'; // Added Link for NotFoundPage
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import DashboardPage from './pages/DashboardPage';
import AppointmentsPage from './pages/AppointmentsPage'; // Staff appointments page
import ProtectedRoute from './components/ProtectedRoute';
import InitialRouteHandler from './components/InitialRouteHandler';
import ForgotPasswordPage from './pages/ForgotPasswordPage'; // Import the Forgot Password page

// Patient Pages
import FindCarePage from './pages/FindCarePage';
import PatientAppointmentsPage from './pages/PatientAppointmentsPage';
import PatientProfilePage from './pages/PatientProfilePage';
import ClinicDetailPage from './pages/ClinicDetailPage';
import DoctorProfileAvailabilityPage from './pages/DoctorProfileAvailabilityPage';
import BookAppointmentPage from './pages/BookAppointmentPage';

const staffRoles = ['clinic_admin', 'doctor'];
const patientRole = ['patient'];

// A simple NotFoundPage component
// For a larger application, this would typically be in its own file (e.g., src/pages/NotFoundPage.tsx)
const NotFoundPage: React.FC = () => {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '80vh', 
      textAlign: 'center',
      fontFamily: 'var(--font-primary)' 
    }}>
      <h1 style={{ fontSize: '3rem', color: 'var(--color-primary-dark)', marginBottom: '1rem' }}>404</h1>
      <h2 style={{ fontSize: '1.5rem', color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>Page Not Found</h2>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '2rem' }}>
        Sorry, the page you are looking for does not exist or may have been moved.
      </p>
      <Link to="/" className="btn btn-primary">
        Go to Homepage
      </Link>
    </div>
  );
};

function App() {
  return (
    <Routes>
      {/* Publicly accessible routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      {/* Staff Dashboard Routes - Protected */}
      <Route
        path="/dashboard"
        element={<ProtectedRoute element={<DashboardPage />} allowedRoles={staffRoles} />}
      />
      <Route
        path="/dashboard/appointments" 
        element={<ProtectedRoute element={<AppointmentsPage />} allowedRoles={staffRoles} />}
      />
      {/* Add other staff-specific protected routes here */}

      {/* Patient Routes - Protected */}
      <Route
        path="/find-care"
        element={<ProtectedRoute element={<FindCarePage />} allowedRoles={patientRole} />}
      />
      <Route
        path="/my-appointments"
        element={<ProtectedRoute element={<PatientAppointmentsPage />} allowedRoles={patientRole} />} 
      />
      <Route
        path="/my-profile"
        element={<ProtectedRoute element={<PatientProfilePage />} allowedRoles={patientRole} />}
      />
      <Route
        path="/clinic/:clinicId"
        element={<ProtectedRoute element={<ClinicDetailPage />} allowedRoles={patientRole} />}
      />
      <Route
        path="/doctor/:doctorId/availability"
        element={<ProtectedRoute element={<DoctorProfileAvailabilityPage />} allowedRoles={patientRole} />}
      />
      <Route
        path="/book-appointment"
        element={<ProtectedRoute element={<BookAppointmentPage />} allowedRoles={patientRole} />}
      />
      {/* Add other patient-specific protected routes here */}


      {/* Initial route handler - determines where to go based on auth status and role */}
      <Route path="/" element={<InitialRouteHandler />} />
      
      {/* Fallback for any other unmatched routes - now points to NotFoundPage */}
      <Route path="*" element={<NotFoundPage />} /> 
    </Routes>
  );
}

export default App;
