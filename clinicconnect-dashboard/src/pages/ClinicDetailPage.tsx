// src/pages/ClinicDetailPage.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import type { DocumentData, QueryDocumentSnapshot, Timestamp as FirestoreTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// Interfaces (ensure these match your actual data structure and are consistent)
interface ClinicAddress {
  street?: string | null;
  area?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  country?: string;
  landmark?: string | null;
}
interface ClinicContactInfo {
  primaryPhoneNumber?: string | null;
  secondaryPhoneNumber?: string | null;
  email?: string | null;
  website?: string | null;
}
interface ClinicOperatingHoursEntry {
  open?: string;
  close?: string;
  isOpen?: boolean;
  notes?: string;
}
interface ClinicOperatingHours {
  monday?: ClinicOperatingHoursEntry;
  tuesday?: ClinicOperatingHoursEntry;
  wednesday?: ClinicOperatingHoursEntry;
  thursday?: ClinicOperatingHoursEntry;
  friday?: ClinicOperatingHoursEntry;
  saturday?: ClinicOperatingHoursEntry;
  sunday?: ClinicOperatingHoursEntry;
}
interface ClinicRating {
  averageScore?: number;
  count?: number;
}
export interface Clinic {
  id: string;
  name: string;
  type?: string;
  about?: string | null;
  address?: ClinicAddress | null;
  contactInfo?: ClinicContactInfo | null;
  operatingHours?: ClinicOperatingHours | null;
  servicesOffered?: string[];
  facilitiesAvailable?: string[];
  displayImageUrls?: string[];
  associatedDoctorUids?: string[];
  rating?: ClinicRating | null;
  isActive?: boolean; // Important for filtering/display
  isVerified?: boolean;
}

interface DoctorProfileSummary {
  uid: string;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profilePictureUrl?: string | null;
  specializations?: string[] | null;
}

// Styles (reusing from FindCarePage where applicable)
const headerImageStyle: React.CSSProperties = {
  width: '100%',
  maxHeight: '350px', // Slightly taller for detail page
  objectFit: 'cover',
  borderRadius: 'var(--border-radius-lg)',
  marginBottom: '2rem',
  backgroundColor: 'var(--color-background-grey)',
};

const sectionStyle: React.CSSProperties = {
  marginBottom: '2.5rem',
};

const sectionTitleStyle: React.CSSProperties = {
  color: 'var(--color-primary-dark)',
  fontSize: '1.75rem',
  borderBottom: '2px solid var(--color-primary)',
  paddingBottom: '0.5rem',
  marginBottom: '1.5rem',
};

const detailGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '2fr 1fr', // Adjust column ratio as needed
  gap: '2rem',
  marginBottom: '2rem',
};

const detailBlockStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-background-card)',
  padding: '1.5rem',
  borderRadius: 'var(--border-radius-lg)', // Use lg for cards
  boxShadow: 'var(--shadow-sm)',
};
  
const detailLabelStyle: React.CSSProperties = {
  display: 'block',
  color: 'var(--color-text-muted)',
  fontSize: '0.875rem',
  marginBottom: '0.25rem',
  fontWeight: 500,
  textTransform: 'uppercase',
};
  
const detailValueStyle: React.CSSProperties = {
  color: 'var(--color-text-primary)',
  fontSize: '1rem',
  wordWrap: 'break-word',
  marginBottom: '1rem', // Space between detail items
};

const doctorCardStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-background-card)',
  borderRadius: 'var(--border-radius-lg)',
  boxShadow: 'var(--shadow-sm)', // Lighter shadow for doctor cards
  padding: '1.5rem',
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
};
const doctorCardHoverStyle: React.CSSProperties = {
    transform: 'translateY(-4px)',
    boxShadow: 'var(--shadow-md)',
};

const doctorImageStyle: React.CSSProperties = {
  width: '90px',
  height: '90px',
  borderRadius: '50%',
  objectFit: 'cover',
  marginBottom: '1rem',
  border: '3px solid var(--border-color)',
};

const serviceTagStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-primary-light)', // Use a light primary variant
  color: 'var(--color-primary-dark)', // Darker text for contrast
  padding: '0.35rem 0.75rem',
  borderRadius: 'var(--border-radius)',
  fontSize: '0.85rem',
  fontWeight: 500,
  border: '1px solid var(--color-primary-light)',
};


