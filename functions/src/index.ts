import { logger as functionsLogger } from "firebase-functions";
import * as admin from "firebase-admin";
import * as functionsV1 from "firebase-functions/v1"; // Explicitly for v1 triggers
import { onCall, HttpsError } from "firebase-functions/v2/https"; // For v2 Callable functions
import { Timestamp } from "firebase-admin/firestore"; // Import Timestamp from firebase-admin for backend

// Check if Firebase Admin SDK has already been initialized
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore(); // Firestore instance

interface ProcessedError {
  message: string;
  name?: string;
  stack?: string;
  originalErrorType?: string;
  details?: string | { [key: string]: unknown };
}

export const createNewUserDocument = functionsV1.auth
  .user()
  .onCreate(async (user: admin.auth.UserRecord) => {
    const { uid, email, phoneNumber, displayName, photoURL } = user;

    functionsLogger.info("Auth onCreate (V1) Triggered for UID:", uid, {
      email: email,
      displayName: displayName,
      phoneNumber: phoneNumber,
    });

    const newUserDocument = {
      uid: uid,
      role: "patient",
      email: email || null,
      profile: {
        primaryPhoneNumber: phoneNumber || null,
        isPhoneNumberVerified: !!phoneNumber,
        email: email || null,
        isEmailVerified: user.emailVerified || false,
        displayName: displayName || "",
        profilePictureUrl: photoURL || "",
        firstName: "",
        lastName: "",
        dateOfBirth: null,
        gender: "prefer_not_to_say",
        address: {
          street: "", area: "", city: "", province: "",
          postalCode: "", country: "Pakistan",
        },
      },
      patientSpecificData: {},
      doctorSpecificData: {},
      adminSpecificData: {},
      chwSpecificData: {},
      languagePreference: "en",
      notificationPreferences: {
        sms: true, whatsapp: false, email: !!email, push: true,
      },
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLogin: null,
    };

    try {
      await db.collection("users").doc(uid).set(newUserDocument);
      functionsLogger.info(`Successfully created Firestore user document (V1 trigger) for UID: ${uid}`);
    } catch (error: unknown) {
      let processedErrorForLogging: ProcessedError;
      if (error instanceof Error) {
        processedErrorForLogging = { message: error.message, name: error.name, stack: error.stack };
      } else if (typeof error === "string") {
        processedErrorForLogging = { message: error };
      } else if (error && typeof error === "object") {
        try {
          const errorDetails = JSON.parse(JSON.stringify(error)) as { [key: string]: unknown };
          processedErrorForLogging = {
            message: "Object error received during user document creation.",
            details: errorDetails,
            originalErrorType: typeof error,
          };
        } catch (serializationError) {
          processedErrorForLogging = {
            message: "Original error object could not be fully serialized in createNewUserDocument.",
            originalErrorType: typeof error,
            details: String(serializationError),
          };
        }
      } else {
        processedErrorForLogging = {
          message: "Unknown error type encountered in createNewUserDocument.",
          originalErrorType: typeof error,
          details: String(error),
        };
      }
      functionsLogger.error(`Error creating Firestore user document (V1 trigger) for UID: ${uid}`, processedErrorForLogging);
    }
  });


