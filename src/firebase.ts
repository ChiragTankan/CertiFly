import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// Initialize client SDK
const app = initializeApp(firebaseConfig);

// Expose services
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Connectivity check helper to run when booting up, as per system instruction
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    console.log("[Firebase] Successfully connected to Firestore database!");
  } catch (error) {
    if (error instanceof Error && error.message.includes("offline")) {
      console.warn("[Firebase Check] Client appears offline or Firestore is unreachable. Inspect connection.");
    }
  }
}
