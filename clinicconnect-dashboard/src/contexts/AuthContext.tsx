// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, Timestamp as FirestoreTimestamp } from 'firebase/firestore'; // Renamed to avoid conflict
import { auth, db } from '../firebaseConfig';
import type { DocumentData } from 'firebase/firestore'; // Type-only import

// --- UserProfile Structure (as defined in your schema) ---
interface UserProfileAddress {
  street?: string | null;
  area?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  country?: string | null;
  landmark?: string | null;
  plusCode?: string | null;
}

interface UserProfileDetails {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profilePictureUrl?: string | null;
  primaryPhoneNumber?: string | null;
  isPhoneNumberVerified?: boolean;
  email?: string | null; // Profile email, can differ from auth email
  isEmailVerified?: boolean; // From Firebase Auth User
  dateOfBirth?: FirestoreTimestamp | null;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say' | string;
  cnicNumber?: string | null;
  address?: UserProfileAddress | null;
}

interface AdminSpecificData {
  managesClinicId?: string | null; // Allow null if not yet assigned
  permissions?: string[];
}

interface DoctorSpecificData {
  specializations?: string[];
  qualifications?: string[];
  pmdcLicenseNumber?: string | null;
  experienceYears?: number | null;
  consultationFee?: number | null;
  about?: string | null;
  languagesSpoken?: string[];
  slotDurationMinutes?: number | null;
  linkedClinicIds?: string[];
}

interface PatientSpecificData {
  bloodGroup?: string | null;
  medicalHistorySummary?: string | null;
  emergencyContact?: {
    name?: string | null;
    phoneNumber?: string | null;
    relationship?: string | null;
  } | null;
  insuranceDetails?: {
    providerName?: string | null;
    policyNumber?: string | null;
    expiryDate?: FirestoreTimestamp | null;
  } | null;
  linkedChwUid?: string | null;
}

interface ChwSpecificData {
  chwId?: string | null;
  assignedRegion?: {
    district?: string | null;
    tehsil?: string | null;
    areaName?: string | null;
  } | null;
  onboardedByAdminUid?: string | null;
  trainingCompleted?: string[];
  isActiveCHW?: boolean;
  // createdAt for CHW role specifically can be here or top-level user createdAt
}

interface NotificationPreferences {
  sms?: boolean;
  whatsapp?: boolean;
  email?: boolean;
  push?: boolean;
}

export interface UserProfile {
  uid: string; // Firebase Auth UID, same as document ID
  role: 'patient' | 'doctor' | 'clinic_admin' | 'chw_support' | 'unknown' | string; // 'unknown' is a good fallback
  email: string | null; // Primary email from Auth, stored for reference
  isActive?: boolean;
  languagePreference?: 'en' | 'ur' | string;
  createdAt?: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
  lastLogin?: FirestoreTimestamp | null;

  profile?: UserProfileDetails | null;
  notificationPreferences?: NotificationPreferences | null;
  adminSpecificData?: AdminSpecificData | null;
  doctorSpecificData?: DoctorSpecificData | null;
  patientSpecificData?: PatientSpecificData | null;
  chwSpecificData?: ChwSpecificData | null;
}

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loadingAuth: boolean; // True while onAuthStateChanged is resolving initially
  loadingProfile: boolean; // True while fetching Firestore profile for an authenticated user
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

// Helper to safely convert Firestore data to Timestamp or keep as null/undefined
const toTimestampSafe = (field: unknown): FirestoreTimestamp | null =>
    field instanceof FirestoreTimestamp ? field : null;

const toTimestampUndefinedSafe = (field: unknown): FirestoreTimestamp | undefined =>
    field instanceof FirestoreTimestamp ? field : undefined;


