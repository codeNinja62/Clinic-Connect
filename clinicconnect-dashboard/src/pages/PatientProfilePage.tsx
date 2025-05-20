// src/pages/PatientProfilePage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Timestamp as FirestoreTimestamp } from 'firebase/firestore';
import { functions } from '../firebaseConfig';
import { httpsCallable } from 'firebase/functions';
import type { HttpsCallableResult } from 'firebase/functions';
// Assuming these are exported from AuthContext or a shared types/index.ts
import type { UserProfile, UserProfileDetails, PatientSpecificData, UserProfileAddress } from '../contexts/AuthContext';

// Type for the form data, closely mirroring parts of UserProfile
type ProfileFormData = {
  displayName: string;
  firstName: string;
  lastName: string;
  primaryPhoneNumber: string;
  profileEmail: string; // Profile email, not auth email (auth email is not editable here)
  dateOfBirth: string; // Store as YYYY-MM-DD string for input
  gender: UserProfileDetails['gender']; // Use the specific gender type
  cnicNumber: string;
  // Address fields
  addressStreet: string;
  addressArea: string;
  addressCity: string;
  addressProvince: string;
  addressPostalCode: string;
  addressLandmark: string;
  // PatientSpecificData fields
  bloodGroup: string;
  medicalHistorySummary: string;
  emergencyContactName: string;
  emergencyContactPhoneNumber: string;
  emergencyContactRelationship: string;
};

// Payload for the Firebase Function - what the client sends
interface UpdateUserProfilePayloadClient {
  profileUpdates?: Partial<Omit<UserProfileDetails, 'dateOfBirth' | 'address' | 'isEmailVerified' | 'isPhoneNumberVerified'> & { dateOfBirth?: string | null, address?: Partial<UserProfileAddress> | null }>;
  patientSpecificUpdates?: Partial<Omit<PatientSpecificData, 'emergencyContact' | 'insuranceDetails'> & { emergencyContact?: Partial<PatientSpecificData['emergencyContact']> | null }>;
  // We are not updating notificationPreferences from this form for now
}

// Response from the Firebase Function
interface UpdateUserProfileResponse {
  success: boolean;
  message: string;
}

// For HttpsCallable errors
interface CallableError extends Error {
  code: string;
  details?: unknown;
}
function isCallableError(error: unknown): error is CallableError {
  return error instanceof Error && typeof (error as CallableError).code === 'string';
}

// --- Reusable Form Styling Components (Conceptual - can be actual components or just styles) ---
// Using our CSS classes from our design system instead of inline styles
// --- End Form Styling Components ---


