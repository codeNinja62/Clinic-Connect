// src/pages/AppointmentsPage.tsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
    collection,
    query,
    where,
    getDocs,
    orderBy,
    Timestamp // Import Timestamp as a value
} from 'firebase/firestore';
import type {
    DocumentData,
    QuerySnapshot,
    QueryDocumentSnapshot
} from 'firebase/firestore'; // Type-only imports for other Firestore types
import { db, functions } from '../firebaseConfig';
import { httpsCallable } from 'firebase/functions';
import type { HttpsCallableResult } from 'firebase/functions';
import type { FirebaseError } from 'firebase/app';

// Types (can be moved to a shared types file)
export type AppointmentStatus =
    | 'confirmed'
    | 'pending_clinic_approval'
    | 'cancelled_by_patient'
    | 'cancelled_by_clinic'
    | 'completed'
    | 'no_show'
    | 'unknown';

export interface Appointment {
  id: string;
  appointmentDateTime: Timestamp;
  appointmentEndTime?: Timestamp;
  patientUid: string;
  patientName?: string | null;
  patientPhoneNumber?: string | null;
  clinicId: string;
  clinicName?: string | null;
  doctorId?: string | null;
  doctorName?: string | null;
  durationMinutes?: number;
  reasonForVisit?: string | null;
  status: AppointmentStatus;
  bookingMethod?: string;
  bookedByUid?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  notes?: string | null;
  isTelemedicine?: boolean;
}

interface UpdateAppointmentStatusPayload {
  appointmentId: string;
  newStatus: AppointmentStatus;
  notes?: string;
}

interface UpdateAppointmentStatusResponse {
  success: boolean;
  message: string;
  updatedAppointment?: Appointment; // This might not be returned or used by client
}

interface CallableError extends Error {
  code: string;
  details?: unknown;
}

function isFirebaseError(error: unknown): error is FirebaseError {
  return error instanceof Error &&
         typeof (error as FirebaseError).code === 'string' &&
         typeof (error as FirebaseError).name === 'string';
}

function isCallableError(error: unknown): error is CallableError {
  return error instanceof Error &&
         typeof (error as CallableError).code === 'string' &&
         typeof (error as CallableError).message === 'string';
}


