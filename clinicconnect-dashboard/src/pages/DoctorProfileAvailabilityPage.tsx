// src/pages/DoctorProfileAvailabilityPage.tsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { UserProfile } from '../contexts/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db, functions as firebaseFunctions } from '../firebaseConfig';
import { httpsCallable } from 'firebase/functions';
import type { HttpsCallableResult } from 'firebase/functions';

// --- Types ---
interface TimeSlot {
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
}
interface GetAvailableSlotsRequest {
  doctorId: string;
  date: string; // YYYY-MM-DD
}
interface GetAvailableSlotsResponse {
  slots: TimeSlot[];
}
interface CallableError extends Error {
  code: string;
  details?: unknown;
}

// --- Type Guards ---
function isCallableError(error: unknown): error is CallableError {
  return error instanceof Error &&
         typeof (error as CallableError).code === 'string' &&
         typeof (error as CallableError).message === 'string';
}

// --- Date Helper Functions ---
// Update the formatDateToYYYYMMDD function to handle time zones consistently
const formatDateToYYYYMMDD = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const getDayOfWeekShort = (date: Date): string => {
  return date.toLocaleDateString('en-US', { weekday: 'short' });
};

const getDateOfMonth = (date: Date): string => {
  return date.toLocaleDateString('en-US', { day: 'numeric' });
};

