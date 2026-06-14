import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  writeBatch,
  increment,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db, testConnection } from "./firebase";
import { Campaign, Recipient, SMTPConfig } from "./types";

// Dynamic Subcomponents
import CSVParser from "./components/CSVParser";
import CertDesigner from "./components/CertDesigner";
import CampaignList from "./components/CampaignList";

// Beautiful design systems icons
import {
  Send,
  FileSpreadsheet,
  Settings,
  Mail,
  User as UserIcon,
  LogOut,
  Play,
  MailOpen,
  ArrowRight,
  AlertTriangle,
  Award,
  BookOpen,
  Search,
  Trash2,
  Sliders,
  CheckCircle2,
  Clock,
  XCircle,
  HelpCircle,
  Type,
  Loader2,
  ChevronDown,
  ChevronUp,
  Info,
  ShieldCheck,
} from "lucide-react";

enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

// System-wide error wrapper matching the 8 Firebase rules pillars
function enforceFirestoreError(error: unknown, op: OperationType, path: string) {
  const errBody = {
    error: error instanceof Error ? error.message : String(error),
    operationType: op,
    path,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
  };
  console.error("[Firestore Hardened Error Event]:", JSON.stringify(errBody));
  throw new Error(JSON.stringify(errBody));
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"visual-builder" | "historical-logs">("visual-builder");
  const [activeStepIndex, setActiveStepIndex] = useState(1);

  // Campaign State
  const [campaignName, setCampaignName] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState(
    "Hi {{name}},\n\nThank you for participating! We are thrilled to invite you to review your auto-generated certificate details.\n\nBest regards,\nOrganizing Committee"
  );
  const [isCertEnabled, setIsCertEnabled] = useState(false);
  const [certCoords, setCertCoords] = useState<Campaign["certCoords"]>(null);
  const [certBase64, setCertBase64] = useState<string | null>(null);

  // Participant list previewing
  const [participants, setParticipants] = useState<Omit<Recipient, "status">[]>([]);
  const [filterQuery, setFilterQuery] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  const [showRecipientsList, setShowRecipientsList] = useState<boolean>(false);

  // Raw Spreadsheet & Column Mapping State
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [nameColumn, setNameColumn] = useState("");
  const [emailColumn, setEmailColumn] = useState("");

  // SMTP Settings
  const [smtpConfig, setSmtpConfig] = useState<SMTPConfig | null>(null);
  const [smtpFromName, setSmtpFromName] = useState("");
  const [smtpFromEmail, setSmtpFromEmail] = useState("");

  // Dispatch Tally & Live Feed States
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchTimeElapsed, setDispatchTimeElapsed] = useState(0);
  const [activeDispatchCampaignId, setActiveDispatchCampaignId] = useState<string | null>(null);
  const [dispatchProgress, setDispatchProgress] = useState({ sent: 0, failed: 0, total: 0 });
  const [dispatchLogs, setDispatchLogs] = useState<{ id: string; name: string; email: string; status: string; info: string }[]>([]);

  // Timer useEffect for tracking dispatch time duration
  useEffect(() => {
    let timerInterval: any = null;
    if (isDispatching) {
      setDispatchTimeElapsed(0);
      timerInterval = setInterval(() => {
        setDispatchTimeElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    }
    return () => {
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
  }, [isDispatching]);

  // Automatically map participants when rawRows or column selections change
  useEffect(() => {
    if (rawRows.length > 0 && nameColumn && emailColumn) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const mapped = rawRows.map((row, idx) => {
        const nameValue = String(row[nameColumn] || "").trim();
        const emailValue = String(row[emailColumn] || "").trim();
        return {
          id: `rec_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
          name: nameValue,
          email: emailValue
        };
      }).filter(item => item.name && item.email && emailRegex.test(item.email));
      setParticipants(mapped);
    } else {
      setParticipants([]);
    }
  }, [rawRows, nameColumn, emailColumn]);

  // Page check & connection tests
  useEffect(() => {
    testConnection();
    const unsub = onAuthStateChanged(auth, (usr) => {
      setCurrentUser(usr);
      setAuthLoading(false);
      if (usr) {
        setSmtpFromName(usr.displayName || "Event Organizer");
        setSmtpFromEmail(usr.email || "");
      }
    });
    return () => unsub();
  }, []);

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("[Auth Sign-In aborted]:", err);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("[Auth Sign-Out Error]:", err);
    }
  };

  // Maps coordinates overlays from subcomponent
  const handleCoordsChanged = (coords: any, imgBase64: string | null) => {
    setCertCoords(coords);
    setCertBase64(imgBase64);
  };

  const insertPlaceholder = () => {
    setEmailBody((prev) => prev + " {{name}}");
  };

  const removeParticipant = (id: string) => {
    setParticipants((prev) => prev.filter((p) => p.id !== id));
  };

  const handleRawDataUploaded = (headersList: string[], rowsList: any[], fileName: string) => {
    setDetectedHeaders(headersList);
    setRawRows(rowsList);
    setUploadedFileName(fileName || "");

    // Auto-select column guesses if they exist
    const guessName = headersList.find(h => h.toLowerCase().includes("name") || h.toLowerCase().includes("full") || h.toLowerCase() === "names") || headersList[0] || "";
    const guessEmail = headersList.find(h => h.toLowerCase().includes("email") || h.toLowerCase().includes("mail") || h.toLowerCase().includes("address")) || headersList[1] || "";
    setNameColumn(guessName);
    setEmailColumn(guessEmail);
  };

  const handleRecipientsParsed = (recs: any[]) => {
    // If auto guess parsed immediately, fallback setting
    if (participants.length === 0) {
      setParticipants(recs);
    }
  };

  // Launch campaign bulk dispatch pipeline
  const dispatchCampaign = async () => {
    if (!currentUser) return;
    if (!campaignName.trim()) {
      alert("Please enter a Campaign Identifier Name.");
      return;
    }
    if (!emailSubject.trim()) {
      alert("Please enter a Subject for the email dispatch.");
      return;
    }
    if (participants.length === 0) {
      alert("Please upload at least one valid participant spreadsheet list.");
      return;
    }
    if (isCertEnabled && !certBase64) {
      alert("You have enabled certificate mailing, but haven't uploaded an image background yet.");
      return;
    }

    setIsDispatching(true);
    setDispatchLogs([]);
    setDispatchProgress({ sent: 0, failed: 0, total: participants.length });

    const campaignId = `camp_${Date.now()}`;
    setActiveDispatchCampaignId(campaignId);
    let campaignTerminalStateSet = false;

    // 1. Create top-level Campaign document inside Firestore
    const campaignDocRef = doc(db, "campaigns", campaignId);
    const campaignPayload: Omit<Campaign, "id"> = {
      name: campaignName,
      subject: emailSubject,
      body: emailBody,
      status: "sending",
      isCertificateEnabled: isCertEnabled,
      certCoords: isCertEnabled ? certCoords : null,
      createdBy: currentUser.uid,
      createdAt: serverTimestamp(),
      totalCount: participants.length,
      sentCount: 0,
      failedCount: 0,
    };

    try {
      await setDoc(campaignDocRef, campaignPayload);
    } catch (dbErr) {
      setIsDispatching(false);
      enforceFirestoreError(dbErr, OperationType.WRITE, `campaigns/${campaignId}`);
      return;
    }

    // 2. Setup recipients documents collectively in subcollection using Firebase Firestore Batch Writes
    try {
      const batch = writeBatch(db);
      participants.forEach((p) => {
        const recipDocRef = doc(db, "campaigns", campaignId, "recipients", p.id);
        const recipientPayload: Omit<Recipient, "id"> = {
          name: p.name,
          email: p.email,
          status: "pending",
        };
        batch.set(recipDocRef, recipientPayload);
      });
      await batch.commit();
    } catch (batchErr) {
      setIsDispatching(false);
      enforceFirestoreError(batchErr, OperationType.WRITE, `campaigns/${campaignId}/recipients/*`);
      return;
    }

    // 3. Dispatch data array to Server API via high-compatibility individual REST queue
    try {
      setDispatchLogs((prev) => [
        {
          id: `sys_init_${Date.now()}`,
          name: "System Worker",
          email: "",
          status: "system",
          info: "Establishing campaign queue and loading configurations...",
        },
        ...prev,
      ]);

      let currentSent = 0;
      let currentFailed = 0;

      for (let i = 0; i < participants.length; i++) {
        const p = participants[i];

        try {
          const response = await fetch("/api/send-single", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              subject: emailSubject,
              body: emailBody,
              isCertificateEnabled: isCertEnabled,
              certificateImageUrl: certBase64,
              certCoords,
              recipient: p,
              smtpConfig: {
                host: smtpConfig?.host || "",
                port: smtpConfig?.port || 587,
                secure: smtpConfig?.secure || false,
                user: smtpConfig?.user || "",
                pass: smtpConfig?.pass || "",
                fromName: smtpFromName,
                fromEmail: smtpFromEmail
              },
            }),
          });

          const result = await response.json();

          if (response.ok && result.status === "sent") {
            currentSent++;
            setDispatchProgress({
              sent: currentSent,
              failed: currentFailed,
              total: participants.length,
            });

            setDispatchLogs((prev) => [
              {
                id: p.id,
                name: p.name,
                email: p.email,
                status: "sent",
                info: result.message || "Dispatched successfully.",
              },
              ...prev,
            ]);

            // Live-sync progress updates in Firestore
            const rDocRef = doc(db, "campaigns", campaignId, "recipients", p.id);
            await updateDoc(rDocRef, {
              status: "sent",
              sentAt: new Date().toISOString(),
            });

            // Increment Campaign aggregated numbers inside Firestore
            await updateDoc(campaignDocRef, {
              sentCount: increment(1),
            });
          } else {
            const errDetail = result.error || "Mailing handler failed to dispatch.";
            currentFailed++;
            setDispatchProgress({
              sent: currentSent,
              failed: currentFailed,
              total: participants.length,
            });

            setDispatchLogs((prev) => [
              {
                id: p.id,
                name: p.name,
                email: p.email,
                status: "failed",
                info: errDetail,
              },
              ...prev,
            ]);

            const rDocRef = doc(db, "campaigns", campaignId, "recipients", p.id);
            await updateDoc(rDocRef, {
              status: "failed",
              sentAt: new Date().toISOString(),
              error: errDetail,
            });

            await updateDoc(campaignDocRef, {
              failedCount: increment(1),
            });
          }
        } catch (individualErr: any) {
          const errDetail = individualErr.message || "Network exception during processing.";
          currentFailed++;
          setDispatchProgress({
            sent: currentSent,
            failed: currentFailed,
            total: participants.length,
          });

          setDispatchLogs((prev) => [
            {
              id: p.id,
              name: p.name,
              email: p.email,
              status: "failed",
              info: errDetail,
            },
            ...prev,
          ]);

          const rDocRef = doc(db, "campaigns", campaignId, "recipients", p.id);
          await updateDoc(rDocRef, {
            status: "failed",
            sentAt: new Date().toISOString(),
            error: errDetail,
          });

          await updateDoc(campaignDocRef, {
            failedCount: increment(1),
          });
        }
      }

      // Mark total campaign run as completed successfully
      await updateDoc(campaignDocRef, {
        status: "completed",
      });
      campaignTerminalStateSet = true;

      setDispatchLogs((prev) => [
        {
          id: `sys_comp_${Date.now()}`,
          name: "System Worker",
          email: "",
          status: "system",
          info: "Bulk send campaign finished successfully.",
        },
        ...prev,
      ]);

      if (!campaignTerminalStateSet) {
        await updateDoc(campaignDocRef, {
          status: "completed",
        });
        campaignTerminalStateSet = true;
      }
    } catch (apiErr: any) {
      console.error("API bulk send failed:", apiErr);
      try {
        if (!campaignTerminalStateSet) {
          await updateDoc(campaignDocRef, { status: "failed" });
          campaignTerminalStateSet = true;
        }
      } catch (innerErr) {
        console.warn("Could not mark campaign as failed in Firestore:", innerErr);
      }
      setDispatchLogs((prev) => [
        {
          id: `conerr_${Date.now()}`,
          name: "API Connection lost",
          email: "",
          status: "failed",
          info: apiErr.message || "An unresolved network disruption occurred during dispatch.",
        },
        ...prev,
      ]);
    } finally {
      setIsDispatching(false);
    }
  };

  const filteredPreview = participants.filter(
    (p) =>
      p.name.toLowerCase().includes(filterQuery.toLowerCase()) ||
      p.email.toLowerCase().includes(filterQuery.toLowerCase())
  );

  if (authLoading) {
    return (
      <div id="loader-viewport" className="min-h-screen bg-black flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-purple-950 border-t-2 border-t-purple-500 animate-spin"></div>
          <div className="text-center space-y-1">
            <p className="text-xs font-bold text-purple-400 tracking-widest uppercase animate-pulse">Initializing Dispatch Environment</p>
            <p className="text-[10px] text-white font-mono">Loading secure Certifly connection...</p>
          </div>
        </div>
      </div>
    );
  }

  // Atmospheric, minimal, high-contrast dark login screen
  if (!currentUser) {
    return (
      <div id="authentication-screen" className="min-h-screen bg-black bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#1b0a33] via-black to-black flex items-center justify-center font-sans px-4">
        <div className="max-w-md w-full bg-zinc-950/95 border border-purple-900/40 rounded-3xl p-8 shadow-2xl shadow-purple-950/20 text-center space-y-6 backdrop-blur-md relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-purple-500 to-transparent"></div>
          
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/10 border border-purple-500/25 flex items-center justify-center text-purple-400 shadow-lg shadow-purple-950/5 hover:scale-105 transition-all duration-300 relative overflow-hidden">
            <Award className="w-8 h-8 text-purple-400 relative z-10 animate-pulse" />
            <Send className="w-4 h-4 text-purple-350 absolute bottom-1 right-1 transform -rotate-12 z-20" />
          </div>

          <div className="space-y-2">
            <h1 className="text-4xl font-bold font-display tracking-tight text-white bg-gradient-to-r from-purple-200 via-white to-purple-200 bg-clip-text text-transparent">
              CertiFly
            </h1>
            <p className="text-xs text-white leading-relaxed max-w-xs mx-auto font-sans">
              Sign in with your administrator account to organize candidates, design layouts, and send automated certificates.
            </p>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-2xl bg-purple-650 hover:bg-purple-600 text-white font-semibold text-sm shadow-xl shadow-purple-950/40 hover:scale-[1.01] transition-all hover:bg-opacity-95 cursor-pointer glow-on-hover"
          >
            <MailOpen className="w-4 h-4 text-white" />
            Sign In with Google Auth
          </button>

          <p className="text-[10px] text-white font-mono uppercase tracking-wider opacity-60">
            Certifly Enterprise Credential System
          </p>
        </div>
      </div>
    );
  }

  // Main UI with responsive Layout and sequential tab wizard
  return (
    <div id="application-container" className="min-h-screen bg-black text-white font-sans flex flex-col bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1d0938] via-black to-black">
      
      {/* Header bar */}
      <header className="sticky top-0 z-40 bg-black/90 backdrop-blur-md border-b border-purple-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-md relative overflow-hidden">
              <Award className="w-5.5 h-5.5 text-purple-400 relative z-10 animate-pulse" />
              <Send className="w-3 h-3 text-purple-300 absolute bottom-1 right-1 transform -rotate-12 z-20" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white font-display tracking-tight bg-gradient-to-r from-purple-200 via-white to-pink-200 bg-clip-text text-transparent flex items-center gap-1.5 leading-none">
                CertiFly
              </h1>
              <p className="text-[9px] text-purple-400/90 font-mono tracking-widest uppercase sm:block hidden mt-0.5">Automated Bulk Mail &bull; Premium Certificate Dispenser</p>
            </div>
          </div>

          {/* User auth badge */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 pl-3.5 pr-1.5 py-1 bg-zinc-950 border border-purple-955 rounded-full text-xs shadow-inner">
              <span className="font-semibold text-white max-w-[120px] truncate sm:block hidden">{currentUser.displayName || currentUser.email}</span>
              {currentUser.photoURL ? (
                <img src={currentUser.photoURL} alt="Avatar" className="w-6.5 h-6.5 rounded-full border border-purple-900 hover:border-purple-400 transition-colors duration-150" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-6.5 h-6.5 rounded-full bg-purple-955 border border-purple-500/35 flex items-center justify-center text-purple-400">
                  <UserIcon className="w-3.5 h-3.5" />
                </div>
              )}
            </div>

            <button
              onClick={handleSignOut}
              className="p-2 border border-purple-950 rounded-full hover:bg-rose-950/40 text-rose-300 hover:text-rose-450 hover:border-rose-900 transition-all duration-150 cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Active Wizard Section */}
        <div className="max-w-3xl mx-auto w-full space-y-6 animate-fade-in">

            {/* Step Tracker Timeline */}
            <div id="step-tracker-pipeline" className="bg-[#0b1022]/85 p-4.5 rounded-2xl border border-slate-800/80 flex items-center justify-between gap-2 overflow-x-auto">
              {[
                { num: 1, label: "Upload File" },
                { num: 2, label: "Match Columns" },
                { num: 3, label: "Choose Style" },
                { num: 4, label: "Write Message" },
                { num: 5, label: "Send Emails" }
              ].map((st) => {
                const isCompleted = 
                  (st.num === 1 && rawRows.length > 0) ||
                  (st.num === 2 && nameColumn && emailColumn && participants.length > 0) ||
                  (st.num === 3 && nameColumn && emailColumn && participants.length > 0) ||
                  (st.num === 4 && campaignName.trim() !== "" && emailSubject.trim() !== "" && emailBody.trim() !== "" && (!isCertEnabled || certBase64 !== null)) ||
                  (st.num < activeStepIndex);
                
                const isActive = activeStepIndex === st.num;
                return (
                  <button
                    key={st.num}
                    type="button"
                    disabled={!isCompleted && !isActive}
                    onClick={() => setActiveStepIndex(st.num)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border transition-all text-xs shrink-0 cursor-pointer ${
                      isActive
                        ? "bg-purple-650 border-purple-500 text-white font-bold opacity-100 shadow-lg shadow-purple-950"
                        : isCompleted
                        ? "bg-slate-900/40 border-emerald-900/50 text-emerald-400 font-semibold hover:border-emerald-500"
                        : "bg-slate-950/20 border-transparent text-slate-500 cursor-not-allowed opacity-40"
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isActive 
                        ? "bg-white text-purple-950" 
                        : isCompleted 
                        ? "bg-emerald-500/20 text-emerald-400" 
                        : "bg-slate-800 text-slate-500"
                    }`}>
                      {st.num}
                    </span>
                    <span>{st.label}</span>
                  </button>
                );
              })}
            </div>

            {/* STEP 1: UPLOAD FILE */}
            {activeStepIndex === 1 && (
              <div className="relative animate-fade-in">
                {/* Physical Card Deck Behind */}
                <div id="deck-layer-2" className="absolute top-4 left-4 right-4 h-20 bg-[#090d1a]/60 rounded-2xl border border-slate-800/40 -z-20 transform translate-y-2 scale-[0.94] opacity-30 pointer-events-none"></div>
                <div id="deck-layer-1" className="absolute top-2 left-2 right-2 h-20 bg-[#0c1224]/80 rounded-2xl border border-slate-800/60 -z-10 transform translate-y-1 scale-[0.97] opacity-65 pointer-events-none"></div>

                <motion.div
                  key="step1"
                  initial={{ opacity: 0, scale: 0.98, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -15 }}
                  transition={{ duration: 0.25 }}
                  className="bg-zinc-950/95 rounded-2xl border border-purple-900/40 p-6 shadow-2xl space-y-4 relative overflow-hidden backdrop-blur-md"
                >
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-purple-500/30 to-transparent"></div>
                  <div>
                    <h2 className="text-sm font-extrabold uppercase tracking-widest text-purple-400 mb-1">Step 1: Upload Emails List</h2>
                    <p className="text-xs text-slate-400">Upload your CSV participant spreadsheet with candidate references.</p>
                  </div>
                  <CSVParser
                    onRawDataUploaded={(headers, rows, fileName) => {
                      handleRawDataUploaded(headers, rows, fileName);
                      setActiveStepIndex(2);
                    }}
                    onRecipientsParsed={handleRecipientsParsed}
                    parsedCount={participants.length}
                  />

                  {rawRows.length > 0 && (
                    <div className="pt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setActiveStepIndex(2)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-xs font-bold transition-all cursor-pointer shadow-lg shadow-purple-950/50"
                      >
                        Proceed to Column Match
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </motion.div>
              </div>
            )}

            {/* STEP 2: MATCH COLUMNS */}
            {activeStepIndex === 2 && (
              <div className="relative animate-fade-in">
                {/* Physical Card Deck Behind */}
                <div id="deck-layer-2" className="absolute top-4 left-4 right-4 h-20 bg-[#090d1a]/60 rounded-2xl border border-slate-800/40 -z-20 transform translate-y-2 scale-[0.94] opacity-30 pointer-events-none"></div>
                <div id="deck-layer-1" className="absolute top-2 left-2 right-2 h-20 bg-[#0c1224]/80 rounded-2xl border border-slate-800/60 -z-10 transform translate-y-1 scale-[0.97] opacity-65 pointer-events-none"></div>

                <motion.div
                  key="step2"
                  initial={{ opacity: 0, scale: 0.98, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -15 }}
                  transition={{ duration: 0.25 }}
                  className="bg-zinc-950/95 rounded-2xl border border-purple-900/40 p-6 shadow-2xl space-y-4 relative overflow-hidden backdrop-blur-md"
                >
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-purple-500/30 to-transparent"></div>
                  <div>
                    <h2 className="text-sm font-extrabold uppercase tracking-widest text-purple-400 mb-1">
                      Step 2: Match Columns
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Pick the columns containing the participant names and emails.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-350 font-sans">Participant Name Column</label>
                      <select
                        value={nameColumn}
                        onChange={(e) => setNameColumn(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-205 focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
                      >
                        <option value="">-- Select name column --</option>
                        {detectedHeaders.map((header) => (
                          <option key={header} value={header}>{header}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5 font-sans">
                      <label className="text-xs font-bold text-slate-355">Participant Email Column</label>
                      <select
                        value={emailColumn}
                        onChange={(e) => setEmailColumn(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-805 rounded-xl text-xs text-slate-205 focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
                      >
                        <option value="">-- Select email column --</option>
                        {detectedHeaders.map((header) => (
                          <option key={header} value={header}>{header}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {participants.length > 0 ? (
                    <div className="space-y-3 pt-2">
                       <p className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5 bg-emerald-950/20 px-3.5 py-2 border border-emerald-900/30 rounded-xl">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        Success! Loaded {participants.length} valid email addresses.
                      </p>
                      <div className="flex justify-between items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setActiveStepIndex(1)}
                          className="px-4 py-2 rounded-xl bg-[#090d1a] border border-slate-800 hover:border-slate-705 text-xs font-bold text-slate-400 transition-all cursor-pointer"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveStepIndex(3)}
                          className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-xs font-bold inline-flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-purple-950/50"
                        >
                          Continue to Choose Style
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center gap-3 pt-3">
                      <button
                        type="button"
                        onClick={() => setActiveStepIndex(1)}
                        className="px-4 py-2 rounded-xl bg-[#090d1a] border border-slate-800 hover:border-slate-705 text-xs font-bold text-slate-400 transition-all cursor-pointer"
                      >
                        Back
                      </button>
                      <p className="text-xs text-rose-300 bg-rose-950/10 px-3.5 py-2 border border-rose-900/20 rounded-xl italic">
                        Configure columns above to parse the file.
                      </p>
                    </div>
                  )}
                </motion.div>
              </div>
            )}

            {/* STEP 3: CHOOSE STYLE */}
            {activeStepIndex === 3 && (
              <div className="relative animate-fade-in">
                {/* Physical Card Deck Behind */}
                <div id="deck-layer-2" className="absolute top-4 left-4 right-4 h-20 bg-[#090d1a]/60 rounded-2xl border border-slate-800/40 -z-20 transform translate-y-2 scale-[0.94] opacity-30 pointer-events-none"></div>
                <div id="deck-layer-1" className="absolute top-2 left-2 right-2 h-20 bg-[#0c1224]/80 rounded-2xl border border-slate-800/60 -z-10 transform translate-y-1 scale-[0.97] opacity-65 pointer-events-none"></div>

                <motion.div
                  key="step3"
                  initial={{ opacity: 0, scale: 0.98, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -15 }}
                  transition={{ duration: 0.25 }}
                  className="bg-zinc-950/95 rounded-2xl border border-purple-900/40 p-6 shadow-2xl space-y-4 relative overflow-hidden backdrop-blur-md"
                >
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-purple-500/30 to-transparent"></div>
                  <div>
                    <h2 className="text-sm font-extrabold uppercase tracking-widest text-purple-400 mb-1">
                      Step 3: Choose Email Format
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Tell us if you want to attach certificates or send clean text documents.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Option A: Plain Text */}
                    <button
                      type="button"
                      onClick={() => setIsCertEnabled(false)}
                      className={`p-5 rounded-2xl border text-left transition-all duration-300 relative overflow-hidden group cursor-pointer ${
                        !isCertEnabled
                          ? "bg-purple-950/45 border-purple-500 shadow-xl shadow-purple-950/20 ring-1 ring-purple-550/20"
                          : "bg-slate-950/40 border-slate-800 hover:border-slate-700 hover:bg-slate-950/60"
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-xl border transition-all shrink-0 ${
                          !isCertEnabled 
                            ? "bg-purple-500/10 border-purple-500/20 text-purple-400" 
                            : "bg-slate-900 border-slate-800 text-slate-500"
                        }`}>
                          <Mail className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-white font-sans">Plain Text Email</h4>
                          <p className="text-xs text-slate-400 mt-1 leading-relaxed font-sans font-normal font-sans">
                            Send simple and readable plain-text emails.
                          </p>
                        </div>
                      </div>
                    </button>

                    {/* Option B: Certificate Attachment */}
                    <button
                      type="button"
                      onClick={() => setIsCertEnabled(true)}
                      className={`p-5 rounded-2xl border text-left transition-all duration-200 relative overflow-hidden group cursor-pointer ${
                        isCertEnabled
                          ? "bg-purple-950/45 border-purple-500 shadow-xl shadow-purple-950/20 ring-1 ring-purple-550/20"
                          : "bg-slate-950/40 border-slate-800 hover:border-slate-700 hover:bg-slate-950/60"
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-xl border transition-all shrink-0 ${
                          isCertEnabled 
                            ? "bg-purple-550/10 border-purple-500/20 text-purple-400" 
                            : "bg-slate-900 border-slate-800 text-slate-500"
                        }`}>
                          <Award className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-white font-sans">Certificate Email</h4>
                          <p className="text-xs text-slate-400 mt-1 leading-relaxed font-sans font-normal">
                            Add a beautiful custom image certificate placeholder.
                          </p>
                        </div>
                      </div>
                    </button>
                  </div>

                  <div className="pt-2 flex justify-between items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveStepIndex(2)}
                      className="px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-xs font-bold text-slate-400 transition-all cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveStepIndex(4)}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-xs font-bold inline-flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-purple-950/50"
                    >
                      Continue to Write Message
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              </div>
            )}

            {/* STEP 4: WRITE EMAIL MESSAGE & DESIGN */}
            {activeStepIndex === 4 && (
              <div className="relative animate-fade-in">
                {/* Physical Card Deck Behind */}
                <div id="deck-layer-2" className="absolute top-4 left-4 right-4 h-20 bg-[#090d1a]/60 rounded-2xl border border-slate-800/40 -z-20 transform translate-y-2 scale-[0.94] opacity-30 pointer-events-none"></div>
                <div id="deck-layer-1" className="absolute top-2 left-2 right-2 h-20 bg-[#0c1224]/80 rounded-2xl border border-slate-800/60 -z-10 transform translate-y-1 scale-[0.97] opacity-65 pointer-events-none"></div>

                <motion.div
                  key="step4"
                  initial={{ opacity: 0, scale: 0.98, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -15 }}
                  transition={{ duration: 0.25 }}
                  className="bg-zinc-950/95 rounded-2xl border border-purple-900/40 p-6 shadow-2xl space-y-4 relative overflow-hidden backdrop-blur-md"
                >
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-purple-500/30 to-transparent"></div>
                  <div>
                    <h2 className="text-sm font-extrabold uppercase tracking-widest text-purple-400 mb-1">
                      Step 4: Write Email Message
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Write your email body. Click "Insert Name Tag" below to mention each user by name.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5 font-sans">
                        <label className="text-xs font-bold text-slate-350">Campaign Name (Internal reference)</label>
                        <input
                          type="text"
                          placeholder="e.g. participation campaign"
                          value={campaignName}
                          onChange={(e) => setCampaignName(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                      </div>

                      <div className="space-y-1.5 font-sans">
                        <label className="text-xs font-bold text-slate-355">Email Subject Line</label>
                        <input
                          type="text"
                          placeholder="Congratulations {{name}}!"
                          value={emailSubject}
                          onChange={(e) => setEmailSubject(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-202 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between font-sans">
                        <label className="text-xs font-bold text-slate-300">Email Message Content</label>
                        <button
                          type="button"
                          onClick={insertPlaceholder}
                          className="inline-flex items-center gap-1.5 px-3 py-1 text-[10.5px] font-bold bg-purple-950/50 hover:bg-zinc-900 text-purple-400 rounded-lg border border-purple-900/40 transition-all cursor-pointer"
                        >
                          <Type className="w-3.5 h-3.5" />
                          Insert Name Tag {"{{name}}"}
                        </button>
                      </div>

                      <textarea
                        rows={6}
                        placeholder="Hi {{name}}, congratulations..."
                        value={emailBody}
                        onChange={(e) => setEmailBody(e.target.value)}
                        className="w-full px-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl block focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono text-xs text-slate-300 leading-relaxed"
                      />
                    </div>
                  </div>

                  {isCertEnabled && (
                    <div className="bg-zinc-950 border border-purple-900/30 p-5 rounded-2xl space-y-3 relative overflow-hidden mt-2">
                      <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-purple-500/30 to-transparent"></div>
                      <div>
                        <h2 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider text-purple-400 font-sans">
                          <Award className="w-4 h-4" />
                          Configure Certificate Layout Template
                        </h2>
                        <p className="text-[11px] text-slate-400">
                          Upload background certificate layouts and define where coordinates should overlap.
                        </p>
                      </div>
                      <CertDesigner isEnabled={isCertEnabled} onCoordsChanged={handleCoordsChanged} sampleName={participants[0]?.name} />
                    </div>
                  )}

                  <div className="pt-2 flex justify-between items-center gap-3 border-t border-slate-800/40 mt-4">
                    <button
                      type="button"
                      onClick={() => setActiveStepIndex(3)}
                      className="px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-xs font-bold text-slate-400 transition-all cursor-pointer"
                    >
                      Back
                    </button>
                    {campaignName.trim() && emailSubject.trim() && emailBody.trim() && (!isCertEnabled || certBase64) ? (
                      <button
                        type="button"
                        onClick={() => setActiveStepIndex(5)}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-xs font-bold inline-flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-purple-950/50"
                      >
                        Continue to Send Emails
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <div className="p-2 border border-rose-950/20 rounded-xl text-[11px] text-rose-350 italic">
                        {!campaignName.trim() || !emailSubject.trim() || !emailBody.trim()
                          ? "Please write campaign, subject and body."
                          : "Please upload certificate template layout."}
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            )}

            {/* STEP 5: VERIFY & SEND EMAILS */}
            {activeStepIndex === 5 && (
              <div className="relative animate-fade-in">
                {/* Physical Card Deck Behind */}
                <div id="deck-layer-2" className="absolute top-4 left-4 right-4 h-20 bg-[#090d1a]/60 rounded-2xl border border-slate-800/40 -z-20 transform translate-y-2 scale-[0.94] opacity-30 pointer-events-none"></div>
                <div id="deck-layer-1" className="absolute top-2 left-2 right-2 h-20 bg-[#0c1224]/80 rounded-2xl border border-slate-800/60 -z-10 transform translate-y-1 scale-[0.97] opacity-65 pointer-events-none"></div>

                <motion.div
                  key="step5"
                  initial={{ opacity: 0, scale: 0.98, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -15 }}
                  transition={{ duration: 0.25 }}
                  className="bg-zinc-950/95 rounded-2xl border border-purple-900/40 p-6 shadow-2xl space-y-6 relative overflow-hidden backdrop-blur-md"
                >
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-purple-500/30 to-transparent"></div>

                  {/* Sub layout for previews and send button */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                    
                    {/* Left subcolumn: lists review */}
                    <div className="md:col-span-7 space-y-6">
                      <div className="bg-zinc-950/80 border border-purple-900/30 rounded-2xl p-5 shadow-xl space-y-5 backdrop-blur-xs">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-bold text-slate-350 tracking-wider uppercase flex items-center gap-2">
                            <FileSpreadsheet className="w-4 h-4 text-purple-400" />
                            Spreadsheet Source Details
                          </h3>
                          <span className="text-[10.5px] font-mono text-purple-400 bg-purple-950/50 px-2.5 py-0.5 rounded-md font-bold border border-purple-900/40">
                            {participants.length} Active Records
                          </span>
                        </div>

                        {/* Simplified File Information Card - replaces the annoying 1000+ scroll list */}
                        <div className="p-4 bg-black border border-purple-955 rounded-xl space-y-3.5">
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-purple-950/50 border border-purple-900/30 rounded-xl text-purple-400">
                              <FileSpreadsheet className="w-5 h-5 animate-pulse" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-slate-400 font-medium font-sans">Source Document Name</p>
                              <p className="text-sm font-extrabold text-white truncate max-w-full font-mono mt-0.5">
                                {uploadedFileName || "imported_spreadsheet.csv"}
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3.5 pt-2.5 border-t border-purple-955 text-xs">
                            <div className="p-3 bg-zinc-900/40 rounded-xl border border-purple-900/30">
                              <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider font-sans">Candidate Names</span>
                              <span className="font-semibold text-slate-200 mt-1 block font-mono">{nameColumn || "Auto Detected"}</span>
                            </div>
                            <div className="p-3 bg-zinc-900/40 rounded-xl border border-purple-900/30">
                              <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider font-sans">Mailing Addresses</span>
                              <span className="font-semibold text-slate-200 mt-1 block font-mono">{emailColumn || "Auto Detected"}</span>
                            </div>
                          </div>
                        </div>

                        {/* Collapsible advanced list review for absolute flexibility */}
                        <div className="border border-purple-955 rounded-xl overflow-hidden bg-purple-950/20">
                          <button
                            type="button"
                            onClick={() => setShowRecipientsList(!showRecipientsList)}
                            className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold text-slate-300 hover:text-white hover:bg-purple-950/30 transition-all cursor-pointer select-none"
                          >
                            <span className="flex items-center gap-1.5 font-sans">
                              <Info className="w-3.5 h-3.5 text-purple-400" />
                              Inspect raw database rows ({participants.length} total)
                            </span>
                            {showRecipientsList ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                          
                          {showRecipientsList && (
                            <div className="p-4 border-t border-purple-955 space-y-3 bg-zinc-950/90">
                              <div className="relative">
                                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                                <input
                                  type="text"
                                  placeholder="Filter rows by name/email..."
                                  value={filterQuery}
                                  onChange={(e) => setFilterQuery(e.target.value)}
                                  className="w-full pl-9 pr-3 py-1.5 bg-black border border-purple-955 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all font-sans"
                                />
                              </div>

                              <div className="max-h-[180px] overflow-y-auto divide-y divide-purple-955 border border-purple-900/30 rounded-xl bg-black p-1">
                                {filteredPreview.map((p, idx) => (
                                  <div key={p.id} className="p-2.5 flex items-center justify-between gap-2 text-xs hover:bg-[#0c1223] rounded-lg transition-colors">
                                    <div className="min-w-0">
                                      <p className="font-semibold text-slate-200 truncate font-sans">
                                        {idx + 1}. {p.name}
                                      </p>
                                      <p className="text-[10px] text-slate-500 truncate font-mono mt-0.5">{p.email}</p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => removeParticipant(p.id)}
                                      disabled={isDispatching}
                                      className="p-1 text-slate-500 hover:text-rose-400 rounded-md transition-colors cursor-pointer shrink-0 disabled:opacity-40"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                                {filteredPreview.length === 0 && (
                                  <p className="text-xs text-slate-500 py-4 text-center">No rows match selection filter.</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right subcolumn: summary & run triggers */}
                    <div className="md:col-span-5 space-y-6">
                      <div className="bg-zinc-950/80 rounded-2xl border border-purple-900/30 p-5 shadow-xl space-y-4 backdrop-blur-xs relative overflow-hidden font-sans">
                        <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-purple-500/20 to-transparent"></div>
                        <div>
                          <h3 className="text-xs font-bold text-slate-205 flex items-center gap-1.5 font-sans uppercase tracking-wider">
                            <Send className="w-3.5 h-3.5 text-purple-400 font-sans" />
                            Send Campaign
                          </h3>
                          <p className="text-[11px] text-slate-400 block font-sans">Complete headers and send now.</p>
                        </div>

                        {isDispatching ? (
                          <div id="active-dispatch-loader" className="space-y-4 p-4 bg-black border border-purple-955 rounded-xl">
                            <div className="flex items-center gap-3">
                              <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-extrabold text-white font-sans">Transmitting batch sequence...</p>
                                <p className="text-[10px] text-slate-400 font-sans">Please keep this window open</p>
                              </div>
                              <span className="text-xs font-mono font-extrabold text-purple-400 text-right">
                                {Math.round(((dispatchProgress.sent + dispatchProgress.failed) / dispatchProgress.total) * 100 || 0)}%
                              </span>
                            </div>

                            <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-850">
                              <div
                                className="bg-gradient-to-r from-purple-500 to-pink-500 h-full transition-all duration-250 shadow-inner"
                                style={{ width: `${((dispatchProgress.sent + dispatchProgress.failed) / dispatchProgress.total) * 100}%` }}
                              ></div>
                            </div>

                            {/* ELAPSED TIMER */}
                            <div className="flex items-center justify-between text-xs pt-1">
                              <span className="text-slate-400 flex items-center gap-1 font-sans">
                                <Clock className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                                Elapsed Time:
                              </span>
                              <span className="font-mono font-extrabold text-white text-[13px] tracking-wider bg-black border border-purple-900/40 px-2.5 py-0.5 rounded-lg">
                                {Math.floor(dispatchTimeElapsed / 60).toString().padStart(2, "0")}:{(dispatchTimeElapsed % 60).toString().padStart(2, "0")}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={dispatchCampaign}
                            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-xs shadow-xl shadow-purple-950/60 transition-all hover:scale-[1.01] active:scale-95 focus:outline-none cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5 fill-white" />
                            Send Emails to All
                          </button>
                        )}
                      </div>

                      {/* NEW PROGRESS STATS LOADING CARD - Replaces raw debug logs terminal */}
                      {(isDispatching || dispatchProgress.sent + dispatchProgress.failed > 0) && (
                        <div id="countdown-loading-container" className="bg-black border border-purple-900/30 rounded-2xl p-5 shadow-inner space-y-4">
                          <div className="flex items-center justify-between text-slate-400 border-b border-purple-955 pb-2.5">
                            <span className="font-extrabold flex items-center gap-1.5 uppercase text-[9px] tracking-wider text-purple-400 font-sans">
                              {isDispatching ? (
                                <span className="w-2 h-2 rounded-full bg-purple-500 animate-ping"></span>
                              ) : (
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                              )}
                              Mailing Dispatch Hub Status
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {isDispatching ? "Transmitting..." : "Finished"}
                            </span>
                          </div>

                          {/* Beautiful Loading Display Panel */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="p-3.5 bg-emerald-950/15 rounded-xl border border-emerald-900/30 text-center">
                              <span className="block text-[10px] text-slate-500 font-bold uppercase font-sans tracking-wide">Mails Delivered</span>
                              <span className="block text-xl font-extrabold text-emerald-400 font-mono mt-1">{dispatchProgress.sent}</span>
                            </div>

                            <div className="p-3.5 bg-rose-950/15 rounded-xl border border-rose-900/30 text-center">
                              <span className="block text-[10px] text-slate-500 font-bold uppercase font-sans tracking-wide">Fails / Skipped</span>
                              <span className="block text-xl font-extrabold text-rose-400 font-mono mt-1">{dispatchProgress.failed}</span>
                            </div>
                          </div>

                          {/* Transmission speed or time indicator */}
                          <div className="p-3 bg-zinc-900/40 rounded-xl border border-purple-955 text-xs text-slate-400 space-y-2">
                            <div className="flex justify-between items-center font-sans">
                              <span>Transmission State:</span>
                              <span className={`font-semibold ${isDispatching ? 'text-purple-400 animate-pulse' : 'text-emerald-400'}`}>
                                {isDispatching ? "Active Streaming Connection" : "Broadcast Completed"}
                              </span>
                            </div>
                            <div className="flex justify-between items-center text-xs font-sans">
                              <span>Total Duration Taken:</span>
                              <span className="font-mono font-bold text-slate-200">
                                {Math.floor(dispatchTimeElapsed / 60).toString().padStart(2, "0")}m {(dispatchTimeElapsed % 60).toString().padStart(2, "0")}s
                              </span>
                            </div>
                            {isDispatching && (
                              <div className="flex justify-between items-center text-[10.5px] text-slate-505 pt-1 border-t border-purple-955 font-sans">
                                <span>Current progress:</span>
                                <span>{dispatchProgress.sent + dispatchProgress.failed} of {dispatchProgress.total} candidates</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                    </div>

                  </div>

                  <div className="pt-4 flex justify-between items-center gap-3 border-t border-slate-800/50 mt-4">
                    <button
                      type="button"
                      onClick={() => setActiveStepIndex(4)}
                      disabled={isDispatching}
                      className="px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-xs font-bold text-slate-400 transition-all cursor-pointer disabled:opacity-45"
                    >
                      Back to Write Message
                    </button>
                  </div>
                </motion.div>
              </div>
            )}

          </div>

      </main>

      {/* Styled Footer bar */}
      <footer className="bg-[#070a13]/85 border-t border-slate-850 py-5 mt-auto text-center text-[10.5px] text-slate-500 font-mono">
        <p>&copy; {new Date().getFullYear()} CertiFly. All rights reserved.</p>
      </footer>
    </div>
  );
}
