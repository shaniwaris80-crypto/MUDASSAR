import {
  initializeApp,
  getApps,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-storage.js";

/* =========================================================
   FIREBASE CONFIG
========================================================= */
const firebaseConfig = {
  apiKey: "AIzaSyCU5HPe6BgavLPG91g8P1_mPqtqaoXo8jo",
  authDomain: "mudassar-eaff1.firebaseapp.com",
  projectId: "mudassar-eaff1",
  storageBucket: "mudassar-eaff1.firebasestorage.app",
  messagingSenderId: "993162447687",
  appId: "1:993162447687:web:e61c85d4f823093cd29a62",
  measurementId: "G-TR8P3854MG",
};

const PRIMARY_APP = initializeApp(firebaseConfig);
const auth = getAuth(PRIMARY_APP);
const db = getFirestore(PRIMARY_APP);
const storage = getStorage(PRIMARY_APP);

await setPersistence(auth, browserLocalPersistence);

/* =========================================================
   SECONDARY AUTH APP
   Used to create new Firebase Auth users without breaking
   the current manager session.
========================================================= */
function getSecondaryAuth() {
  const existing = getApps().find((app) => app.name === "secondary-auth-app");
  const app = existing || initializeApp(firebaseConfig, "secondary-auth-app");
  return getAuth(app);
}

/* =========================================================
   STATIC INITIAL STAFF
   These 3 are the starter accounts. New drivers/managers
   can be created later from the Drivers module.
========================================================= */
const INITIAL_STAFF = {
  mudassar: {
    staffKey: "mudassar",
    fullName: "MUDASSAR",
    email: "mudassar@fleet.app",
    legacyPassword: "mudassar1990",
    pin: "1990",
    role: "manager",
    active: true,
    authMode: "legacy",
    managerKey: "mudassar",
    managerName: "MUDASSAR",
    colorHex: "#1d4ed8",
  },
  saqlain: {
    staffKey: "saqlain",
    fullName: "SAQLAIN",
    email: "saqlain@fleet.app",
    legacyPassword: "saqlain1234",
    pin: "1234",
    role: "driver",
    active: true,
    authMode: "legacy",
    managerKey: "mudassar",
    managerName: "MUDASSAR",
    colorHex: "#16a34a",
  },
  shujaat: {
    staffKey: "shujaat",
    fullName: "SHUJAAT",
    email: "shujaat@fleet.app",
    legacyPassword: "shujaat1234",
    pin: "1234",
    role: "driver",
    active: true,
    authMode: "legacy",
    managerKey: "mudassar",
    managerName: "MUDASSAR",
    colorHex: "#ea580c",
  },
};

const HISTORY_PAGE_SIZE = 30;

/* =========================================================
   STATE
========================================================= */
const state = {
  authUser: null,
  currentStaffKey: "",
  currentStaff: null,

  publicProfiles: {},
  driverProfiles: {},
  cars: {},
  shifts: [],

  unsubPublicProfiles: null,
  unsubDriverProfiles: null,
  unsubCars: null,
  unsubShifts: null,

  charts: {},

  historyPage: 1,

  photoModalStaffKey: "",
  pendingPhotoFile: null,
  pendingPhotoPreviewUrl: "",

  editingDriverKey: "",
  editingCarId: "",
};

/* =========================================================
   DOM HELPERS
========================================================= */
const $ = (id) => document.getElementById(id);

function show(el) {
  el?.classList.remove("hidden");
}

function hide(el) {
  el?.classList.add("hidden");
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(value) {
  return `€${num(value).toFixed(2)}`;
}

function safeDiv(a, b) {
  return b > 0 ? a / b : 0;
}

function initials(name) {
  return String(name || "U")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "U";
}

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  show(toast);
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => hide(toast), 2600);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function dateTimeLabel() {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(d);
}

function statCard(label, value, sub = "") {
  return `
    <div class="stat-card">
      <div class="stat-label">${esc(label)}</div>
      <div class="stat-value">${esc(value)}</div>
      <div class="stat-sub">${esc(sub)}</div>
    </div>
  `;
}

function getCssVar(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

function normalizeStaffKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function passwordFromPin(pin) {
  return `fleet-${String(pin).trim()}`;
}

function getPublicProfile(staffKey) {
  const a = state.publicProfiles[staffKey] || {};
  const b = INITIAL_STAFF[staffKey] || {};
  return Object.keys(a).length || Object.keys(b).length ? { ...b, ...a } : null;
}

function getDriverProfile(staffKey) {
  const base = getPublicProfile(staffKey) || {};
  const details = state.driverProfiles[staffKey] || {};
  return Object.keys(base).length || Object.keys(details).length
    ? { ...base, ...details }
    : null;
}

function getAllProfiles() {
  const keys = new Set([
    ...Object.keys(INITIAL_STAFF),
    ...Object.keys(state.publicProfiles),
    ...Object.keys(state.driverProfiles),
  ]);

  return [...keys]
    .map((key) => getDriverProfile(key))
    .filter(Boolean)
    .sort((a, b) => String(a.fullName || "").localeCompare(String(b.fullName || "")));
}

function getVisibleProfiles() {
  if (!state.currentStaff) return [];
  if (state.currentStaff.role === "manager") {
    return getAllProfiles();
  }
  const self = getDriverProfile(state.currentStaff.staffKey);
  return self ? [self] : [];
}

function getActiveProfilesForLogin() {
  return getAllProfiles().filter((p) => p.active !== false && p.status !== "inactive");
}

function getActiveDriversForOperations() {
  return getAllProfiles().filter((p) => p.active !== false && p.status !== "inactive");
}

function getCurrentProfile() {
  return state.currentStaffKey ? getDriverProfile(state.currentStaffKey) : null;
}

function getColorHex(profile) {
  return profile?.colorHex || "#1d4ed8";
}

function buildDriverBadgeStyle(profile) {
  return `background:${getColorHex(profile)};`;
}

function buildDriverLineStyle(profile) {
  return `background:${getColorHex(profile)};`;
}

function buildHistoryRowStyle(profile) {
  return `border-left:5px solid ${getColorHex(profile)};`;
}

function isManager() {
  return state.currentStaff?.role === "manager";
}

function currentManagerKey() {
  return state.currentStaff?.managerKey || state.currentStaff?.staffKey || "mudassar";
}

function currentManagerName() {
  return state.currentStaff?.managerName || state.currentStaff?.fullName || "MUDASSAR";
}

function currentViewId() {
  const open = [...document.querySelectorAll(".view")].find((v) => !v.classList.contains("hidden"));
  return open?.id || "dashboardView";
}

function isViewVisible(id) {
  return !$(id)?.classList.contains("hidden");
}

function buildCarLabel(car) {
  const plate = car?.plate || "";
  const brand = car?.brand || "";
  const model = car?.model || "";
  const alias = car?.alias || "";

  const pieces = [
    alias,
    [brand, model].filter(Boolean).join(" ").trim(),
    plate ? `(${plate})` : "",
  ].filter(Boolean);

  return pieces.join(" ").trim();
}

function getCarById(carId) {
  return state.cars[carId] || null;
}

function getActiveCars() {
  return Object.entries(state.cars)
    .filter(([, car]) => car.status !== "inactive")
    .map(([id, car]) => ({ id, ...car }))
    .sort((a, b) => buildCarLabel(a).localeCompare(buildCarLabel(b)));
}

function revokePendingPreview() {
  if (state.pendingPhotoPreviewUrl) {
    URL.revokeObjectURL(state.pendingPhotoPreviewUrl);
    state.pendingPhotoPreviewUrl = "";
  }
}

function cleanupSubs() {
  if (typeof state.unsubPublicProfiles === "function") {
    state.unsubPublicProfiles();
    state.unsubPublicProfiles = null;
  }
  if (typeof state.unsubDriverProfiles === "function") {
    state.unsubDriverProfiles();
    state.unsubDriverProfiles = null;
  }
  if (typeof state.unsubCars === "function") {
    state.unsubCars();
    state.unsubCars = null;
  }
  if (typeof state.unsubShifts === "function") {
    state.unsubShifts();
    state.unsubShifts = null;
  }
}

/* =========================================================
   THEME
========================================================= */
const themeKey = "fleet-theme-mode";

function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem(themeKey, theme);

  const text = theme === "light" ? "Night mode" : "Day mode";
  if ($("themeToggleBtn")) $("themeToggleBtn").textContent = text;
  if ($("themeToggleAuthBtn")) $("themeToggleAuthBtn").textContent = text;

  rerenderVisibleCharts();
}

(function initTheme() {
  const saved = localStorage.getItem(themeKey) || "light";
  applyTheme(saved);
})();

$("themeToggleBtn")?.addEventListener("click", () => {
  const current = document.body.getAttribute("data-theme") || "light";
  applyTheme(current === "light" ? "dark" : "light");
});

$("themeToggleAuthBtn")?.addEventListener("click", () => {
  const current = document.body.getAttribute("data-theme") || "light";
  applyTheme(current === "light" ? "dark" : "light");
});

/* =========================================================
   LOGIN PROFILES LOAD
========================================================= */
async function loadPublicProfilesForLogin() {
  const merged = { ...INITIAL_STAFF };

  try {
    const snap = await getDocs(collection(db, "publicProfiles"));
    snap.docs.forEach((d) => {
      merged[d.id] = {
        ...(INITIAL_STAFF[d.id] || {}),
        ...d.data(),
      };
    });
  } catch (error) {
    console.warn("Public profiles load fallback:", error);
  }

  state.publicProfiles = merged;
  populateLoginSelect();
}

function populateLoginSelect() {
  const select = $("loginStaff");
  if (!select) return;

  const profiles = Object.values(state.publicProfiles || INITIAL_STAFF)
    .filter((p) => p.active !== false && p.status !== "inactive")
    .sort((a, b) => String(a.fullName || "").localeCompare(String(b.fullName || "")));

  select.innerHTML = profiles
    .map((p) => {
      const roleText = p.role === "manager" ? "Manager / Driver" : "Driver";
      return `<option value="${esc(p.staffKey)}">${esc(p.fullName)} — ${esc(roleText)}</option>`;
    })
    .join("");

  if (!select.value && profiles[0]) {
    select.value = profiles[0].staffKey;
  }

  updateLoginHint();
}

function updateLoginHint() {
  const selected = getPublicProfile($("loginStaff").value) || INITIAL_STAFF[$("loginStaff").value];
  if (!selected) return;

  $("loginHint").textContent = "Enter your credentials to continue.";
  $("loginBtn").textContent = `Sign in as ${selected.role === "manager" ? "manager" : "driver"}`;
}

$("loginStaff")?.addEventListener("change", updateLoginHint);

/* =========================================================
   LOGIN
========================================================= */
$("loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const staffKey = $("loginStaff").value;
  const pin = $("loginPin").value.trim();

  const selected = getPublicProfile(staffKey) || INITIAL_STAFF[staffKey];
  if (!selected) {
    showToast("Invalid user.");
    return;
  }

  if (!pin) {
    showToast("Enter your PIN.");
    return;
  }

  const email = selected.email;
  const primaryAttemptPassword =
    selected.authMode === "legacy"
      ? selected.legacyPassword || passwordFromPin(pin)
      : passwordFromPin(pin);

  try {
    await signInWithEmailAndPassword(auth, email, primaryAttemptPassword);
    $("loginPin").value = "";
    showToast("Signed in.");
  } catch (firstError) {
    try {
      const fallbackPassword = passwordFromPin(pin);
      if (fallbackPassword !== primaryAttemptPassword) {
        await signInWithEmailAndPassword(auth, email, fallbackPassword);
        $("loginPin").value = "";
        showToast("Signed in.");
        return;
      }
      throw firstError;
    } catch (secondError) {
      console.error(secondError);
      showToast("Sign in failed. Check Firebase users, passwords or PIN.");
    }
  }
});

