// src/pages/BookAppointmentPage.tsx
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { functions } from '../firebaseConfig';
import { httpsCallable } from 'firebase/functions';
import type { HttpsCallableResult } from 'firebase/functions';

// Types
interface AppointmentBookingState {
  doctorId: string;
  clinicId: string;
  selectedSlotDateTimeISO: string;
  doctorName?: string;
  clinicName?: string;
  durationMinutes?: number;
}

interface BookAppointmentPayload {
  clinicId: string;
  doctorId: string;
  appointmentDateTime: string;
  reasonForVisit?: string;
  durationMinutes?: number;
}

interface BookAppointmentResponse {
  success: boolean;
  appointmentId?: string;
  message: string;
}

interface CallableError extends Error {
  code: string;
  details?: unknown;
}

function isCallableError(error: unknown): error is CallableError {
  return error instanceof Error &&
         typeof (error as CallableError).code === 'string' &&
         typeof (error as CallableError).message === 'string';
}

// We'll use our CSS classes from the new design system


const BookAppointmentPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, loadingAuth } = useAuth();

  const [bookingDetails, setBookingDetails] = useState<AppointmentBookingState | null>(null);
  const [reasonForVisit, setReasonForVisit] = useState<string>('');
  const [isLoading, setIsLoadingState] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  useEffect(() => {
    if (location.state) {
      const state = location.state as AppointmentBookingState;
      if (!state.doctorId || !state.clinicId || !state.selectedSlotDateTimeISO) {
        setError("Booking information is incomplete. Please go back and select a doctor and time slot again.");
        setBookingDetails(null);
        return;
      }
      
      // Ensure consistent date format without 'Z' suffix to match Pakistan time (UTC+5)
      if (state.selectedSlotDateTimeISO.endsWith('Z')) {
        state.selectedSlotDateTimeISO = state.selectedSlotDateTimeISO.slice(0, -1);
        console.log('[DEBUG] useEffect: Removed Z suffix from date:', state.selectedSlotDateTimeISO);
      }
      
      setBookingDetails(state);
      console.log('[DEBUG] Appointment date/time set:', state.selectedSlotDateTimeISO);
    } else {
      setError("No booking information provided. Please start by finding care and selecting a slot.");
      setBookingDetails(null);
    }
  }, [location.state]);
  const handleBookingConfirmation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!bookingDetails || !currentUser) {
      setError("Cannot proceed with booking. Essential details or user session is missing. Please try again or re-login.");
      return;
    }

    setIsLoadingState(true);
    setError(null);
    setSuccessMessage(null);
    
    // Ensure date format is correct - double check for any 'Z' suffix
    let appointmentDateTime = bookingDetails.selectedSlotDateTimeISO;
    
    // Remove 'Z' suffix if it exists to ensure we're using Pakistan time (UTC+5)
    if (appointmentDateTime.endsWith('Z')) {
      appointmentDateTime = appointmentDateTime.slice(0, -1);
      console.log('[DEBUG] Removed Z suffix from date:', appointmentDateTime);
    }

    const payload: BookAppointmentPayload = {
      clinicId: bookingDetails.clinicId,
      doctorId: bookingDetails.doctorId,
      appointmentDateTime: appointmentDateTime,
      reasonForVisit: reasonForVisit.trim() || undefined,
      durationMinutes: bookingDetails.durationMinutes || 30,
    };    try {
      console.log('[DEBUG] Booking appointment with payload:', payload);
      const bookAppointmentFunction = httpsCallable<BookAppointmentPayload, BookAppointmentResponse>(functions, 'bookAppointment');
      const result: HttpsCallableResult<BookAppointmentResponse> = await bookAppointmentFunction(payload);

      if (result.data.success) {
        setSuccessMessage(result.data.message || "Appointment booked successfully!");
        setTimeout(() => {
          navigate('/my-appointments', {
            state: {
                newAppointmentId: result.data.appointmentId,
                successFlashMessage: "Your appointment has been successfully booked!"
            },
            replace: true
          });
        }, 2500);
      } else {
        setError(result.data.message || "Failed to book appointment. The slot may no longer be available.");
      }
    } catch (e: unknown) {
      console.error("Error calling bookAppointment function:", e);
      let errorMessage = "An unexpected error occurred while booking your appointment.";
      if (isCallableError(e)) {
        const details = e.details as Partial<{ message: string }>;
        errorMessage = (details && typeof details.message === 'string') ? `Booking Error: ${details.message} (Code: ${e.code})` : `Booking Error: ${e.message} (Code: ${e.code})`;
      } else if (e instanceof Error) {
        errorMessage = `System Error: ${e.message}`;
      }
      setError(errorMessage);
    } finally {
      setIsLoadingState(false);
    }
  };
  if (loadingAuth) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p className="loading-text mt-md">Verifying authentication...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location, message: "Please login to book an appointment." }} replace />;
  }

  if (!bookingDetails && !error) {
    return (
      <div className="loading-container">
        <div className="shimmer" style={{height: '50px', width: '200px', margin: '0 auto', borderRadius: 'var(--border-radius)'}}></div>
        <p className="loading-text mt-md">Preparing booking information...</p>
      </div>
    );
  }

  if (!bookingDetails && error) {
    return (
      <div className="form-page">
        <div className="card card-error">
          <div className="card-body text-center">
            <div className="text-error text-lg font-bold mb-md">Booking Error</div>
            <p className="p-md bg-error-light text-error rounded-md mb-lg">{error}</p>
            <Link to="/find-care" className="btn btn-primary">
              Return to Find Care
            </Link>
          </div>
        </div>
      </div>
    );
  }
  const confirmedBookingDetails = bookingDetails as AppointmentBookingState;
  return (
    <div className="form-page scale-in">
      <div className="card card-accent-top">
        <div className="card-body">
          <div className="mb-md">
            <button onClick={() => navigate(-1)} className="btn btn-link text-secondary">
                &larr; Change Slot or Doctor
            </button>
          </div>
          
          <h2 className="text-center font-bold text-xl mb-lg text-primary">Confirm Your Appointment</h2>

          <div className="card appointment-card mb-lg">
            <div className="appointment-info">
              <div className="appointment-date">
                <div className="appointment-month">{new Date(confirmedBookingDetails.selectedSlotDateTimeISO).toLocaleString('en-US', { month: 'short' })}</div>
                <div className="appointment-day">{new Date(confirmedBookingDetails.selectedSlotDateTimeISO).getDate()}</div>
              </div>
                <div className="appointment-details">
                <div className="appointment-time">
                  {new Date(confirmedBookingDetails.selectedSlotDateTimeISO).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                  {/* <span className="text-muted text-sm ml-xs">(Pakistan Time - UTC+5)</span> */}
                </div>
                <div className="appointment-doctor">{confirmedBookingDetails.doctorName || `ID: ${confirmedBookingDetails.doctorId}`}</div>
                {confirmedBookingDetails.clinicName && (
                  <div className="appointment-location">
                    <span>📍</span> {confirmedBookingDetails.clinicName}
                  </div>
                )}
                <div className="appointment-badge appointment-badge-pending">
                  {confirmedBookingDetails.durationMinutes || 30} min
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleBookingConfirmation} className="fade-in">
            <div className="form-group">
              <label htmlFor="reasonForVisit" className="form-label">
                Reason for Visit <span className="text-muted">(Optional)</span>
              </label>
              <textarea
                id="reasonForVisit"
                className="form-control"
                value={reasonForVisit}
                onChange={(e) => setReasonForVisit(e.target.value)}
                rows={4}
                placeholder="e.g., Annual checkup, fever, consultation..."
              />
            </div>

            {error && <div className="p-sm my-md bg-error-light text-error text-center rounded-md">{error}</div>}
            
            {successMessage && (
              <div className="p-sm my-md bg-success-light text-center rounded-md">
                <div className="font-medium text-success-dark">{successMessage}</div>
                <div className="text-sm mt-xs">Redirecting you to your appointments...</div>
              </div>
            )}

            <button
              type="submit"
              className={`btn ${successMessage ? 'btn-success' : 'btn-primary'} btn-lg btn-block ${isLoading ? 'btn-loading' : ''}`}
              disabled={isLoading || !!successMessage}
            >
              {isLoading ? 'Processing Booking...' : (successMessage ? 'Appointment Confirmed!' : 'Confirm & Book Appointment')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default BookAppointmentPage;