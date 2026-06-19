import { useState, useEffect, FormEvent } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  sendPasswordResetEmail,
} from "firebase/auth";
import {
  Wifi,
  Copy,
  Check,
  LogOut,
  Mail,
  Lock,
  Calendar,
  Layers,
  Database,
  RefreshCw,
  Eye,
  EyeOff,
  AlertCircle,
  HelpCircle,
  CheckCircle,
  Clock,
  Sparkle,
  Smartphone,
  Laptop,
  Activity,
  ShieldCheck,
  PlusCircle,
  Edit3,
  Save,
  X,
  Gauge,
  Signal,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { auth } from "./firebase";
import {
  getUserProfile,
  getVoucherDetails,
  redeemWiFiPromoVoucherTransaction,
  seedVouchersInFirestore,
  resetDatabaseForTesting,
  getAllVouchersForAdmin,
  getUserVouchersHistory,
  claimAdditionalWiFiVoucher,
  addPromoVoucher,
  bulkAddPromoVouchers,
} from "./firebaseService";
import { AppUser, PromoVoucher, ViewState } from "./types";

export default function App() {
  // Authentication & session state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<AppUser | null>(null);
  const [assignedVoucher, setAssignedVoucher] = useState<PromoVoucher | null>(null);

  // Flow State
  const [view, setView] = useState<ViewState>("loading");
  const [loadingMsg, setLoadingMsg] = useState("Initializing Wireless System...");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Form Inputs
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);

  // Administrative / Sandbox Panel States
  const [adminVouchers, setAdminVouchers] = useState<PromoVoucher[]>([]);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [isSandboxOperating, setIsSandboxOperating] = useState(false);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [adminAuthorized, setAdminAuthorized] = useState(() => sessionStorage.getItem("lycel_admin_auth") === "true");
  const [adminPinInput, setAdminPinInput] = useState("");
  const [newVoucherCode, setNewVoucherCode] = useState("");
  const [newVoucherDuration, setNewVoucherDuration] = useState("12 Hours");


  // Voucher Copy State
  const [isCopied, setIsCopied] = useState(false);
  const [hasAuthNotAllowedError, setHasAuthNotAllowedError] = useState(false);
  const [hasAuthConfigError, setHasAuthConfigError] = useState(false);

  // Expanded Wireless Portal States
  const [voucherHistory, setVoucherHistory] = useState<PromoVoucher[]>([]);
  const [isClaimingAdditional, setIsClaimingAdditional] = useState(false);
  const [currentTab, setCurrentTab] = useState<"pass" | "devices" | "speed-test" | "history">("pass");

  // Speed Test Simulator State
  const [speedTestActive, setSpeedTestActive] = useState(false);
  const [speedTestStep, setSpeedTestStep] = useState<"idle" | "ping" | "download" | "upload" | "finished">("idle");
  const [speedMetrics, setSpeedMetrics] = useState({ ping: 0, download: 0, upload: 0, jitter: 0 });
  const [speedTestProgress, setSpeedTestProgress] = useState(0);

  // Devices State (loaded from localStorage mock-live cache)
  const [devices, setDevices] = useState<Array<{ id: string; name: string; mac: string; ip: string; type: "smartphone" | "laptop" | "tablet"; status: "authorized" | "blocked" }>>(() => {
    const cached = localStorage.getItem("wireless_devices");
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        // Fallback
      }
    }
    return [
      { id: "dev-1", name: "My Personal Phone (This Device)", mac: "E4:A4:71:0D:39:BB", ip: "10.0.0.12", type: "smartphone", status: "authorized" },
      { id: "dev-2", name: "MacBook Pro laptop", mac: "F0:18:98:C1:44:A2", ip: "10.0.0.45", type: "laptop", status: "authorized" },
      { id: "dev-3", name: "iPad Streaming Pro", mac: "A0:C5:5F:B6:E1:9E", ip: "10.0.0.113", type: "tablet", status: "authorized" },
    ];
  });

  // Keep devices in sync
  useEffect(() => {
    localStorage.setItem("wireless_devices", JSON.stringify(devices));
  }, [devices]);

  // Editing state for devices rename
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editingDeviceName, setEditingDeviceName] = useState("");

  // Toast dispatch helper
  const showNotification = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // 1. Monitor Authentication Session
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        setView("loading");
        setLoadingMsg("Syncing your wireless voucher...");
        await syncUserAndVoucher(user);
      } else {
        setCurrentUser(null);
        setUserProfile(null);
        setAssignedVoucher(null);
        setView("login");
      }
    });
    return () => unsubscribe();
  }, []);

  // Sync profile & acquire voucher if none exists
  const syncUserAndVoucher = async (user: User) => {
    try {
      // 1. Fetch user's history of claimed vouchers
      if (user.email) {
        const history = await getUserVouchersHistory(user.email);
        setVoucherHistory(history);
      }

      // Look up profile
      const profile = await getUserProfile(user.uid);
      if (profile) {
        setUserProfile(profile);
        // Load assigned voucher
        const voucher = await getVoucherDetails(profile.voucher);
        setAssignedVoucher(voucher);
        setView("dashboard");
      } else {
        // No profile, run atomic transaction to assign voucher
        setLoadingMsg("Claiming your free 12-Hour promo voucher...");
        try {
          const claimedCode = await redeemWiFiPromoVoucherTransaction(user.uid, user.email || "");
          const updatedProfile = await getUserProfile(user.uid);
          setUserProfile(updatedProfile);
          const voucher = await getVoucherDetails(claimedCode);
          setAssignedVoucher(voucher);
          
          if (user.email) {
            const history = await getUserVouchersHistory(user.email);
            setVoucherHistory(history);
          }

          showNotification("Free 12-Hour WiFi Voucher Claimed Successfully!", "success");
          setView("dashboard");
        } catch (redeemErr: any) {
          if (redeemErr.message && redeemErr.message.includes("NO_VOUCHERS_AVAILABLE")) {
            // Still create an incomplete profile or represent error cleanly
            setUserProfile({
              uid: user.uid,
              email: user.email || "",
              voucher: "",
              createdAt: new Date(),
            });
            setAssignedVoucher(null);
            showNotification("No promotional vouchers are currently available.", "error");
            setView("dashboard");
          } else {
            throw redeemErr;
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      showNotification("Failed to synchronize with promo database.", "error");
      setView("dashboard");
    }
  };

  // Fetch administrator voucher table
  const fetchAdminVouchers = async () => {
    if (!currentUser || currentUser.email !== "lycelclanaja@gmail.com") {
      setAdminVouchers([]);
      return;
    }
    try {
      const list = await getAllVouchersForAdmin();
      setAdminVouchers(list || []);
    } catch (e) {
      console.warn("Could not list vouchers on sandbox panel: ", e);
    }
  };

  // Refresh admin state automatically or manually
  useEffect(() => {
    if (adminPanelOpen && adminAuthorized && currentUser?.email === "lycelclanaja@gmail.com") {
      fetchAdminVouchers();
    }
  }, [adminPanelOpen, adminAuthorized, currentUser]);

  // Copy code to clipboard
  const handleCopyVoucherCode = async () => {
    if (!assignedVoucher) return;
    try {
      await navigator.clipboard.writeText(assignedVoucher.code);
      setIsCopied(true);
      showNotification(`Voucher Code ${assignedVoucher.code} copied!`, "success");
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      showNotification("Failed to copy code to clipboard.", "error");
    }
  };

  // Request / Claim Additional Voucher from database
  const handleClaimAdditionalVoucher = async () => {
    if (!currentUser) return;
    setIsClaimingAdditional(true);
    try {
      const email = currentUser.email || "";
      const uid = currentUser.uid;
      const newVoucherCode = await claimAdditionalWiFiVoucher(uid, email);
      
      // Update local profile representation
      const updatedProfile = await getUserProfile(uid);
      setUserProfile(updatedProfile);
      
      // Load details of this assigned voucher
      const voucher = await getVoucherDetails(newVoucherCode);
      setAssignedVoucher(voucher);

      // Refresh chronological logs list
      const history = await getUserVouchersHistory(email);
      setVoucherHistory(history);

      showNotification(`Claimed additional voucher successfully! New Code: ${newVoucherCode}`, "success");
    } catch (err: any) {
      console.error(err);
      if (err.message && err.message.includes("NO_VOUCHERS_AVAILABLE")) {
        showNotification("No additional promotional vouchers are available in the system.", "error");
      } else {
        showNotification(err.message || "Failed to claim additional voucher.", "error");
      }
    } finally {
      setIsClaimingAdditional(false);
    }
  };

  // Speed Test Simulator Runner
  const startSpeedTestSim = () => {
    if (speedTestActive) return;
    setSpeedTestActive(true);
    setSpeedTestProgress(0);
    setSpeedTestStep("ping");
    setSpeedMetrics({ ping: 0, download: 0, upload: 0, jitter: 0 });

    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress += 4;
      setSpeedTestProgress(currentProgress);

      if (currentProgress >= 15 && currentProgress < 40) {
        setSpeedTestStep("ping");
        setSpeedMetrics(prev => ({
          ...prev,
          ping: Math.floor(Math.random() * 12) + 14,
          jitter: Math.floor(Math.random() * 3) + 1,
        }));
      } else if (currentProgress >= 40 && currentProgress < 75) {
        setSpeedTestStep("download");
        setSpeedMetrics(prev => ({
          ...prev,
          download: parseFloat((Math.random() * 12 + 62.4).toFixed(1)),
        }));
      } else if (currentProgress >= 75 && currentProgress < 100) {
        setSpeedTestStep("upload");
        setSpeedMetrics(prev => ({
          ...prev,
          upload: parseFloat((Math.random() * 6 + 24.1).toFixed(1)),
        }));
      } else if (currentProgress >= 100) {
        clearInterval(interval);
        setSpeedTestStep("finished");
        setSpeedTestProgress(100);
        setSpeedTestActive(false);
        showNotification("Hotspot Speed Test Completed! High Signal Connection Verified.", "success");
      }
    }, 120);
  };

  // Toggle devices blocked vs authorized states
  const toggleDeviceStatus = (id: string) => {
    setDevices(prev =>
      prev.map(d =>
        d.id === id ? { ...d, status: d.status === "authorized" ? "blocked" : "authorized" } : d
      )
    );
    const target = devices.find(x => x.id === id);
    if (target) {
      const isBlocked = target.status === "authorized";
      showNotification(`${target.name} has been ${isBlocked ? "blocked from using" : "authorized to access"} this voucher!`, isBlocked ? "info" : "success");
    }
  };

  // Trigger device rename
  const startEditingDevice = (id: string, currentName: string) => {
    setEditingDeviceId(id);
    setEditingDeviceName(currentName);
  };

  // Save device name
  const saveDeviceRename = () => {
    if (!editingDeviceName.trim()) return;
    setDevices(prev =>
      prev.map(d =>
        d.id === editingDeviceId ? { ...d, name: editingDeviceName.trim() } : d
      )
    );
    setEditingDeviceId(null);
    setEditingDeviceName("");
    showNotification("Device name updated.", "success");
  };

  // 2. Register Form Submission
  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password || !confirmPassword) {
      showNotification("Please fill in all layout fields.", "error");
      return;
    }
    if (password.length < 6) {
      showNotification("Password must be at least 6 characters long.", "error");
      return;
    }
    if (password !== confirmPassword) {
      showNotification("Confirmation passwords do not match.", "error");
      return;
    }

    setView("loading");
    setLoadingMsg("Creating account on Lycel Network...");

    setHasAuthNotAllowedError(false);
    setHasAuthConfigError(false);
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
      // onAuthStateChanged trigger will fire syncUserAndVoucher automatically
    } catch (error: any) {
      console.error(error);
      setView("register");
      if (error.code === "auth/email-already-in-use") {
        showNotification("This email is already registered. Please login.", "error");
      } else if (error.code === "auth/invalid-email") {
        showNotification("Invalid email address.", "error");
      } else if (error.code === "auth/operation-not-allowed") {
        setHasAuthNotAllowedError(true);
        showNotification("Email/Password Auth is not enabled in your Firebase console.", "error");
      } else if (error.code === "auth/configuration-not-found") {
        setHasAuthConfigError(true);
        showNotification("Firebase Auth activation required.", "error");
      } else {
        showNotification(error.message || "Registration failed.", "error");
      }
    }
  };

  // 3. Login Form Submission
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      showNotification("Please provide email and password.", "error");
      return;
    }

    setView("loading");
    setLoadingMsg("Securing connection with hotspot gateway...");
    setHasAuthNotAllowedError(false);
    setHasAuthConfigError(false);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error: any) {
      console.error(error);
      setView("login");
      if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password" || error.code === "auth/user-not-found") {
        showNotification("Invalid email or password connection.", "error");
      } else if (error.code === "auth/operation-not-allowed") {
        setHasAuthNotAllowedError(true);
        showNotification("Email/Password Auth is not enabled in your Firebase console.", "error");
      } else if (error.code === "auth/configuration-not-found") {
        setHasAuthConfigError(true);
        showNotification("Firebase Auth activation required.", "error");
      } else {
        showNotification("Authentication failed. Please check credentials.", "error");
      }
    }
  };

  // 3.5 Reset Password Handler
  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      showNotification("Please provide your email address.", "error");
      return;
    }

    setIsSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      showNotification("Reset link sent! Please check your email inbox.", "success");
      setView("login");
    } catch (error: any) {
      console.error("Password reset error:", error);
      if (error.code === "auth/user-not-found") {
        showNotification("No account found with this email. Please sign up.", "error");
      } else if (error.code === "auth/invalid-email") {
        showNotification("Invalid email address format.", "error");
      } else if (error.code === "auth/missing-email") {
        showNotification("Missing email address.", "error");
      } else {
        showNotification(error.message || "Failed to send reset email.", "error");
      }
    } finally {
      setIsSendingReset(false);
    }
  };

  // 4. Logout Action
  const handleLogout = async () => {
    setView("loading");
    setLoadingMsg("Logging out safely...");
    try {
      await signOut(auth);
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      showNotification("Successfully signed out.", "success");
    } catch (error) {
      showNotification("Error during logout operation.", "error");
      setView("dashboard");
    }
  };

  // 5. Developer Sandbox Helpers
  const handleSeedDatabase = async () => {
    if (!currentUser || currentUser.email !== "lycelclanaja@gmail.com") {
      showNotification("Administrator account required. Please register and sign in as lycelclanaja@gmail.com to seed the database.", "error");
      return;
    }
    setIsSandboxOperating(true);
    showNotification("Seeding FREE001 - FREE005 to Firestore...", "info");
    try {
      await seedVouchersInFirestore();
      await fetchAdminVouchers();
      showNotification("Database seeded successfully with 5 free codes!", "success");

      // Re-claim voucher if current logged in user has none
      if (currentUser && (!userProfile || !userProfile.voucher)) {
        setView("loading");
        setLoadingMsg("Re-triggering promotional check...");
        await syncUserAndVoucher(currentUser);
      }
    } catch (e: any) {
      showNotification("Failed to seed. Access forbidden or rules blocked.", "error");
    } finally {
      setIsSandboxOperating(false);
    }
  };

  const handleResetDatabase = async () => {
    if (!currentUser || currentUser.email !== "lycelclanaja@gmail.com") {
      showNotification("Administrator account required. Please register and sign in as lycelclanaja@gmail.com to reset.", "error");
      return;
    }
    setIsSandboxOperating(true);
    showNotification("Wiping redemptions & purging accounts...", "info");
    try {
      await resetDatabaseForTesting();
      await fetchAdminVouchers();
      showNotification("Promo-vouchers cleared and set as unused!", "success");

      // Force sign-out to renew test state
      if (currentUser) {
        await signOut(auth);
      } else {
        setView("login");
      }
    } catch (e: any) {
      showNotification("Wipe failed. Security rules did not allow direct purge.", "error");
    } finally {
      setIsSandboxOperating(false);
    }
  };

  const handleAdminPinSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (currentUser?.email !== "lycelclanaja@gmail.com") {
      showNotification("Access denied. Admin email required.", "error");
      setAdminPinInput("");
      return;
    }

    if (adminPinInput.trim() === "833981") {
      sessionStorage.setItem("lycel_admin_auth", "true");
      setAdminAuthorized(true);
      setAdminPinInput("");
      showNotification("CMS Admin Access Granted!", "success");
      fetchAdminVouchers();
    } else {
      showNotification("Incorrect PIN code! Access denied.", "error");
      setAdminPinInput("");
    }
  };

  const handleAdminLock = () => {
    sessionStorage.removeItem("lycel_admin_auth");
    setAdminAuthorized(false);
    showNotification("CMS Admin panel locked.", "info");
  };


  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files ? e.target.files[0] : null;
    if (!file) return;

    if (currentUser?.email !== "lycelclanaja@gmail.com") {
      showNotification("Access denied. Admin email required.", "error");
      return;
    }

    setIsBulkUploading(true);
    showNotification("Processing bulk upload...", "info");

    const reader = new FileReader();
    reader.onload = async (event: any) => {
      const text = event.target.result;
      const lines = text.split("\n");
      const vouchers: { code: string, duration: string }[] = [];
      
      for (const line of lines) {
        if (!line.trim()) continue;
        const [code, duration] = line.split(",");
        if (code && code.trim()) {
          vouchers.push({ code: code.trim(), duration: (duration || "12 Hours").trim() });
        }
      }

      if (vouchers.length === 0) {
        showNotification("No vouchers found in file.", "error");
        setIsBulkUploading(false);
        return;
      }

      try {
        await bulkAddPromoVouchers(vouchers);
        await fetchAdminVouchers();
        showNotification(`Successfully uploaded ${vouchers.length} vouchers!`, "success");
      } catch (err: any) {
        console.error(err);
        showNotification("Failed to bulk upload vouchers.", "error");
      } finally {
        setIsBulkUploading(false);
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // Reset input
  };

  const handleManualAddVoucher = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentUser || currentUser.email !== "lycelclanaja@gmail.com") {
      showNotification("Administrator account required. Please register and sign in as lycelclanaja@gmail.com first.", "error");
      return;
    }
    const cleanCode = newVoucherCode.trim().toUpperCase();
    if (!cleanCode) {
      showNotification("Please enter a valid voucher code.", "error");
      return;
    }
    if (!/^[A-Z0-9_-]{3,20}$/.test(cleanCode)) {
      showNotification("Code must be 3-20 alphanumeric characters, dashes, or underscores.", "error");
      return;
    }

    setIsSandboxOperating(true);
    showNotification(`Adding WiFi voucher "${cleanCode}"...`, "info");
    try {
      await addPromoVoucher(cleanCode, newVoucherDuration);
      setNewVoucherCode("");
      await fetchAdminVouchers();
      showNotification(`WiFi Voucher "${cleanCode}" successfully added!`, "success");
    } catch (err: any) {
      if (err.message === "VOUCHER_ALREADY_EXISTS") {
        showNotification(`Voucher with code "${cleanCode}" already exists!`, "error");
      } else {
        console.error(err);
        showNotification("Failed to add voucher. Access forbidden or rules blocked.", "error");
      }
    } finally {
      setIsSandboxOperating(false);
    }
  };


  // Helper to format timestamp securely
  const formatTimestamp = (ts: any) => {
    if (!ts) return "N/A";
    if (ts.seconds) {
      return new Date(ts.seconds * 1000).toLocaleString();
    }
    if (ts instanceof Date) {
      return ts.toLocaleString();
    }
    return String(ts);
  };

  return (
    <div className="min-h-screen bg-[#e0e7ff] text-slate-800 font-sans antialiased relative overflow-x-hidden flex flex-col justify-between" id="app_root">
      
      {/* Background Mesh Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-400 rounded-full mix-blend-multiply filter blur-[80px] opacity-30 pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-indigo-400 rounded-full mix-blend-multiply filter blur-[80px] opacity-30 pointer-events-none z-0" />
      <div className="absolute top-[20%] right-[10%] w-[400px] h-[400px] bg-sky-300 rounded-full mix-blend-multiply filter blur-[80px] opacity-20 pointer-events-none z-0" />

      {/* Floating Notification Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4"
            id={`toast_${toast.type}`}
          >
            <div className={`p-4 rounded-2xl shadow-xl border flex items-start gap-3 backdrop-blur-md ${
              toast.type === "success" 
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-800" 
                : toast.type === "error" 
                ? "bg-rose-500/10 border-rose-500/20 text-rose-800" 
                : "bg-blue-500/10 border-blue-500/20 text-blue-800"
            }`}>
              <div className="mt-0.5">
                {toast.type === "success" ? (
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : toast.type === "error" ? (
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                ) : (
                  <HelpCircle className="w-5 h-5 text-blue-600 shrink-0" />
                )}
              </div>
              <p className="text-sm font-semibold leading-tight">{toast.message}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* App Header */}
      <header className="relative w-full py-6 px-4 max-w-md mx-auto z-10" id="app_header">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/15 flex items-center justify-center text-white">
              <Wifi className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-slate-800 flex items-center gap-1.5 leading-none">
                Kapten<span className="text-blue-600 font-medium">/</span>Lycel
              </h1>
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">WiFi Connect</span>
            </div>
          </div>
          
          <span className="px-3 py-1 text-[10px] font-bold bg-white/40 border border-white/40 backdrop-blur-md text-blue-600 rounded-full flex items-center gap-1.5 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Promo Hotspot
          </span>
        </div>
      </header>

      {/* Primary Container View */}
      <main className="flex-grow flex items-center justify-center px-4 py-2 relative z-10" id="app_main">
        <div className="w-full max-w-md">

          {/* 1. VIEW: LOADING SCREEN */}
          {view === "loading" && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="backdrop-blur-xl bg-white/45 border border-white/40 p-8 rounded-3xl text-center shadow-2xl space-y-6"
              id="loading_screen"
            >
              <div className="relative w-16 h-16 mx-auto">
                {/* Visual loading ripples */}
                <div className="absolute inset-0 rounded-full border-4 border-blue-500/10" />
                <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
                <Wifi className="w-6 h-6 text-blue-600 absolute inset-0 m-auto animate-bounce" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-slate-800">Please Wait</h3>
                <p className="text-sm text-slate-650 font-mono leading-relaxed">{loadingMsg}</p>
              </div>
            </motion.div>
          )}

          {/* 2. VIEW: LOGIN SCREEN */}
          {view === "login" && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="backdrop-blur-xl bg-white/45 border border-white/40 p-6 rounded-3xl shadow-2xl space-y-6"
              id="login_card"
            >
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-800">Log In to Hotspot</h2>
                <p className="text-sm text-slate-500">Access your dashboard to view your free WiFi promo ticket.</p>
              </div>

              {hasAuthNotAllowedError && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-slate-800 text-xs leading-relaxed space-y-2 text-left shadow-sm">
                  <div className="flex items-center gap-1.5 font-bold text-amber-800">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                    Email/Password Auth Disabled
                  </div>
                  <p className="text-[11px] text-slate-605">
                    Your Firebase project is denying email-password sign-in. To enable:
                  </p>
                  <ol className="list-decimal pl-4.5 text-[11px] text-slate-605 space-y-1">
                    <li>Go to your <a href={`https://console.firebase.google.com/project/${auth.app.options.projectId}/authentication/providers`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-bold">Firebase Console</a></li>
                    <li>Click <strong>Build</strong> &gt; <strong>Authentication</strong></li>
                    <li>Go to the <strong>Sign-in method</strong> tab</li>
                    <li>Add/edit <strong>Email/Password</strong> provider, enable it, and save!</li>
                  </ol>
                </div>
              )}

              {hasAuthConfigError && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-slate-800 text-xs leading-relaxed space-y-2 text-left shadow-sm">
                  <div className="flex items-center gap-1.5 font-bold text-amber-800">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                    Firebase Auth Not Initialized
                  </div>
                  <p className="text-[11px] text-slate-605">
                    Firebase Authentication has not been activated for this Firebase project yet. To fix:
                  </p>
                  <ol className="list-decimal pl-4.5 text-[11px] text-slate-605 space-y-1">
                    <li>Go to the <a href={`https://console.firebase.google.com/project/${auth.app.options.projectId}/authentication`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-bold">Firebase Console Authentication</a></li>
                    <li>Click the blue <strong>"Get Started"</strong> button to initialize Authentication</li>
                    <li>Go to the <strong>Sign-in method</strong> tab and enable <strong>Email/Password</strong> provider</li>
                  </ol>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-5" id="login_form">
                <div className="space-y-1.5">
                  <label htmlFor="login_email" className="text-xs font-bold text-slate-500 tracking-wide uppercase">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                    <input
                      id="login_email"
                      type="email"
                      placeholder="e.g. name@domain.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full pl-11 pr-4 py-3 bg-white/40 border border-white/45 focus:bg-white/70 focus:border-blue-500 rounded-xl focus:ring-1 focus:ring-blue-500 text-sm placeholder-slate-400 outline-none text-slate-800 transition-all font-mono shadow-inner-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label htmlFor="login_password" className="text-xs font-bold text-slate-500 tracking-wide uppercase">Password</label>
                    <button
                      type="button"
                      onClick={() => {
                        setView("forgot_password");
                        setHasAuthNotAllowedError(false);
                        setHasAuthConfigError(false);
                      }}
                      className="text-xs text-blue-650 hover:text-blue-800 hover:underline font-bold transition outline-none"
                      id="link_forgot_password"
                    >
                      Forgot?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                    <input
                      id="login_password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full pl-11 pr-11 py-3 bg-white/40 border border-white/45 focus:bg-white/70 focus:border-blue-500 rounded-xl focus:ring-1 focus:ring-blue-500 text-sm placeholder-slate-400 outline-none text-slate-800 transition-all font-mono shadow-inner-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      id="toggle_login_pwd_visibility"
                    >
                      {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                    </button>
                  </div>
                </div>

                <button
                  id="btn_login"
                  type="submit"
                  className="w-full py-3.5 bg-slate-900 hover:bg-slate-850 active:scale-[0.98] text-white font-bold rounded-2xl text-sm shadow-md cursor-pointer transition-all flex items-center justify-center gap-2"
                >
                  Confirm Login
                </button>
              </form>

              <div className="pt-2 border-t border-slate-200 text-center">
                <p className="text-sm text-slate-500 font-medium font-sans">
                  New Network Member?{" "}
                  <button
                    onClick={() => {
                      setView("register");
                      setEmail("");
                      setPassword("");
                      setShowPassword(false);
                    }}
                    className="text-blue-600 hover:text-blue-800 hover:underline font-bold transition"
                    id="link_go_register"
                  >
                    Create Account
                  </button>
                </p>
              </div>
            </motion.div>
          )}

          {/* 3. VIEW: REGISTER SCREEN */}
          {view === "register" && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="backdrop-blur-xl bg-white/45 border border-white/40 p-6 rounded-3xl shadow-2xl space-y-5"
              id="register_card"
            >
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-800">Join & Get WiFi Ticket</h2>
                <p className="text-sm text-slate-500">Create a hotspot account to secure 12 hours of unlimited WiFi.</p>
              </div>

              {hasAuthNotAllowedError && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-slate-800 text-xs leading-relaxed space-y-2 text-left shadow-sm">
                  <div className="flex items-center gap-1.5 font-bold text-amber-800">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                    Email/Password Auth Disabled
                  </div>
                  <p className="text-[11px] text-slate-605">
                    Your Firebase project is denying email-password sign-up. To enable:
                  </p>
                  <ol className="list-decimal pl-4.5 text-[11px] text-slate-605 space-y-1">
                    <li>Go to your <a href={`https://console.firebase.google.com/project/${auth.app.options.projectId}/authentication/providers`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-bold">Firebase Console</a></li>
                    <li>Click <strong>Build</strong> &gt; <strong>Authentication</strong></li>
                    <li>Go to the <strong>Sign-in method</strong> tab</li>
                    <li>Add/edit <strong>Email/Password</strong> provider, enable it, and save!</li>
                  </ol>
                </div>
              )}

              {hasAuthConfigError && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-slate-800 text-xs leading-relaxed space-y-2 text-left shadow-sm">
                  <div className="flex items-center gap-1.5 font-bold text-amber-800">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                    Firebase Auth Not Initialized
                  </div>
                  <p className="text-[11px] text-slate-605">
                    Firebase Authentication has not been activated for this Firebase project yet. To fix:
                  </p>
                  <ol className="list-decimal pl-4.5 text-[11px] text-slate-605 space-y-1">
                    <li>Go to the <a href={`https://console.firebase.google.com/project/${auth.app.options.projectId}/authentication`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-bold">Firebase Console Authentication</a></li>
                    <li>Click the blue <strong>"Get Started"</strong> button to initialize Authentication</li>
                    <li>Go to the <strong>Sign-in method</strong> tab and enable <strong>Email/Password</strong> provider</li>
                  </ol>
                </div>
              )}

              <form onSubmit={handleRegister} className="space-y-4" id="register_form">
                <div className="space-y-1.5">
                  <label htmlFor="reg_email" className="text-xs font-bold text-slate-500 tracking-wide uppercase">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                    <input
                      id="reg_email"
                      type="email"
                      placeholder="name@domain.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full pl-11 pr-4 py-3 bg-white/40 border border-white/45 focus:bg-white/70 focus:border-blue-500 rounded-xl focus:ring-1 focus:ring-blue-500 text-sm placeholder-slate-400 outline-none text-slate-800 transition-all font-mono shadow-inner-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="reg_password" className="text-xs font-bold text-slate-500 tracking-wide uppercase">Group Password (min 6 chars)</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                    <input
                      id="reg_password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full pl-11 pr-11 py-3 bg-white/40 border border-white/45 focus:bg-white/70 focus:border-blue-500 rounded-xl focus:ring-1 focus:ring-blue-500 text-sm placeholder-slate-400 outline-none text-slate-800 transition-all font-mono shadow-inner-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      id="toggle_reg_pwd_visibility"
                    >
                      {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="reg_confirm" className="text-xs font-bold text-slate-500 tracking-wide uppercase">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                    <input
                      id="reg_confirm"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="w-full pl-11 pr-4 py-3 bg-white/40 border border-white/45 focus:bg-white/70 focus:border-blue-500 rounded-xl focus:ring-1 focus:ring-blue-500 text-sm placeholder-slate-400 outline-none text-slate-800 transition-all font-mono shadow-inner-sm"
                    />
                  </div>
                </div>

                <button
                  id="btn_register"
                  type="submit"
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-750 text-white font-bold rounded-2xl text-sm shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  <Sparkle className="w-4 h-4 text-amber-300 fill-amber-300 animate-spin-slow" />
                  Register & Claim Free Voucher
                </button>
              </form>

              <div className="pt-2 border-t border-slate-200 text-center">
                <p className="text-sm text-slate-500 font-medium font-sans">
                  Already registered?{" "}
                  <button
                    onClick={() => {
                      setView("login");
                      setEmail("");
                      setPassword("");
                      setShowPassword(false);
                    }}
                    className="text-blue-600 hover:text-blue-800 hover:underline font-bold transition"
                    id="link_go_login"
                  >
                    Back to Login
                  </button>
                </p>
              </div>
            </motion.div>
          )}
          
          {/* 3.1 VIEW: FORGOT PASSWORD PAGE */}
          {view === "forgot_password" && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="backdrop-blur-xl bg-white/45 border border-white/40 p-6 rounded-3xl shadow-2xl space-y-6"
              id="forgot_password_card"
            >
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-800">Recover Account</h2>
                <p className="text-sm text-slate-500">Provide your account email address. We will email you a secure link to reset your password.</p>
              </div>

              <form onSubmit={handleForgotPassword} className="space-y-5" id="forgot_password_form">
                <div className="space-y-1.5">
                  <label htmlFor="reset_email" className="text-xs font-bold text-slate-500 tracking-wide uppercase">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                    <input
                      id="reset_email"
                      type="email"
                      placeholder="e.g. name@domain.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full pl-11 pr-4 py-3 bg-white/40 border border-white/45 focus:bg-white/70 focus:border-blue-500 rounded-xl focus:ring-1 focus:ring-blue-500 text-sm placeholder-slate-400 outline-none text-slate-800 transition-all font-mono shadow-inner-sm"
                    />
                  </div>
                </div>

                <button
                  id="btn_send_reset"
                  type="submit"
                  disabled={isSendingReset}
                  className="w-full py-3.5 bg-slate-900 hover:bg-slate-850 active:scale-[0.98] disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-bold rounded-2xl text-sm shadow-md cursor-pointer transition-all flex items-center justify-center gap-2"
                >
                  {isSendingReset ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Sending Recovery Email...
                    </>
                  ) : (
                    "Send Password Reset Email"
                  )}
                </button>
              </form>

              <div className="pt-2 border-t border-slate-200 text-center">
                <p className="text-sm text-slate-500 font-medium font-sans">
                  Ready to Sign In?{" "}
                  <button
                    onClick={() => {
                      setView("login");
                    }}
                    className="text-blue-600 hover:text-blue-800 hover:underline font-bold transition"
                    id="link_back_to_login"
                  >
                    Back to Login
                  </button>
                </p>
              </div>
            </motion.div>
          )}

          {/* 4. VIEW: REDEEMED VOUCHER DASHBOARD VIEW */}
          {view === "dashboard" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35 }}
              className="space-y-6"
              id="dashboard_view"
            >
              {/* User Session Detail Widget */}
              <div className="backdrop-blur-xl bg-white/45 border border-white/40 p-4 rounded-3xl flex items-center justify-between shadow-2xl" id="user_session_bar">
                <div className="space-y-0.5 max-w-[70%]">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Active Member</span>
                  <p className="text-sm font-semibold truncate text-slate-700 font-mono">{currentUser?.email}</p>
                </div>
                <button
                  id="btn_logout"
                  onClick={handleLogout}
                  className="px-3.5 py-1.5 rounded-xl bg-white/40 border border-white/40 hover:bg-red-50 hover:text-red-600 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>

              {/* DASHBOARD TAB NAVIGATION BAR */}
              <div className="grid grid-cols-4 gap-1 p-1 bg-white/30 backdrop-blur-md rounded-2xl border border-white/50 shadow-sm" id="dashboard_tabs">
                <button
                  onClick={() => setCurrentTab("pass")}
                  className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    currentTab === "pass"
                      ? "bg-blue-600 text-white shadow-md font-extrabold"
                      : "text-slate-650 hover:bg-white/40 hover:text-slate-800"
                  }`}
                >
                  My Pass
                </button>
                <button
                  onClick={() => setCurrentTab("history")}
                  className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    currentTab === "history"
                      ? "bg-blue-600 text-white shadow-md font-extrabold"
                      : "text-slate-650 hover:bg-white/40 hover:text-slate-800"
                  }`}
                >
                  History
                  {voucherHistory.length > 0 && (
                    <span className="px-1.5 py-0.5 bg-blue-100/80 text-blue-800 text-[9px] font-extrabold rounded-full">
                      {voucherHistory.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setCurrentTab("devices")}
                  className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    currentTab === "devices"
                      ? "bg-blue-600 text-white shadow-md font-extrabold"
                      : "text-slate-650 hover:bg-white/40 hover:text-slate-805"
                  }`}
                >
                  Devices
                </button>
                <button
                  onClick={() => setCurrentTab("speed-test")}
                  className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    currentTab === "speed-test"
                      ? "bg-blue-600 text-white shadow-md font-extrabold"
                      : "text-slate-650 hover:bg-white/40 hover:text-slate-805"
                  }`}
                >
                  Speed Test
                </button>
              </div>

              {/* TAB CONTAINER SCREEN */}
              <AnimatePresence mode="wait">
                {/* SUB SECTION 1: PASS CARD DETAILED PORTAL VIEW */}
                {currentTab === "pass" && (
                  <motion.div
                    key="tab-pass"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-4"
                  >
                    {/* VOUCHER TICKET GRAPHIC CARD */}
                    <div className="relative group" id="voucher_card_outer">
                      <div className="absolute inset-0 bg-blue-500/10 rounded-[32px] blur-2xl group-hover:bg-blue-500/15 transition-all duration-300 pointer-events-none" />

                      <div className="relative backdrop-blur-lg bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[32px] overflow-hidden shadow-2xl flex flex-col justify-between border border-white/20" id="visual_coupon">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full translate-x-16 -translate-y-16 pointer-events-none" />
                        
                        <div className="p-6 border-b border-dashed border-white/20 flex items-center justify-between relative ticket-punch-left ticket-punch-right">
                          <div className="flex items-center gap-2 relative z-10">
                            <Wifi className="w-5 h-5 text-blue-200 animate-pulse" />
                            <span className="text-xs font-bold uppercase tracking-widest text-white">Kapten/Lycel WiFi</span>
                          </div>

                          <div className="flex flex-col items-end relative z-10">
                            <span className="px-3 py-1 bg-white/25 rounded-full text-[10px] font-bold tracking-widest uppercase text-white shadow-sm flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                              Active Ticket
                            </span>
                          </div>
                        </div>

                        {assignedVoucher ? (
                          <div className="p-8 text-center space-y-6 relative z-10 text-white">
                            <p className="text-xs font-bold tracking-[0.2em] opacity-80 uppercase">WiFi Voucher Code</p>
                            
                            <button
                              onClick={handleCopyVoucherCode}
                              className="w-full inline-block cursor-pointer active:scale-98 transition-transform"
                              title="Click to copy voucher code"
                              id="btn_voucher_code_display"
                            >
                              <div className="py-5 px-3 bg-white/10 hover:bg-white/15 border border-white/10 rounded-2xl transition-all relative flex flex-col items-center justify-center gap-1">
                                <span className="text-4xl font-mono font-black tracking-widest text-white break-all leading-none select-all">
                                  {assignedVoucher.code}
                                </span>
                                <span className="text-[10px] uppercase tracking-wider text-blue-100 font-bold flex items-center gap-1.5 mt-2 opacity-85">
                                  <Copy className="w-3.5 h-3.5" />
                                  Click Code to Copy
                                </span>
                              </div>
                            </button>

                            <div className="h-[1px] w-full bg-white/20"></div>

                            <div className="grid grid-cols-2 gap-4">
                              <div className="p-4 bg-white/10 border border-white/10 rounded-2xl text-left">
                                <span className="text-[10px] opacity-75 uppercase font-semibold block mb-1">Duration</span>
                                <span className="text-base font-bold text-white flex items-center gap-2">
                                  <Clock className="w-4 h-4 text-blue-200 shrink-0" />
                                  {assignedVoucher.duration}
                                </span>
                              </div>

                              <div className="p-4 bg-white/10 border border-white/10 rounded-2xl text-left">
                                <span className="text-[10px] opacity-75 uppercase font-semibold block mb-1">Assigned On</span>
                                <span className="text-base font-bold text-white flex items-center gap-2 truncate">
                                  <Calendar className="w-4 h-4 text-blue-200 shrink-0" />
                                  <span className="truncate font-mono">
                                    {userProfile?.createdAt ? (
                                      new Date((userProfile.createdAt as any).seconds * 1000).toLocaleDateString()
                                    ) : (
                                      new Date().toLocaleDateString()
                                    )}
                                  </span>
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="p-8 text-center space-y-4 text-white relative z-10">
                            <div className="w-12 h-12 rounded-full bg-white/10 border border-white/20 text-white flex items-center justify-center mx-auto">
                              <AlertCircle className="w-6 h-6 shrink-0" />
                            </div>
                            <div className="space-y-2">
                              <p className="text-sm font-semibold">Voucher Is Currently Unavailable</p>
                              <p className="text-xs text-blue-100 opacity-80 leading-relaxed px-2">
                                Promo vouchers are currently unavailable. Please contact the administrator.
                              </p>
                            </div>
                          </div>
                        )}

                        <div className="p-6 bg-black/10 border-t border-white/15 rounded-b-[32px] relative z-10 text-white">
                          <div className="flex items-start gap-4">
                            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <div>
                              <p className="text-sm font-bold">How to use?</p>
                              <p className="text-[11px] text-blue-100 opacity-90">Connect to "Kapten_WiFi" and paste this code in the portal.</p>
                            </div>
                          </div>
                        </div>

                      </div>
                    </div>

                    {assignedVoucher && (
                      <button
                        id="btn_copy_voucher"
                        onClick={handleCopyVoucherCode}
                        className="w-full py-4 bg-slate-900 hover:bg-slate-850 active:scale-95 text-white rounded-2xl font-bold flex items-center justify-center gap-3 shadow-lg hover:shadow-slate-900/10 transition-all cursor-pointer text-center text-sm"
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-5 h-5 text-white stroke-[2.5]" />
                            Voucher Code Copied!
                          </>
                        ) : (
                          <>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                            Copy Voucher Code
                          </>
                        )}
                      </button>
                    )}
                  </motion.div>
                )}

                {/* SUB SECTION 2: CLAIM HISTORY TIMELINE TRACKER */}
                {currentTab === "history" && (
                  <motion.div
                    key="tab-history"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-4 text-left"
                  >
                    <div className="backdrop-blur-xl bg-white/45 border border-white/40 p-5 rounded-[28px] shadow-xl space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <h3 className="text-sm font-bold text-slate-800">My Claimed Vouchers</h3>
                          <p className="text-[11px] text-slate-500">Historical wireless access logs</p>
                        </div>
                        <span className="px-2 py-0.5 rounded-lg text-[9px] font-mono font-bold bg-slate-200 text-slate-705 font-semibold">
                          {voucherHistory.length} total
                        </span>
                      </div>

                      {/* Timeline List of Coupons */}
                      <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                        {voucherHistory.length > 0 ? (
                          voucherHistory.map((v, idx) => {
                            const isActive = assignedVoucher?.code === v.code;
                            return (
                              <div
                                key={v.code || idx}
                                className={`p-3 rounded-xl border flex items-center justify-between transition-colors ${
                                  isActive
                                    ? "bg-blue-500/10 border-blue-500/30"
                                    : "bg-white/40 border-white/60 hover:bg-white/60"
                                }`}
                              >
                                <div className="space-y-1 max-w-[65%]">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-sm font-extrabold text-slate-800">{v.code}</span>
                                    {isActive && (
                                      <span className="bg-emerald-500 text-white text-[8px] font-bold px-1.5 py-0.2 rounded-full animate-pulse uppercase">
                                        Active
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-slate-500 font-medium">
                                    Claimed: {v.usedAt ? (
                                      new Date((v.usedAt as any).seconds ? (v.usedAt as any).seconds * 1000 : v.usedAt).toLocaleString()
                                    ) : "Incomplete Date"}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-bold text-slate-605 bg-white/70 px-2 py-1 rounded-lg border border-slate-200">
                                    {v.duration}
                                  </span>
                                  <button
                                    onClick={async () => {
                                      await navigator.clipboard.writeText(v.code);
                                      showNotification(`Voucher ${v.code} copied!`, "success");
                                    }}
                                    className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
                                    title="Copy Code"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-center py-8 text-slate-400 italic text-xs">
                            No vouchers claimed under this account yet.
                          </div>
                        )}
                      </div>

                      {/* Claim more notice banner */}
                      <div className="p-3 bg-indigo-505/10 rounded-2xl border border-indigo-500/20 text-[10px] text-indigo-900 leading-relaxed flex gap-2">
                        <AlertCircle className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                        <div>
                          <strong>Portal Policy:</strong> Requesting an additional promo ticket will reserve and activate a brand-new 12-Hour login credential. Previously logged codes will be archived in your history logs list.
                        </div>
                      </div>

                      {/* Action trigger button */}
                      <button
                        onClick={handleClaimAdditionalVoucher}
                        disabled={isClaimingAdditional}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-750 text-white text-xs font-bold rounded-xl shadow-md active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {isClaimingAdditional ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Provisioning Wireless Ticket...
                          </>
                        ) : (
                          <>
                            <PlusCircle className="w-4 h-4" />
                            Claim Additional Free Voucher
                          </>
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* SUB SECTION 3: CONNECTED DEVICES LIST & ACL BLOCKED MANAGER */}
                {currentTab === "devices" && (
                  <motion.div
                    key="tab-devices"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-4 text-left"
                  >
                    <div className="backdrop-blur-xl bg-white/45 border border-white/40 p-5 rounded-[28px] shadow-xl space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <h3 className="text-sm font-bold text-slate-800 font-sans">Authorized Terminals</h3>
                          <p className="text-[11px] text-slate-505">Access Control Management under current code</p>
                        </div>
                        <span className="px-2 py-0.5 rounded-lg text-[9px] font-mono font-bold bg-green-100 text-green-70s font-semibold">
                          {devices.filter(d => d.status === "authorized").length} Online
                        </span>
                      </div>

                      {/* Device List Rows */}
                      <div className="space-y-2.5">
                        {devices.map((device) => (
                          <div
                            key={device.id}
                            className="bg-white/40 border border-white/50 p-3 rounded-xl flex flex-col gap-2 relative shadow-inner-sm"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2.5 max-w-[70%]">
                                <div className="w-8 h-8 rounded-lg bg-blue-150 border border-blue-200 text-blue-600 flex items-center justify-center">
                                  {device.type === "laptop" ? (
                                    <Laptop className="w-4 h-4" />
                                  ) : (
                                    <Smartphone className="w-4 h-4" />
                                  )}
                                </div>
                                <div className="space-y-0.2">
                                  {editingDeviceId === device.id ? (
                                    <div className="flex items-center gap-1 mt-0.5">
                                      <input
                                        type="text"
                                        value={editingDeviceName}
                                        onChange={(e) => setEditingDeviceName(e.target.value)}
                                        className="text-xs px-1.5 py-0.5 border border-blue-400 bg-white rounded outline-none text-slate-800"
                                        maxLength={35}
                                        id="rename_input_field"
                                      />
                                      <button
                                        onClick={saveDeviceRename}
                                        className="p-1 rounded bg-green-500 hover:bg-green-600 text-white"
                                      >
                                        <Save className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={() => setEditingDeviceId(null)}
                                        className="p-1 rounded bg-red-400 hover:bg-red-500 text-white"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs font-bold text-slate-800 line-clamp-1">{device.name}</span>
                                      <button
                                        onClick={() => startEditingDevice(device.id, device.name)}
                                        className="p-0.5 text-slate-400 hover:text-slate-600 transition"
                                        title="Rename device reference label"
                                      >
                                        <Edit3 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  )}
                                  <p className="text-[10px] text-slate-400 font-mono">
                                    IP: {device.ip} &bull; MAC: {device.mac}
                                  </p>
                                </div>
                              </div>

                              <div className="flex flex-col items-end gap-1.5">
                                <span
                                  className={`px-2 py-0.5 rounded-lg text-[8px] uppercase font-extrabold border ${
                                    device.status === "authorized"
                                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-750"
                                      : "bg-red-500/10 border-red-500/20 text-red-750"
                                  }`}
                                >
                                  {device.status === "authorized" ? "Authorized" : "Blocked"}
                                </span>
                                <button
                                  onClick={() => toggleDeviceStatus(device.id)}
                                  className={`px-2 py-0.8 text-[9px] font-bold rounded-lg border transition cursor-pointer active:scale-95 ${
                                    device.status === "authorized"
                                      ? "bg-red-500/10 hover:bg-red-500/25 border-red-500/20 text-red-700"
                                      : "bg-blue-600 hover:bg-blue-750 text-white border-transparent"
                                  }`}
                                >
                                  {device.status === "authorized" ? "Block Access" : "Grant Access"}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Device limitations stats */}
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div className="p-3 rounded-2xl border border-white/60 bg-white/20 text-left font-sans">
                          <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold block">Capacity Status</span>
                          <span className="text-sm font-mono font-black text-slate-800 mt-0.5 block">
                            {devices.filter(d => d.status === "authorized").length} of 5 Terminals
                          </span>
                        </div>
                        <div className="p-3 rounded-2xl border border-white/60 bg-white/20 text-left font-sans flex items-center justify-between">
                          <div className="space-y-0.5">
                            <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold block">Auth Enforced</span>
                            <span className="text-xs text-slate-700 font-extrabold flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              WPA/WPA2 Sec
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* SUB SECTION 4: INTELLIGENT DIAGNOSTICS & SPEED TEST METER */}
                {currentTab === "speed-test" && (
                  <motion.div
                    key="tab-speed-test"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-4 text-left"
                  >
                    <div className="backdrop-blur-xl bg-white/45 border border-white/40 p-5 rounded-[28px] shadow-xl space-y-4">
                      <div className="space-y-0.5">
                        <h3 className="text-sm font-bold text-slate-800">Hotspot Signal Diagnostics</h3>
                        <p className="text-[11px] text-slate-505">Measure direct latency & bandwidth speed</p>
                      </div>

                      {/* Gauge graphical panel */}
                      <div className="relative p-6 bg-slate-900 rounded-3xl flex flex-col items-center justify-center text-center overflow-hidden border border-slate-800">
                        <div className="absolute inset-0 bg-radial-gradient from-blue-600/10 to-transparent pointer-events-none" />
                        
                        <div className="relative w-40 h-40 flex items-center justify-center">
                          {/* Signal dial SVG circle */}
                          <svg className="absolute w-full h-full transform -rotate-90">
                            <circle
                              cx="80"
                              cy="80"
                              r="65"
                              stroke="#1e293b"
                              strokeWidth="10"
                              fill="transparent"
                            />
                            <circle
                              cx="80"
                              cy="80"
                              r="65"
                              stroke="#3b82f6"
                              strokeWidth="10"
                              fill="transparent"
                              strokeDasharray="408"
                              strokeDashoffset={408 - (408 * speedTestProgress) / 100}
                              className="transition-all duration-150"
                              strokeLinecap="round"
                            />
                          </svg>

                          {/* Gauge core value text panel */}
                          <div className="text-white space-y-1 relative z-10">
                            {speedTestStep === "idle" && (
                              <div className="space-y-1">
                                <Signal className="w-8 h-8 text-slate-400 mx-auto animate-pulse" />
                                <p className="text-xs uppercase tracking-widest text-slate-450 font-bold">Diag</p>
                                <p className="text-xs font-semibold text-slate-300">Ready</p>
                              </div>
                            )}

                            {speedTestStep === "ping" && (
                              <div className="space-y-0.5">
                                <span className="text-3xl font-mono font-black animate-pulse text-blue-400">
                                  {speedMetrics.ping || "--"}
                                </span>
                                <p className="text-[10px] uppercase text-slate-405 font-bold tracking-wide">Ping ms</p>
                              </div>
                            )}

                            {speedTestStep === "download" && (
                              <div className="space-y-0.5">
                                <span className="text-4xl font-mono font-black text-blue-400">
                                  {speedMetrics.download}
                                </span>
                                <p className="text-[10px] uppercase text-slate-405 font-bold tracking-wide">Download Mbps</p>
                              </div>
                            )}

                            {speedTestStep === "upload" && (
                              <div className="space-y-0.5">
                                <span className="text-4xl font-mono font-black text-purple-400">
                                  {speedMetrics.upload}
                                </span>
                                <p className="text-[10px] uppercase text-slate-405 font-bold tracking-wide">Upload Mbps</p>
                              </div>
                            )}

                            {speedTestStep === "finished" && (
                              <div className="space-y-0.5">
                                <span className="text-3xl font-mono font-black text-emerald-400">
                                  {speedMetrics.download}
                                </span>
                                <p className="text-[10px] uppercase text-slate-405 font-bold tracking-wide">Optimal</p>
                                <p className="text-[10px] font-bold text-emerald-500">Mbps</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Description label of active steps */}
                        <div className="mt-4 text-center z-10 w-full">
                          <p className="text-xs font-semibold font-mono text-slate-300">
                            {speedTestStep === "idle" && "Hotspot Portal Diagnostics"}
                            {speedTestStep === "ping" && "Resolving wireless gateway response times..."}
                            {speedTestStep === "download" && `Testing bandwidth download rate (${speedMetrics.download} Mbps)...`}
                            {speedTestStep === "upload" && `Testing bandwidth upload rate (${speedMetrics.upload} Mbps)...`}
                            {speedTestStep === "finished" && "Optimal carrier bandwith verified!"}
                          </p>
                          <div className="w-2/3 h-1 bg-slate-800 rounded-full mx-auto mt-2 overflow-hidden">
                            <div
                              className="h-full bg-blue-500 transition-all duration-150 rounded-full"
                              style={{ width: `${speedTestProgress}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Metrics Summary Grid Block */}
                      <div className="grid grid-cols-3 gap-2.5">
                        <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-center font-mono">
                          <span className="text-[8px] uppercase tracking-wider text-slate-500 font-bold block mb-0.5">latency</span>
                          <span className="text-sm font-black text-white">
                            {speedMetrics.ping ? `${speedMetrics.ping} ms` : "--"}
                          </span>
                        </div>
                        <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-center font-mono">
                          <span className="text-[8px] uppercase tracking-wider text-slate-500 font-bold block mb-0.5 font-sans">jitter</span>
                          <span className="text-sm font-black text-white">
                            {speedMetrics.jitter ? `${speedMetrics.jitter} ms` : "--"}
                          </span>
                        </div>
                        <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-center font-mono">
                          <span className="text-[8px] uppercase tracking-wider text-slate-500 font-bold block mb-0.5">Upload</span>
                          <span className="text-sm font-black text-purple-400">
                            {speedMetrics.upload ? `${speedMetrics.upload} Mb/s` : "--"}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={startSpeedTestSim}
                        disabled={speedTestActive}
                        className="w-full py-3.5 bg-blue-600 hover:bg-blue-750 disabled:opacity-50 text-white text-xs font-bold rounded-2xl shadow-lg hover:shadow-blue-500/15 transition flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                      >
                        <Activity className={`w-4 h-4 ${speedTestActive ? "animate-spin" : ""}`} />
                        {speedTestStep === "finished" ? "Run Diagnostics Again" : speedTestActive ? "Testing Bandwith Carrier..." : "Begin Hotspot Diagnostics"}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </main>

      {/* 5. FLOATING ADMIN/SANDBOX UTILITY CONSOLE */}
      <footer className="w-full max-w-md mx-auto px-4 pb-6 mt-8 relative z-20" id="sandbox_console_section">
        <div className="backdrop-blur-xl bg-white/45 border border-white/40 p-4 rounded-3xl shadow-2xl space-y-3.5 text-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-blue-600" />
              WiFi CMS Admin Portal
            </span>
            {currentUser?.email === "lycelclanaja@gmail.com" && (
              <button
                onClick={() => setAdminPanelOpen(!adminPanelOpen)}
                className="px-2.5 py-1 rounded-xl bg-white/40 border border-white/50 text-[10px] font-mono hover:bg-white text-blue-600 font-semibold flex items-center gap-1 transition cursor-pointer shadow-sm active:scale-95"
                id="btn_toggle_sandbox_panel"
              >
                <Layers className="w-3 h-3" />
                {adminPanelOpen ? "Close Admin CMS" : "Open Admin CMS"}
              </button>
            )}
          </div>

          {/* Collapsible Panel content */}
          <AnimatePresence>
            {adminPanelOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden space-y-4 pt-1"
                id="sandbox_panel_inner"
              >
                {!adminAuthorized ? (
                  /* Form for entering the PIN */
                  <form onSubmit={handleAdminPinSubmit} className="space-y-3 p-1" id="admin_pin_form">
                    <div className="text-center space-y-1">
                      <h4 className="text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-blue-600" />
                        Administrator Security Check
                      </h4>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        To access the WiFi CMS Administrative Console, please provide your Admin Access PIN.
                      </p>
                    </div>

                    <div className="flex flex-col items-center gap-2">
                      <input
                        type="password"
                        maxLength={6}
                        value={adminPinInput}
                        onChange={(e) => setAdminPinInput(e.target.value.replace(/\D/g, ""))}
                        placeholder="••••••"
                        className="w-28 text-center tracking-widest font-mono text-sm py-1.5 rounded-xl border border-slate-300 bg-white/60 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-semibold"
                        required
                        id="admin_pin_input"
                      />
                      <button
                        type="submit"
                        className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl cursor-pointer transition shadow hover:shadow-md active:scale-95 flex items-center justify-center gap-1.5"
                        id="btn_submit_admin_pin"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        Unlock Administrative CMS
                      </button>
                    </div>
                    {/* PIN hint removed as requested */}
                  </form>
                ) : (
                  /* Full CMS Admin Board Once Authorized */
                  <div className="space-y-4 text-slate-800" id="cms_dashboard_content">
                    {/* Admin Status Info with lock button */}
                    <div className="flex items-center justify-between p-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-850 text-[10px]">
                      <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                        Lycel CMS Enabled (Admin)
                      </div>
                      <button
                        onClick={handleAdminLock}
                        className="px-2 py-0.5 rounded-md bg-white hover:bg-slate-50 border border-emerald-500/20 text-[9px] font-bold text-rose-605 hover:text-rose-700 cursor-pointer transition active:scale-95"
                        id="btn_lock_admin_cms"
                      >
                        Lock Console
                      </button>
                    </div>

                    {(!currentUser || currentUser.email !== "lycelclanaja@gmail.com") && (
                      <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-slate-800 text-[11px] leading-relaxed space-y-1.5 shadow-sm">
                        <div className="flex items-center gap-1.5 font-bold text-amber-800">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                          Firebase Credentials Check
                        </div>
                        <p className="text-slate-700">
                          To seed or add new vouchers, Firestore security rules require that you create an account and sign up or log in as the verified administrator (<strong>lycelclanaja@gmail.com</strong>). Please authenticate above before performing database CMS actions.
                        </p>
                      </div>
                    )}

                    {/* Manual Voucher Addition Section */}
                    <div className="p-3.5 rounded-2xl border border-white/50 bg-white/40 space-y-2.5 shadow-sm">
                      <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <PlusCircle className="w-4 h-4 text-emerald-600" />
                        Add WiFi Voucher
                      </h4>
                      
                      <form onSubmit={handleManualAddVoucher} className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Voucher Code</label>
                            <input
                              type="text"
                              value={newVoucherCode}
                              onChange={(e) => setNewVoucherCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
                              placeholder="e.g. VIP889"
                              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 font-mono text-[11px] bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-bold placeholder:text-slate-400 placeholder:font-sans uppercase"
                              maxLength={20}
                              required
                              id="manual_voucher_code_input"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Access Duration</label>
                            <select
                              value={newVoucherDuration}
                              onChange={(e) => setNewVoucherDuration(e.target.value)}
                              className="w-full px-2 py-1.5 rounded-xl border border-slate-300 font-mono text-[11px] bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all cursor-pointer font-semibold animate-none"
                              id="manual_voucher_duration_select"
                            >
                              <option value="12 Hours">12 Hours (Default)</option>
                              <option value="24 Hours">24 Hours</option>
                              <option value="48 Hours">48 Hours</option>
                              <option value="1 Hour">1 Hour</option>
                              <option value="2 Hours">2 Hours</option>
                              <option value="7 Days">7 Days</option>
                            </select>
                          </div>
                        </div>

                        {/* Quick presets helper */}
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <span className="text-[8px] text-slate-500 uppercase font-bold">Presets:</span>
                          {["12 Hours", "24 Hours", "48 Hours"].map((dur) => (
                            <button
                              key={dur}
                              type="button"
                              onClick={() => setNewVoucherDuration(dur)}
                              className={`px-1.5 py-0.5 rounded-md text-[8px] font-bold transition border cursor-pointer ${
                                newVoucherDuration === dur
                                  ? "bg-emerald-600 text-white border-emerald-700"
                                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                              }`}
                            >
                              {dur}
                            </button>
                          ))}
                        </div>

                        <button
                          type="submit"
                          disabled={isSandboxOperating}
                          className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl cursor-pointer transition shadow hover:shadow-md active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-55"
                          id="btn_submit_add_manual_voucher"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          {isSandboxOperating ? "Adding Voucher..." : "Add Voucher to Pool"}
                        </button>
                      </form>
                    </div>

                    {/* Bulk Upload Section */}
                    <div className="p-3.5 rounded-2xl border border-white/50 bg-white/40 space-y-2.5 shadow-sm">
                      <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <Database className="w-4 h-4 text-emerald-600" />
                        Bulk Voucher Upload
                      </h4>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Upload CSV (code,duration)</label>
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleBulkUpload}
                        disabled={isBulkUploading}
                        className="w-full px-2.5 py-1.5 text-xs text-slate-600 bg-white border border-slate-300 rounded-xl cursor-pointer file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-[10px] file:font-semibold file:bg-emerald-100 file:text-emerald-700 hover:file:bg-emerald-200"
                        id="bulk_voucher_upload"
                      />
                      {isBulkUploading && (
                        <div className="text-[10px] text-emerald-700 font-bold animate-pulse">Uploading and processing...</div>
                      )}
                    </div>

                    {/* Real-time Voucher Registry table */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        WiFi Voucher Registry ({adminVouchers.length} Total)
                      </h4>

                      <div className="rounded-2xl border border-white/50 bg-white/30 overflow-hidden text-xs max-h-[160px] overflow-y-auto shadow-inner-sm">
                        <table className="w-full text-left font-mono border-collapse">
                          <thead>
                            <tr className="bg-white/50 text-slate-605 border-b border-white/35">
                              <th className="p-2 py-1.5 font-bold text-[10px] uppercase">Voucher Code</th>
                              <th className="p-2 py-1.5 font-bold text-[10px] uppercase">Duration</th>
                              <th className="p-2 py-1.5 font-bold text-[10px] uppercase">Status</th>
                              <th className="p-2 py-1.5 font-bold text-[10px] uppercase">Claimed By</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/20 text-slate-755">
                            {adminVouchers.length > 0 ? (
                              adminVouchers.map((voucher) => (
                                <tr key={voucher.code} className="hover:bg-white/20">
                                  <td className="p-2 py-1.5 font-bold text-slate-850">{voucher.code}</td>
                                  <td className="p-2 py-1.5 text-slate-600 text-[10px]">{voucher.duration}</td>
                                  <td className="p-2 py-1.5">
                                    {voucher.used ? (
                                      <span className="px-1.5 py-0.5 rounded-lg text-[9px] uppercase font-bold bg-amber-500/10 border border-amber-500/20 text-amber-700">
                                        Claimed
                                      </span>
                                    ) : (
                                      <span className="px-1.5 py-0.5 rounded-lg text-[9px] uppercase font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 animate-pulse">
                                        Available
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-2 py-1.5 text-slate-500 truncate max-w-[120px]" title={voucher.usedBy || "N/A"}>
                                    {voucher.usedBy ? voucher.usedBy : "-"}
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={4} className="p-3 text-center text-slate-400 italic">
                                  No vouchers exist in Firestore. Create one above!
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Developer Sandbox Options */}
                    <div className="pt-2 border-t border-slate-200/55 space-y-2">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">Debug Actions & Overrides</span>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={handleSeedDatabase}
                          disabled={isSandboxOperating}
                          className="py-2.5 px-3 rounded-2xl border border-indigo-200 hover:border-indigo-400 bg-white/40 hover:bg-white/70 text-indigo-700 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-sm active:scale-95"
                          id="btn_seed_database"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          Seed FREE001-FREE005
                        </button>

                        <button
                          onClick={handleResetDatabase}
                          disabled={isSandboxOperating}
                          className="py-2.5 px-3 rounded-2xl border border-rose-200 hover:border-rose-400 bg-white/40 hover:bg-white/70 text-rose-700 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-sm active:scale-95"
                          id="btn_reset_database"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isSandboxOperating ? "animate-spin" : ""}`} />
                          Wipe & Clear DB
                        </button>
                      </div>
                      <p className="text-[10px] text-center text-slate-500 font-mono">
                        Database Env: {auth.app.options.projectId} (web)
                      </p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </footer>
    </div>
  );
}