$("logoutBtn")?.addEventListener("click", async () => {
  try {
    cleanupSubs();
    destroyAllCharts();
    await signOut(auth);
    state.authUser = null;
    state.currentStaff = null;
    state.currentStaffKey = "";
    $("loginPin").value = "";
    await loadPublicProfilesForLogin();
    show($("authView"));
    hide($("appView"));
    showToast("Logged out.");
  } catch (error) {
    console.error(error);
    showToast("Logout failed.");
  }
});

/* =========================================================
   AUTH STATE
========================================================= */
onAuthStateChanged(auth, async (user) => {
  cleanupSubs();

  if (!user) {
    return;
  }

  const matched =
    Object.values(state.publicProfiles).find((p) => p.email === user.email) ||
    Object.values(INITIAL_STAFF).find((p) => p.email === user.email);

  if (!matched) {
    showToast("This account is not allowed in this app.");
    await signOut(auth);
    return;
  }

  state.authUser = user;
  state.currentStaffKey = matched.staffKey;
  state.currentStaff = { ...matched };

  await ensureCurrentUserDocs();
  attachNav();

  hide($("authView"));
  show($("appView"));

  subscribePublicProfiles();
  subscribeDriverProfiles();
  subscribeCars();
  subscribeShifts();

  setHeaderProfile();
  populateOperationalSelects();
  setShiftDefaults();
  renderShiftPreview();
  renderDriversView();
  renderCarsView();
  rerenderVisibleView();
});

/* =========================================================
   ENSURE STARTER DOCS
========================================================= */
async function ensureCurrentUserDocs() {
  const selfProfile = getPublicProfile(state.currentStaffKey) || INITIAL_STAFF[state.currentStaffKey];
  if (!selfProfile) return;

  if (isManager()) {
    for (const [staffKey, base] of Object.entries(INITIAL_STAFF)) {
      await ensurePublicProfileDoc(staffKey, base);
      await ensureDriverProfileDoc(staffKey, base);
    }
  } else {
    await ensurePublicProfileDoc(selfProfile.staffKey, selfProfile);
    await ensureDriverProfileDoc(selfProfile.staffKey, selfProfile);
  }
}

async function ensurePublicProfileDoc(staffKey, base) {
  const ref = doc(db, "publicProfiles", staffKey);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      staffKey: base.staffKey,
      fullName: base.fullName,
      email: base.email,
      role: base.role,
      active: base.active !== false,
      status: base.status || "active",
      authMode: base.authMode || "legacy",
      managerKey: base.managerKey || base.staffKey,
      managerName: base.managerName || base.fullName,
      colorHex: base.colorHex || "#1d4ed8",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

async function ensureDriverProfileDoc(staffKey, base) {
  const ref = doc(db, "driverProfiles", staffKey);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      staffKey: base.staffKey,
      fullName: base.fullName,
      email: base.email,
      role: base.role,
      managerKey: base.managerKey || base.staffKey,
      managerName: base.managerName || base.fullName,
      colorHex: base.colorHex || "#1d4ed8",
      phone: "",
      defaultCarId: "",
      photoUrl: "",
      photoPath: "",
      status: "active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

/* =========================================================
   SUBSCRIPTIONS
========================================================= */
function subscribePublicProfiles() {
  state.unsubPublicProfiles = onSnapshot(collection(db, "publicProfiles"), (snap) => {
    const next = { ...INITIAL_STAFF };
    snap.docs.forEach((d) => {
      next[d.id] = {
        ...(INITIAL_STAFF[d.id] || {}),
        ...d.data(),
      };
    });
    state.publicProfiles = next;
    populateLoginSelect();
    renderDriversView();
    populateOperationalSelects();
    if (state.currentStaffKey) {
      const current = getDriverProfile(state.currentStaffKey);
      if (current) state.currentStaff = current;
    }
    setHeaderProfile();
    renderHistoryTable();
    renderReports();
    renderDashboard();
  });
}

function subscribeDriverProfiles() {
  state.unsubDriverProfiles = onSnapshot(collection(db, "driverProfiles"), (snap) => {
    const next = {};
    snap.docs.forEach((d) => {
      next[d.id] = d.data();
    });
    state.driverProfiles = next;
    if (state.currentStaffKey) {
      const current = getDriverProfile(state.currentStaffKey);
      if (current) state.currentStaff = current;
    }
    setHeaderProfile();
    populateOperationalSelects();
    renderDriversView();
    renderHistoryTable();
    renderDashboard();
    renderReports();
  });
}

function subscribeCars() {
  state.unsubCars = onSnapshot(collection(db, "cars"), (snap) => {
    const next = {};
    snap.docs.forEach((d) => {
      next[d.id] = d.data();
    });
    state.cars = next;
    populateOperationalSelects();
    renderCarsView();
    renderDriversView();
    renderHistoryTable();
    renderReports();
    setHeaderProfile();
  });
}

function subscribeShifts() {
  const shiftsRef = collection(db, "shifts");

  if (isManager()) {
    const q = query(shiftsRef, where("managerKey", "==", state.currentStaff.staffKey));
    state.unsubShifts = onSnapshot(q, (snap) => {
      state.shifts = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(sortShifts);
      renderDashboard();
      renderHistoryTable();
      renderReports();
    });
    return;
  }

  const q = query(shiftsRef, where("driverKey", "==", state.currentStaff.staffKey));
  state.unsubShifts = onSnapshot(q, (snap) => {
    state.shifts = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(sortShifts);
    renderDashboard();
    renderHistoryTable();
    renderReports();
  });
}

function sortShifts(a, b) {
  const da = String(a.dateKey || "");
  const db = String(b.dateKey || "");
  if (da !== db) return db.localeCompare(da);

  const ca = a.createdAt?.seconds || 0;
  const cb = b.createdAt?.seconds || 0;
  return cb - ca;
}

/* =========================================================
   SIDEBAR / VIEW
========================================================= */
function setHeaderProfile() {
  const profile = getCurrentProfile();
  if (!profile) return;

  $("sidebarName").textContent = profile.fullName || "";
  $("sidebarRole").textContent = profile.role === "manager" ? "Manager / Driver" : "Driver";
  $("sidebarVehicle").textContent = getDefaultCarLabel(profile) || "No default car";

  setCirclePhoto(
    $("sidebarAvatarImg"),
    $("sidebarAvatar"),
    profile.photoUrl,
    profile.fullName
  );
}

function attachNav() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      openView(btn.dataset.view);
    };
  });
}

function openView(viewId) {
  document.querySelectorAll(".view").forEach((view) => hide(view));
  show($(viewId));

  const map = {
    dashboardView: ["Dashboard", "Live overview of income, fuel, spending and net"],
    shiftView: ["New Shift", "Manager can create full shift details on behalf of any driver"],
    historyView: ["Shift History", "Search by date, driver or car · 30 rows per page"],
    reportsView: ["Reports", "Daily, weekly, monthly and yearly analytics with export PDFs"],
    driversView: ["Drivers", "Create new drivers, edit existing ones and manage photos"],
    carsView: ["Cars", "View existing cars, add new ones and assign defaults"],
  };

  $("pageTitle").textContent = map[viewId][0];
  $("pageSubtitle").textContent = map[viewId][1];

  rerenderVisibleView();
}

function rerenderVisibleView() {
  const view = currentViewId();

  if (view === "dashboardView") {
    renderDashboard();
  } else if (view === "shiftView") {
    renderShiftPreview();
  } else if (view === "historyView") {
    renderHistoryTable();
  } else if (view === "reportsView") {
    renderReports();
  } else if (view === "driversView") {
    renderDriversView();
  } else if (view === "carsView") {
    renderCarsView();
  }
}

function rerenderVisibleCharts() {
  if (isViewVisible("dashboardView")) renderDashboardCharts();
  if (isViewVisible("reportsView")) renderReportCharts();
}

/* =========================================================
   PHOTO HELPERS
========================================================= */
function setCirclePhoto(imgEl, fallbackEl, photoUrl, fullName) {
  if (photoUrl) {
    imgEl.src = photoUrl;
    show(imgEl);
    hide(fallbackEl);
  } else {
    imgEl.src = "";
    hide(imgEl);
    fallbackEl.textContent = initials(fullName);
    show(fallbackEl);
  }
}

function photoHtml(profile, small = false) {
  const imgClass = small ? "circle-photo-small" : "circle-photo";
  const fallbackClass = small ? "circle-fallback-small" : "circle-fallback";

  if (profile?.photoUrl) {
    return `<img src="${esc(profile.photoUrl)}" alt="${esc(profile.fullName)}" class="${imgClass}" />`;
  }

  return `<div class="${fallbackClass}">${esc(initials(profile?.fullName || "D"))}</div>`;
}

/* =========================================================
   OPERATIONAL SELECTS
========================================================= */
function populateOperationalSelects() {
  populateShiftDriverSelect();
  populateShiftCarsSelect();
  populateHistoryDriverSelect();
  populateReportDriverSelect();
  populateDriverDefaultCarSelect();
  populateCarDefaultDriverSelect();
}

function populateShiftDriverSelect() {
  const select = $("sfDriverKey");
  const profiles = getActiveDriversForOperations();

  if (isManager()) {
    show($("driverSelectWrap"));
    select.innerHTML = profiles
      .map((profile) => `<option value="${esc(profile.staffKey)}">${esc(profile.fullName)}</option>`)
      .join("");
    if (!select.value && profiles[0]) {
      select.value = profiles[0].staffKey;
    }
  } else {
    hide($("driverSelectWrap"));
    select.innerHTML = "";
  }
}

function populateShiftCarsSelect() {
  const select = $("sfCarId");
  if (!select) return;

  const cars = getActiveCars();
  const options = [
    `<option value="">Select car</option>`,
    ...cars.map((car) => `<option value="${esc(car.id)}">${esc(buildCarLabel(car))}</option>`),
  ];
  select.innerHTML = options.join("");

  applyDriverDefaultCarToShift();
}