const PatientProfilePage: React.FC = () => {
  const { userProfile, loadingAuth, loadingProfile, currentUser } = useAuth();
  // const navigate = useNavigate(); // Not used in this version

  const [isEditMode, setIsEditMode] = useState(false);
  const [formData, setFormData] = useState<Partial<ProfileFormData>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Initialize form with data from userProfile
  const initializeForm = useCallback(() => {
    if (userProfile) {
      const dob = userProfile.profile?.dateOfBirth;
      // Ensure dob is a FirestoreTimestamp before calling toDate()
      const dobString = dob instanceof FirestoreTimestamp ? dob.toDate().toISOString().split('T')[0] : '';

      setFormData({
        displayName: userProfile.profile?.displayName || '',
        firstName: userProfile.profile?.firstName || '',
        lastName: userProfile.profile?.lastName || '',
        primaryPhoneNumber: userProfile.profile?.primaryPhoneNumber || '',
        profileEmail: userProfile.profile?.email || '', // This is profile.email, not userProfile.email (auth email)
        dateOfBirth: dobString,
        gender: userProfile.profile?.gender || 'prefer_not_to_say',
        cnicNumber: userProfile.profile?.cnicNumber || '',
        addressStreet: userProfile.profile?.address?.street || '',
        addressArea: userProfile.profile?.address?.area || '',
        addressCity: userProfile.profile?.address?.city || '',
        addressProvince: userProfile.profile?.address?.province || '',
        addressPostalCode: userProfile.profile?.address?.postalCode || '',
        addressLandmark: userProfile.profile?.address?.landmark || '',
        bloodGroup: userProfile.patientSpecificData?.bloodGroup || '',
        medicalHistorySummary: userProfile.patientSpecificData?.medicalHistorySummary || '',
        emergencyContactName: userProfile.patientSpecificData?.emergencyContact?.name || '',
        emergencyContactPhoneNumber: userProfile.patientSpecificData?.emergencyContact?.phoneNumber || '',
        emergencyContactRelationship: userProfile.patientSpecificData?.emergencyContact?.relationship || '',
      });
    }
  }, [userProfile]); // Dependency: userProfile

  useEffect(() => {
    if (!isEditMode) { // Re-initialize form if user exits edit mode or profile updates elsewhere
        initializeForm();
    }
  }, [userProfile, isEditMode, initializeForm]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (successMessage) setSuccessMessage(null); // Clear messages on new input
    if (error) setError(null);
  };

  const handleSubmitProfileUpdate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentUser || !userProfile) { // Check both currentUser and userProfile
      setError("User session is invalid. Please re-login.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    // Construct payload with only changed values compared to initial userProfile state
    // This prevents sending unchanged data or overwriting fields with empty strings if not intended.
    const payload: UpdateUserProfilePayloadClient = {
        profileUpdates: {},
        patientSpecificUpdates: {}
    };
    
    const currentProfile = userProfile.profile || {};
    const currentPatientData = userProfile.patientSpecificData || {};
    const currentEmergencyContact = currentPatientData.emergencyContact || {};
    const currentAddress = currentProfile.address || {};

    // Helper to add if changed
    const addIfChanged = (obj: any, key: string, formValue: any, originalValue: any) => {
        // Treat empty string from form as intending to clear, send null
        const valueToConsider = formValue === '' ? null : formValue;
        if (valueToConsider !== (originalValue === undefined ? null : originalValue)) { // Compare with original, handling undefined
            obj[key] = valueToConsider;
        }
    };
    
    // Profile Updates
    addIfChanged(payload.profileUpdates!, 'displayName', formData.displayName, currentProfile.displayName);
    addIfChanged(payload.profileUpdates!, 'firstName', formData.firstName, currentProfile.firstName);
    addIfChanged(payload.profileUpdates!, 'lastName', formData.lastName, currentProfile.lastName);
    addIfChanged(payload.profileUpdates!, 'primaryPhoneNumber', formData.primaryPhoneNumber, currentProfile.primaryPhoneNumber);
    addIfChanged(payload.profileUpdates!, 'email', formData.profileEmail, currentProfile.email);
    
    const currentDobString = currentProfile.dateOfBirth instanceof FirestoreTimestamp ? currentProfile.dateOfBirth.toDate().toISOString().split('T')[0] : null;
    if (formData.dateOfBirth !== (currentDobString || '')) { // Compare with string form of current DOB
        payload.profileUpdates!.dateOfBirth = formData.dateOfBirth || null; // Send string or null
    }

    addIfChanged(payload.profileUpdates!, 'gender', formData.gender, currentProfile.gender);
    addIfChanged(payload.profileUpdates!, 'cnicNumber', formData.cnicNumber, currentProfile.cnicNumber);

    const addressChanges: Partial<UserProfileAddress> = {};
    addIfChanged(addressChanges, 'street', formData.addressStreet, currentAddress.street);
    addIfChanged(addressChanges, 'area', formData.addressArea, currentAddress.area);
    addIfChanged(addressChanges, 'city', formData.addressCity, currentAddress.city);
    addIfChanged(addressChanges, 'province', formData.addressProvince, currentAddress.province);
    addIfChanged(addressChanges, 'postalCode', formData.addressPostalCode, currentAddress.postalCode);
    addIfChanged(addressChanges, 'landmark', formData.addressLandmark, currentAddress.landmark);
    if (Object.keys(addressChanges).length > 0) {
        addressChanges.country = currentAddress.country || 'Pakistan'; // Preserve or default country
        payload.profileUpdates!.address = addressChanges;
    }
    
    // Patient Specific Updates (only if user is a patient)
    if (userProfile.role === 'patient') {
        addIfChanged(payload.patientSpecificUpdates!, 'bloodGroup', formData.bloodGroup, currentPatientData.bloodGroup);
        addIfChanged(payload.patientSpecificUpdates!, 'medicalHistorySummary', formData.medicalHistorySummary, currentPatientData.medicalHistorySummary);

        const emergencyContactChanges: Partial<NonNullable<PatientSpecificData['emergencyContact']>> = {};
        addIfChanged(emergencyContactChanges, 'name', formData.emergencyContactName, currentEmergencyContact.name);
        addIfChanged(emergencyContactChanges, 'phoneNumber', formData.emergencyContactPhoneNumber, currentEmergencyContact.phoneNumber);
        addIfChanged(emergencyContactChanges, 'relationship', formData.emergencyContactRelationship, currentEmergencyContact.relationship);
        
        if (Object.keys(emergencyContactChanges).length > 0) {
            payload.patientSpecificUpdates!.emergencyContact = emergencyContactChanges;
        }
    }

    // Clean up empty top-level update objects from payload
    if (Object.keys(payload.profileUpdates || {}).length === 0) delete payload.profileUpdates;
    if (Object.keys(payload.patientSpecificUpdates || {}).length === 0) delete payload.patientSpecificUpdates;
    
    if (!payload.profileUpdates && !payload.patientSpecificUpdates) {
        setSuccessMessage("No changes were made to your profile.");
        setIsSubmitting(false);
        setIsEditMode(false);
        return;
    }

    try {
        const updateUserProfileFunction = httpsCallable<UpdateUserProfilePayloadClient, UpdateUserProfileResponse>(functions, 'updateUserProfile');
        const result: HttpsCallableResult<UpdateUserProfileResponse> = await updateUserProfileFunction(payload);

        if (result.data.success) {
            setSuccessMessage(result.data.message || "Profile updated successfully!");
            setIsEditMode(false);
            // To see changes immediately, AuthContext would need a refresh mechanism.
            // For now, inform user. A re-fetch by AuthContext on next appropriate event is ideal.
            alert("Profile update successful! Your changes have been saved.");
            // Potentially trigger a refresh in AuthContext if implemented:
            // refreshUserProfile(); 
        } else {
            setError(result.data.message || "Failed to update profile. Please ensure all data is valid.");
        }
    } catch (e: unknown) {
        console.error("Error calling updateUserProfile function:", e);
        let msg = "An unexpected error occurred while updating your profile.";
        if (isCallableError(e)) {
          msg = e.details && typeof (e.details as {message?: string})?.message === 'string' 
                ? (e.details as {message: string}).message 
                : e.message;
        } else if (e instanceof Error) {
          msg = e.message;
        }
        setError(`Profile update error: ${msg}`);
    } finally {
        setIsSubmitting(false);
    }
  };

  if (loadingAuth || loadingProfile || !userProfile) {
    return (
      <div className="page-container loading-container">
        <div className="loading-spinner"></div>
        <p className="loading-text mt-md">Loading your profile information...</p>
      </div>
    );
  }

  const displayValue = (value: string | number | null | undefined, placeholder = 'Not set') => {
    if (value === null || value === undefined || String(value).trim() === '') {
        return <span style={{color: 'var(--color-text-muted)'}}>{placeholder}</span>;
    }
    return String(value);
  };
  
  const displayDate = (timestamp: FirestoreTimestamp | null | undefined, placeholder = 'Not set') => {
    if (timestamp instanceof FirestoreTimestamp) {
        return timestamp.toDate().toLocaleDateString('en-CA'); // YYYY-MM-DD format
    }
    return <span style={{color: 'var(--color-text-muted)'}}>{placeholder}</span>;
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <h1 className="page-title">My Profile</h1>
        {!isEditMode && (
          <button 
            onClick={() => { 
                initializeForm(); // Ensure form data is fresh before entering edit mode
                setIsEditMode(true); 
                setError(null); 
                setSuccessMessage(null); 
            }} 
            className="btn btn-primary"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-xs">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            Edit Profile
          </button>
        )}
      </header>

      {successMessage && <div className="alert alert-success mb-lg">{successMessage}</div>}
      {error && <div className="alert alert-danger mb-lg">{error}</div>}

      <form onSubmit={handleSubmitProfileUpdate}>
        {/* Personal Information Card */}
        <div className="card profile-card mb-lg slide-up">
          <div className="card-header">
            <h3 className="card-title">Personal Information</h3>
          </div>
          <div className="card-body">
            <div className="form-row">
              <div className="form-group form-group-full">
                <label className="form-label" htmlFor="displayName">Display Name</label>
                {isEditMode ? (
                  <input className="form-control" type="text" id="displayName" name="displayName" value={formData.displayName || ''} onChange={handleInputChange} />
                ) : <p className="form-value">{displayValue(userProfile.profile?.displayName)}</p>}
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="firstName">First Name</label>
                {isEditMode ? (
                  <input className="form-control" type="text" id="firstName" name="firstName" value={formData.firstName || ''} onChange={handleInputChange} />
                ) : <p className="form-value">{displayValue(userProfile.profile?.firstName)}</p>}
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="lastName">Last Name</label>
                {isEditMode ? (
                  <input className="form-control" type="text" id="lastName" name="lastName" value={formData.lastName || ''} onChange={handleInputChange} />
                ) : <p className="form-value">{displayValue(userProfile.profile?.lastName)}</p>}
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Authentication Email</label>
                <p className="form-value text-muted">
                  {userProfile.email || 'N/A'} 
                  <span className="badge badge-light-muted ml-sm">Cannot be changed here</span>
                </p>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="profileEmail">Profile Email (Contact)</label>
                {isEditMode ? (
                  <input className="form-control" type="email" id="profileEmail" name="profileEmail" value={formData.profileEmail || ''} onChange={handleInputChange} />
                ) : <p className="form-value">{displayValue(userProfile.profile?.email)}</p>}
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="primaryPhoneNumber">Phone Number</label>
                {isEditMode ? (
                  <input className="form-control" type="tel" id="primaryPhoneNumber" name="primaryPhoneNumber" value={formData.primaryPhoneNumber || ''} onChange={handleInputChange} placeholder="+923xxxxxxxxx" />
                ) : <p className="form-value">{displayValue(userProfile.profile?.primaryPhoneNumber)}</p>}
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="dateOfBirth">Date of Birth</label>
                {isEditMode ? (
                  <input className="form-control" type="date" id="dateOfBirth" name="dateOfBirth" value={formData.dateOfBirth || ''} onChange={handleInputChange} max={new Date().toISOString().split("T")[0]} />
                ) : <p className="form-value">{displayDate(userProfile.profile?.dateOfBirth)}</p>}
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="gender">Gender</label>
                {isEditMode ? (
                  <select className="form-control" id="gender" name="gender" value={formData.gender || 'prefer_not_to_say'} onChange={handleInputChange}>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                ) : <p className="form-value capitalize">{displayValue(userProfile.profile?.gender?.replace('_', ' '))}</p>}
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="cnicNumber">CNIC Number</label>
                {isEditMode ? (
                  <input className="form-control" type="text" id="cnicNumber" name="cnicNumber" value={formData.cnicNumber || ''} onChange={handleInputChange} placeholder="e.g., 12345-1234567-1" />
                ) : <p className="form-value">{displayValue(userProfile.profile?.cnicNumber)}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Address Information Card */}
        <div className="card profile-card mb-lg slide-up">
          <div className="card-header">
            <h3 className="card-title">Address Information</h3>
          </div>
          <div className="card-body">
            <div className="form-row">
              <div className="form-group form-group-full">
                <label className="form-label" htmlFor="addressStreet">Street Address</label>
                {isEditMode ? (
                  <input className="form-control" type="text" id="addressStreet" name="addressStreet" value={formData.addressStreet || ''} onChange={handleInputChange} />
                ) : <p className="form-value">{displayValue(userProfile.profile?.address?.street)}</p>}
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="addressArea">Area / Locality</label>
                {isEditMode ? (
                  <input className="form-control" type="text" id="addressArea" name="addressArea" value={formData.addressArea || ''} onChange={handleInputChange} />
                ) : <p className="form-value">{displayValue(userProfile.profile?.address?.area)}</p>}
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="addressCity">City</label>
                {isEditMode ? (
                  <input className="form-control" type="text" id="addressCity" name="addressCity" value={formData.addressCity || ''} onChange={handleInputChange} />
                ) : <p className="form-value">{displayValue(userProfile.profile?.address?.city)}</p>}
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="addressProvince">Province</label>
                {isEditMode ? (
                  <input className="form-control" type="text" id="addressProvince" name="addressProvince" value={formData.addressProvince || ''} onChange={handleInputChange} />
                ) : <p className="form-value">{displayValue(userProfile.profile?.address?.province)}</p>}
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="addressPostalCode">Postal Code</label>
                {isEditMode ? (
                  <input className="form-control" type="text" id="addressPostalCode" name="addressPostalCode" value={formData.addressPostalCode || ''} onChange={handleInputChange} />
                ) : <p className="form-value">{displayValue(userProfile.profile?.address?.postalCode)}</p>}
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group form-group-full">
                <label className="form-label" htmlFor="addressLandmark">
                  Landmark <span className="text-muted text-sm">(Optional)</span>
                </label>
                {isEditMode ? (
                  <input className="form-control" type="text" id="addressLandmark" name="addressLandmark" value={formData.addressLandmark || ''} onChange={handleInputChange} />
                ) : <p className="form-value">{displayValue(userProfile.profile?.address?.landmark)}</p>}
              </div>
            </div>
          </div>
        </div>
        
        {/* Patient Specific Data Card */}
        {userProfile.role === 'patient' && (
          <div className="card profile-card mb-lg slide-up">
            <div className="card-header">
              <h3 className="card-title">Medical & Emergency Information</h3>
            </div>
            <div className="card-body">
              <div className="form-row">
                <div className="form-group form-group-full">
                  <label className="form-label" htmlFor="bloodGroup">Blood Group</label>
                  {isEditMode ? (
                    <input className="form-control" type="text" id="bloodGroup" name="bloodGroup" value={formData.bloodGroup || ''} onChange={handleInputChange} />
                  ) : <p className="form-value">{displayValue(userProfile.patientSpecificData?.bloodGroup)}</p>}
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group form-group-full">
                  <label className="form-label" htmlFor="medicalHistorySummary">
                    Medical History Summary <span className="text-muted text-sm">(Allergies, Chronic Conditions)</span>
                  </label>
                  {isEditMode ? (
                    <textarea className="form-control" id="medicalHistorySummary" name="medicalHistorySummary" value={formData.medicalHistorySummary || ''} onChange={handleInputChange} rows={4}></textarea>
                  ) : <p className="form-value pre-wrap">{displayValue(userProfile.patientSpecificData?.medicalHistorySummary)}</p>}
                </div>
              </div>
              
              <h4 className="section-subtitle">Emergency Contact</h4>
              
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="emergencyContactName">Full Name</label>
                  {isEditMode ? (
                    <input className="form-control" type="text" id="emergencyContactName" name="emergencyContactName" value={formData.emergencyContactName || ''} onChange={handleInputChange} />
                  ) : <p className="form-value">{displayValue(userProfile.patientSpecificData?.emergencyContact?.name)}</p>}
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="emergencyContactPhoneNumber">Phone Number</label>
                  {isEditMode ? (
                    <input className="form-control" type="tel" id="emergencyContactPhoneNumber" name="emergencyContactPhoneNumber" value={formData.emergencyContactPhoneNumber || ''} onChange={handleInputChange} />
                  ) : <p className="form-value">{displayValue(userProfile.patientSpecificData?.emergencyContact?.phoneNumber)}</p>}
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="emergencyContactRelationship">Relationship</label>
                  {isEditMode ? (
                    <input className="form-control" type="text" id="emergencyContactRelationship" name="emergencyContactRelationship" value={formData.emergencyContactRelationship || ''} onChange={handleInputChange} />
                  ) : <p className="form-value">{displayValue(userProfile.patientSpecificData?.emergencyContact?.relationship)}</p>}
                </div>
                <div className="form-group"></div> {/* Placeholder for alignment */}
              </div>
            </div>
          </div>
        )}

        {isEditMode && (
          <div className="form-actions">
            <button 
                type="button" 
                onClick={() => { 
                    setIsEditMode(false); 
                    setError(null); 
                    setSuccessMessage(null); 
                    initializeForm(); // Reset form to original profile data on cancel
                }} 
                className="btn btn-secondary btn-lg"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-xs">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
              Cancel
            </button>
            <button type="submit" className="btn btn-success btn-lg" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <span className="spinner-border spinner-border-sm mr-sm"></span>
                  Saving Changes...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-xs">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                    <polyline points="17 21 17 13 7 13 7 21"></polyline>
                    <polyline points="7 3 7 8 15 8"></polyline>
                  </svg>
                  Save Changes
                </>
              )}
            </button>
          </div>
        )}
      </form>
      
      <div className="back-link">
        <Link to="/find-care" className="btn btn-outline-primary">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-xs">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          Back to Find Care
        </Link>
      </div>
    </div>
  );
};

export default PatientProfilePage;