export const bookAppointment = onCall(async (request) => {
  if (!request.auth) {
    functionsLogger.error("bookAppointment: Unauthenticated user attempt.");
    throw new HttpsError("unauthenticated", "You must be logged in to book an appointment.");
  }
  const patientUid = request.auth.uid;
  const data = request.data;
  const {
    clinicId,
    doctorId,
    appointmentDateTime, // Expected as "YYYY-MM-DDTHH:MM:SS" (local to doctor's clinic)
    reasonForVisit,
    durationMinutes: clientDurationMinutes,
    symptomsInput: clientSymptomsInput,
    isTelemedicine: clientIsTelemedicine,
    telemedicineDetails: clientTelemedicineDetails,
  } = data;

  functionsLogger.info(`bookAppointment: Called by UID: ${patientUid} for doctor ${doctorId || "any"} at clinic ${clinicId} for datetime ${appointmentDateTime}`);

  if (!clinicId || !appointmentDateTime) {
    functionsLogger.error("bookAppointment: Missing required fields clinicId or appointmentDateTime.");
    throw new HttpsError("invalid-argument", "Missing required fields: clinicId and appointmentDateTime must be provided.");
  }

  // --- TIMEZONE HANDLING for "Asia/Karachi" (PKT, UTC+5) ---
  const DOCTOR_OPERATIONAL_TIMEZONE_NAME = "Asia/Karachi"; // For logging
  const PKT_OFFSET_FROM_UTC_MINUTES = 5 * 60; // Pakistan Standard Time is UTC+5 (300 minutes)

  let parsedAppointmentDateTimeUTC: Date;
  try {
    const localDateTimeStr = String(appointmentDateTime);

    const [datePart, timePart] = localDateTimeStr.split("T");
    if (!datePart || !timePart) {
      throw new Error(`Invalid datetime string format: "${localDateTimeStr}". Expected "YYYY-MM-DDTHH:MM:SS"`);
    }
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute, second] = timePart.split(":").map(Number);

    if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(minute) || (second !== undefined && isNaN(second)) ) {
      throw new Error(`Invalid date or time components in appointmentDateTime string: "${localDateTimeStr}"`);
    }

    // Step 1: Construct a Date object using Date.UTC(). This treats the components as if they were UTC.
    // Note: JavaScript months are 0-indexed (0 for January, 11 for December).
    const tempDateAsIfUTC = new Date(Date.UTC(year, month - 1, day, hour, minute, second || 0));
    functionsLogger.info(`bookAppointment: Intermediate tempDateAsIfUTC (nominal UTC from components): ${tempDateAsIfUTC.toISOString()}`);

    // Step 2: Since tempDateAsIfUTC was created with PKT local time components but *as UTC*,
    // to get the true UTC time, we subtract the PKT offset.
    // e.g., If 09:00 PKT, tempDateAsIfUTC is 09:00 "nominal UTC". True UTC is 09:00 PKT - 5 hours = 04:00 UTC.
    parsedAppointmentDateTimeUTC = new Date(tempDateAsIfUTC.getTime() - (PKT_OFFSET_FROM_UTC_MINUTES * 60000));

    if (isNaN(parsedAppointmentDateTimeUTC.getTime())) {
      throw new Error(`Failed to parse "${localDateTimeStr}" into a valid UTC date.`);
    }

    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60000);
    if (parsedAppointmentDateTimeUTC < fiveMinutesFromNow) {
      throw new Error(`Appointment date and time (${parsedAppointmentDateTimeUTC.toISOString()}) must be at least 5 minutes in the future from now (${now.toISOString()}).`);
    }
    functionsLogger.info(`bookAppointment: Parsed local DT "${localDateTimeStr}" (assumed ${DOCTOR_OPERATIONAL_TIMEZONE_NAME}) to UTC: ${parsedAppointmentDateTimeUTC.toISOString()}`);
  } catch (e: unknown) {
    let errMsg = "Invalid appointmentDateTime provided or failed timezone conversion.";
    if (e instanceof Error) errMsg = e.message;
    functionsLogger.error("bookAppointment: Error parsing appointmentDateTime.", { inputDateTime: appointmentDateTime, error: errMsg });
    throw new HttpsError("invalid-argument", `Invalid appointment date/time: ${errMsg}`);
  }

  const DEFAULT_APPOINTMENT_DURATION_MINUTES = 30;
  const appointmentDuration = typeof clientDurationMinutes === "number" && clientDurationMinutes > 0 ?
    clientDurationMinutes :
    DEFAULT_APPOINTMENT_DURATION_MINUTES;
  const appointmentEndTimeUTC = new Date(parsedAppointmentDateTimeUTC.getTime() + appointmentDuration * 60000);

  let doctorDisplayName = "the clinic";
  if (doctorId) {
    try {
      const doctorDoc = await db.collection("users").doc(doctorId).get();
      if (doctorDoc.exists) {
        const doctorProfile = doctorDoc.data()?.profile;
        doctorDisplayName = doctorProfile?.displayName || `${doctorProfile?.firstName || ""} ${doctorProfile?.lastName || ""}`.trim() || `Dr. ${doctorId.substring(0, 6)}`;
      }
    } catch (docError) {
      functionsLogger.warn(`bookAppointment: Could not fetch doctor's name for notification for doctorId ${doctorId}`, docError);
    }
  }

  const newAppointmentDocument = {
    patientUid: patientUid,
    patientName: request.auth.token?.name || null,
    patientPhoneNumber: request.auth.token?.phone_number || null,
    clinicId: clinicId,
    doctorId: doctorId || null,
    doctorName: doctorId ? doctorDisplayName : null,
    appointmentDateTime: Timestamp.fromDate(parsedAppointmentDateTimeUTC),
    appointmentEndTime: Timestamp.fromDate(appointmentEndTimeUTC),
    durationMinutes: appointmentDuration,
    reasonForVisit: reasonForVisit || "",
    symptomsInput: clientSymptomsInput || null,
    status: "pending_clinic_approval",
    bookingMethod: "ONLINE_PATIENT_APP",
    bookedByUid: patientUid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    isTelemedicine: clientIsTelemedicine || false,
    cancellationReason: null,
    rescheduledFromAppointmentId: null,
    rescheduledToAppointmentId: null,
    checkInTime: null,
    checkInMethod: null,
    ePrescriptionId: null,
    billingId: null,
    patientFeedback: null,
    notes: "",
    telemedicineDetails: (clientIsTelemedicine || false) ? (clientTelemedicineDetails || {}) : null,
  };

  try {
    const appointmentRef = await db.collection("appointments").add(newAppointmentDocument);
    functionsLogger.info(`bookAppointment: Successfully created appointment ${appointmentRef.id} for patient ${patientUid} at UTC: ${parsedAppointmentDateTimeUTC.toISOString()}`);

    const patientNotificationRef = db.collection("users").doc(patientUid)
      .collection("notifications").doc();
    const appointmentDateForMessage = parsedAppointmentDateTimeUTC.toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZone: DOCTOR_OPERATIONAL_TIMEZONE_NAME,
    });

    await patientNotificationRef.set({
      title: "Appointment Requested",
      message: `Your appointment request for ${appointmentDateForMessage} with ${doctorDisplayName} is pending approval.`,
      type: "APPOINTMENT_PENDING",
      linkTo: `/my-appointments/${appointmentRef.id}`,
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      relatedEntityId: appointmentRef.id,
    });
    functionsLogger.info(`bookAppointment: Created 'APPOINTMENT_PENDING' notification for patient ${patientUid} for appointment ${appointmentRef.id}`);

    return { success: true, appointmentId: appointmentRef.id, message: "Appointment requested successfully. Awaiting clinic confirmation." };
  } catch (error: unknown) {
    let clientMessage = "Failed to book appointment. Please try again later.";
    let errorDetailsForClient: object = { detail: "An internal error occurred." };
    let processedErrorForLogging: ProcessedError;

    if (error instanceof HttpsError) {
      throw error;
    }
    if (error instanceof Error) {
      clientMessage = error.message || clientMessage;
      errorDetailsForClient = { name: error.name, message: error.message };
      processedErrorForLogging = { message: error.message, name: error.name, stack: error.stack };
    } else if (typeof error === "string") {
      clientMessage = error; errorDetailsForClient = { message: error }; processedErrorForLogging = { message: error };
    } else if (error && typeof error === "object") {
      try {
        const errorObjectString = JSON.stringify(error);
        const parsedErrorObject = JSON.parse(errorObjectString) as {message?: string; [key: string]: unknown};
        if (typeof parsedErrorObject.message === "string") clientMessage = parsedErrorObject.message;
        errorDetailsForClient = parsedErrorObject;
        processedErrorForLogging = { message: "Object error received.", details: parsedErrorObject, originalErrorType: typeof error };
      } catch (serializationErrorCaught) {
        const fallbackMessage = "A non-serializable error object was encountered."; clientMessage = fallbackMessage;
        errorDetailsForClient = { detail: fallbackMessage };
        processedErrorForLogging = { message: fallbackMessage, originalErrorType: typeof error, details: String(serializationErrorCaught) };
      }
    } else {
      const fallbackMessage = "An unknown error type was encountered."; clientMessage = fallbackMessage;
      errorDetailsForClient = { detail: fallbackMessage };
      processedErrorForLogging = { message: fallbackMessage, originalErrorType: typeof error, details: String(error) };
    }
    functionsLogger.error(`bookAppointment: Error creating appointment for patient ${patientUid}`, processedErrorForLogging);
    throw new HttpsError("internal", clientMessage, errorDetailsForClient);
  }
});