function populateHistoryDriverSelect() {
  const select = $("historyDriverFilter");
  if (!select) return;

  if (!isManager()) {
    select.innerHTML = `<option value="${esc(state.currentStaff.staffKey)}">${esc(
      state.currentStaff.fullName
    )}</option>`;
    return;
  }

  const options = [
    `<option value="all">All</option>`,
    ...getActiveDriversForOperations().map(
      (profile) => `<option value="${esc(profile.staffKey)}">${esc(profile.fullName)}</option>`
    ),
  ];
  select.innerHTML = options.join("");
}

function populateReportDriverSelect() {
  const select = $("reportDriverFilter");
  if (!select) return;

  if (!isManager()) {
    select.innerHTML = `<option value="${esc(state.currentStaff.staffKey)}">${esc(
      state.currentStaff.fullName
    )}</option>`;
    return;
  }

  const options = [
    `<option value="all">All</option>`,
    ...getActiveDriversForOperations().map(
      (profile) => `<option value="${esc(profile.staffKey)}">${esc(profile.fullName)}</option>`
    ),
  ];
  select.innerHTML = options.join("");
}

function populateDriverDefaultCarSelect() {
  const select = $("driverDefaultCarInput");
  if (!select) return;

  const cars = getActiveCars();
  select.innerHTML = [
    `<option value="">No default car</option>`,
    ...cars.map((car) => `<option value="${esc(car.id)}">${esc(buildCarLabel(car))}</option>`),
  ].join("");
}

function populateCarDefaultDriverSelect() {
  const select = $("carDefaultDriverInput");
  if (!select) return;

  const profiles = getActiveDriversForOperations();
  select.innerHTML = [
    `<option value="">No default driver</option>`,
    ...profiles.map(
      (profile) => `<option value="${esc(profile.staffKey)}">${esc(profile.fullName)}</option>`
    ),
  ].join("");
}

function getDefaultCarLabel(profile) {
  if (!profile?.defaultCarId) return "";
  const car = getCarById(profile.defaultCarId);
  return car ? buildCarLabel({ id: profile.defaultCarId, ...car }) : "";
}

$("sfDriverKey")?.addEventListener("change", () => {
  applyDriverDefaultCarToShift();
  renderShiftPreview();
});

$("sfCarId")?.addEventListener("change", renderShiftPreview);

function applyDriverDefaultCarToShift() {
  const select = $("sfCarId");
  if (!select) return;

  const driverKey = isManager() ? $("sfDriverKey").value : state.currentStaff.staffKey;
  const profile = getDriverProfile(driverKey);
  if (!profile) return;

  if (profile.defaultCarId && state.cars[profile.defaultCarId]) {
    select.value = profile.defaultCarId;
  } else if (!select.value) {
    select.value = "";
  }
}

/* =========================================================
   SHIFT DEFAULTS
========================================================= */
function setShiftDefaults() {
  $("sfDate").value = todayISO();
  $("sfKm").value = "";
  $("sfStartTime").value = "";
  $("sfEndTime").value = "";
  $("sfNotes").value = "";

  [
    "sfTaximetroCash",
    "sfTaximetroCard",
    "sfCabifyCash",
    "sfCabifyApp",
    "sfFreeNowCash",
    "sfFreeNowApp",
    "sfUberApp",
    "sfFuel1",
    "sfFuel2",
    "sfFuel3",
    "sfFuelOther",
    "sfParking",
    "sfTolls",
    "sfCleaning",
    "sfOtherExpenses",
    "sfWash",
    "sfOil",
    "sfTyres",
    "sfWorkshop",
    "sfItv",
    "sfOtherMaintenance",
  ].forEach((id) => {
    $(id).value = "0";
  });

  applyDriverDefaultCarToShift();
  renderShiftPreview();
}

const shiftFieldIds = [
  "sfDate",
  "sfDriverKey",
  "sfCarId",
  "sfKm",
  "sfStartTime",
  "sfEndTime",
  "sfNotes",
  "sfTaximetroCash",
  "sfTaximetroCard",
  "sfCabifyCash",
  "sfCabifyApp",
  "sfFreeNowCash",
  "sfFreeNowApp",
  "sfUberApp",
  "sfFuel1",
  "sfFuel2",
  "sfFuel3",
  "sfFuelOther",
  "sfParking",
  "sfTolls",
  "sfCleaning",
  "sfOtherExpenses",
  "sfWash",
  "sfOil",
  "sfTyres",
  "sfWorkshop",
  "sfItv",
  "sfOtherMaintenance",
];

shiftFieldIds.forEach((id) => {
  $(id)?.addEventListener("input", renderShiftPreview);
  $(id)?.addEventListener("change", renderShiftPreview);
});

$("resetShiftBtn")?.addEventListener("click", () => {
  $("shiftForm").reset();
  setShiftDefaults();
});

