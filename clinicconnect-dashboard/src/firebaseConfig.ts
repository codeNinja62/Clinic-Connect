import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions"; // For callable functions

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "API-KEY",
  authDomain: "clinicconnectpk.firebaseapp.com",
  projectId: "clinicconnectpk",
  storageBucket: "clinicconnectpk.firebasestorage.app",
  messagingSenderId: "600285157927",
  appId: "1:600285157927:web:322b16f7fedbd701df0c02",
  measurementId: "G-967PZDBH2G"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app); // Initialize Cloud Functions (for callable)

export { app, auth, db, functions };
