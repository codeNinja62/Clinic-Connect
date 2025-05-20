// src/pages/FindCarePage.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebaseConfig'; // For signOut
import { signOut } from 'firebase/auth';
import { collection, query, where, getDocs, orderBy, limit, QueryConstraint } from 'firebase/firestore';
import type { DocumentData, QueryDocumentSnapshot, Timestamp as FirestoreTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import NotificationBell from '../components/NotificationBell'; // Import the NotificationBell component

// Interfaces (ensure consistency with other files or a shared types definition)
interface ClinicAddress {
  street?: string | null;
  area?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  country?: string;
  landmark?: string | null;
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
  isActive?: boolean;
  isVerified?: boolean;
  address?: ClinicAddress | null;
  primaryPhoneNumber?: string | null;
  displayImageUrls?: string[] | null;
  servicesOffered?: string[] | null;
  rating?: ClinicRating | null;
}

// We'll use our CSS classes from the new design system instead of inline styles
const pageHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '1rem',
  marginBottom: '1.5rem',
  borderBottom: '1px solid var(--color-border)'
};
// --- End Styles ---


const FindCarePage: React.FC = () => {
  const { currentUser, userProfile, loadingAuth } = useAuth();
  const navigate = useNavigate();

  const [allClinics, setAllClinics] = useState<Clinic[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [isLoadingClinics, setIsLoadingClinics] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [hoveredClinicId, setHoveredClinicId] = useState<string | null>(null);

  const mapClinicData = useCallback((doc: QueryDocumentSnapshot<DocumentData>): Clinic => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name || "Unnamed Clinic",
      type: data.type,
      address: data.address,
      primaryPhoneNumber: data.contactInfo?.primaryPhoneNumber || null, 
      servicesOffered: data.servicesOffered,
      displayImageUrls: data.displayImageUrls,
      isActive: data.isActive,
      isVerified: data.isVerified,
      about: data.about || null,
      rating: data.rating || null,
    };
  }, []);

  useEffect(() => {
    if (loadingAuth) {
      return; 
    }

    const fetchClinics = async () => {
      setIsLoadingClinics(true);
      setFetchError(null);
      try {
        const clinicsRef = collection(db, 'clinics');
        const qConstraints: QueryConstraint[] = [
          where('isActive', '==', true),
          where('isVerified', '==', true),
          orderBy('name', 'asc') 
        ];
        
        const q = query(clinicsRef, ...qConstraints, limit(50));

        const querySnapshot = await getDocs(q);
        const fetchedClinicsData: Clinic[] = querySnapshot.docs.map(mapClinicData);
        setAllClinics(fetchedClinicsData);
      } catch (err: unknown) {
        console.error("Error fetching clinics:", err);
        let specificErrorMessage = "Failed to fetch clinics. Please try again.";
        if (typeof err === "object" && err !== null && "code" in err) {
          const firebaseError = err as { code: string; message?: string };
          if (firebaseError.code === 'permission-denied') {
            specificErrorMessage = "Permission problem when fetching clinics. Check Firestore rules.";
          } else if (firebaseError.code === 'failed-precondition' && firebaseError.message?.includes('index')) {
            specificErrorMessage = "Data query needs an index. Please check Firebase console for index creation link or contact support.";
          } else if (firebaseError.message) {
            specificErrorMessage = `Failed to fetch clinics: ${firebaseError.message}`;
          }
        } else if (err instanceof Error) {
          specificErrorMessage = `Failed to fetch clinics: ${err.message}`;
        }
        setFetchError(specificErrorMessage);
      } finally {
        setIsLoadingClinics(false);
      }
    };

    fetchClinics();
  }, [loadingAuth, mapClinicData]);

  const filteredClinics = useMemo(() => {
    if (!searchTerm.trim() && !cityFilter.trim()) {
      return allClinics;
    }
    const lowerSearchTerm = searchTerm.toLowerCase().trim();
    const lowerCityFilter = cityFilter.toLowerCase().trim();

    return allClinics.filter(clinic => {
      const nameMatch = clinic.name.toLowerCase().includes(lowerSearchTerm);
      const cityMatch = lowerCityFilter ? clinic.address?.city?.toLowerCase().includes(lowerCityFilter) : true;
      
      let serviceMatch = false;
      if (lowerSearchTerm && clinic.servicesOffered) {
        serviceMatch = clinic.servicesOffered.some(service => service.toLowerCase().includes(lowerSearchTerm));
      }
      return (nameMatch || serviceMatch) && cityMatch;
    });
  }, [allClinics, searchTerm, cityFilter]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login', { replace: true });
    } catch (error) {
      console.error("Error logging out from FindCarePage:", error);
      setFetchError("Could not log out. Please try again.");
    }
  };

  if (loadingAuth) {
    return <div className="page-container" style={{textAlign: 'center', paddingTop: '4rem'}}>Verifying authentication...</div>;
  }
  
  // The ProtectedRoute component should handle unauthorized access.
  // This additional check is a fallback or for scenarios where the page might be accessible publicly.
  if (!currentUser || (userProfile && userProfile.role !== 'patient')) {
    // If this page is strictly for patients and ProtectedRoute is correctly configured,
    // this block might not be strictly necessary as ProtectedRoute would redirect.
    // However, it's a good safeguard.
    console.warn("FindCarePage: User is not a patient or not logged in. Redirecting or showing limited view.");
    // Depending on requirements, you might redirect or show a message.
    // For now, we assume ProtectedRoute handles unauthorized role access.
  }

  return (
    <div className="page-container">
      <header style={pageHeaderStyle}>
        <h1 style={{ color: 'var(--color-primary)', fontSize: '1.75rem', margin: 0, fontWeight: 700 }}>
            Clinic Connect
        </h1>
        <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}> {/* Adjusted gap for better spacing */}
            {currentUser && userProfile && (
                <>
                    <span style={{color: 'var(--color-text-secondary)', fontSize: '0.9rem', whiteSpace: 'nowrap', marginRight: '0.5rem'}}>
                        {userProfile.profile?.displayName || userProfile.email}
                    </span>
                    <NotificationBell /> {/* Added NotificationBell component here */}
                    <Link to="/my-appointments" className="btn btn-link btn-sm">My Appointments</Link>
                    <Link to="/my-profile" className="btn btn-link btn-sm">My Profile</Link>
                    <button onClick={handleLogout} className="btn btn-outline-primary btn-sm">Logout</button>
                </>
            )}
             {!currentUser && ( // If no user is logged in, show Login/Sign Up
                <Link to="/login" className="btn btn-primary">Login/Sign Up</Link>
            )}
        </div>
      </header>

      <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '1.1rem', marginBottom: '1.5rem' }}>
        Search for healthcare providers. Filter by name, services, or city.
      </p>      <div className="card search-bar p-lg mb-xl">
        <div className="search-input-container flex gap-md">
          <div className="search-bar flex-1">
            <i className="search-icon">🔍</i>
            <input
              className="form-control"
              type="search"
              placeholder="Search clinic name, service (e.g., cardiology)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search clinics by name or service"
            />
          </div>
          <div className="search-bar flex-1">
            <i className="search-icon">📍</i>
            <input
              className="form-control"
              type="text"
              placeholder="Filter by city (e.g., Lahore)"
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              aria-label="Filter clinics by city"
            />
          </div>
        </div>
      </div>

      {isLoadingClinics && (
        <div className="text-center p-xl">
          <div className="shimmer" style={{height: '50px', width: '200px', margin: '0 auto', borderRadius: 'var(--border-radius)'}}></div>
          <p className="text-primary mt-md">Loading clinics...</p>
        </div>
      )}
      
      {!isLoadingClinics && fetchError && (
        <div className="card p-lg bg-error-light text-center" role="alert">
          <strong>Error:</strong> {fetchError}
        </div>
      )}

      {!isLoadingClinics && !fetchError && filteredClinics.length === 0 && (
        <div className="card text-center p-xl mt-lg">
          <p className="text-muted">
            No clinics found matching your current search or filters.
          </p>
        </div>
      )}

      {!isLoadingClinics && !fetchError && filteredClinics.length > 0 && (
        <div className="clinic-card-grid stagger-list">
          {filteredClinics.map((clinic) => (
            <div 
              key={clinic.id} 
              className="clinic-card"
              onMouseEnter={() => setHoveredClinicId(clinic.id)}
              onMouseLeave={() => setHoveredClinicId(null)}
              role="listitem"
            >
              {clinic.isVerified && (
                <div className="clinic-verified-badge" title="Verified Clinic">
                  ✓
                </div>
              )}
              <img 
                className="clinic-image"
                src={clinic.displayImageUrls && clinic.displayImageUrls.length > 0 && clinic.displayImageUrls[0] ? clinic.displayImageUrls[0] : `https://placehold.co/600x400/E0E0E0/495057?text=${encodeURIComponent(clinic.name)}`} 
                alt={`${clinic.name}`} 
                onError={(e) => {
                  // Fallback to a generic placeholder if the primary image fails
                  if (e.currentTarget.src !== `https://placehold.co/600x400/E9ECEF/808080?text=Image+Error`) {
                    e.currentTarget.src = `https://placehold.co/600x400/E9ECEF/808080?text=Image+Error`;
                  }
                }}
              />
              <div className="clinic-body">
                <h3 className="clinic-name">{clinic.name}</h3>
                {clinic.type && <p className="clinic-type">{clinic.type}</p>}                {clinic.address?.city && (
                  <div className="clinic-location">
                    <span className="clinic-location-icon">📍</span>
                    {clinic.address.area ? `${clinic.address.area}, ` : ''}
                    {clinic.address.city}
                  </div>
                )}
                
                {clinic.primaryPhoneNumber && (
                  <div className="clinic-location">
                    <span className="clinic-location-icon">📞</span>
                    <a href={`tel:${clinic.primaryPhoneNumber}`} className="text-secondary">{clinic.primaryPhoneNumber}</a>
                  </div>
                )}
                
                {clinic.rating?.averageScore && typeof clinic.rating.count === 'number' && clinic.rating.count > 0 && (
                  <div className="doctor-rating">
                    <div className="doctor-rating-stars">⭐</div>
                    <div>{clinic.rating.averageScore.toFixed(1)}</div>
                    <div className="doctor-rating-count">({clinic.rating.count} rating{clinic.rating.count > 1 ? 's' : ''})</div>
                  </div>
                )}
                
                {clinic.servicesOffered && clinic.servicesOffered.length > 0 && (
                  <div className="clinic-tags" aria-label="Services offered">
                    {clinic.servicesOffered.slice(0, 3).map(service => (
                      <span key={service} className="clinic-tag">{service}</span>
                    ))}
                    {clinic.servicesOffered.length > 3 && <span className="clinic-tag">+ {clinic.servicesOffered.length - 3} more</span>}
                  </div>
                )}
                
                <p className="doctor-bio mt-md" title={clinic.about || ''}>
                  {clinic.about || 'No detailed description available.'}
                </p>
              </div>
              
              <div className="clinic-footer">
                <Link 
                  to={`/clinic/${clinic.id}`} 
                  className="btn btn-primary"
                >
                  View Details & Doctors
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FindCarePage;