// --- Styling ---
const dateNavigationContainerStyle: React.CSSProperties = { marginBottom: '2rem', padding: '1rem 0', borderBottom: '1px solid var(--border-color)'};
const dateNavHeaderStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'};
const currentMonthYearStyle: React.CSSProperties = { margin: 0, color: 'var(--color-text-primary)', fontSize: '1.25rem', fontWeight: 600};
const dateChipsContainerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap'};
const timeSlotCategoryStyle: React.CSSProperties = { marginBottom: '2rem' };
const timeSlotCategoryTitleStyle: React.CSSProperties = { fontSize: '1.2rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.6rem'};
const timeSlotsGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '0.65rem'};
const timeSlotPillHoverStyle: React.CSSProperties = { borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', transform: 'scale(1.03)'};
const noSlotsMessageStyle: React.CSSProperties = { textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '1.05rem', padding: '2rem', backgroundColor: 'var(--color-background-grey)', borderRadius: 'var(--border-radius-lg)', marginTop: '1rem'};


const DoctorProfileAvailabilityPage: React.FC = () => {
  const { doctorId } = useParams<{ doctorId: string }>();
  const [searchParams] = useSearchParams();
  const clinicIdFromParams = searchParams.get('clinicId');

  const { loadingAuth } = useAuth();
  const navigate = useNavigate();

  const [doctor, setDoctor] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState<boolean>(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(today.setDate(diff));
  });
  const [selectedDateISO, setSelectedDateISO] = useState<string>(formatDateToYYYYMMDD(new Date()));

  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);

  // --- DEBUGGING LOG ---
  useEffect(() => {
    console.log('[DEBUG] Page State Update:', {
      doctorId,
      selectedDateISO,
      isLoadingProfile,
      profileError: profileError ? profileError.substring(0,100) : null,
      isLoadingSlots,
      slotsError: slotsError ? slotsError.substring(0,100) : null,
      availableSlotsCount: availableSlots.length,
      doctorName: doctor ? doctorName : "Not loaded",
    });
  }, [doctorId, selectedDateISO, isLoadingProfile, profileError, isLoadingSlots, slotsError, availableSlots, doctor]);


  const doctorName = useMemo(() => {
    if (!doctor) return 'Doctor';
    const p = doctor.profile;
    const n = p?.displayName || `${p?.firstName || ''} ${p?.lastName || ''}`.trim() || doctor.email || 'Doctor';
    return n === '' || n === ' ' ? (doctor.email || 'Doctor') : n;
  }, [doctor]);

  const specializations = useMemo(() => doctor?.doctorSpecificData?.specializations?.join(', ') ?? ' ', [doctor]);

  useEffect(() => {
    console.log('[DEBUG] Auth Loading State:', loadingAuth);
    if (loadingAuth) return;
    if (!doctorId) {
      console.error('[DEBUG] Doctor ID missing from URL.');
      setProfileError('Doctor ID missing from URL.');
      setIsLoadingProfile(false);
      return;
    }
    let mounted = true;
    console.log(`[DEBUG] Fetching profile for doctorId: ${doctorId}`);
    const fetchProfile = async () => {
      if (!mounted) return;
      setIsLoadingProfile(true);
      setProfileError(null);
      try {
        const snap = await getDoc(doc(db, 'users', doctorId));
        if (!mounted) return;
        if (snap.exists()) {
          const data = snap.data();
          console.log('[DEBUG] Doctor profile data received:', data);
          if (data?.role === 'doctor') {
            setDoctor({ uid: snap.id, ...data } as UserProfile);
          } else {
            console.warn('[DEBUG] Profile found but not a doctor role.');
            setProfileError('The requested profile does not belong to a doctor.');
          }
        } else {
          console.warn('[DEBUG] Doctor profile not found in Firestore.');
          setProfileError('Doctor profile not found.');
        }
      } catch (e) {
        if (mounted) {
          const errorMsg = e instanceof Error ? e.message : 'An error occurred while loading the doctor profile.';
          console.error('[DEBUG] Error fetching doctor profile:', errorMsg, e);
          setProfileError(errorMsg);
        }
      } finally {
        if (mounted) setIsLoadingProfile(false);
      }
    };
    fetchProfile();
    return () => { mounted = false; };
  }, [doctorId, loadingAuth]);

  const fetchSlots = useCallback(async (dateToFetch: string) => {
    if (!doctorId || !dateToFetch) {
        console.warn('[DEBUG] fetchSlots: doctorId or dateToFetch is missing.', { doctorId, dateToFetch });
        return;
    }
    if (!doctor) {
        console.warn('[DEBUG] fetchSlots: Doctor profile not yet loaded. Aborting slot fetch.');
        setSlotsError("Doctor profile must be loaded before fetching slots.");
        return;
    }

    console.log(`[DEBUG] fetchSlots: Called for Doctor ID: ${doctorId} on Date: ${dateToFetch}`);
    let mounted = true;
    setIsLoadingSlots(true);
    setSlotsError(null); // Clear previous errors before a new fetch
    setAvailableSlots([]); // Clear previous slots before fetching new ones

    try {
      const callable = httpsCallable<GetAvailableSlotsRequest, GetAvailableSlotsResponse>(firebaseFunctions, 'getAvailableSlots');
      const payload: GetAvailableSlotsRequest = { doctorId, date: dateToFetch };
      console.log('[DEBUG] fetchSlots: Payload to backend:', payload);
      const result: HttpsCallableResult<GetAvailableSlotsResponse> = await callable(payload);
      console.log('[DEBUG] fetchSlots: Result from backend:', result);

      if (!mounted) return;

      if (result.data && Array.isArray(result.data.slots)) {
        const receivedSlots = result.data.slots;
        console.log(`[DEBUG] fetchSlots: Received ${receivedSlots.length} slots from backend for ${dateToFetch}:`, receivedSlots);
        
        if (receivedSlots.length === 0) {
          // This log explicitly states that an empty array was received.
          console.warn(`[DEBUG] fetchSlots: Backend returned an empty list of slots for ${dateToFetch}. UI will show "No slots available".`);
        }
        
        setAvailableSlots(receivedSlots); // Storing the received slots (which might be an empty array)
        console.log(`[DEBUG] fetchSlots: setAvailableSlots called with ${receivedSlots.length} slots for ${dateToFetch}. Check next 'Page State Update' log to confirm state.`);
      } else {
        console.error('[DEBUG] fetchSlots: Invalid slot data format received from backend:', result.data);
        setSlotsError('Received invalid slot data from the server.'); // Set user-facing error
        // No need to throw here as setSlotsError will trigger UI update, and finally block will run.
      }
    } catch (e) {
      if (!mounted) return;
      let msg = 'Failed to fetch available slots.';
      if (isCallableError(e)) {
        const details = e.details as Partial<{ message: string }>;
        msg = (details?.message) ? `${e.message}: ${details.message}` : `${e.message} (Code: ${e.code})`;
      } else if (e instanceof Error) {
        msg = e.message;
      }
      console.error("[DEBUG] fetchSlots: Error during 'getAvailableSlots' call or processing response:", msg, e);
      setSlotsError(msg); // Set user-facing error
    } finally {
      if (mounted) setIsLoadingSlots(false);
    }
  }, [doctorId, firebaseFunctions, doctor]);

  useEffect(() => {
    console.log('[DEBUG] Slot Fetching useEffect Triggered:', { selectedDateISO, doctorId, loadingAuth, isLoadingProfile, doctorExists: !!doctor });
    if (selectedDateISO && doctorId && !loadingAuth && !isLoadingProfile && doctor) {
      fetchSlots(selectedDateISO);
    } else {
      if (!doctor && !isLoadingProfile && !loadingAuth && doctorId) {
        console.warn("[DEBUG] Slot Fetching useEffect: Doctor profile not loaded, but profile loading finished. Slots not fetched.");
      }
    }
  }, [selectedDateISO, doctorId, fetchSlots, loadingAuth, isLoadingProfile, doctor]);

  const dateChips = useMemo(() => {
    const chips: Date[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let effectiveWeekStart = new Date(currentWeekStart);
    if (effectiveWeekStart < today && (effectiveWeekStart.getDate() + 6) < today.getDate() && effectiveWeekStart.getMonth() <= today.getMonth() && effectiveWeekStart.getFullYear() <= today.getFullYear() ) {
        const dayOfWeek = today.getDay();
        const diffToMonday = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        effectiveWeekStart = new Date(new Date().setDate(diffToMonday));
        effectiveWeekStart.setHours(0,0,0,0);
    }
    for (let i = 0; i < 7; i++) {
      const chipDate = new Date(effectiveWeekStart);
      chipDate.setDate(effectiveWeekStart.getDate() + i);
      if (chipDate >= today) {
        chips.push(chipDate);
      }
    }
    console.log("[DEBUG] Generated Date Chips:", chips.map(d => formatDateToYYYYMMDD(d)));
    return chips;
  }, [currentWeekStart]);

  const handleDateChipClick = (date: Date) => {
    console.log('[DEBUG] Date chip clicked:', formatDateToYYYYMMDD(date));
    setSelectedDateISO(formatDateToYYYYMMDD(date));
  };

  const changeWeek = (direction: 'prev' | 'next') => {
    console.log('[DEBUG] changeWeek called with direction:', direction);
    setCurrentWeekStart(prev => {
      const newStartDate = new Date(prev);
      newStartDate.setDate(prev.getDate() + (direction === 'next' ? 7 : -7));
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (direction === 'prev') {
        const lastDayOfNewWeek = new Date(newStartDate);
        lastDayOfNewWeek.setDate(newStartDate.getDate() + 6);
        if (lastDayOfNewWeek < today) {
          const currentMonday = new Date(new Date().setDate(new Date().getDate() - new Date().getDay() + (new Date().getDay() === 0 ? -6 : 1)));
          currentMonday.setHours(0,0,0,0);
          setSelectedDateISO(formatDateToYYYYMMDD(new Date()));
          console.log('[DEBUG] changeWeek (prev): Snapping to current week.', formatDateToYYYYMMDD(currentMonday));
          return currentMonday;
        }
      }
      const firstDayOfNewWeek = new Date(newStartDate);
      if (firstDayOfNewWeek < today && direction === 'next') {
          setSelectedDateISO(formatDateToYYYYMMDD(today));
      } else if (firstDayOfNewWeek >= today) {
          setSelectedDateISO(formatDateToYYYYMMDD(firstDayOfNewWeek));
      } else {
          setSelectedDateISO(formatDateToYYYYMMDD(today));
      }
      console.log('[DEBUG] changeWeek: New start date:', formatDateToYYYYMMDD(newStartDate), 'Selected ISO:', selectedDateISO);
      return newStartDate;
    });
  };
  const handleSlotSelection = (slot: TimeSlot) => {
    const clinicId = clinicIdFromParams ?? doctor?.doctorSpecificData?.linkedClinicIds?.[0];
    if (!clinicId) {
      const errorMsg = 'Clinic ID could not be determined for booking. Please ensure the doctor is linked to a clinic or try accessing from a clinic page.';
      console.error('[DEBUG] handleSlotSelection: Error -', errorMsg, { clinicIdFromParams, doctorLinkedClinics: doctor?.doctorSpecificData?.linkedClinicIds });
      setSlotsError(errorMsg);
      return;
    }
    // Fix timezone issue: Remove the Z suffix since we're using Pakistan time (UTC+5)
    // The dates in Firebase are already stored in Pakistan time
    const bookingState = {
      doctorId, clinicId, 
      // Format without Z suffix to indicate local time (Pakistan time - UTC+5)
      selectedSlotDateTimeISO: `${selectedDateISO}T${slot.startTime}:00`,
      doctorName, durationMinutes: doctor?.doctorSpecificData?.slotDurationMinutes ?? 30,
    };
    console.log('[DEBUG] handleSlotSelection: Navigating to /book-appointment with state:', bookingState);
    navigate('/book-appointment', { state: bookingState });
  };

  const { morning: morningSlots, afternoon: afternoonSlots, evening: eveningSlots } = useMemo(() => {
    const m: TimeSlot[] = [], a: TimeSlot[] = [], e: TimeSlot[] = [];
    availableSlots.forEach(s => {
      const h = parseInt(s.startTime.split(':')[0], 10);
      if (h < 12) m.push(s);
      else if (h < 17) a.push(s);
      else e.push(s);
    });
    console.log('[DEBUG] Categorized Slots:', { morning: m.length, afternoon: a.length, evening: e.length });
    return { morning: m, afternoon: a, evening: e };
  }, [availableSlots]);

  if (loadingAuth || isLoadingProfile) {
    console.log('[DEBUG] Render: Loading auth or profile...');
    return <div className="page-container" style={{ textAlign: 'center', paddingTop: '4rem' }}>Loading doctor profile...</div>;
  }
  if (profileError) {
    console.log('[DEBUG] Render: Profile error:', profileError);
    return <div className="page-container alert alert-danger text-center" style={{ margin: '2rem auto', maxWidth: '600px' }}>Error: {profileError}</div>;
  }
  if (!doctor) {
    console.log('[DEBUG] Render: Doctor profile not found or not loaded.');
    return <div className="page-container text-center" style={{ paddingTop: '4rem' }}>Doctor profile not found or could not be loaded.</div>;
  }

  console.log('[DEBUG] Rendering Slot Section - Conditions:', {
    isLoadingSlots,
    slotsError: slotsError ? slotsError.substring(0,100) : null,
    availableSlotsLength: availableSlots.length,
    selectedDateISO
  });


  return (
    <div className="page-container">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
        <button onClick={() => navigate(clinicIdFromParams ? `/clinic/${clinicIdFromParams}` : "/find-care")} className="btn btn-link" style={{ paddingLeft: 0, color: 'var(--color-primary)', fontSize: '0.95rem' }}>
          &larr; Back to {clinicIdFromParams ? 'Clinic Details' : 'Find Care'}
        </button>
      </header>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', marginBottom: '2.5rem', textAlign: 'center' }}>
        <img src={doctor.profile?.profilePictureUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(doctorName)}&background=E9ECEF&color=495057&size=120&font-size=0.33&bold=true`} alt={doctorName} style={{width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--border-color)' }} />
        <div>
          <h1 style={{ color: 'var(--color-primary-dark)', margin: '0 0 0.25rem 0', fontSize: '2rem' }}>{doctorName}</h1>
          <p style={{ margin: '0 0 0.5rem 0', color: 'var(--color-text-secondary)', fontSize: '1.1rem' }}>{specializations}</p>
          {doctor.doctorSpecificData?.qualifications && <p style={{ margin: '0.25rem 0', fontSize: '0.9em', color: 'var(--color-text-muted)' }}>{doctor.doctorSpecificData.qualifications.join(", ")}</p>}
        </div>
      </div>

      <div className="card">
        <h2 style={{ color: 'var(--color-primary-dark)', marginBottom: '2rem', textAlign: 'center', fontSize: '1.6rem' }}>Book an Appointment</h2>

        <div style={dateNavigationContainerStyle}>
            <div style={dateNavHeaderStyle}>
                <button onClick={() => changeWeek('prev')} className="btn btn-outline-primary btn-sm" disabled={!dateChips.some(d => new Date(formatDateToYYYYMMDD(d)) < new Date(formatDateToYYYYMMDD(currentWeekStart)) ) && new Date(formatDateToYYYYMMDD(currentWeekStart)) <= new Date(formatDateToYYYYMMDD(new Date())) }>&larr; Prev Week</button>
                <h3 style={currentMonthYearStyle}>
                    {new Date(selectedDateISO + 'T00:00:00Z').toLocaleDateString('en-PK', { month: 'long', year: 'numeric', timeZone:'UTC' })}
                </h3>
                <button onClick={() => changeWeek('next')} className="btn btn-outline-primary btn-sm">Next Week &rarr;</button>
            </div>
            <div style={dateChipsContainerStyle}>
                {dateChips.length > 0 ? dateChips.map(date => {
                    const isoDate = formatDateToYYYYMMDD(date);
                    const isSelected = isoDate === selectedDateISO;
                    return (
                        <button
                            key={isoDate}
                            onClick={() => handleDateChipClick(date)}
                            className={`btn date-chip ${isSelected ? 'btn-primary' : 'btn-outline-primary'}`}
                            aria-pressed={isSelected}
                            title={date.toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long' })}
                        >
                            <span className="day-name">{getDayOfWeekShort(date)}</span>
                            <span className="day-number">{getDateOfMonth(date)}</span>
                        </button>
                    );
                }) : <p style={{color: 'var(--color-text-muted)'}}>No upcoming dates available in this range.</p>}
            </div>
        </div>

        {isLoadingSlots && <div style={{marginTop: '1rem', textAlign: 'center', color: 'var(--color-primary)', fontStyle: 'italic', fontSize: '1.1rem'}}>Loading available slots...</div>}
        {slotsError && <div className="alert alert-warning" style={{marginTop: '1rem', textAlign: 'center'}}>{slotsError}</div>}

        {!isLoadingSlots && !slotsError && availableSlots.length === 0 && selectedDateISO && (
          <div style={noSlotsMessageStyle}>
            No slots available for {new Date(selectedDateISO + "T00:00:00.000Z").toLocaleDateString('en-PK', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })}.
            <br/>Please select another date.
          </div>
        )}

        {!isLoadingSlots && !slotsError && availableSlots.length > 0 && (
          <div style={{marginTop: '1.5rem'}}>
            <p style={{textAlign: 'left', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '1rem', fontSize: '1.1rem'}}>
              Available Slots for {new Date(selectedDateISO + "T00:00:00.000Z").toLocaleDateString('en-PK', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })}:
            </p>

            {[{title: 'Morning', slots: morningSlots}, {title: 'Afternoon', slots: afternoonSlots}, {title: 'Evening', slots: eveningSlots}].map((category, catIndex) => (
                category.slots.length > 0 && (
                    <div key={`${category.title}-${catIndex}`} style={timeSlotCategoryStyle}>
                        <h4 style={timeSlotCategoryTitleStyle}>{category.title}</h4>
                        <div style={timeSlotsGridStyle}>
                        {category.slots.map((slot, slotIndex) => (
                            <button
                                key={`${slot.startTime}-${slotIndex}`}
                                onClick={() => handleSlotSelection(slot)}
                                className="slot-pill"
                                style={hoveredSlot === `${slot.startTime}-${slotIndex}` ? {...timeSlotPillHoverStyle} : {}}
                                onMouseEnter={() => setHoveredSlot(`${slot.startTime}-${slotIndex}`)}
                                onMouseLeave={() => setHoveredSlot(null)}
                                title={`Book appointment at ${slot.startTime}`}
                            >
                            {slot.startTime}
                            </button>
                        ))}
                        </div>
                    </div>
                )
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DoctorProfileAvailabilityPage;