const AppointmentsPage: React.FC = () => {
  const { userProfile, loadingAuth, loadingProfile } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingStatusInfo, setUpdatingStatusInfo] = useState<{id: string, status: AppointmentStatus} | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('upcoming'); // Default filter

  const mapFirestoreDataToAppointment = useCallback((docSnapshot: QueryDocumentSnapshot<DocumentData>): Appointment => {
    const data = docSnapshot.data();
    const statusString = typeof data.status === 'string' ? data.status : 'unknown';
    const validStatuses: AppointmentStatus[] = ['confirmed', 'pending_clinic_approval', 'cancelled_by_patient', 'cancelled_by_clinic', 'completed', 'no_show', 'unknown'];
    const finalStatus: AppointmentStatus = validStatuses.includes(statusString as AppointmentStatus) ? statusString as AppointmentStatus : 'unknown';

    // Helper to ensure a field is a Timestamp or return a default/undefined
    const ensureTimestamp = (field: any, defaultVal: Timestamp | undefined = undefined): Timestamp | undefined => {
        return field instanceof Timestamp ? field : defaultVal;
    };
    const ensureTimestampNonNull = (field: any): Timestamp => {
        return field instanceof Timestamp ? field : Timestamp.fromDate(new Date(0)); // Default to epoch if critical and missing
    };


    return {
      id: docSnapshot.id,
      appointmentDateTime: ensureTimestampNonNull(data.appointmentDateTime),
      appointmentEndTime: ensureTimestamp(data.appointmentEndTime),
      patientUid: typeof data.patientUid === 'string' ? data.patientUid : 'unknown_patient_uid',
      patientName: typeof data.patientName === 'string' ? data.patientName : null,
      patientPhoneNumber: typeof data.patientPhoneNumber === 'string' ? data.patientPhoneNumber : null,
      clinicId: typeof data.clinicId === 'string' ? data.clinicId : 'unknown_clinic_id',
      clinicName: typeof data.clinicName === 'string' ? data.clinicName : null,
      doctorId: typeof data.doctorId === 'string' ? data.doctorId : null,
      doctorName: typeof data.doctorName === 'string' ? data.doctorName : null,
      durationMinutes: typeof data.durationMinutes === 'number' ? data.durationMinutes : undefined,
      reasonForVisit: typeof data.reasonForVisit === 'string' ? data.reasonForVisit : null,
      status: finalStatus,
      bookingMethod: typeof data.bookingMethod === 'string' ? data.bookingMethod : undefined,
      bookedByUid: typeof data.bookedByUid === 'string' ? data.bookedByUid : undefined,
      createdAt: ensureTimestamp(data.createdAt),
      updatedAt: ensureTimestamp(data.updatedAt),
      notes: typeof data.notes === 'string' ? data.notes : null,
      isTelemedicine: typeof data.isTelemedicine === 'boolean' ? data.isTelemedicine : undefined,
    };
  }, []);

  const fetchAppointmentsForStaff = useCallback(async () => {
    if (!userProfile || (userProfile.role !== 'clinic_admin' && userProfile.role !== 'doctor')) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    const appointmentsRef = collection(db, 'appointments');
    const queryConstraints: ReturnType<typeof where | typeof orderBy>[] = [];

    try {
      if (userProfile.role === 'clinic_admin') {
        const clinicId = userProfile.adminSpecificData?.managesClinicId;
        if (!clinicId) {
          setError("Admin's managed clinic ID not found in profile.");
          setIsLoading(false);
          return;
        }
        queryConstraints.push(where('clinicId', '==', clinicId));
      } else if (userProfile.role === 'doctor') {
        queryConstraints.push(where('doctorId', '==', userProfile.uid));
      }

      const now = Timestamp.now(); // This will now work
      let orderByDirection: 'asc' | 'desc' = 'asc';

      if (filterStatus === 'upcoming') {
        queryConstraints.push(where('appointmentDateTime', '>=', now));
        orderByDirection = 'asc';
      } else if (filterStatus === 'past') {
        queryConstraints.push(where('appointmentDateTime', '<', now));
        orderByDirection = 'desc';
      } else { // 'all'
        orderByDirection = 'desc'; // Default sort for 'all' can be most recent first
      }
      // Always order by appointmentDateTime
      queryConstraints.push(orderBy('appointmentDateTime', orderByDirection));
      
      const q = query(appointmentsRef, ...queryConstraints);
      const querySnapshot: QuerySnapshot<DocumentData> = await getDocs(q);
      const fetchedAppointments = querySnapshot.docs.map(mapFirestoreDataToAppointment);
      setAppointments(fetchedAppointments);

    } catch (err: unknown) {
      console.error("Error fetching staff appointments:", err);
      let specificErrorMessage = "Failed to fetch appointments. Please check Firestore rules or Indexes.";
       if (isFirebaseError(err)) {
        specificErrorMessage = `Firestore Error: ${err.message} (Code: ${err.code})`;
      } else if (err instanceof Error) {
        specificErrorMessage = err.message;
      }
      setError(specificErrorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [userProfile, filterStatus, mapFirestoreDataToAppointment]);

  const availableActions = useMemo(() => (currentStatus: AppointmentStatus): Array<{label: string, newStatus: AppointmentStatus, className?: string }> => {
    switch (currentStatus) {
        case 'pending_clinic_approval':
            return [
                { label: 'Confirm', newStatus: 'confirmed', className: 'btn-success btn-sm' },
                { label: 'Cancel (Clinic)', newStatus: 'cancelled_by_clinic', className: 'btn-danger btn-sm'  }
            ];
        case 'confirmed':
            return [
                { label: 'Mark Completed', newStatus: 'completed', className: 'btn-primary btn-sm'  },
                { label: 'Mark No-Show', newStatus: 'no_show', className: 'btn-secondary btn-sm' },
                { label: 'Cancel (Clinic)', newStatus: 'cancelled_by_clinic', className: 'btn-danger btn-sm'  }
            ];
        // Add case for 'checked_in' if needed
        // case 'checked_in':
        //     return [
        //         { label: 'Mark Completed', newStatus: 'completed', className: 'btn-primary btn-sm'  },
        //         { label: 'Mark No-Show', newStatus: 'no_show', className: 'btn-secondary btn-sm' },
        //     ];
        default:
            return [];
    }
  }, []);

  useEffect(() => {
    if (!loadingAuth && !loadingProfile && userProfile) {
      if (userProfile.role === 'clinic_admin' || userProfile.role === 'doctor') {
        fetchAppointmentsForStaff();
      } else {
        setError("Access denied. This page is for clinic staff.");
        setIsLoading(false);
      }
    } else if (!loadingAuth && !loadingProfile && !userProfile) {
      setError("User profile not loaded. Cannot determine staff role.");
      setIsLoading(false);
    }
  }, [userProfile, loadingAuth, loadingProfile, fetchAppointmentsForStaff]); // fetchAppointmentsForStaff depends on filterStatus

  const handleUpdateStatus = async (appointmentId: string, newStatus: AppointmentStatus) => {
    if (!userProfile) {
        setError("User profile not available. Cannot perform action.");
        return;
    }
    const statusText = newStatus.replace(/_/g, ' ');
    let reasonForUpdate: string | undefined = undefined;

    if (newStatus === 'cancelled_by_clinic' || newStatus === 'no_show') {
        const promptResponse = window.prompt(`Enter reason/notes for marking as "${statusText}":`);
        if (promptResponse === null) return; // User cancelled the prompt
        reasonForUpdate = promptResponse.trim() || `Marked as ${statusText} by staff.`;
    } else {
        const confirmation = window.confirm(`Are you sure you want to update status to "${statusText}"?`);
        if (!confirmation) return;
    }
    
    setUpdatingStatusInfo({id: appointmentId, status: newStatus});
    setError(null);

    try {
        const updateStatusFunction = httpsCallable<UpdateAppointmentStatusPayload, UpdateAppointmentStatusResponse>(functions, 'updateAppointmentStatusByStaff');
        const response: HttpsCallableResult<UpdateAppointmentStatusResponse> = await updateStatusFunction({
            appointmentId,
            newStatus,
            notes: reasonForUpdate
        });

        if (!response.data.success) {
            throw new Error(response.data.message || "Failed to update appointment status via function.");
        }
        
        // Update local state to reflect change immediately
        setAppointments(prevAppointments =>
            prevAppointments.map(appt =>
                appt.id === appointmentId
                ? { ...appt, status: newStatus, notes: reasonForUpdate ? (appt.notes ? `${appt.notes}\nStaff: ${reasonForUpdate}` : `Staff: ${reasonForUpdate}`) : appt.notes, updatedAt: Timestamp.now() } // This will now work
                : appt
            )
        );
        alert(`Appointment status updated to ${statusText}.`);

    } catch (e: unknown) {
        console.error("Error updating appointment status:", e);
        let errorMessage = "Failed to update status.";
        if (isCallableError(e)) {
            const details = e.details as Partial<{ message: string }>;
            errorMessage = (details && typeof details.message === 'string') ? `${e.message}: ${details.message}` : e.message;
        } else if (e instanceof Error) {
            errorMessage = e.message;
        }
        setError(errorMessage);
        alert(`Error: ${errorMessage}`);
    } finally {
        setUpdatingStatusInfo(null);
    }
  };

  if (loadingAuth || loadingProfile) {
    return <div className="page-container" style={{ textAlign: 'center', paddingTop: '4rem'}}>Loading user data...</div>;
  }

  if (!userProfile || (userProfile.role !== 'clinic_admin' && userProfile.role !== 'doctor')) {
    return (
      <div className="page-container" style={{ textAlign: 'center', paddingTop: '4rem' }}>
        <div className="card" style={{maxWidth: '500px', margin: 'auto'}}>
            <h3 style={{color: 'var(--color-error)'}}>Access Denied</h3>
            <p>This page is for clinic staff only.</p>
            {error && <p className="alert alert-danger" style={{marginTop: '1rem'}}>{error}</p> }
            <Link to="/login" className="btn" style={{marginTop: '1rem'}}>Go to Login</Link>
        </div>
      </div>
    );
  }
  
  if (error && !isLoading) {
    return (
        <div className="page-container">
            <div style={pageHeaderStyle}>
                <h1 style={{ margin: 0 }}>Clinic Appointments</h1>
                <Link to="/dashboard" className="btn btn-outline-primary">&larr; Dashboard</Link>
            </div>
            <div className="alert alert-danger">Error: {error}</div>
        </div>
    );
  }
  
  const getStatusBadgeStyle = (status: AppointmentStatus): React.CSSProperties => {
    let backgroundColor = 'var(--color-text-muted)';
    let color = 'var(--color-text-light)'; // Default for dark backgrounds
    switch (status) {
        case 'confirmed': backgroundColor = 'var(--color-success)'; break;
        case 'pending_clinic_approval': backgroundColor = 'var(--color-warning)'; color = 'var(--color-text-on-warning)'; break;
        case 'cancelled_by_patient':
        case 'cancelled_by_clinic': backgroundColor = 'var(--color-error)'; break;
        case 'completed': backgroundColor = 'var(--color-primary)'; break;
        case 'no_show': backgroundColor = 'var(--color-secondary)'; break;
        // default: color = 'var(--color-text-secondary)'; backgroundColor = 'var(--color-background-grey)'; break; // Unknown status - handled by default
    }
    return {
        color,
        backgroundColor,
        padding: '0.3em 0.65em',
        borderRadius: 'var(--border-radius)',
        fontSize: '0.8rem',
        fontWeight: 500,
        textTransform: 'capitalize',
        display: 'inline-block',
        minWidth: '110px', // Ensure badges have some consistent width
        textAlign: 'center',
        whiteSpace: 'nowrap',
    };
  };

  return (
    <div className="page-container">
      <div style={pageHeaderStyle}>
        <h1 style={{ margin: 0 }}>Clinic Appointments</h1>
        <div style={{display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap'}}>
            <label htmlFor="statusFilter" style={{fontWeight: 500, marginBottom: 0}}>Filter:</label>
            <select
                id="statusFilter"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{padding: '0.5rem 0.75rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color-input)', fontSize: '0.9rem'}}
            >
                <option value="upcoming">Upcoming</option>
                <option value="past">Past</option>
                <option value="all">All Appointments</option>
            </select>
            <Link to="/dashboard" className="btn btn-outline-primary btn-sm">&larr; Dashboard</Link>
        </div>
      </div>

      {isLoading && <div style={{textAlign: 'center', padding: '3rem', fontSize: '1.1rem', color: 'var(--color-primary)'}}>Loading appointments...</div>}
      
      {!isLoading && appointments.length === 0 && !error && (
        <div className="card text-center" style={{padding: '2rem'}}>
            <p style={{fontSize: '1.1rem', color: 'var(--color-text-muted)'}}>
                No {filterStatus !== 'all' ? filterStatus : ''} appointments found.
            </p>
        </div>
      )}

      {!isLoading && appointments.length > 0 && (
        <div className="table-responsive">
            <table>
            <thead>
                <tr>
                    <th style={tableHeaderStyleCSS}>Date & Time</th>
                    <th style={tableHeaderStyleCSS}>Patient</th>
                    <th style={tableHeaderStyleCSS}>Contact</th>
                    {userProfile?.role === 'clinic_admin' && <th style={tableHeaderStyleCSS}>Assigned Doctor</th>}
                    <th style={{...tableHeaderStyleCSS, minWidth: '150px'}}>Reason</th>
                    <th style={tableHeaderStyleCSS}>Status</th>
                    <th style={{...tableHeaderStyleCSS, minWidth: '210px', textAlign: 'center'}}>Actions</th>
                </tr>
            </thead>
            <tbody>
                {appointments.map((appt, index) => (
                <tr key={appt.id} style={{backgroundColor: appt.id === updatingStatusInfo?.id ? '#e7f3ff' : (index % 2 === 0 ? 'var(--color-background-card)' : 'var(--color-background-grey)') } }>
                    <td style={tableCellStyleCSS}>{appt.appointmentDateTime.toDate().toLocaleString('en-PK', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Karachi' })}</td>
                    <td style={tableCellStyleCSS}>{appt.patientName || 'N/A'}</td>
                    <td style={tableCellStyleCSS}>{appt.patientPhoneNumber || 'N/A'}</td>
                    {userProfile?.role === 'clinic_admin' && <td style={tableCellStyleCSS}>{appt.doctorName || (appt.doctorId ? `ID: ${appt.doctorId.substring(0,6)}...` : 'N/A') }</td>}
                    <td style={{...tableCellStyleCSS, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}} title={appt.reasonForVisit || ''}>
                        {appt.reasonForVisit || 'N/A'}
                    </td>
                    <td style={{...tableCellStyleCSS, textAlign: 'center'}}>
                        <span style={getStatusBadgeStyle(appt.status)}>
                            {appt.status.replace(/_/g, ' ') || 'Unknown'}
                        </span>
                    </td>
                    <td style={{...tableCellStyleCSS, textAlign: 'center'}}>
                    {availableActions(appt.status).map(action => (
                        <button
                            key={action.newStatus}
                            onClick={() => handleUpdateStatus(appt.id, action.newStatus)}
                            disabled={updatingStatusInfo?.id === appt.id}
                            className={`btn ${action.className || 'btn-secondary btn-sm'}`}
                            style={{
                                marginRight: '5px',
                                marginBottom: '5px', // For wrapping
                                opacity: updatingStatusInfo?.id === appt.id ? 0.7 : 1,
                            }}
                            title={`Change status to ${action.label}`}
                        >
                            {updatingStatusInfo?.id === appt.id && updatingStatusInfo?.status === action.newStatus ? '...' : action.label}
                        </button>
                    ))}
                    {availableActions(appt.status).length === 0 && <span style={{fontSize: '0.85rem', color: 'var(--color-text-muted)'}}>-</span>}
                    </td>
                </tr>
                ))}
            </tbody>
            </table>
        </div>
      )}
    </div>
  );
};

const pageHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '2rem',
  paddingBottom: '1rem',
  borderBottom: '1px solid var(--border-color)',
  flexWrap: 'wrap',
  gap: '1rem'
};

const tableHeaderStyleCSS: React.CSSProperties = {
    padding: '0.85rem 1rem',
    textAlign: 'left',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    borderBottom: '2px solid var(--border-color)',
    whiteSpace: 'nowrap',
    verticalAlign: 'middle',
    backgroundColor: 'var(--color-background-grey)',
};

const tableCellStyleCSS: React.CSSProperties = {
    padding: '0.75rem 1rem',
    verticalAlign: 'middle',
    borderTop: '1px solid var(--border-color)',
    fontSize: '0.9rem',
    color: 'var(--color-text-primary)',
};

export default AppointmentsPage;
