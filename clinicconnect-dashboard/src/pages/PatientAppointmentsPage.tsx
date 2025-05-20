// src/pages/PatientAppointmentsPage.tsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp, // Ensure Timestamp is imported as a value
  // doc, // Not used if cancellation is via Cloud Function
  // runTransaction // Not used if cancellation is via Cloud Function
} from 'firebase/firestore';
import type {
    DocumentData,
    QuerySnapshot,
    QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db, functions } from '../firebaseConfig'; // 'functions' for httpsCallable
import { httpsCallable } from 'firebase/functions'; // For calling Cloud Functions
import type { HttpsCallableResult } from 'firebase/functions';
// import type { FirebaseError } from 'firebase/app'; // Not explicitly used here, but good for general error typing

// Appointment interface, should be consistent or from a shared types file
export interface Appointment {
  id: string;
  appointmentDateTime: Timestamp;
  appointmentEndTime?: Timestamp;
  patientUid: string;
  clinicId: string;
  clinicName?: string | null;
  clinicAddressShort?: string | null; // Added based on your previous version
  doctorId?: string | null;
  doctorName?: string | null;
  durationMinutes?: number;
  reasonForVisit?: string | null;
  status: AppointmentStatus;
  isTelemedicine?: boolean;
  cancellationReason?: string | null;
  visitSummaryForPatient?: string | null; // Field for patient-visible summary
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type AppointmentStatus =
  | 'confirmed'
  | 'pending_clinic_approval'
  | 'cancelled_by_patient'
  | 'cancelled_by_clinic'
  | 'completed'
  | 'no_show'
  | 'unknown';

// Types for the Cloud Function call
interface CancelAppointmentPayload {
  appointmentId: string;
  reason?: string;
}
interface CancelAppointmentResponse {
  success: boolean;
  message: string;
}
interface CallableError extends Error { // For HttpsError from Cloud Function
  code: string;
  details?: unknown;
}

const PatientAppointmentsPage: React.FC = () => {
  const { currentUser, userProfile, loadingAuth, loadingProfile } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState<true>(true); // Default to true
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming');

  const mapFirestoreDataToAppointment = useCallback((docSnapshot: QueryDocumentSnapshot<DocumentData>): Appointment => {
    const data = docSnapshot.data();
    const statusString = typeof data.status === 'string' ? data.status : 'unknown';
    const validStatuses: AppointmentStatus[] = ['confirmed', 'pending_clinic_approval', 'cancelled_by_patient', 'cancelled_by_clinic', 'completed', 'no_show', 'unknown'];
    const finalStatus: AppointmentStatus = validStatuses.includes(statusString as AppointmentStatus) ? statusString as AppointmentStatus : 'unknown';
    
    const ensureTimestamp = (field: any, defaultVal?: Timestamp): Timestamp => {
        if (field instanceof Timestamp) return field;
        // If a default is provided and field is missing/invalid, use default. Otherwise, use epoch.
        return defaultVal || Timestamp.fromDate(new Date(0)); 
    };

    return {
      id: docSnapshot.id,
      appointmentDateTime: ensureTimestamp(data.appointmentDateTime),
      appointmentEndTime: data.appointmentEndTime instanceof Timestamp ? data.appointmentEndTime : undefined,
      patientUid: data.patientUid, 
      clinicId: data.clinicId || 'unknown_clinic_id',
      clinicName: data.clinicName || null,
      clinicAddressShort: data.clinicAddressShort || null,
      doctorId: data.doctorId || null,
      doctorName: data.doctorName || null,
      durationMinutes: typeof data.durationMinutes === 'number' ? data.durationMinutes : undefined,
      reasonForVisit: data.reasonForVisit || null,
      status: finalStatus,
      isTelemedicine: typeof data.isTelemedicine === 'boolean' ? data.isTelemedicine : false,
      cancellationReason: data.cancellationReason || null,
      visitSummaryForPatient: data.visitSummaryForPatient || null, // Map the new field
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt : undefined,
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : undefined,
    };
  }, []);


  const fetchAppointments = useCallback(async () => {
    if (!currentUser?.uid) { // Check currentUser.uid directly
      setError("Please log in to view your appointments.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const appointmentsRef = collection(db, 'appointments');
      const queryConstraints: any[] = [ // Use any[] for queryConstraints if type becomes complex
        where('patientUid', '==', currentUser.uid)
      ];

      const now = Timestamp.now();
      let orderByDirection: 'asc' | 'desc' = 'asc';

      if (filter === 'upcoming') {
        queryConstraints.push(where('appointmentDateTime', '>=', now));
        orderByDirection = 'asc';
      } else if (filter === 'past') {
        queryConstraints.push(where('appointmentDateTime', '<', now));
        orderByDirection = 'desc';
      } else { // 'all'
         orderByDirection = 'desc'; 
      }
      queryConstraints.push(orderBy('appointmentDateTime', orderByDirection));
      
      const q = query(appointmentsRef, ...queryConstraints);
      const querySnapshot: QuerySnapshot<DocumentData> = await getDocs(q);
      const fetchedAppointments = querySnapshot.docs.map(mapFirestoreDataToAppointment);
      setAppointments(fetchedAppointments);
    } catch (err) {
      console.error("Error fetching patient appointments:", err);
      setError("Failed to fetch appointments. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, filter, mapFirestoreDataToAppointment]);

  useEffect(() => {
    if (!loadingAuth && !loadingProfile && currentUser) {
      fetchAppointments();
    } else if (!loadingAuth && !loadingProfile && !currentUser) {
        setError("You need to be logged in to see your appointments.");
        setIsLoading(false);
    }
  }, [currentUser, loadingAuth, loadingProfile, fetchAppointments]);

  const handleCancelAppointment = async (appointmentId: string) => {
    const appointmentToCancel = appointments.find(appt => appt.id === appointmentId);
    if (!appointmentToCancel) return;

    const now = new Date().getTime();
    const apptTime = appointmentToCancel.appointmentDateTime.toDate().getTime();
    const oneHourInMillis = 1 * 60 * 60 * 1000;

    if (apptTime - now < oneHourInMillis && (appointmentToCancel.status === 'confirmed' || appointmentToCancel.status === 'pending_clinic_approval')) {
        alert("This appointment is too soon to cancel online (less than 1 hour prior). Please contact the clinic directly if you need to make changes.");
        return;
    }

    const reason = window.prompt("Please provide a brief reason for cancellation (optional):");
    if (reason === null) { 
        return; // User pressed cancel on the prompt
    }

    setCancellingId(appointmentId);
    setError(null); // Clear previous errors
    try {
        const cancelFunction = httpsCallable<CancelAppointmentPayload, CancelAppointmentResponse>(functions, 'cancelPatientAppointment');
        const result: HttpsCallableResult<CancelAppointmentResponse> = await cancelFunction({ appointmentId, reason: reason || undefined });

        if (result.data.success) {
            // Optimistically update UI or re-fetch
            setAppointments(prev => prev.map(appt => 
                appt.id === appointmentId 
                ? { ...appt, status: 'cancelled_by_patient', cancellationReason: reason || "Cancelled by patient" } 
                : appt
            ));
            alert(result.data.message || "Appointment cancelled successfully.");
        } else {
            throw new Error(result.data.message || "Failed to cancel appointment via function.");
        }
    } catch (e: unknown) {
        console.error("Error cancelling appointment via Cloud Function:", e);
        let errorMessage = "Could not cancel appointment.";
         if (e && typeof e === 'object' && 'message' in e) {
            const callableError = e as CallableError; // HttpsError from Firebase
            errorMessage = callableError.message || "An unknown error occurred during cancellation.";
            if (callableError.details && typeof (callableError.details as any).message === 'string') {
                errorMessage += ` Details: ${(callableError.details as any).message}`;
            } else if (typeof callableError.details === 'string') {
                errorMessage += ` Details: ${callableError.details}`;
            }
        } else if (e instanceof Error) {
            errorMessage = e.message;
        }
        setError(errorMessage);
        alert(`Error: ${errorMessage}`);
    } finally {
        setCancellingId(null);
    }
  };

  const getStatusBadgeStyle = (status: AppointmentStatus): React.CSSProperties => {
    let backgroundColor = 'var(--color-text-muted)';
    let color = 'var(--color-text-light)';
    switch (status) {
        case 'confirmed': backgroundColor = 'var(--color-success)'; break;
        case 'pending_clinic_approval': backgroundColor = 'var(--color-warning)'; color = 'var(--color-text-on-warning)'; break;
        case 'cancelled_by_patient':
        case 'cancelled_by_clinic': backgroundColor = 'var(--color-error)'; break;
        case 'completed': backgroundColor = 'var(--color-primary)'; break;
        case 'no_show': backgroundColor = 'var(--color-secondary)'; break;
    }
    return {
        color, backgroundColor, padding: '0.3em 0.65em', borderRadius: 'var(--border-radius)',
        fontSize: '0.8rem', fontWeight: 500, textTransform: 'capitalize',
        display: 'inline-block', minWidth: '110px', textAlign: 'center', whiteSpace: 'nowrap',
    };
  };

  // --- Styles ---
  const pageContainerStyle: React.CSSProperties = { padding: '2rem', maxWidth: '1000px', margin: '0 auto' };
  const headerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' };
  const filterContainerStyle: React.CSSProperties = { marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' };
  const cardStyle: React.CSSProperties = { backgroundColor: 'var(--color-background-card)', borderRadius: 'var(--border-radius-lg)', padding: '1.5rem', marginBottom: '1.5rem', boxShadow: 'var(--shadow-md)' };
  const cardTitleStyle: React.CSSProperties = { marginTop: 0, marginBottom: '0.5rem', color: 'var(--color-primary-dark)', fontSize: '1.2rem' };
  const cardDetailStyle: React.CSSProperties = { margin: '0.3rem 0', fontSize: '0.95rem', color: 'var(--color-text-secondary)' };
  const summarySectionStyle: React.CSSProperties = {
    marginTop: '1rem',
    paddingTop: '1rem',
    borderTop: '1px dashed var(--border-color-input)',
  };
  const summaryTitleStyle: React.CSSProperties = {
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    marginBottom: '0.5rem',
  };
  const summaryTextStyle: React.CSSProperties = {
    fontSize: '0.9rem',
    color: 'var(--color-text-secondary)',
    whiteSpace: 'pre-wrap', 
    lineHeight: 1.6,
  };


  if (loadingAuth || loadingProfile || isLoading) {
    return <div style={{...pageContainerStyle, textAlign: 'center', paddingTop: '3rem'}}>Loading your appointments...</div>;
  }

  return (
    <div style={pageContainerStyle}>
      <header style={headerStyle}>
        <h1 style={{ margin: 0, color: 'var(--color-primary)' }}>My Appointments</h1>
        <Link to="/find-care" className="btn btn-outline-primary">Book New Appointment</Link>
      </header>

      <div style={filterContainerStyle}>
        <label htmlFor="appointmentFilter" style={{fontWeight: 500, marginRight: '0.5rem'}}>Show:</label>
        <select 
            id="appointmentFilter"
            value={filter} 
            onChange={(e) => setFilter(e.target.value as 'upcoming' | 'past' | 'all')}
            style={{padding: '0.5rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color-input)'}}
        >
          <option value="upcoming">Upcoming</option>
          <option value="past">Past</option>
          <option value="all">All</option>
        </select>
      </div>

      {error && <div className="alert alert-danger" style={{marginBottom: '1.5rem'}}>{error}</div>}

      {appointments.length === 0 && !isLoading && (
        <div className="card text-center" style={{padding: '2rem'}}>
            <p style={{fontSize: '1.1rem', color: 'var(--color-text-muted)'}}>
                You have no {filter !== 'all' ? filter : ''} appointments.
            </p>
        </div>
      )}

      {appointments.map((appt) => (
        <div key={appt.id} style={cardStyle}>
          <h3 style={cardTitleStyle}>
            {appt.clinicName || `Clinic ID: ${appt.clinicId.substring(0,10)}...`}
          </h3>
          <p style={cardDetailStyle}>
            <strong>Date & Time:</strong> {appt.appointmentDateTime.toDate().toLocaleString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Karachi' })}
          </p>
          {appt.doctorName && <p style={cardDetailStyle}><strong>Doctor:</strong> {appt.doctorName}</p>}
          {appt.reasonForVisit && <p style={cardDetailStyle}><strong>Reason:</strong> {appt.reasonForVisit}</p>}
          <p style={cardDetailStyle}>
            <strong>Status:</strong> <span style={getStatusBadgeStyle(appt.status)}>{appt.status.replace(/_/g, ' ')}</span>
          </p>
          {appt.cancellationReason && (appt.status === 'cancelled_by_clinic' || appt.status === 'cancelled_by_patient') && (
            <p style={{...cardDetailStyle, color: 'var(--color-error-dark, var(--color-error))', fontSize: '0.85rem'}}>
                <strong>Cancellation Reason:</strong> {appt.cancellationReason}
            </p>
          )}

          {/* Display Visit Summary for Completed Appointments */}
          {appt.status === 'completed' && appt.visitSummaryForPatient && (
            <div style={summarySectionStyle}>
              <h4 style={summaryTitleStyle}>Visit Summary</h4>
              <p style={summaryTextStyle}>{appt.visitSummaryForPatient}</p>
            </div>
          )}

          {(appt.status === 'pending_clinic_approval' || appt.status === 'confirmed') && (
            <button
              onClick={() => handleCancelAppointment(appt.id)}
              disabled={cancellingId === appt.id}
              className="btn btn-danger btn-sm"
              style={{ marginTop: '1rem', alignSelf: 'flex-start' }}
            >
              {cancellingId === appt.id ? 'Cancelling...' : 'Cancel Appointment'}
            </button>
          )}
        </div>
      ))}
       <nav style={{ marginTop: '3rem', textAlign: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem', display: 'flex', justifyContent: 'center', gap: '2rem' }}>
        <Link to="/find-care" style={{color: 'var(--color-primary)', fontWeight: 500}}>Find Care</Link>
        <Link to="/my-profile" style={{color: 'var(--color-primary)', fontWeight: 500}}>My Profile</Link>
      </nav>
    </div>
  );
};

export default PatientAppointmentsPage;