// --- getAvailableSlots FUNCTION ---
interface GetAvailableSlotsData {
  doctorId: string;
  date: string;
}

interface TimeSlot {
  startTime: string;
  endTime: string;
}

const timeToMinutes = (timeStrInput: string): number => {
  const timeStr = String(timeStrInput || "").trim().replace(/^"|"$/g, "");
  const [hours, minutes] = timeStr.split(":").map(Number);
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    functionsLogger.warn(`Invalid time string in timeToMinutes. Original='${timeStrInput}', Cleaned='${timeStr}'`);
    return NaN;
  }
  return hours * 60 + minutes;
};

const minutesToTime = (totalMinutes: number): string => {
  if (isNaN(totalMinutes) || totalMinutes < 0 || totalMinutes >= 24 * 60) {
    functionsLogger.warn(`Invalid totalMinutes received in minutesToTime: ${totalMinutes}`);
    return "00:00";
  }
  const hours = Math.floor(totalMinutes / 60).toString().padStart(2, "0");
  const minutes = (totalMinutes % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
};

export const getAvailableSlots = onCall(async (request): Promise<{ slots: TimeSlot[] }> => {
  if (!request.auth) {
    functionsLogger.error("getAvailableSlots: Unauthenticated user attempt.");
    throw new HttpsError("unauthenticated", "You must be logged in to view available slots.");
  }
  const patientUid = request.auth.uid;

  const data = request.data as GetAvailableSlotsData;
  const { doctorId, date: targetDateString } = data;
  functionsLogger.info(`getAvailableSlots called by patient UID: ${patientUid} for doctor UID: ${doctorId} on date: ${targetDateString}`);

  if (!doctorId || !targetDateString || !/^\d{4}-\d{2}-\d{2}$/.test(targetDateString)) {
    throw new HttpsError("invalid-argument", "doctorId and a valid date (YYYY-MM-DD) are required.");
  }

  const targetDateUtc = new Date(targetDateString + "T00:00:00.000Z");
  if (isNaN(targetDateUtc.getTime())) {
    throw new HttpsError("invalid-argument", "Invalid date value.");
  }

  try {
    const doctorDocSnap = await db.collection("users").doc(doctorId).get();
    if (!doctorDocSnap.exists || doctorDocSnap.data()?.role !== "doctor") {
      throw new HttpsError("not-found", "Doctor profile not found or user is not a doctor.");
    }
    const doctorData = doctorDocSnap.data();
    if (!doctorData) throw new HttpsError("internal", "Doctor data is missing after existence check.");

    const slotDurationMinutes = doctorData.doctorSpecificData?.slotDurationMinutes || 30;

    const templateDocSnap = await db.collection("users").doc(doctorId).collection("scheduleTemplates").doc("default_weekly").get();
    const doctorTimeZone = templateDocSnap.exists ? templateDocSnap.data()?.timeZone || "Asia/Karachi" : "Asia/Karachi";
    functionsLogger.debug(`Doctor ${doctorId} timezone set to: ${doctorTimeZone}`);


    let workPeriods: { start: string; end: string }[] = [];
    const dayOfWeekIndex = targetDateUtc.getUTCDay();
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const dayOfWeek = dayNames[dayOfWeekIndex];

    const overrideDocSnap = await db.collection("users").doc(doctorId).collection("dateOverrides").doc(targetDateString).get();
    if (overrideDocSnap.exists) {
      const overrideData = overrideDocSnap.data();
      if (overrideData?.isCompletelyUnavailable === true) {
        functionsLogger.info(`Doctor ${doctorId} is completely unavailable on ${targetDateString} due to override.`);
        return { slots: [] };
      }
      if (overrideData?.specificPeriods && Array.isArray(overrideData.specificPeriods) && overrideData.specificPeriods.length > 0) {
        workPeriods = overrideData.specificPeriods;
        functionsLogger.info(`Using specific override periods for ${doctorId} on ${targetDateString}.`, { workPeriods });
      }
    }

    if (workPeriods.length === 0 && templateDocSnap.exists) {
      const templateData = templateDocSnap.data();
      workPeriods = templateData?.weeklyPattern?.[dayOfWeek] || [];
      functionsLogger.info(`Using weekly template for ${doctorId} on ${targetDateString} (${dayOfWeek}).`, { workPeriods });
    }

    if (workPeriods.length === 0) {
      functionsLogger.info(`No work periods defined for doctor ${doctorId} on ${targetDateString}.`);
      return { slots: [] };
    }

    const potentialSlots: TimeSlot[] = [];
    workPeriods.forEach((period) => {
      let currentSlotStartTimeMinutes = timeToMinutes(period.start);
      const periodEndTimeMinutes = timeToMinutes(period.end);

      if (isNaN(currentSlotStartTimeMinutes) || isNaN(periodEndTimeMinutes)) {
        functionsLogger.warn(`Skipping work period due to invalid time string for doctor ${doctorId}:`, period);
        return;
      }

      while (currentSlotStartTimeMinutes + slotDurationMinutes <= periodEndTimeMinutes) {
        const slotEndTimeMinutes = currentSlotStartTimeMinutes + slotDurationMinutes;
        potentialSlots.push({
          startTime: minutesToTime(currentSlotStartTimeMinutes),
          endTime: minutesToTime(slotEndTimeMinutes),
        });
        currentSlotStartTimeMinutes += slotDurationMinutes;
      }
    });

    functionsLogger.debug(`Potential slots for ${doctorId} on ${targetDateString} (times in doctor's TZ ${doctorTimeZone}):`, potentialSlots);

    if (potentialSlots.length === 0) {
      functionsLogger.info(`No potential slots generated after parsing work periods for ${doctorId} on ${targetDateString}.`);
      return { slots: [] };
    }

    const startOfDayForQuery = Timestamp.fromDate(targetDateUtc);
    const tempEndOfDay = new Date(targetDateUtc);
    tempEndOfDay.setUTCHours(23, 59, 59, 999);
    const endOfDayForQuery = Timestamp.fromDate(tempEndOfDay);

    const appointmentsQuery = db.collection("appointments")
      .where("doctorId", "==", doctorId)
      .where("appointmentDateTime", ">=", startOfDayForQuery)
      .where("appointmentDateTime", "<=", endOfDayForQuery)
      .where("status", "in", ["confirmed", "pending_clinic_approval", "checked_in"]);

    const appointmentsSnapshot = await appointmentsQuery.get();
    const bookedStartTimesMinutes: Set<number> = new Set();

    appointmentsSnapshot.forEach((docSnap) => {
      const apptData = docSnap.data();
      if (apptData.appointmentDateTime && apptData.appointmentDateTime instanceof Timestamp) {
        const apptDateUtc = apptData.appointmentDateTime.toDate();

        const apptTimeInDoctorTZString = apptDateUtc.toLocaleString("en-US", { // Renamed variable
          year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit", hourCycle: "h23",
          timeZone: doctorTimeZone,
        });
        try {
          const parts = apptTimeInDoctorTZString.match(/(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2})/); // Using renamed variable
          if (parts) {
            const month = parseInt(parts[1], 10);
            const day = parseInt(parts[2], 10);
            const year = parseInt(parts[3], 10);
            const hours = parseInt(parts[4], 10);
            const minutes = parseInt(parts[5], 10);
            const apptDatePartInDoctorTZ = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            if (apptDatePartInDoctorTZ === targetDateString) {
              bookedStartTimesMinutes.add(hours * 60 + minutes);
            } else {
              functionsLogger.debug(`Booked appt ${docSnap.id} on ${apptDatePartInDoctorTZ} (doctor's TZ) does not match target date ${targetDateString}.`);
            }
          } else {
            functionsLogger.warn(`Could not parse localized time string: ${apptTimeInDoctorTZString} for appt ${docSnap.id}`); // Using renamed variable
          }
        } catch (e) {
          functionsLogger.error(`Error parsing localized time for appt ${docSnap.id}: ${apptTimeInDoctorTZString}`, e); // Using renamed variable
        }
      }
    });
    functionsLogger.debug(`Booked slot start times (in minutes, in doctor's TZ ${doctorTimeZone}) for ${doctorId} on ${targetDateString}:`, Array.from(bookedStartTimesMinutes));

    const availableSlots = potentialSlots.filter((slot) => {
      const potentialSlotStartMinutes = timeToMinutes(slot.startTime);
      if (isNaN(potentialSlotStartMinutes)) return false;
      return !bookedStartTimesMinutes.has(potentialSlotStartMinutes);
    });

    functionsLogger.info(`Returning ${availableSlots.length} available slots for doctor ${doctorId} on ${targetDateString}.`);
    return { slots: availableSlots };
  } catch (error: unknown) {
    let clientMessage = "Failed to retrieve available slots. Please try again later.";
    let errorDetailsForClient: object = { detail: "An internal error occurred." };
    let processedErrorForLogging: ProcessedError;

    if (error instanceof HttpsError) {
      throw error;
    }
    if (error instanceof Error) {
      clientMessage = error.message || clientMessage;
      errorDetailsForClient = { name: error.name, message: error.message };
      processedErrorForLogging = { message: error.message, name: error.name, stack: error.stack };
    } else if (typeof error === "string") {
      clientMessage = error; errorDetailsForClient = { message: error }; processedErrorForLogging = { message: error };
    } else if (error && typeof error === "object") {
      try {
        const errorObjectString = JSON.stringify(error);
        const parsedErrorObject = JSON.parse(errorObjectString) as {message?: string; [key: string]: unknown};
        if (typeof parsedErrorObject.message === "string") clientMessage = parsedErrorObject.message;
        errorDetailsForClient = parsedErrorObject;
        processedErrorForLogging = { message: "Object error received.", details: parsedErrorObject, originalErrorType: typeof error };
      } catch (serializationErrorCaught) {
        const fallbackMessage = "A non-serializable error object was encountered."; clientMessage = fallbackMessage;
        errorDetailsForClient = { detail: fallbackMessage };
        processedErrorForLogging = { message: fallbackMessage, originalErrorType: typeof error, details: String(serializationErrorCaught) };
      }
    } else {
      const fallbackMessage = "An unknown error type was encountered."; clientMessage = fallbackMessage;
      errorDetailsForClient = { detail: fallbackMessage };
      processedErrorForLogging = { message: fallbackMessage, originalErrorType: typeof error, details: String(error) };
    }
    functionsLogger.error(`getAvailableSlots: Error for doctor ${doctorId}, date ${targetDateString}`, processedErrorForLogging);
    throw new HttpsError("internal", clientMessage, errorDetailsForClient);
  }
});