const ClinicDetailPage: React.FC = () => {
  const { clinicId } = useParams<{ clinicId: string }>();
  const { loadingAuth } = useAuth(); // Only need loadingAuth here
  const navigate = useNavigate();

  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [doctors, setDoctors] = useState<DoctorProfileSummary[]>([]);
  const [isLoadingPage, setIsLoadingPage] = useState(true); // Page level loading state
  const [error, setError] = useState<string | null>(null);
  const [hoveredDoctorId, setHoveredDoctorId] = useState<string | null>(null);

  const mapClinicData = useCallback((data: DocumentData, id: string): Clinic => {
    return {
      id: id,
      name: data.name || 'Clinic Name Not Available',
      type: data.type || undefined,
      about: data.about || null,
      address: data.address || null,
      contactInfo: data.contactInfo || null,
      operatingHours: data.operatingHours || null,
      servicesOffered: Array.isArray(data.servicesOffered) ? data.servicesOffered : [],
      facilitiesAvailable: Array.isArray(data.facilitiesAvailable) ? data.facilitiesAvailable : [],
      displayImageUrls: Array.isArray(data.displayImageUrls) ? data.displayImageUrls : [],
      associatedDoctorUids: Array.isArray(data.associatedDoctorUids) ? data.associatedDoctorUids : [],
      rating: data.rating || null,
      isActive: typeof data.isActive === 'boolean' ? data.isActive : undefined,
      isVerified: typeof data.isVerified === 'boolean' ? data.isVerified : undefined,
    };
  }, []);
  
  const mapDoctorData = useCallback((docSnap: QueryDocumentSnapshot<DocumentData>): DoctorProfileSummary => {
    const data = docSnap.data();
    return {
        uid: docSnap.id,
        displayName: data.profile?.displayName || `${data.profile?.firstName || ''} ${data.profile?.lastName || ''}`.trim() || null,
        firstName: data.profile?.firstName || null,
        lastName: data.profile?.lastName || null,
        profilePictureUrl: data.profile?.profilePictureUrl || null,
        specializations: Array.isArray(data.doctorSpecificData?.specializations) ? data.doctorSpecificData.specializations : [],
    };
  }, []);

  useEffect(() => {
    if (loadingAuth) return; // Wait for auth state to be confirmed by AuthContext

    if (!clinicId) {
      setError("Clinic ID is missing from the URL.");
      setIsLoadingPage(false);
      return;
    }

    const fetchClinicDetails = async () => {
      console.log(`ClinicDetailPage: Fetching details for clinicId: ${clinicId}`);
      setIsLoadingPage(true);
      setError(null);
      setClinic(null); // Reset clinic on new fetch
      setDoctors([]);   // Reset doctors

      try {
        const clinicDocRef = doc(db, 'clinics', clinicId);
        const clinicDocSnap = await getDoc(clinicDocRef);

        if (clinicDocSnap.exists()) {
          const clinicData = mapClinicData(clinicDocSnap.data(), clinicDocSnap.id);
          console.log("ClinicDetailPage: Clinic data fetched:", clinicData);
          
          // Only proceed if clinic is active and verified (optional client-side check)
          // if (!clinicData.isActive || !clinicData.isVerified) {
          //   setError("This clinic is currently not active or verified.");
          //   setIsLoadingPage(false);
          //   return;
          // }
          setClinic(clinicData);

          if (clinicData.associatedDoctorUids && clinicData.associatedDoctorUids.length > 0) {
            const doctorUidsToQuery = clinicData.associatedDoctorUids.slice(0, 30); // Firestore 'in' query limit
            if (doctorUidsToQuery.length > 0) {
                const doctorsRef = collection(db, 'users');
                const q = query(doctorsRef, where("__name__", 'in', doctorUidsToQuery), where('role', '==', 'doctor'));
                const doctorsSnap = await getDocs(q);
                const fetchedDoctors = doctorsSnap.docs.map(mapDoctorData);
                console.log("ClinicDetailPage: Doctors fetched:", fetchedDoctors);
                setDoctors(fetchedDoctors);
            }
          }
        } else {
          console.log(`ClinicDetailPage: Clinic with ID "${clinicId}" not found.`);
          setError(`Clinic not found. It may have been removed or the ID is incorrect.`);
        }
      } catch (e: unknown) {
        console.error("ClinicDetailPage: Error fetching clinic details:", e);
        const errorMessage = e instanceof Error ? e.message : "An unknown error occurred.";
        setError(`Failed to load clinic information: ${errorMessage}. Please check Firestore rules and indexes.`);
      } finally {
        setIsLoadingPage(false);
        console.log("ClinicDetailPage: Fetching complete.");
      }
    };

    fetchClinicDetails();
  }, [clinicId, loadingAuth, mapClinicData, mapDoctorData]);

  const formatOperatingHours = (hours?: ClinicOperatingHoursEntry) => {
    if (!hours || !hours.isOpen) return <span style={{color: 'var(--color-text-muted)'}}>Closed</span>;
    return `${hours.open || ''} - ${hours.close || ''}${hours.notes ? ` (${hours.notes})` : ''}`;
  };

  if (loadingAuth || isLoadingPage) {
    return <div className="page-container" style={{ textAlign: 'center', paddingTop: '4rem' }}>Loading clinic details...</div>;
  }

  if (error) {
    return (
        <div className="page-container" style={{ textAlign: 'center', paddingTop: '4rem' }}>
            <div className="alert alert-danger"><strong>Error:</strong> {error}</div>
            <Link to="/find-care" className="btn btn-primary" style={{marginTop: '1rem'}}>Back to Find Care</Link>
        </div>
    );
  }

  if (!clinic) {
    // This case should ideally be covered by error state if not found.
    return (
        <div className="page-container" style={{ textAlign: 'center', paddingTop: '4rem' }}>
            <p>Clinic information could not be loaded. It may not exist or there was an issue.</p>
            <Link to="/find-care" className="btn btn-primary">Back to Find Care</Link>
        </div>
    );
  }

  const daysOfWeek: (keyof ClinicOperatingHours)[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  return (
    <div className="page-container">
      <header style={{ marginBottom: '1.5rem', paddingTop: '1rem' }}> {/* Added paddingTop */}
        <Link to="/find-care" className="btn btn-link" style={{ paddingLeft: 0, color: 'var(--color-primary-dark)', fontSize: '0.95rem' }}>
          &larr; Back to Search Results
        </Link>
      </header>

      <img 
        src={clinic.displayImageUrls?.[0] || `https://via.placeholder.com/1200x350.png?text=${encodeURIComponent(clinic.name)}`} 
        alt={`${clinic.name} main view`} 
        style={headerImageStyle}
        onError={(e) => (e.currentTarget.src = `https://via.placeholder.com/1200x350.png?text=Clinic+Image+Unavailable`)}
      />

      <div style={{textAlign: 'center', marginBottom: '2.5rem'}}>
        <h1 style={{ color: 'var(--color-primary-dark)', fontSize: '2.5rem', marginBottom: '0.25rem' }}>
          {clinic.name}
        </h1>
        {clinic.type && <p style={{fontSize: '1.15rem', color: 'var(--color-text-muted)', margin: 0}}>{clinic.type}</p>}
      </div>


      {clinic.about && (
        <section style={sectionStyle} className="card">
          <h2 style={sectionTitleStyle}>About {clinic.name}</h2>
          <p style={{lineHeight: 1.75, color: 'var(--color-text-secondary)'}}>{clinic.about}</p>
        </section>
      )}

      <div style={detailGridStyle}>
        <div style={detailBlockStyle}>
            <h3 style={{color: 'var(--color-primary-dark)', marginBottom: '1.25rem'}}>Contact & Location</h3>
            {clinic.address && (
                <div style={{marginBottom: '1rem'}}>
                    <span style={detailLabelStyle}>Address</span>
                    <p style={detailValueStyle}>
                        {clinic.address.street}{clinic.address.street && clinic.address.area ? ', ' : ''}
                        {clinic.address.area}{clinic.address.area && clinic.address.city ? ', ' : ''}
                        {clinic.address.city}{clinic.address.city && clinic.address.province ? ', ' : ''}
                        {clinic.address.province}{clinic.address.province && clinic.address.postalCode ? ' ' : ''}{clinic.address.postalCode || ''}
                        {clinic.address.landmark && <><br/><em style={{fontSize: '0.9em'}}>({clinic.address.landmark})</em></>}
                    </p>
                </div>
            )}
            {clinic.contactInfo?.primaryPhoneNumber && (
                <div style={{marginBottom: '1rem'}}>
                    <span style={detailLabelStyle}>Phone</span>
                    <p style={detailValueStyle}><a href={`tel:${clinic.contactInfo.primaryPhoneNumber}`}>{clinic.contactInfo.primaryPhoneNumber}</a></p>
                </div>
            )}
            {clinic.contactInfo?.email && (
                 <div style={{marginBottom: '1rem'}}>
                    <span style={detailLabelStyle}>Email</span>
                    <p style={detailValueStyle}><a href={`mailto:${clinic.contactInfo.email}`}>{clinic.contactInfo.email}</a></p>
                </div>
            )}
            {clinic.contactInfo?.website && (
                <div> {/* Removed marginBottom for last item */}
                    <span style={detailLabelStyle}>Website</span>
                    <p style={detailValueStyle}><a href={clinic.contactInfo.website} target="_blank" rel="noopener noreferrer">{clinic.contactInfo.website}</a></p>
                </div>
            )}
        </div>

        {clinic.operatingHours && Object.keys(clinic.operatingHours).length > 0 && (
            <div style={detailBlockStyle}>
                <h3 style={{color: 'var(--color-primary-dark)', marginBottom: '1.25rem'}}>Operating Hours</h3>
                <table style={{width: '100%', fontSize: '0.95rem'}}>
                    <tbody>
                        {daysOfWeek.map(day => {
                            const hours = clinic.operatingHours![day as keyof ClinicOperatingHours]; // Type assertion
                            return hours ? (
                                <tr key={day} style={{borderBottom: '1px solid var(--border-color)'}}>
                                    <td style={{textTransform: 'capitalize', fontWeight: 500, padding: '0.6rem 0', color: 'var(--color-text-primary)'}}>{day}</td>
                                    <td style={{textAlign: 'right', padding: '0.6rem 0', color: 'var(--color-text-secondary)'}}>{formatOperatingHours(hours)}</td>
                                </tr>
                            ) : null;
                        })}
                    </tbody>
                </table>
            </div>
        )}
      </div>


      {clinic.servicesOffered && clinic.servicesOffered.length > 0 && (
        <section style={sectionStyle} className="card">
          <h2 style={sectionTitleStyle}>Services Offered</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {clinic.servicesOffered.map(service => (
              <span key={service} style={serviceTagStyle}>
                {service}
              </span>
            ))}
          </div>
        </section>
      )}
      
      {clinic.facilitiesAvailable && clinic.facilitiesAvailable.length > 0 && (
        <section style={sectionStyle} className="card">
          <h2 style={sectionTitleStyle}>Facilities Available</h2>
           <ul style={{ listStyle: 'none', paddingLeft: 0, columns: (clinic.facilitiesAvailable.length > 5 ? 2 : 1), columnGap: '2rem' }}>
            {clinic.facilitiesAvailable.map(facility => (
              <li key={facility} style={{marginBottom: '0.6rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center' }}>
                <span role="img" aria-label="Checkmark" style={{color: 'var(--color-accent)', marginRight: '0.5rem', fontSize: '1.1rem'}}>✓</span>{facility}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Doctors at {clinic.name}</h2>
        {doctors.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {doctors.map(doctor => (
              <div 
                key={doctor.uid} 
                style={hoveredDoctorId === doctor.uid ? {...doctorCardStyle, ...doctorCardHoverStyle} : doctorCardStyle}
                onMouseEnter={() => setHoveredDoctorId(doctor.uid)}
                onMouseLeave={() => setHoveredDoctorId(null)}
              >
                <img 
                  src={doctor.profilePictureUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(doctor.displayName || doctor.firstName || 'D')}&background=E0E0E0&color=888&size=100`} 
                  alt={doctor.displayName || 'Doctor'} 
                  style={doctorImageStyle}
                />
                <h4 style={{color: 'var(--color-primary)', fontSize: '1.25rem', marginBottom: '0.25rem', fontWeight: 600}}>
                  {doctor.displayName || `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim() || 'Doctor Name'}
                </h4>
                {doctor.specializations && doctor.specializations.length > 0 && (
                  <p style={{color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '1rem', minHeight: '2.5em' /* Ensure space for 2 lines */}}>
                    {doctor.specializations.join(', ')}
                  </p>
                )}
                <Link 
                  to={`/doctor/${doctor.uid}/availability?clinicId=${clinicId}`} 
                  className="btn btn-secondary"
                  style={{marginTop: 'auto', width: '100%', fontWeight: 500}}
                >
                  View Profile & Book
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="card text-center">
            <p style={{color: 'var(--color-text-muted)'}}>
                {isLoadingPage ? 'Loading doctor information...' : 'No doctors currently listed for this clinic, or information is being updated.'}
            </p>
          </div>
        )}
      </section>
    </div>
  );
};

export default ClinicDetailPage;