export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true); // True until the first auth state is determined
  const [loadingProfile, setLoadingProfile] = useState(false); // True only when actively fetching profile

  useEffect(() => {
    console.log("AuthContext: Subscribing to onAuthStateChanged.");
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log("AuthContext: onAuthStateChanged triggered. Firebase user UID:", user?.uid || "No user");
      setCurrentUser(user); // Set Firebase user (or null)

      if (user) {
        setLoadingProfile(true); // Indicate profile fetching has started
        console.log(`AuthContext: User ${user.uid} authenticated. Fetching Firestore profile...`);
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            const firestoreData = userDocSnap.data() as DocumentData; // Cast as DocumentData initially
            console.log("AuthContext: Firestore document exists. Data:", JSON.stringify(firestoreData));

            // Robust mapping from Firestore data to UserProfile interface
            const profile: UserProfile = {
              uid: user.uid,
              role: (typeof firestoreData.role === 'string' ? firestoreData.role : 'unknown') as UserProfile['role'],
              email: user.email, // Auth email is source of truth for top-level
              isActive: typeof firestoreData.isActive === 'boolean' ? firestoreData.isActive : true,
              languagePreference: typeof firestoreData.languagePreference === 'string' ? firestoreData.languagePreference : 'en',
              createdAt: toTimestampUndefinedSafe(firestoreData.createdAt),
              updatedAt: toTimestampUndefinedSafe(firestoreData.updatedAt),
              lastLogin: toTimestampSafe(firestoreData.lastLogin),
              profile: firestoreData.profile ? {
                displayName: firestoreData.profile.displayName || null,
                firstName: firestoreData.profile.firstName || null,
                lastName: firestoreData.profile.lastName || null,
                profilePictureUrl: firestoreData.profile.profilePictureUrl || null,
                primaryPhoneNumber: firestoreData.profile.primaryPhoneNumber || null,
                isPhoneNumberVerified: !!firestoreData.profile.isPhoneNumberVerified, // Ensure boolean
                email: firestoreData.profile.email || null, // Profile-specific email
                isEmailVerified: !!user.emailVerified, // From FirebaseUser
                dateOfBirth: toTimestampSafe(firestoreData.profile.dateOfBirth),
                gender: firestoreData.profile.gender || 'prefer_not_to_say',
                cnicNumber: firestoreData.profile.cnicNumber || null,
                address: firestoreData.profile.address || null,
              } : null,
              notificationPreferences: firestoreData.notificationPreferences || null,
              adminSpecificData: firestoreData.adminSpecificData || null,
              doctorSpecificData: firestoreData.doctorSpecificData || null,
              patientSpecificData: firestoreData.patientSpecificData ? {
                ...firestoreData.patientSpecificData,
                insuranceDetails: firestoreData.patientSpecificData.insuranceDetails ? {
                    ...firestoreData.patientSpecificData.insuranceDetails,
                    expiryDate: toTimestampSafe(firestoreData.patientSpecificData.insuranceDetails.expiryDate)
                } : null
              } : null,
              chwSpecificData: firestoreData.chwSpecificData || null,
            };
            setUserProfile(profile);
            console.log("AuthContext: User profile successfully mapped and set:", JSON.stringify(profile));
          } else {
            console.warn(`AuthContext: No Firestore profile document found for user ${user.uid}. Setting userProfile with role 'unknown'.`);
            // This case should ideally be rare if createNewUserDocument function works.
            setUserProfile({
              uid: user.uid,
              email: user.email,
              role: 'unknown', // Default role if Firestore document is missing
            });
          }
        } catch (error) {
          console.error("AuthContext: Error fetching user profile from Firestore:", error);
          // Set a minimal profile with 'unknown' role on error to allow potential graceful degradation
          setUserProfile({
            uid: user.uid,
            email: user.email,
            role: 'unknown',
          });
        } finally {
          console.log("AuthContext: Setting loadingProfile to false.");
          setLoadingProfile(false); // Profile fetching attempt (success or fail) is complete
        }
      } else { // No Firebase auth user (logged out)
        setUserProfile(null);
        if (loadingProfile) { // If we were loading a profile, stop it
            console.log("AuthContext: User logged out during profile load. Setting loadingProfile to false.");
            setLoadingProfile(false);
        }
      }
      // This marks the end of the initial onAuthStateChanged processing
      console.log("AuthContext: Setting loadingAuth to false.");
      setLoadingAuth(false);
    });

    return () => {
      console.log("AuthContext: Unsubscribing from onAuthStateChanged.");
      unsubscribe();
    };
  }, []); // Empty dependency array: runs once on mount, cleans up on unmount

  const value = {
    currentUser,
    userProfile,
    loadingAuth,
    loadingProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};