/* =========================================================
   SHIFT CALCULATIONS
========================================================= */
function minutesBetween(dateStr, startTime, endTime) {
  if (!dateStr || !startTime || !endTime) return 0;

  const start = new Date(`${dateStr}T${startTime}:00`);
  const end = new Date(`${dateStr}T${endTime}:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  let diff = end.getTime() - start.getTime();
  if (diff < 0) diff += 24 * 60 * 60 * 1000;

  return Math.round(diff / 60000);
}

function getShiftRawForm() {
  return {
    dateKey: $("sfDate").value,
    startTime: $("sfStartTime").value,
    endTime: $("sfEndTime").value,
    carId: $("sfCarId").value,
    km: $("sfKm").value,
    notes: $("sfNotes").value.trim(),

    taximetroCash: $("sfTaximetroCash").value,
    taximetroCard: $("sfTaximetroCard").value,

    cabifyCash: $("sfCabifyCash").value,
    cabifyApp: $("sfCabifyApp").value,

    freeNowCash: $("sfFreeNowCash").value,
    freeNowApp: $("sfFreeNowApp").value,

    uberApp: $("sfUberApp").value,

    fuel1: $("sfFuel1").value,
    fuel2: $("sfFuel2").value,
    fuel3: $("sfFuel3").value,
    fuelOther: $("sfFuelOther").value,

    parking: $("sfParking").value,
    tolls: $("sfTolls").value,
    cleaning: $("sfCleaning").value,
    otherExpenses: $("sfOtherExpenses").value,

    wash: $("sfWash").value,
    oil: $("sfOil").value,
    tyres: $("sfTyres").value,
    workshop: $("sfWorkshop").value,
    itv: $("sfItv").value,
    otherMaintenance: $("sfOtherMaintenance").value,
  };
}

function calculateShift(raw) {
  const workedMinutes = minutesBetween(raw.dateKey, raw.startTime, raw.endTime);
  const workedHours = workedMinutes / 60;
  const km = num(raw.km);

  const totalTaximetro = num(raw.taximetroCash) + num(raw.taximetroCard);
  const totalCabify = num(raw.cabifyCash) + num(raw.cabifyApp);
  const totalFreeNow = num(raw.freeNowCash) + num(raw.freeNowApp);
  const totalUber = num(raw.uberApp);

  const totalCash = num(raw.taximetroCash) + num(raw.cabifyCash) + num(raw.freeNowCash);
  const totalCard = num(raw.taximetroCard);
  const totalApps = num(raw.cabifyApp) + num(raw.freeNowApp) + num(raw.uberApp);
  const totalIncome = totalTaximetro + totalCabify + totalFreeNow + totalUber;

  const totalFuel =
    num(raw.fuel1) +
    num(raw.fuel2) +
    num(raw.fuel3) +
    num(raw.fuelOther);

  const totalExpenses =
    num(raw.parking) +
    num(raw.tolls) +
    num(raw.cleaning) +
    num(raw.otherExpenses);

  const totalMaintenance =
    num(raw.wash) +
    num(raw.oil) +
    num(raw.tyres) +
    num(raw.workshop) +
    num(raw.itv) +
    num(raw.otherMaintenance);

  const totalSpending = totalFuel + totalExpenses + totalMaintenance;
  const netProfit = totalIncome - totalSpending;
  const kmPerEuro = safeDiv(km, totalIncome);

  return {
    workedMinutes,
    workedHours,
    km,

    totalTaximetro,
    totalCabify,
    totalFreeNow,
    totalUber,

    totalCash,
    totalCard,
    totalApps,
    totalIncome,

    totalFuel,
    totalExpenses,
    totalMaintenance,
    totalSpending,
    netProfit,
    kmPerEuro,
  };
}

function renderShiftPreview() {
  const raw = getShiftRawForm();
  const calc = calculateShift(raw);

  $("taximetroTotalBadge").textContent = money(calc.totalTaximetro);
  $("cabifyTotalBadge").textContent = money(calc.totalCabify);
  $("freenowTotalBadge").textContent = money(calc.totalFreeNow);
  $("uberTotalBadge").textContent = money(calc.totalUber);

  $("fuelTotalBadge").textContent = money(calc.totalFuel);
  $("expensesTotalBadge").textContent = money(calc.totalExpenses);
  $("maintenanceTotalBadge").textContent = money(calc.totalMaintenance);

  $("sumCash").textContent = money(calc.totalCash);
  $("sumCard").textContent = money(calc.totalCard);
  $("sumApps").textContent = money(calc.totalApps);
  $("sumIncome").textContent = money(calc.totalIncome);

  $("sumFuel").textContent = money(calc.totalFuel);
  $("sumExpenses").textContent = money(calc.totalExpenses);
  $("sumMaintenance").textContent = money(calc.totalMaintenance);
  $("sumSpending").textContent = money(calc.totalSpending);

  $("finalIncome").textContent = money(calc.totalIncome);
  $("finalFuel").textContent = money(calc.totalFuel);
  $("finalSpending").textContent = money(calc.totalSpending);
  $("finalNet").textContent = money(calc.netProfit);

  $("shiftPreview").innerHTML = [
    statCard("Hours", calc.workedHours.toFixed(2), `${calc.workedMinutes} min`),
    statCard("KM", calc.km.toFixed(1), "Direct input"),
    statCard("Income", money(calc.totalIncome), "All sources"),
    statCard("Fuel", money(calc.totalFuel), "Only fuel"),
    statCard("Spending", money(calc.totalSpending), "Fuel + gastos + mantenimiento"),
    statCard("Net", money(calc.netProfit), "Income - spending"),
    statCard("KM/€", calc.kmPerEuro.toFixed(3), "Average"),
    statCard("Apps", money(calc.totalApps), "Cabify + Free Now + Uber"),
  ].join("");
}

/* =========================================================
   SAVE SHIFT
========================================================= */
$("shiftForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    const payload = buildShiftPayload();
    await addDoc(collection(db, "shifts"), payload);
    showToast("Shift saved.");
    $("shiftForm").reset();
    setShiftDefaults();
    openView("historyView");
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    document.querySelector('[data-view="historyView"]').classList.add("active");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Could not save shift.");
  }
});

function buildShiftPayload() {
  if (!state.currentStaff) throw new Error("No active user.");

  const driverKey = isManager() ? $("sfDriverKey").value : state.currentStaff.staffKey;
  const driver = getDriverProfile(driverKey);
  if (!driver) throw new Error("Driver not found.");

  const raw = getShiftRawForm();
  if (!raw.dateKey) throw new Error("Date is required.");
  if (!raw.startTime || !raw.endTime) throw new Error("Start and end times are required.");
  if (num(raw.km) < 0) throw new Error("KM must be 0 or higher.");

  const calc = calculateShift(raw);
  const car = raw.carId ? getCarById(raw.carId) : null;

  return {
    driverKey: driver.staffKey,
    driverName: driver.fullName,
    driverColorClass: driver.staffKey,
    driverColorHex: getColorHex(driver),

    managerKey: driver.managerKey || currentManagerKey(),
    managerName: driver.managerName || currentManagerName(),

    carId: raw.carId || "",
    vehicle: car ? buildCarLabel({ id: raw.carId, ...car }) : "",

    dateKey: raw.dateKey,
    startTime: raw.startTime,
    endTime: raw.endTime,
    notes: raw.notes,

    km: calc.km,
    workedMinutes: calc.workedMinutes,
    workedHours: calc.workedHours,

    taximetroCash: num(raw.taximetroCash),
    taximetroCard: num(raw.taximetroCard),

    cabifyCash: num(raw.cabifyCash),
    cabifyApp: num(raw.cabifyApp),

    freeNowCash: num(raw.freeNowCash),
    freeNowApp: num(raw.freeNowApp),

    uberApp: num(raw.uberApp),

    totalTaximetro: calc.totalTaximetro,
    totalCabify: calc.totalCabify,
    totalFreeNow: calc.totalFreeNow,
    totalUber: calc.totalUber,

    totalCash: calc.totalCash,
    totalCard: calc.totalCard,
    totalApps: calc.totalApps,
    totalIncome: calc.totalIncome,

    fuel1: num(raw.fuel1),
    fuel2: num(raw.fuel2),
    fuel3: num(raw.fuel3),
    fuelOther: num(raw.fuelOther),
    totalFuel: calc.totalFuel,

    parking: num(raw.parking),
    tolls: num(raw.tolls),
    cleaning: num(raw.cleaning),
    otherExpenses: num(raw.otherExpenses),
    totalExpenses: calc.totalExpenses,

    wash: num(raw.wash),
    oil: num(raw.oil),
    tyres: num(raw.tyres),
    workshop: num(raw.workshop),
    itv: num(raw.itv),
    otherMaintenance: num(raw.otherMaintenance),
    totalMaintenance: calc.totalMaintenance,

    totalSpending: calc.totalSpending,
    netProfit: calc.netProfit,
    kmPerEuro: calc.kmPerEuro,

    status: "CLOSED",
    createdByUid: state.authUser.uid,
    createdByKey: state.currentStaff.staffKey,
    createdByRole: state.currentStaff.role,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

/* =========================================================
   DASHBOARD
========================================================= */
function renderDashboard() {
  const todayRows = filterRowsByRange(state.shifts, "today");
  const weekRows = filterRowsByRange(state.shifts, "week");
  const monthRows = filterRowsByRange(state.shifts, "month");
  const yearRows = filterRowsByRange(state.shifts, "year");

  const today = summarizeRows(todayRows);
  const week = summarizeRows(weekRows);
  const month = summarizeRows(monthRows);
  const year = summarizeRows(yearRows);

  $("dashboardStats").innerHTML = [
    statCard("Today Income", money(today.totalIncome), `${today.count} shifts`),
    statCard("Today Fuel", money(today.totalFuel), "Fuel only"),
    statCard("Today Spending", money(today.totalSpending), "All spend"),
    statCard("Today Net", money(today.netProfit), "Final result"),
    statCard("Week Income", money(week.totalIncome), `${week.totalKm.toFixed(1)} km`),
    statCard("Month Income", money(month.totalIncome), `${month.totalHours.toFixed(1)} h`),
    statCard("Year Income", money(year.totalIncome), `${year.count} shifts`),
    statCard("Today KM/€", today.kmPerEuro.toFixed(3), "Average"),
  ].join("");

  $("todayIncomeSources").innerHTML = [
    statCard("Taxímetro", money(today.totalTaximetro), "Cash + card"),
    statCard("Cabify", money(today.totalCabify), "Cash + app"),
    statCard("Free Now", money(today.totalFreeNow), "Cash + app"),
    statCard("Uber", money(today.totalUber), "App only"),
  ].join("");

  $("todaySpendingSources").innerHTML = [
    statCard("Fuel", money(today.totalFuel), "Separated"),
    statCard("Gastos", money(today.totalExpenses), "Operational"),
    statCard("Mantenimiento", money(today.totalMaintenance), "Service / repair"),
    statCard("Net", money(today.netProfit), "Income - spending"),
  ].join("");

  renderTopDriversList();
  renderPeakAnalyticsList();

  if (isViewVisible("dashboardView")) {
    renderDashboardCharts();
  }
}

function renderTopDriversList() {
  const groups = groupByKey(state.shifts, (row) => row.driverKey);

  const ranked = Object.entries(groups)
    .map(([staffKey, rows]) => ({
      profile: getDriverProfile(staffKey),
      summary: summarizeRows(rows),
    }))
    .sort((a, b) => b.summary.totalIncome - a.summary.totalIncome)
    .slice(0, 6);

  $("topDriversList").innerHTML = ranked.length
    ? ranked
        .map(({ profile, summary }) => {
          return `
            <div class="stack-row">
              <div class="stack-row-left">
                <div class="driver-line" style="${buildDriverLineStyle(profile)}"></div>
                ${photoHtml(profile, true)}
                <div>
                  <strong>${esc(profile?.fullName || "")}</strong>
                  <div class="muted">${summary.count} shifts • ${summary.totalKm.toFixed(1)} km</div>
                </div>
              </div>
              <div>
                <strong>${money(summary.totalIncome)}</strong>
                <div class="muted">Net ${money(summary.netProfit)}</div>
              </div>
            </div>
          `;
        })
        .join("")
    : `<div class="center-empty">No shifts yet.</div>`;
}

function renderPeakAnalyticsList() {
  const bestDay = getBestDay(state.shifts);
  const worstDay = getWorstDay(state.shifts);
  const peakHour = getPeakHour(state.shifts);
  const highFuel = getHighestFuelDay(state.shifts);

  const items = [
    {
      title: "Best Day",
      value: bestDay ? `${bestDay.key} · ${money(bestDay.summary.totalIncome)}` : "—",
      sub: bestDay ? `${bestDay.summary.count} shifts` : "No data",
    },
    {
      title: "Worst Day",
      value: worstDay ? `${worstDay.key} · ${money(worstDay.summary.totalIncome)}` : "—",
      sub: worstDay ? "Lowest income" : "No data",
    },
    {
      title: "Peak Hour",
      value: peakHour ? `${peakHour.hour}:00 · ${money(peakHour.amount)}` : "—",
      sub: peakHour ? "Estimated by shift time blocks" : "No data",
    },
    {
      title: "Highest Fuel Day",
      value: highFuel ? `${highFuel.key} · ${money(highFuel.summary.totalFuel)}` : "—",
      sub: highFuel ? "Fuel total" : "No data",
    },
  ];

  $("peakAnalyticsList").innerHTML = items
    .map(
      (item) => `
        <div class="stack-row">
          <div>
            <strong>${esc(item.title)}</strong>
            <div class="muted">${esc(item.sub)}</div>
          </div>
          <div><strong>${esc(item.value)}</strong></div>
        </div>
      `
    )
    .join("");
}

/* =========================================================
   SHIFT HISTORY
========================================================= */
$("historySearch")?.addEventListener("input", resetAndRenderHistory);
$("historyDateFilter")?.addEventListener("change", resetAndRenderHistory);
$("historyDriverFilter")?.addEventListener("change", resetAndRenderHistory);
$("historyCarFilter")?.addEventListener("input", resetAndRenderHistory);

$("clearHistoryFiltersBtn")?.addEventListener("click", () => {
  $("historySearch").value = "";
  $("historyDateFilter").value = "";
  populateHistoryDriverSelect();
  $("historyCarFilter").value = "";
  state.historyPage = 1;
  renderHistoryTable();
});

$("historyPrevBtn")?.addEventListener("click", () => {
  state.historyPage = Math.max(1, state.historyPage - 1);
  renderHistoryTable();
});

$("historyNextBtn")?.addEventListener("click", () => {
  const totalPages = Math.max(1, Math.ceil(getFilteredHistoryRows().length / HISTORY_PAGE_SIZE));
  state.historyPage = Math.min(totalPages, state.historyPage + 1);
  renderHistoryTable();
});

function resetAndRenderHistory() {
  state.historyPage = 1;
  renderHistoryTable();
}

function getFilteredHistoryRows() {
  const searchText = $("historySearch").value.trim().toLowerCase();
  const dateFilter = $("historyDateFilter").value;
  const driverFilter = $("historyDriverFilter").value;
  const carFilter = $("historyCarFilter").value.trim().toLowerCase();

  return state.shifts.filter((row) => {
    const matchesSearch =
      !searchText ||
      [
        row.driverName,
        row.vehicle,
        row.notes,
        row.dateKey,
        row.managerName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(searchText);

    const matchesDate = !dateFilter || row.dateKey === dateFilter;
    const matchesDriver = !driverFilter || driverFilter === "all" || row.driverKey === driverFilter;
    const matchesCar = !carFilter || String(row.vehicle || "").toLowerCase().includes(carFilter);

    return matchesSearch && matchesDate && matchesDriver && matchesCar;
  });
}

function renderHistoryTable() {
  const filtered = getFilteredHistoryRows();
  const totalPages = Math.max(1, Math.ceil(filtered.length / HISTORY_PAGE_SIZE));

  if (state.historyPage > totalPages) state.historyPage = totalPages;

  const start = (state.historyPage - 1) * HISTORY_PAGE_SIZE;
  const pageRows = filtered.slice(start, start + HISTORY_PAGE_SIZE);

  $("historyResultsCount").textContent = `${filtered.length} results`;
  $("historyCurrentPageInfo").textContent = `Page ${state.historyPage}`;
  $("historyPaginationInfo").textContent = `Page ${state.historyPage} of ${totalPages}`;

  $("historyPrevBtn").disabled = state.historyPage <= 1;
  $("historyNextBtn").disabled = state.historyPage >= totalPages;

  if (!pageRows.length) {
    $("historyTableBody").innerHTML = `
      <tr>
        <td colspan="9">
          <div class="center-empty">No shifts found.</div>
        </td>
      </tr>
    `;
    return;
  }

  $("historyTableBody").innerHTML = pageRows
    .map((row) => {
      const profile = getDriverProfile(row.driverKey) || {};
      return `
        <tr class="history-row" style="${buildHistoryRowStyle(profile)}">
          <td>
            <div class="history-driver-cell">
              ${photoHtml(profile, true)}
              <div>
                <div class="driver-badge" style="${buildDriverBadgeStyle(profile)}">${esc(row.driverName)}</div>
                <div class="muted">${esc(row.managerName || "")}</div>
              </div>
            </div>
          </td>
          <td>${esc(formatDate(row.dateKey))}</td>
          <td>${esc(row.vehicle || "-")}</td>
          <td>${num(row.workedHours).toFixed(2)}</td>
          <td>${num(row.km).toFixed(1)}</td>
          <td class="income-positive">${money(row.totalIncome)}</td>
          <td class="warning-text">${money(row.totalFuel)}</td>
          <td class="spending-negative">${money(row.totalSpending)}</td>
          <td class="${num(row.netProfit) >= 0 ? "income-positive" : "spending-negative"}">${money(
            row.netProfit
          )}</td>
        </tr>
      `;
    })
    .join("");
}

/* =========================================================
   REPORTS
========================================================= */
$("reportRange")?.addEventListener("change", renderReports);
$("reportDriverFilter")?.addEventListener("change", renderReports);
$("reportCarFilter")?.addEventListener("input", renderReports);

function getReportRows() {
  const range = $("reportRange").value;
  const driverKey = isManager() ? $("reportDriverFilter").value : state.currentStaff.staffKey;
  const carText = $("reportCarFilter").value.trim().toLowerCase();

  let rows = filterRowsByRange(state.shifts, range);

  if (driverKey && driverKey !== "all") {
    rows = rows.filter((row) => row.driverKey === driverKey);
  }

  if (carText) {
    rows = rows.filter((row) => String(row.vehicle || "").toLowerCase().includes(carText));
  }

  return rows;
}

function renderReports() {
  const rows = getReportRows();
  const summary = summarizeRows(rows);

  $("reportStats").innerHTML = [
    statCard("Income", money(summary.totalIncome), `${summary.count} shifts`),
    statCard("Fuel", money(summary.totalFuel), "Separated"),
    statCard("Spending", money(summary.totalSpending), "All spend"),
    statCard("Net", money(summary.netProfit), "Final result"),
    statCard("KM", summary.totalKm.toFixed(1), "Direct input"),
    statCard("KM/€", summary.kmPerEuro.toFixed(3), "Average"),
    statCard("Hours", summary.totalHours.toFixed(2), "Worked"),
    statCard("Apps", money(summary.totalApps), "Cabify + Free Now + Uber"),
  ].join("");

  renderReportPeakList(rows);
  renderReportBreakdownList(summary);
  renderDailyReportList(rows);
  renderPeriodReportList(rows, summary);

  if (isViewVisible("reportsView")) {
    renderReportCharts();
  }
}

function renderReportPeakList(rows) {
  const bestDay = getBestDay(rows);
  const worstDay = getWorstDay(rows);
  const peakHour = getPeakHour(rows);
  const fuelDay = getHighestFuelDay(rows);

  const items = [
    {
      title: "Peak Day",
      value: bestDay ? `${bestDay.key} · ${money(bestDay.summary.totalIncome)}` : "—",
      sub: bestDay ? `${bestDay.summary.count} shifts` : "No data",
    },
    {
      title: "Worst Day",
      value: worstDay ? `${worstDay.key} · ${money(worstDay.summary.totalIncome)}` : "—",
      sub: worstDay ? "Lowest income" : "No data",
    },
    {
      title: "Peak Hour",
      value: peakHour ? `${peakHour.hour}:00 · ${money(peakHour.amount)}` : "—",
      sub: peakHour ? "Estimated by shift blocks" : "No data",
    },
    {
      title: "Highest Fuel Day",
      value: fuelDay ? `${fuelDay.key} · ${money(fuelDay.summary.totalFuel)}` : "—",
      sub: fuelDay ? "Fuel total" : "No data",
    },
  ];

  $("reportPeakList").innerHTML = items
    .map(
      (item) => `
        <div class="stack-row">
          <div>
            <strong>${esc(item.title)}</strong>
            <div class="muted">${esc(item.sub)}</div>
          </div>
          <div><strong>${esc(item.value)}</strong></div>
        </div>
      `
    )
    .join("");
}

function renderReportBreakdownList(summary) {
  const items = [
    ["Taxímetro", money(summary.totalTaximetro), "Cash + card"],
    ["Cabify", money(summary.totalCabify), "Cash + app"],
    ["Free Now", money(summary.totalFreeNow), "Cash + app"],
    ["Uber", money(summary.totalUber), "App only"],
    ["Fuel", money(summary.totalFuel), "Only fuel"],
    ["Gastos", money(summary.totalExpenses), "Operational"],
    ["Mantenimiento", money(summary.totalMaintenance), "Service / repair"],
    ["KM/€", summary.kmPerEuro.toFixed(3), "Average"],
  ];

  $("reportBreakdownList").innerHTML = items
    .map(
      ([title, value, sub]) => `
        <div class="stack-row">
          <div>
            <strong>${esc(title)}</strong>
            <div class="muted">${esc(sub)}</div>
          </div>
          <div><strong>${esc(value)}</strong></div>
        </div>
      `
    )
    .join("");
}

function renderDailyReportList(rows) {
  const grouped = groupByKey(rows, (row) => row.dateKey);
  const days = Object.entries(grouped)
    .map(([key, dayRows]) => ({
      key,
      summary: summarizeRows(dayRows),
    }))
    .sort((a, b) => b.key.localeCompare(a.key))
    .slice(0, 12);

  $("dailyReportList").innerHTML = days.length
    ? days
        .map(
          (day) => `
            <div class="stack-row">
              <div>
                <strong>${esc(day.key)}</strong>
                <div class="muted">${day.summary.count} shifts • ${day.summary.totalKm.toFixed(
            1
          )} km</div>
              </div>
              <div>
                <strong>${money(day.summary.totalIncome)}</strong>
                <div class="muted">Fuel ${money(day.summary.totalFuel)} · Net ${money(
            day.summary.netProfit
          )}</div>
              </div>
            </div>
          `
        )
        .join("")
    : `<div class="center-empty">No report data.</div>`;
}

function renderPeriodReportList(rows, summary) {
  const bestDriver = getBestDriver(rows);
  const avgShiftIncome = safeDiv(summary.totalIncome, summary.count);
  const avgShiftFuel = safeDiv(summary.totalFuel, summary.count);
  const avgShiftNet = safeDiv(summary.netProfit, summary.count);

  const items = [
    {
      title: "Average Shift Income",
      value: money(avgShiftIncome),
      sub: `${summary.count} shifts`,
    },
    {
      title: "Average Shift Fuel",
      value: money(avgShiftFuel),
      sub: "Per shift",
    },
    {
      title: "Average Shift Net",
      value: money(avgShiftNet),
      sub: "Per shift",
    },
    {
      title: "Best Driver",
      value: bestDriver ? bestDriver.profile.fullName : "—",
      sub: bestDriver ? money(bestDriver.summary.totalIncome) : "No data",
    },
  ];

  $("periodReportList").innerHTML = items
    .map(
      (item) => `
        <div class="stack-row">
          <div>
            <strong>${esc(item.title)}</strong>
            <div class="muted">${esc(item.sub)}</div>
          </div>
          <div><strong>${esc(item.value)}</strong></div>
        </div>
      `
    )
    .join("");
}

/* =========================================================
   SUMMARY / ANALYTICS HELPERS
========================================================= */
function filterRowsByRange(rows, range) {
  if (range === "all") return [...rows];

  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (range === "today") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (range === "week") {
    const day = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - day);
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else if (range === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(end.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
  } else if (range === "year") {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(11, 31);
    end.setHours(23, 59, 59, 999);
  } else {
    return [...rows];
  }

  return rows.filter((row) => {
    const d = row.dateKey ? new Date(`${row.dateKey}T12:00:00`) : null;
    return d && d >= start && d <= end;
  });
}

function summarizeRows(rows) {
  const base = rows.reduce(
    (acc, row) => {
      acc.count += 1;
      acc.totalHours += num(row.workedHours);
      acc.totalKm += num(row.km);

      acc.totalTaximetro += num(row.totalTaximetro);
      acc.totalCabify += num(row.totalCabify);
      acc.totalFreeNow += num(row.totalFreeNow);
      acc.totalUber += num(row.totalUber);

      acc.totalCash += num(row.totalCash);
      acc.totalCard += num(row.totalCard);
      acc.totalApps += num(row.totalApps);
      acc.totalIncome += num(row.totalIncome);

      acc.totalFuel += num(row.totalFuel);
      acc.totalExpenses += num(row.totalExpenses);
      acc.totalMaintenance += num(row.totalMaintenance);
      acc.totalSpending += num(row.totalSpending);

      acc.netProfit += num(row.netProfit);
      return acc;
    },
    {
      count: 0,
      totalHours: 0,
      totalKm: 0,

      totalTaximetro: 0,
      totalCabify: 0,
      totalFreeNow: 0,
      totalUber: 0,

      totalCash: 0,
      totalCard: 0,
      totalApps: 0,
      totalIncome: 0,

      totalFuel: 0,
      totalExpenses: 0,
      totalMaintenance: 0,
      totalSpending: 0,

      netProfit: 0,
      kmPerEuro: 0,
    }
  );

  base.kmPerEuro = safeDiv(base.totalKm, base.totalIncome);
  return base;
}

function groupByKey(rows, getKey) {
  return rows.reduce((acc, row) => {
    const key = getKey(row);
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
}

function getBestDay(rows) {
  const groups = groupByKey(rows, (row) => row.dateKey);
  const ranked = Object.entries(groups)
    .map(([key, dayRows]) => ({ key, summary: summarizeRows(dayRows) }))
    .sort((a, b) => b.summary.totalIncome - a.summary.totalIncome);
  return ranked[0] || null;
}

function getWorstDay(rows) {
  const groups = groupByKey(rows, (row) => row.dateKey);
  const ranked = Object.entries(groups)
    .map(([key, dayRows]) => ({ key, summary: summarizeRows(dayRows) }))
    .sort((a, b) => a.summary.totalIncome - b.summary.totalIncome);
  return ranked[0] || null;
}

function getHighestFuelDay(rows) {
  const groups = groupByKey(rows, (row) => row.dateKey);
  const ranked = Object.entries(groups)
    .map(([key, dayRows]) => ({ key, summary: summarizeRows(dayRows) }))
    .sort((a, b) => b.summary.totalFuel - a.summary.totalFuel);
  return ranked[0] || null;
}

function getBestDriver(rows) {
  const groups = groupByKey(rows, (row) => row.driverKey);
  const ranked = Object.entries(groups)
    .map(([staffKey, driverRows]) => ({
      profile: getDriverProfile(staffKey),
      summary: summarizeRows(driverRows),
    }))
    .sort((a, b) => b.summary.totalIncome - a.summary.totalIncome);
  return ranked[0] || null;
}

function getPeakHour(rows) {
  const hourTotals = new Array(24).fill(0);

  rows.forEach((row) => {
    const startHour = extractHour(row.startTime);
    const endHour = extractHour(row.endTime);
    if (startHour === null || endHour === null) return;

    const hours = buildCoveredHours(startHour, endHour);
    const allocated = safeDiv(num(row.totalIncome), hours.length);

    hours.forEach((hour) => {
      hourTotals[hour] += allocated;
    });
  });

  let bestHour = null;
  let bestAmount = 0;

  hourTotals.forEach((amount, hour) => {
    if (amount > bestAmount) {
      bestAmount = amount;
      bestHour = hour;
    }
  });

  return bestHour === null ? null : { hour: bestHour, amount: bestAmount };
}

function extractHour(timeStr) {
  if (!timeStr || !timeStr.includes(":")) return null;
  const h = Number(timeStr.split(":")[0]);
  return Number.isFinite(h) ? h : null;
}

function buildCoveredHours(startHour, endHour) {
  const out = [];
  let current = startHour;
  let guard = 0;

  while (guard < 30) {
    out.push(current);
    if (current === endHour) break;
    current = (current + 1) % 24;
    guard += 1;
  }

  return [...new Set(out)];
}

/* =========================================================
   CHARTS
========================================================= */
function destroyChart(key) {
  if (state.charts[key]) {
    state.charts[key].destroy();
    delete state.charts[key];
  }
}

function destroyAllCharts() {
  Object.keys(state.charts).forEach(destroyChart);
}

function upsertChart(key, canvasId, config) {
  if (!window.Chart) return;
  const canvas = $(canvasId);
  if (!canvas) return;
  destroyChart(key);
  state.charts[key] = new window.Chart(canvas.getContext("2d"), config);
}

function buildBaseChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 250 },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        labels: {
          color: getCssVar("--text"),
          boxWidth: 12,
          boxHeight: 12,
        },
      },
      tooltip: {
        enabled: true,
      },
    },
    scales: {
      x: {
        ticks: { color: getCssVar("--muted") },
        grid: { color: getCssVar("--border") },
      },
      y: {
        ticks: { color: getCssVar("--muted") },
        grid: { color: getCssVar("--border") },
      },
    },
  };
}

function getDailySeries(rows, field, limit = 14) {
  const groups = groupByKey(rows, (row) => row.dateKey);
  const entries = Object.entries(groups)
    .map(([date, dayRows]) => ({
      date,
      value: dayRows.reduce((sum, row) => sum + num(row[field]), 0),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-limit);

  return {
    labels: entries.map((e) => e.date),
    values: entries.map((e) => e.value),
  };
}

function getDriverSeries(rows, field) {
  const groups = groupByKey(rows, (row) => row.driverKey);
  const entries = Object.entries(groups)
    .map(([staffKey, driverRows]) => ({
      label: getDriverProfile(staffKey)?.fullName || staffKey,
      value: driverRows.reduce((sum, row) => sum + num(row[field]), 0),
      color: getColorHex(getDriverProfile(staffKey)),
    }))
    .sort((a, b) => b.value - a.value);

  return entries;
}

function renderDashboardCharts() {
  const rows = filterRowsByRange(state.shifts, "month");

  const incomeDaily = getDailySeries(rows, "totalIncome", 14);
  const fuelDaily = getDailySeries(rows, "totalFuel", 14);
  const driverSeries = getDriverSeries(rows, "totalIncome");

  const summary = summarizeRows(rows);
  const appsSeries = [
    summary.totalTaximetro,
    summary.totalCabify,
    summary.totalFreeNow,
    summary.totalUber,
  ];

  upsertChart("dashboardIncomeChart", "dashboardIncomeChart", {
    type: "line",
    data: {
      labels: incomeDaily.labels,
      datasets: [
        {
          label: "Income",
          data: incomeDaily.values,
          borderColor: getCssVar("--success"),
          backgroundColor: "rgba(22,163,74,0.14)",
          tension: 0.32,
          fill: true,
        },
      ],
    },
    options: buildBaseChartOptions(),
  });

  upsertChart("dashboardFuelChart", "dashboardFuelChart", {
    type: "bar",
    data: {
      labels: fuelDaily.labels,
      datasets: [
        {
          label: "Fuel",
          data: fuelDaily.values,
          backgroundColor: getCssVar("--warning"),
        },
      ],
    },
    options: buildBaseChartOptions(),
  });

  upsertChart("dashboardDriverChart", "dashboardDriverChart", {
    type: "bar",
    data: {
      labels: driverSeries.map((x) => x.label),
      datasets: [
        {
          label: "Income",
          data: driverSeries.map((x) => x.value),
          backgroundColor: driverSeries.map((x) => x.color),
        },
      ],
    },
    options: buildBaseChartOptions(),
  });

  upsertChart("dashboardAppsChart", "dashboardAppsChart", {
    type: "doughnut",
    data: {
      labels: ["Taxímetro", "Cabify", "Free Now", "Uber"],
      datasets: [
        {
          data: appsSeries,
          backgroundColor: [
            getCssVar("--taximetro-text"),
            getCssVar("--cabify-text"),
            getCssVar("--freenow-text"),
            getCssVar("--uber-text"),
          ],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: getCssVar("--text") },
        },
      },
    },
  });
}

function renderReportCharts() {
  const rows = getReportRows();

  const incomeDaily = getDailySeries(rows, "totalIncome", 20);
  const fuelDaily = getDailySeries(rows, "totalFuel", 20);
  const driverSeries = getDriverSeries(rows, "totalIncome");
  const summary = summarizeRows(rows);

  upsertChart("reportIncomeTrendChart", "reportIncomeTrendChart", {
    type: "line",
    data: {
      labels: incomeDaily.labels,
      datasets: [
        {
          label: "Income",
          data: incomeDaily.values,
          borderColor: getCssVar("--info"),
          backgroundColor: "rgba(37,99,235,0.12)",
          tension: 0.3,
          fill: true,
        },
      ],
    },
    options: buildBaseChartOptions(),
  });

  upsertChart("reportFuelTrendChart", "reportFuelTrendChart", {
    type: "line",
    data: {
      labels: fuelDaily.labels,
      datasets: [
        {
          label: "Fuel",
          data: fuelDaily.values,
          borderColor: getCssVar("--warning"),
          backgroundColor: "rgba(217,119,6,0.12)",
          tension: 0.3,
          fill: true,
        },
      ],
    },
    options: buildBaseChartOptions(),
  });

  upsertChart("reportAppsChart", "reportAppsChart", {
    type: "bar",
    data: {
      labels: ["Taxímetro", "Cabify", "Free Now", "Uber"],
      datasets: [
        {
          label: "Income",
          data: [
            summary.totalTaximetro,
            summary.totalCabify,
            summary.totalFreeNow,
            summary.totalUber,
          ],
          backgroundColor: [
            getCssVar("--taximetro-text"),
            getCssVar("--cabify-text"),
            getCssVar("--freenow-text"),
            getCssVar("--uber-text"),
          ],
        },
      ],
    },
    options: buildBaseChartOptions(),
  });

  upsertChart("reportDriversChart", "reportDriversChart", {
    type: "bar",
    data: {
      labels: driverSeries.map((x) => x.label),
      datasets: [
        {
          label: "Income",
          data: driverSeries.map((x) => x.value),
          backgroundColor: driverSeries.map((x) => x.color),
        },
      ],
    },
    options: buildBaseChartOptions(),
  });
}

/* =========================================================
   DRIVERS VIEW
========================================================= */
function renderDriversView() {
  const profiles = getVisibleProfiles();
  const activeCount = profiles.filter((p) => p.status !== "inactive" && p.active !== false).length;
  const managerCount = profiles.filter((p) => p.role === "manager").length;
  const driverCount = profiles.filter((p) => p.role === "driver").length;

  $("driversStats").innerHTML = [
    statCard("Profiles", String(profiles.length), "Visible"),
    statCard("Active", String(activeCount), "Enabled"),
    statCard("Drivers", String(driverCount), "Driver accounts"),
    statCard("Managers", String(managerCount), "Manager accounts"),
  ].join("");

  $("driversGrid").innerHTML = profiles.length
    ? profiles.map((profile) => renderDriverCard(profile)).join("")
    : `<div class="center-empty">No drivers found.</div>`;

  attachDriverCardEvents();

  if (!isManager()) {
    hide($("openAddDriverBtn"));
  } else {
    show($("openAddDriverBtn"));
  }
}

function renderDriverCard(profile) {
  const carLabel = getDefaultCarLabel(profile) || "No default car";
  const editable = isManager() || state.currentStaffKey === profile.staffKey;
  const title = profile.role === "manager" ? "Manager / Driver" : "Driver";

  return `
    <div class="card profile-card">
      <div class="profile-color-bar" style="background:${esc(getColorHex(profile))};"></div>

      <div class="profile-card-head">
        ${photoHtml(profile, false)}
        <div class="profile-info">
          <div class="profile-name">${esc(profile.fullName)}</div>
          <div class="profile-role">${esc(title)}</div>
          <div class="driver-badge" style="${buildDriverBadgeStyle(profile)}">${esc(profile.fullName)}</div>
        </div>
      </div>

      <div class="profile-meta-list">
        <div>Email: ${esc(profile.email || "-")}</div>
        <div>Phone: ${esc(profile.phone || "-")}</div>
        <div>Default car: ${esc(carLabel)}</div>
        <div>Status: ${esc(profile.status || "active")}</div>
      </div>

      <div class="profile-actions">
        ${
          editable
            ? `
              <button class="secondary-btn" type="button" data-driver-photo="${esc(profile.staffKey)}">Photo</button>
              <button class="primary-btn" type="button" data-driver-edit="${esc(profile.staffKey)}">Edit</button>
            `
            : ""
        }
      </div>
    </div>
  `;
}

function attachDriverCardEvents() {
  document.querySelectorAll("[data-driver-edit]").forEach((btn) => {
    btn.onclick = () => {
      const staffKey = btn.getAttribute("data-driver-edit");
      openDriverModal("edit", staffKey);
    };
  });

  document.querySelectorAll("[data-driver-photo]").forEach((btn) => {
    btn.onclick = () => {
      const staffKey = btn.getAttribute("data-driver-photo");
      openPhotoModal(staffKey);
    };
  });
}

$("openAddDriverBtn")?.addEventListener("click", () => openDriverModal("new", ""));

function openDriverModal(mode, staffKey) {
  state.editingDriverKey = staffKey || "";
  const profile = staffKey ? getDriverProfile(staffKey) : null;

  $("driverFormMode").value = mode;
  $("driverOriginalStaffKey").value = staffKey || "";
  $("driverModalTitle").textContent = mode === "new" ? "Add New Driver" : "Edit Driver";

  $("driverFullNameInput").value = profile?.fullName || "";
  $("driverRoleInput").value = profile?.role || "driver";
  $("driverPinInput").value = "";
  $("driverEmailInput").value = profile?.email || "";
  $("driverPhoneInput").value = profile?.phone || "";
  $("driverDefaultCarInput").value = profile?.defaultCarId || "";
  $("driverColorInput").value = profile?.colorHex || "#1d4ed8";
  $("driverStaffKeyInput").value = profile?.staffKey || "";
  $("driverStatusInput").value = profile?.status || "active";

  const editing = mode === "edit";
  $("driverEmailInput").disabled = editing;
  $("driverRoleInput").disabled = editing;
  $("driverStaffKeyInput").disabled = editing;
  $("driverPinInput").disabled = editing;
  $("driverPinInput").placeholder = editing ? "PIN change not available here" : "Required";

  show($("driverModal"));
  $("driverModal").setAttribute("aria-hidden", "false");
}

function closeDriverModal() {
  hide($("driverModal"));
  $("driverModal").setAttribute("aria-hidden", "true");
  state.editingDriverKey = "";
  $("driverForm").reset();
}

$("closeDriverModalBtn")?.addEventListener("click", closeDriverModal);
$("cancelDriverModalBtn")?.addEventListener("click", closeDriverModal);
document.querySelectorAll("[data-close-driver-modal]").forEach((el) => {
  el.addEventListener("click", closeDriverModal);
});

$("driverForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    if (!isManager()) throw new Error("Only manager can save drivers.");

    const mode = $("driverFormMode").value;
    if (mode === "new") {
      await createNewDriverFromModal();
      showToast("Driver created.");
    } else {
      await updateExistingDriverFromModal();
      showToast("Driver updated.");
    }

    closeDriverModal();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Could not save driver.");
  }
});

async function createNewDriverFromModal() {
  const fullName = $("driverFullNameInput").value.trim();
  const role = $("driverRoleInput").value;
  const pin = $("driverPinInput").value.trim();
  const email = $("driverEmailInput").value.trim().toLowerCase();
  const phone = $("driverPhoneInput").value.trim();
  const defaultCarId = $("driverDefaultCarInput").value;
  const colorHex = $("driverColorInput").value;
  const staffKey = normalizeStaffKey($("driverStaffKeyInput").value);
  const status = $("driverStatusInput").value;

  if (!fullName) throw new Error("Full name is required.");
  if (!email) throw new Error("Email is required.");
  if (!pin || pin.length < 4) throw new Error("PIN must have at least 4 digits.");
  if (!staffKey) throw new Error("Alias / key is required.");

  if (state.publicProfiles[staffKey]) {
    throw new Error("Staff key already exists.");
  }

  const secondaryAuth = getSecondaryAuth();
  await createUserWithEmailAndPassword(secondaryAuth, email, passwordFromPin(pin));
  await signOut(secondaryAuth);

  const managerKeyValue = role === "manager" ? staffKey : state.currentStaff.staffKey;
  const managerNameValue = role === "manager" ? fullName : state.currentStaff.fullName;

  await setDoc(doc(db, "publicProfiles", staffKey), {
    staffKey,
    fullName,
    email,
    role,
    active: status !== "inactive",
    status,
    authMode: "pin",
    managerKey: managerKeyValue,
    managerName: managerNameValue,
    colorHex,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await setDoc(doc(db, "driverProfiles", staffKey), {
    staffKey,
    fullName,
    email,
    role,
    managerKey: managerKeyValue,
    managerName: managerNameValue,
    colorHex,
    phone,
    defaultCarId,
    photoUrl: "",
    photoPath: "",
    status,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

async function updateExistingDriverFromModal() {
  const originalStaffKey = $("driverOriginalStaffKey").value;
  const original = getDriverProfile(originalStaffKey);
  if (!original) throw new Error("Driver not found.");

  const fullName = $("driverFullNameInput").value.trim();
  const phone = $("driverPhoneInput").value.trim();
  const defaultCarId = $("driverDefaultCarInput").value;
  const colorHex = $("driverColorInput").value;
  const status = $("driverStatusInput").value;

  const managerKeyValue = original.role === "manager" ? original.staffKey : original.managerKey || state.currentStaff.staffKey;
  const managerNameValue = original.role === "manager" ? fullName : original.managerName || state.currentStaff.fullName;

  await setDoc(
    doc(db, "publicProfiles", originalStaffKey),
    {
      fullName,
      active: status !== "inactive",
      status,
      colorHex,
      managerKey: managerKeyValue,
      managerName: managerNameValue,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await setDoc(
    doc(db, "driverProfiles", originalStaffKey),
    {
      fullName,
      phone,
      defaultCarId,
      colorHex,
      status,
      managerKey: managerKeyValue,
      managerName: managerNameValue,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/* =========================================================
   CARS VIEW
========================================================= */
function renderCarsView() {
  const cars = Object.entries(state.cars)
    .map(([id, car]) => ({ id, ...car }))
    .sort((a, b) => buildCarLabel(a).localeCompare(buildCarLabel(b)));

  const activeCount = cars.filter((car) => car.status === "active").length;
  const maintenanceCount = cars.filter((car) => car.status === "maintenance").length;

  $("carsStats").innerHTML = [
    statCard("Cars", String(cars.length), "Total"),
    statCard("Active", String(activeCount), "Available"),
    statCard("Maintenance", String(maintenanceCount), "Workshop / maintenance"),
    statCard("Inactive", String(cars.filter((c) => c.status === "inactive").length), "Disabled"),
  ].join("");

  $("carsGrid").innerHTML = cars.length
    ? cars.map((car) => renderCarCard(car)).join("")
    : `<div class="center-empty">No cars found.</div>`;

  attachCarCardEvents();

  if (!isManager()) {
    hide($("openAddCarBtn"));
  } else {
    show($("openAddCarBtn"));
  }
}

function renderCarCard(car) {
  const defaultDriver = car.defaultDriverKey ? getDriverProfile(car.defaultDriverKey) : null;
  const driverLabel = defaultDriver ? defaultDriver.fullName : "No default driver";

  return `
    <div class="card car-card">
      <div class="car-card-head">
        <div class="circle-fallback" style="background:${esc(getCssVar("--panel-2"))};color:${esc(getCssVar("--text"))};">
          ${esc((car.plate || "C").slice(0, 2).toUpperCase())}
        </div>
        <div class="car-info">
          <div class="profile-name">${esc(buildCarLabel(car) || "Car")}</div>
          <div class="profile-role">${esc(car.status || "active")}</div>
        </div>
      </div>

      <div class="car-meta-list">
        <div>Plate: ${esc(car.plate || "-")}</div>
        <div>Brand / Model: ${esc([car.brand, car.model].filter(Boolean).join(" ") || "-")}</div>
        <div>Default driver: ${esc(driverLabel)}</div>
        <div>Current KM: ${num(car.currentKm).toFixed(1)}</div>
        <div>Notes: ${esc(car.notes || "-")}</div>
      </div>

      ${
        isManager()
          ? `
            <div class="car-actions">
              <button class="primary-btn" type="button" data-car-edit="${esc(car.id)}">Edit</button>
            </div>
          `
          : ""
      }
    </div>
  `;
}

function attachCarCardEvents() {
  document.querySelectorAll("[data-car-edit]").forEach((btn) => {
    btn.onclick = () => {
      const carId = btn.getAttribute("data-car-edit");
      openCarModal("edit", carId);
    };
  });
}

$("openAddCarBtn")?.addEventListener("click", () => openCarModal("new", ""));

function openCarModal(mode, carId) {
  state.editingCarId = carId || "";
  const car = carId ? getCarById(carId) : null;

  $("carFormMode").value = mode;
  $("carOriginalId").value = carId || "";
  $("carModalTitle").textContent = mode === "new" ? "Add New Car" : "Edit Car";

  $("carPlateInput").value = car?.plate || "";
  $("carBrandInput").value = car?.brand || "";
  $("carModelInput").value = car?.model || "";
  $("carAliasInput").value = car?.alias || "";
  $("carStatusInput").value = car?.status || "active";
  $("carDefaultDriverInput").value = car?.defaultDriverKey || "";
  $("carCurrentKmInput").value = num(car?.currentKm).toString();
  $("carNotesInput").value = car?.notes || "";

  show($("carModal"));
  $("carModal").setAttribute("aria-hidden", "false");
}

function closeCarModal() {
  hide($("carModal"));
  $("carModal").setAttribute("aria-hidden", "true");
  state.editingCarId = "";
  $("carForm").reset();
}

$("closeCarModalBtn")?.addEventListener("click", closeCarModal);
$("cancelCarModalBtn")?.addEventListener("click", closeCarModal);
document.querySelectorAll("[data-close-car-modal]").forEach((el) => {
  el.addEventListener("click", closeCarModal);
});

$("carForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    if (!isManager()) throw new Error("Only manager can save cars.");

    if ($("carFormMode").value === "new") {
      await createCarFromModal();
      showToast("Car created.");
    } else {
      await updateCarFromModal();
      showToast("Car updated.");
    }

    closeCarModal();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Could not save car.");
  }
});

async function createCarFromModal() {
  const payload = getCarFormPayload();
  await addDoc(collection(db, "cars"), payload);
}

async function updateCarFromModal() {
  const carId = $("carOriginalId").value;
  if (!carId) throw new Error("Missing car ID.");

  const payload = getCarFormPayload();
  await setDoc(doc(db, "cars", carId), payload, { merge: true });
}

function getCarFormPayload() {
  const plate = $("carPlateInput").value.trim();
  const brand = $("carBrandInput").value.trim();
  const model = $("carModelInput").value.trim();
  const alias = $("carAliasInput").value.trim();
  const status = $("carStatusInput").value;
  const defaultDriverKey = $("carDefaultDriverInput").value;
  const currentKm = num($("carCurrentKmInput").value);
  const notes = $("carNotesInput").value.trim();

  if (!plate) throw new Error("Plate is required.");

  return {
    plate,
    brand,
    model,
    alias,
    status,
    defaultDriverKey,
    currentKm,
    notes,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  };
}

/* =========================================================
   PHOTO MODAL
========================================================= */
function openPhotoModal(staffKey) {
  const profile = getDriverProfile(staffKey);
  if (!profile) return;

  state.photoModalStaffKey = staffKey;
  state.pendingPhotoFile = null;
  revokePendingPreview();

  $("photoModalTitle").textContent = `${profile.fullName} — Driver Photo`;

  setCirclePhoto(
    $("photoPreviewImg"),
    $("photoPreviewAvatar"),
    profile.photoUrl,
    profile.fullName
  );

  $("driverPhotoUploadInput").value = "";
  $("driverPhotoCameraInput").value = "";

  show($("photoModal"));
  $("photoModal").setAttribute("aria-hidden", "false");
}

function closePhotoModal() {
  revokePendingPreview();
  state.photoModalStaffKey = "";
  state.pendingPhotoFile = null;
  $("driverPhotoUploadInput").value = "";
  $("driverPhotoCameraInput").value = "";
  hide($("photoModal"));
  $("photoModal").setAttribute("aria-hidden", "true");
}

$("closePhotoModalBtn")?.addEventListener("click", closePhotoModal);
document.querySelectorAll("[data-close-photo-modal]").forEach((el) => {
  el.addEventListener("click", closePhotoModal);
});

$("driverPhotoUploadInput")?.addEventListener("change", (e) => {
  handleSelectedPhotoFile(e.target.files?.[0] || null);
});

$("driverPhotoCameraInput")?.addEventListener("change", (e) => {
  handleSelectedPhotoFile(e.target.files?.[0] || null);
});

function handleSelectedPhotoFile(file) {
  if (!file || !state.photoModalStaffKey) return;
  state.pendingPhotoFile = file;
  revokePendingPreview();
  state.pendingPhotoPreviewUrl = URL.createObjectURL(file);

  $("photoPreviewImg").src = state.pendingPhotoPreviewUrl;
  show($("photoPreviewImg"));
  hide($("photoPreviewAvatar"));
}

$("removeDriverPhotoBtn")?.addEventListener("click", async () => {
  try {
    const staffKey = state.photoModalStaffKey;
    if (!staffKey) return;

    const profile = getDriverProfile(staffKey);
    if (!profile) throw new Error("Profile not found.");

    if (profile.photoPath) {
      try {
        await deleteObject(storageRef(storage, profile.photoPath));
      } catch (error) {
        console.warn("Delete old photo warning:", error);
      }
    }

    await setDoc(
      doc(db, "driverProfiles", staffKey),
      {
        photoUrl: "",
        photoPath: "",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    showToast("Photo removed.");
    closePhotoModal();
  } catch (error) {
    console.error(error);
    showToast("Could not remove photo.");
  }
});

$("saveDriverPhotoBtn")?.addEventListener("click", async () => {
  try {
    const staffKey = state.photoModalStaffKey;
    if (!staffKey) throw new Error("No selected driver.");
    if (!state.pendingPhotoFile) throw new Error("Select a photo first.");

    const profile = getDriverProfile(staffKey);
    if (!profile) throw new Error("Profile not found.");

    if (profile.photoPath) {
      try {
        await deleteObject(storageRef(storage, profile.photoPath));
      } catch (error) {
        console.warn("Delete previous photo warning:", error);
      }
    }

    const ext = getFileExtension(state.pendingPhotoFile.name || "jpg");
    const path = `driverPhotos/${staffKey}/photo_${Date.now()}.${ext}`;
    const ref = storageRef(storage, path);

    await uploadBytes(ref, state.pendingPhotoFile);
    const url = await getDownloadURL(ref);

    await setDoc(
      doc(db, "driverProfiles", staffKey),
      {
        photoUrl: url,
        photoPath: path,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    showToast("Photo saved.");
    closePhotoModal();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Could not save photo.");
  }
});

function getFileExtension(filename) {
  const ext = String(filename).split(".").pop()?.toLowerCase() || "jpg";
  return ext.replace(/[^a-z0-9]/g, "") || "jpg";
}

/* =========================================================
   PDF REPORT EXPORT
========================================================= */
$("exportReportPdfBtn")?.addEventListener("click", async () => {
  try {
    await exportCurrentReportPdf();
  } catch (error) {
    console.error(error);
    showToast("Could not export PDF.");
  }
});

async function exportCurrentReportPdf() {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) {
    showToast("jsPDF not loaded.");
    return;
  }

  const rows = getReportRows();
  const summary = summarizeRows(rows);
  const range = $("reportRange").value;
  const driverKey = isManager() ? $("reportDriverFilter").value : state.currentStaff.staffKey;
  const selectedDriver = driverKey && driverKey !== "all" ? getDriverProfile(driverKey) : null;

  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 14;
  let y = 16;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.text("TAXI FLEET REPORT", margin, y);
  y += 8;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(`Generated: ${dateTimeLabel()}`, margin, y);
  y += 6;
  pdf.text(`Range: ${range.toUpperCase()}`, margin, y);
  y += 6;
  pdf.text(`Driver: ${selectedDriver ? selectedDriver.fullName : "GLOBAL"}`, margin, y);
  y += 10;

  if (selectedDriver) {
    y = await drawDriverPdfHeader(pdf, selectedDriver, margin, y, pageWidth - margin * 2);
    y += 8;
  }

  y = drawPdfSectionTitle(pdf, "SUMMARY", margin, y);
  y = drawPdfSummaryGrid(
    pdf,
    [
      ["Total Income", money(summary.totalIncome)],
      ["Total Fuel", money(summary.totalFuel)],
      ["Total Spending", money(summary.totalSpending)],
      ["Net Profit", money(summary.netProfit)],
      ["KM", summary.totalKm.toFixed(1)],
      ["KM/€", summary.kmPerEuro.toFixed(3)],
      ["Hours", summary.totalHours.toFixed(2)],
      ["Shifts", String(summary.count)],
    ],
    margin,
    y,
    pageWidth - margin * 2
  );
  y += 6;

  y = drawPdfSectionTitle(pdf, "BREAKDOWN", margin, y);
  y = drawPdfSummaryGrid(
    pdf,
    [
      ["Taxímetro", money(summary.totalTaximetro)],
      ["Cabify", money(summary.totalCabify)],
      ["Free Now", money(summary.totalFreeNow)],
      ["Uber", money(summary.totalUber)],
      ["Cash", money(summary.totalCash)],
      ["Card", money(summary.totalCard)],
      ["Apps", money(summary.totalApps)],
      ["Maintenance", money(summary.totalMaintenance)],
    ],
    margin,
    y,
    pageWidth - margin * 2
  );
  y += 6;

  const peakDay = getBestDay(rows);
  const peakHour = getPeakHour(rows);
  const fuelDay = getHighestFuelDay(rows);

  y = drawPdfSectionTitle(pdf, "PEAK ANALYTICS", margin, y);
  y = drawPdfTextList(
    pdf,
    [
      `Peak day: ${peakDay ? `${peakDay.key} · ${money(peakDay.summary.totalIncome)}` : "—"}`,
      `Peak hour: ${peakHour ? `${peakHour.hour}:00 · ${money(peakHour.amount)}` : "—"}`,
      `Highest fuel day: ${fuelDay ? `${fuelDay.key} · ${money(fuelDay.summary.totalFuel)}` : "—"}`,
    ],
    margin,
    y,
    pageWidth - margin * 2
  );
  y += 6;

  y = drawPdfSectionTitle(pdf, "SHIFT LIST", margin, y);
  drawPdfShiftTable(pdf, rows, margin, y, pageWidth, pageHeight);

  const fileLabel = selectedDriver ? selectedDriver.fullName : "GLOBAL";
  pdf.save(`fleet-report-${fileLabel}-${range}-${todayISO()}.pdf`);
  showToast("PDF exported.");
}

function drawPdfSectionTitle(pdf, title, x, y) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(title, x, y);
  pdf.setDrawColor(180);
  pdf.line(x, y + 1.5, 195, y + 1.5);
  return y + 7;
}

function drawPdfSummaryGrid(pdf, pairs, x, y, width) {
  const cols = 2;
  const colWidth = width / cols;
  const rowHeight = 12;

  pdf.setFontSize(10);

  pairs.forEach((pair, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const bx = x + col * colWidth;
    const by = y + row * rowHeight;

    pdf.setDrawColor(220);
    pdf.roundedRect(bx, by, colWidth - 3, rowHeight - 2, 2, 2);

    pdf.setFont("helvetica", "normal");
    pdf.text(pair[0], bx + 3, by + 5);

    pdf.setFont("helvetica", "bold");
    pdf.text(pair[1], bx + 3, by + 10);
  });

  return y + Math.ceil(pairs.length / cols) * rowHeight;
}

function drawPdfTextList(pdf, lines, x, y, width) {
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);

  lines.forEach((line) => {
    const wrapped = pdf.splitTextToSize(line, width);
    pdf.text(wrapped, x, y);
    y += wrapped.length * 5 + 1;
  });

  return y;
}

async function drawDriverPdfHeader(pdf, profile, x, y, width) {
  const boxH = 28;

  pdf.setDrawColor(220);
  pdf.roundedRect(x, y, width, boxH, 3, 3);

  const imageX = x + 4;
  const imageY = y + 4;

  if (profile.photoUrl) {
    const dataUrl = await imageUrlToDataUrl(profile.photoUrl);
    if (dataUrl) {
      pdf.addImage(dataUrl, "JPEG", imageX, imageY, 18, 18);
    } else {
      drawPdfAvatarCircle(pdf, profile, imageX + 9, imageY + 9, 9);
    }
  } else {
    drawPdfAvatarCircle(pdf, profile, imageX + 9, imageY + 9, 9);
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(profile.fullName, x + 28, y + 10);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(`Role: ${profile.role === "manager" ? "Manager / Driver" : "Driver"}`, x + 28, y + 16);
  pdf.text(`Default car: ${getDefaultCarLabel(profile) || "-"}`, x + 28, y + 22);

  return y + boxH;
}

function drawPdfAvatarCircle(pdf, profile, cx, cy, r) {
  const rgb = hexToRgb(getColorHex(profile));
  pdf.setFillColor(rgb.r, rgb.g, rgb.b);
  pdf.circle(cx, cy, r, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(initials(profile.fullName), cx, cy + 1.5, { align: "center" });
  pdf.setTextColor(0, 0, 0);
}

function drawPdfShiftTable(pdf, rows, x, y, pageWidth, pageHeight) {
  const headers = ["Date", "Driver", "Car", "KM", "Income", "Fuel", "Spend", "Net"];
  const colWidths = [24, 28, 34, 16, 24, 18, 22, 20];
  const lineHeight = 7;

  const drawHeader = () => {
    let cursor = x;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    headers.forEach((header, idx) => {
      pdf.setDrawColor(220);
      pdf.rect(cursor, y, colWidths[idx], lineHeight);
      pdf.text(header, cursor + 2, y + 4.5);
      cursor += colWidths[idx];
    });
    y += lineHeight;
  };

  drawHeader();
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);

  rows.forEach((row) => {
    if (y > pageHeight - 18) {
      pdf.addPage();
      y = 16;
      drawHeader();
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
    }

    const cells = [
      row.dateKey || "",
      row.driverName || "",
      row.vehicle || "",
      num(row.km).toFixed(1),
      money(row.totalIncome),
      money(row.totalFuel),
      money(row.totalSpending),
      money(row.netProfit),
    ];

    let cursor = x;
    cells.forEach((cell, idx) => {
      pdf.setDrawColor(230);
      pdf.rect(cursor, y, colWidths[idx], lineHeight);
      pdf.text(String(cell), cursor + 2, y + 4.5, {
        maxWidth: colWidths[idx] - 4,
      });
      cursor += colWidths[idx];
    });

    y += lineHeight;
  });
}

async function imageUrlToDataUrl(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return await blobToDataUrl(blob);
  } catch (error) {
    console.warn("Image load for PDF failed:", error);
    return "";
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function hexToRgb(hex) {
  const clean = String(hex).replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean.padEnd(6, "0");

  const n = parseInt(full, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

/* =========================================================
   INITIAL LOAD
========================================================= */
await loadPublicProfilesForLogin();
updateLoginHint();
renderShiftPreview();
renderDashboard();
renderHistoryTable();
renderReports();
renderDriversView();
renderCarsView();