export const cancelPatientAppointment = onCall(async (request) => {
  if (!request.auth) {
    functionsLogger.error("cancelPatientAppointment: Unauthenticated user attempt.");
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }
  const patientUid = request.auth.uid;
  const { appointmentId, reason } = request.data as { appointmentId: string; reason?: string };

  if (!appointmentId) {
    throw new HttpsError("invalid-argument", "Appointment ID is required.");
  }
  functionsLogger.info(`cancelPatientAppointment: Called by UID: ${patientUid} for appointmentId: ${appointmentId}`);
  const appointmentRef = db.collection("appointments").doc(appointmentId);
  try {
    await db.runTransaction(async (transaction) => {
      const apptDoc = await transaction.get(appointmentRef);
      if (!apptDoc.exists) throw new HttpsError("not-found", "Appointment not found.");
      const apptData = apptDoc.data();
      if (!apptData) throw new HttpsError("data-loss", "Appointment data is missing.");
      if (apptData.patientUid !== patientUid) throw new HttpsError("permission-denied", "You are not authorized to cancel this appointment.");
      const cancellableStatuses = ["confirmed", "pending_clinic_approval"];
      if (!cancellableStatuses.includes(apptData.status)) throw new HttpsError("failed-precondition", `Cannot cancel appointment with status: ${apptData.status}.`);
      const now = Timestamp.now();
      const appointmentTime = apptData.appointmentDateTime as Timestamp;
      const ONE_HOUR_IN_MILLIS = 60 * 60 * 1000;
      if (appointmentTime.toMillis() - now.toMillis() < ONE_HOUR_IN_MILLIS) {
        throw new HttpsError("failed-precondition", "Cannot cancel appointment less than 1 hour before its scheduled time. Please contact the clinic.");
      }
      transaction.update(appointmentRef, {
        status: "cancelled_by_patient",
        cancellationReason: reason || "Cancelled by patient via app.",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    functionsLogger.info(`Appointment ${appointmentId} cancelled by patient ${patientUid}.`);
    return { success: true, message: "Appointment cancelled successfully." };
  } catch (error: unknown) {
    functionsLogger.error(`cancelPatientAppointment: Error for appointmentId ${appointmentId}`, error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Failed to cancel appointment due to an internal error.");
  }
});

interface ProfileUpdatesClient {
  displayName?: string | null; firstName?: string | null; lastName?: string | null;
  primaryPhoneNumber?: string | null; email?: string | null; dateOfBirth?: string | null;
  gender?: "male" | "female" | "other" | "prefer_not_to_say" | string | null;
  cnicNumber?: string | null;
  address?: {
    street?: string | null; area?: string | null; city?: string | null; province?: string | null;
    postalCode?: string | null; country?: string | null; landmark?: string | null;
  } | null;
}
interface PatientSpecificUpdatesClient {
  bloodGroup?: string | null; medicalHistorySummary?: string | null;
  emergencyContact?: { name?: string | null; phoneNumber?: string | null; relationship?: string | null; } | null;
}
interface UpdateUserProfilePayloadClient {
  profileUpdates?: Partial<ProfileUpdatesClient>;
  patientSpecificUpdates?: Partial<PatientSpecificUpdatesClient>;
}


export const updateUserProfile = onCall( async (request) => {
  if (!request.auth) {
    functionsLogger.error("updateUserProfile: Unauthenticated user attempt.");
    throw new HttpsError("unauthenticated", "Authentication is required to update your profile.");
  }
  const uid = request.auth.uid;
  const dataFromClient = request.data as UpdateUserProfilePayloadClient;
  functionsLogger.info(`updateUserProfile: Called by UID: ${uid}`, { rawDataFromClient: JSON.stringify(dataFromClient) });

  if ((!dataFromClient.profileUpdates || Object.keys(dataFromClient.profileUpdates).length === 0) &&
      (!dataFromClient.patientSpecificUpdates || Object.keys(dataFromClient.patientSpecificUpdates).length === 0)) {
    functionsLogger.info(`updateUserProfile: No update data fields provided by UID: ${uid}.`);
    return { success: true, message: "No changes were submitted to save." };
  }

  // Validate phone number and CNIC if provided
  if (dataFromClient.profileUpdates) {
    if (dataFromClient.profileUpdates.primaryPhoneNumber &&
        dataFromClient.profileUpdates.primaryPhoneNumber !== null) {
      const phoneNumber = dataFromClient.profileUpdates.primaryPhoneNumber;
      if (!/^\d{1,11}$/.test(phoneNumber)) { // Ensure numeric and between 1 and 11 digits
        throw new HttpsError("invalid-argument", "Phone number must contain only 1 to 11 numeric digits.");
      }
    }
    if (dataFromClient.profileUpdates.cnicNumber &&
        dataFromClient.profileUpdates.cnicNumber !== null) {
      const cnicNumber = dataFromClient.profileUpdates.cnicNumber;
      if (!/^\d{1,13}$/.test(cnicNumber)) { // Ensure numeric and between 1 and 13 digits
        throw new HttpsError("invalid-argument", "CNIC number must contain only 1 to 13 numeric digits.");
      }
    }
  }
  if (dataFromClient.patientSpecificUpdates?.emergencyContact?.phoneNumber &&
      dataFromClient.patientSpecificUpdates.emergencyContact.phoneNumber !== null) {
    const emergencyPhone = dataFromClient.patientSpecificUpdates.emergencyContact.phoneNumber;
    if (!/^\d{1,11}$/.test(emergencyPhone)) { // Ensure numeric and between 1 and 11 digits
      throw new HttpsError("invalid-argument", "Emergency contact phone number must contain only 1 to 11 numeric digits.");
    }
  }


  const userRef = db.collection("users").doc(uid);
  const { serverTimestamp, delete: deleteField } = admin.firestore.FieldValue;
  const updatePayload: { [key: string]: unknown } = {};

  if (dataFromClient.profileUpdates) {
    const { dateOfBirth, address, ...otherProfileUpdates } = dataFromClient.profileUpdates;
    for (const [key, value] of Object.entries(otherProfileUpdates)) {
      if (value !== undefined) updatePayload[`profile.${key}`] = value === null ? deleteField() : value;
    }
    if (dateOfBirth !== undefined) {
      if (dateOfBirth === null || dateOfBirth === "") updatePayload["profile.dateOfBirth"] = null;
      else if (typeof dateOfBirth === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
        try {
          const dobDate = new Date(dateOfBirth + "T00:00:00Z"); // Assume YYYY-MM-DD is UTC date
          if (!isNaN(dobDate.getTime())) updatePayload["profile.dateOfBirth"] = admin.firestore.Timestamp.fromDate(dobDate);
          else functionsLogger.warn(`User ${uid}: Invalid dateOfBirth string format: ${dateOfBirth}. Not updated.`);
        } catch (e: unknown) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          functionsLogger.error(`User ${uid}: Error converting dateOfBirth "${dateOfBirth}" to Timestamp: ${errorMessage}`);
        }
      } else functionsLogger.warn(`User ${uid}: Malformed dateOfBirth: ${JSON.stringify(dateOfBirth)}. Not updated.`);
    }
    if (address !== undefined) {
      if (address === null) updatePayload["profile.address"] = deleteField();
      else {
        let addressHasUpdates = false;
        for (const [addrKey, addrValue] of Object.entries(address)) {
          if (addrValue !== undefined) {
            updatePayload[`profile.address.${addrKey}`] = addrValue === null ? deleteField() : addrValue;
            addressHasUpdates = true;
          }
        }
        if (addressHasUpdates && updatePayload["profile.address.country"] === undefined && address.country === undefined) {
          const existingUserDoc = await userRef.get();
          const existingCountry = existingUserDoc.data()?.profile?.address?.country;
          updatePayload["profile.address.country"] = existingCountry || "Pakistan";
        } else if (addressHasUpdates && address.country !== undefined) {
          updatePayload["profile.address.country"] = address.country === null ? deleteField() : address.country;
        }
      }
    }
  }
  if (dataFromClient.patientSpecificUpdates) {
    const { emergencyContact, ...otherPatientUpdates } = dataFromClient.patientSpecificUpdates;
    for (const [key, value] of Object.entries(otherPatientUpdates)) {
      if (value !== undefined) updatePayload[`patientSpecificData.${key}`] = value === null ? deleteField() : value;
    }
    if (emergencyContact !== undefined) {
      if (emergencyContact === null) updatePayload["patientSpecificData.emergencyContact"] = deleteField();
      else {
        for (const [ecKey, ecValue] of Object.entries(emergencyContact)) {
          if (ecValue !== undefined) updatePayload[`patientSpecificData.emergencyContact.${ecKey}`] = ecValue === null ? deleteField() : ecValue;
        }
      }
    }
  }

  const updateFieldKeys = Object.keys(updatePayload);
  if (updateFieldKeys.length > 0) updatePayload.updatedAt = serverTimestamp();
  else {
    functionsLogger.info(`updateUserProfile: No actual data fields changed by UID: ${uid}. No update performed.`);
    return { success: true, message: "No changes detected to save." };
  }

  try {
    await userRef.update(updatePayload);
    functionsLogger.info(`User profile updated for UID: ${uid}. Payload:`, JSON.stringify(updatePayload));
    return { success: true, message: "Profile updated successfully." };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown Firestore update error.";
    functionsLogger.error(`updateUserProfile: Firestore update error for UID ${uid}: ${errorMessage}`, error);
    throw new HttpsError("internal", errorMessage || "Failed to update profile due to a server error.");
  }
});

// Define AppointmentStatus type
type AppointmentStatus =
    | "confirmed"
    | "pending_clinic_approval"
    | "cancelled_by_patient"
    | "cancelled_by_clinic"
    | "completed"
    | "no_show"
    | "unknown";

  interface SetAppointmentVisitSummaryPayload {
  appointmentId: string;
  visitSummary: string;
}

interface UpdateAppointmentStatusPayloadCF {
  appointmentId: string;
  newStatus: AppointmentStatus;
  notes?: string;
}
export const updateAppointmentStatusByStaff = onCall(async (request) => {
  functionsLogger.info("updateAppointmentStatusByStaff: Called with data:", request.data);
  if (!request.auth) {
    functionsLogger.error("updateAppointmentStatusByStaff: Unauthenticated user attempt.");
    throw new HttpsError("unauthenticated", "You must be logged in and authorized to perform this action.");
  }
  const staffUid = request.auth.uid;
  const { appointmentId, newStatus, notes } = request.data as UpdateAppointmentStatusPayloadCF;

  if (!appointmentId || !newStatus) {
    functionsLogger.error("updateAppointmentStatusByStaff: Missing appointmentId or newStatus.");
    throw new HttpsError("invalid-argument", "Appointment ID and new status are required.");
  }
  const validStatusesUpdate: AppointmentStatus[] = ["confirmed", "pending_clinic_approval", "cancelled_by_patient", "cancelled_by_clinic", "completed", "no_show"];
  if (!validStatusesUpdate.includes(newStatus)) {
    functionsLogger.error(`updateAppointmentStatusByStaff: Invalid new status provided: ${newStatus}`);
    throw new HttpsError("invalid-argument", `Invalid status: ${newStatus}.`);
  }

  const appointmentRef = db.collection("appointments").doc(appointmentId);
  const staffUserRef = db.collection("users").doc(staffUid);

  try {
    let patientUidToNotify: string | null = null;
    let appointmentTimeForMessage: string = "an upcoming date";
    let doctorNameForMessage: string = "your doctor";
    const DOCTOR_OPERATIONAL_TIMEZONE_NAME_NOTIF = "Asia/Karachi"; // For notification messages

    await db.runTransaction(async (transaction) => {
      const staffDoc = await transaction.get(staffUserRef);
      const appointmentDoc = await transaction.get(appointmentRef);
      if (!staffDoc.exists) {
        functionsLogger.error(`updateAppointmentStatusByStaff: Staff user document not found for UID: ${staffUid}`);
        throw new HttpsError("not-found", "Staff user profile not found.");
      }
      if (!appointmentDoc.exists) {
        functionsLogger.error(`updateAppointmentStatusByStaff: Appointment document not found: ${appointmentId}`);
        throw new HttpsError("not-found", "Appointment not found.");
      }
      const staffData = staffDoc.data();
      const appointmentData = appointmentDoc.data();
      if (!staffData || !appointmentData) {
        functionsLogger.error("updateAppointmentStatusByStaff: Missing data for staff or appointment document.");
        throw new HttpsError("internal", "Error retrieving document data.");
      }
      patientUidToNotify = appointmentData.patientUid;
      if (appointmentData.appointmentDateTime instanceof Timestamp) {
        appointmentTimeForMessage = appointmentData.appointmentDateTime.toDate().toLocaleDateString("en-US", {
          weekday: "long", year: "numeric", month: "long", day: "numeric",
          hour: "numeric", minute: "2-digit", timeZone: DOCTOR_OPERATIONAL_TIMEZONE_NAME_NOTIF,
        });
      }
      doctorNameForMessage = appointmentData.doctorName || "the clinic";

      const staffRole = staffData.role;
      const appointmentClinicId = appointmentData.clinicId;
      const appointmentDoctorId = appointmentData.doctorId;
      const currentAppointmentStatus = appointmentData.status as AppointmentStatus;
      let isAuthorized = false;
      if (staffRole === "clinic_admin") {
        if (staffData.adminSpecificData?.managesClinicId === appointmentClinicId) {
          const clinicDoc = await transaction.get(db.collection("clinics").doc(appointmentClinicId));
          if (clinicDoc.exists && clinicDoc.data()?.adminUids?.includes(staffUid)) isAuthorized = true;
          else functionsLogger.warn(`updateAppointmentStatusByStaff: Admin ${staffUid} manages clinic ${appointmentClinicId} but not listed in clinic's adminUids or clinic doc missing.`);
        }
      } else if (staffRole === "doctor") {
        if (staffUid === appointmentDoctorId) isAuthorized = true;
      }
      if (!isAuthorized) {
        functionsLogger.error(`updateAppointmentStatusByStaff: Staff UID ${staffUid} (Role: ${staffRole}) is not authorized to update appointment ${appointmentId}.`);
        throw new HttpsError("permission-denied", "You are not authorized to update this appointment.");
      }
      if (newStatus === "confirmed" && (currentAppointmentStatus === "cancelled_by_clinic" || currentAppointmentStatus === "cancelled_by_patient")) {
        throw new HttpsError("failed-precondition", `Cannot confirm an already cancelled appointment (Status: ${currentAppointmentStatus}).`);
      }
      if (newStatus === "completed" && currentAppointmentStatus === "pending_clinic_approval") {
        throw new HttpsError("failed-precondition", "Appointment must be confirmed before it can be marked as completed.");
      }
      const updateData: { status: AppointmentStatus; updatedAt: FirebaseFirestore.FieldValue; notes?: string; cancellationReason?: string; } = {
        status: newStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (notes !== undefined && notes !== null) {
        updateData.notes = appointmentData.notes ? `${appointmentData.notes}\nStaff (${new Date().toLocaleDateString()}): ${notes}` : `Staff (${new Date().toLocaleDateString()}): ${notes}`;
      }
      if (newStatus === "cancelled_by_clinic" && notes) {
        updateData.cancellationReason = notes;
      }
      transaction.update(appointmentRef, updateData);
      functionsLogger.info(`updateAppointmentStatusByStaff: Appointment ${appointmentId} status updated to ${newStatus} by staff ${staffUid}.`);
    });

    if (patientUidToNotify) {
      let notifTitle = "Appointment Update";
      let notifMessage = `Your appointment on ${appointmentTimeForMessage} with ${doctorNameForMessage} has been updated.`;
      let notifType = "APPOINTMENT_UPDATE";

      if (newStatus === "confirmed") {
        notifTitle = "Appointment Confirmed!";
        notifMessage = `Great news! Your appointment on ${appointmentTimeForMessage} with ${doctorNameForMessage} has been confirmed.`;
        notifType = "APPOINTMENT_CONFIRMED";
      } else if (newStatus === "cancelled_by_clinic") {
        notifTitle = "Appointment Cancelled";
        notifMessage = `Unfortunately, your appointment on ${appointmentTimeForMessage} with ${doctorNameForMessage} has been cancelled by the clinic. Reason: ${notes || "No reason provided."}`;
        notifType = "APPOINTMENT_CANCELLED_CLINIC";
      } else if (newStatus === "completed") {
        notifTitle = "Appointment Completed";
        notifMessage = `Your appointment on ${appointmentTimeForMessage} with ${doctorNameForMessage} has been marked as completed.`;
        notifType = "APPOINTMENT_COMPLETED";
      }

      if (notifType !== "APPOINTMENT_UPDATE" || newStatus === "pending_clinic_approval") {
        const patientNotificationRef = db.collection("users").doc(patientUidToNotify)
          .collection("notifications").doc();
        await patientNotificationRef.set({
          title: notifTitle,
          message: notifMessage,
          type: notifType,
          linkTo: `/my-appointments/${appointmentId}`,
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          relatedEntityId: appointmentId,
        });
        functionsLogger.info(`updateAppointmentStatusByStaff: Created '${notifType}' notification for patient ${patientUidToNotify} for appointment ${appointmentId}`);
      }
    }

    const displayStatus = newStatus.replace(/_/g, " ");
    return { success: true, message: `Appointment status successfully updated to ${displayStatus}.` };
  } catch (error: unknown) {
    functionsLogger.error(`updateAppointmentStatusByStaff: Error for appointmentId ${appointmentId} by staff ${staffUid}`, error);
    if (error instanceof HttpsError) throw error;
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred.";
    throw new HttpsError("internal", `Failed to update appointment: ${errorMessage}`);
  }
});

// Add this new function and its related types to your existing Cloud Functions index.ts file

// If you haven't already, define AppointmentStatus globally or ensure it's accessible.
// For this snippet, it's included. If it's already global in your file, you can remove this.


export const setAppointmentVisitSummaryByStaff = onCall(async (request) => {
  functionsLogger.info("setAppointmentVisitSummaryByStaff: Called with data:", request.data);

  if (!request.auth) {
    functionsLogger.error("setAppointmentVisitSummaryByStaff: Unauthenticated user attempt.");
    throw new HttpsError("unauthenticated", "You must be logged in and authorized to perform this action.");
  }

  const staffUid = request.auth.uid;
  const { appointmentId, visitSummary } = request.data as SetAppointmentVisitSummaryPayload;

  if (!appointmentId || typeof visitSummary !== "string" || visitSummary.trim() === "") {
    functionsLogger.error("setAppointmentVisitSummaryByStaff: Missing appointmentId or visitSummary, or visitSummary is empty/not a string.");
    throw new HttpsError("invalid-argument", "Appointment ID and a non-empty visit summary string are required.");
  }

  const appointmentRef = db.collection("appointments").doc(appointmentId);
  const staffUserRef = db.collection("users").doc(staffUid);

  try {
    let patientUidToNotify: string | null = null; // To store patient UID for notification

    await db.runTransaction(async (transaction) => {
      const staffDoc = await transaction.get(staffUserRef);
      const appointmentDoc = await transaction.get(appointmentRef);

      if (!staffDoc.exists) {
        functionsLogger.error(`setAppointmentVisitSummaryByStaff: Staff user document not found for UID: ${staffUid}`);
        throw new HttpsError("not-found", "Staff user profile not found.");
      }
      if (!appointmentDoc.exists) {
        functionsLogger.error(`setAppointmentVisitSummaryByStaff: Appointment document not found: ${appointmentId}`);
        throw new HttpsError("not-found", "Appointment not found.");
      }

      const staffData = staffDoc.data();
      const appointmentData = appointmentDoc.data();

      if (!staffData || !appointmentData) {
        functionsLogger.error("setAppointmentVisitSummaryByStaff: Missing data for staff or appointment document.");
        throw new HttpsError("internal", "Error retrieving document data.");
      }

      // Store patientUid for notification before potentially failing authorization
      patientUidToNotify = appointmentData.patientUid;

      // Authorization: Only the assigned doctor or an admin of the clinic can add/edit summary.
      // And typically, only for 'completed' appointments, but we allow for draft notes.
      const staffRole = staffData.role;
      const appointmentClinicId = appointmentData.clinicId;
      const appointmentDoctorId = appointmentData.doctorId;
      const currentAppointmentStatus = appointmentData.status as AppointmentStatus;

      let isAuthorized = false;
      if (staffRole === "clinic_admin") {
        if (staffData.adminSpecificData?.managesClinicId === appointmentClinicId) {
          const clinicDoc = await transaction.get(db.collection("clinics").doc(appointmentClinicId));
          if (clinicDoc.exists && clinicDoc.data()?.adminUids?.includes(staffUid)) {
            isAuthorized = true;
          } else {
            functionsLogger.warn(`setAppointmentVisitSummaryByStaff: Admin ${staffUid} check failed for clinic ${appointmentClinicId}. Clinic doc exists: ${clinicDoc.exists}, adminUids includes staffUid: ${clinicDoc.data()?.adminUids?.includes(staffUid)}`);
          }
        }
      } else if (staffRole === "doctor") {
        if (staffUid === appointmentDoctorId) {
          isAuthorized = true;
        }
      }

      if (!isAuthorized) {
        functionsLogger.error(`setAppointmentVisitSummaryByStaff: Staff UID ${staffUid} (Role: ${staffRole}) is not authorized for appointment ${appointmentId}.`);
        throw new HttpsError("permission-denied", "You are not authorized to update this appointment's summary.");
      }

      // Best practice: Only allow adding summaries to completed appointments.
      // You can adjust this if doctors need to draft notes before completion.
      if (currentAppointmentStatus !== "completed") {
        functionsLogger.warn(`setAppointmentVisitSummaryByStaff: Attempt to add/update summary for an appointment that is not yet 'completed'. Current status: ${currentAppointmentStatus}. Appointment ID: ${appointmentId}`);
        // For now, we allow it but log a warning. Consider throwing an error if this should be strict.
        // throw new HttpsError("failed-precondition", "Visit summary can only be added to completed appointments.");
      }

      transaction.update(appointmentRef, {
        visitSummaryForPatient: visitSummary.trim(), // Trim the summary
        updatedAt: admin.firestore.FieldValue.serverTimestamp(), // Also update the main updatedAt timestamp
      });
      functionsLogger.info(`setAppointmentVisitSummaryByStaff: Visit summary for appointment ${appointmentId} updated by staff ${staffUid}.`);
    });

    // Send a notification to the patient that a summary has been added/updated.
    if (patientUidToNotify) {
      const notifRef = db.collection("users").doc(patientUidToNotify).collection("notifications").doc();
      await notifRef.set({
        title: "Visit Summary Updated",
        message: "A summary for your recent appointment has been added/updated. Please check your appointment details.",
        type: "VISIT_SUMMARY_UPDATED", // Changed type for clarity
        linkTo: `/my-appointments/${appointmentId}`,
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        relatedEntityId: appointmentId,
      });
      functionsLogger.info(`Created 'VISIT_SUMMARY_UPDATED' notification for patient ${patientUidToNotify} for appointment ${appointmentId}`);
    }

    return { success: true, message: "Visit summary successfully saved." };
  } catch (error: unknown) {
    functionsLogger.error(`setAppointmentVisitSummaryByStaff: Error for appointmentId ${appointmentId} by staff ${staffUid}`, error);
    if (error instanceof HttpsError) {
      throw error; // Re-throw HttpsErrors directly
    }
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred while saving summary.";
    throw new HttpsError("internal", `Failed to save visit summary: ${errorMessage}`);
  }
});
