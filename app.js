import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence,
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

await setPersistence(auth, browserLocalPersistence);

/* =========================================================
   FIXED STAFF
========================================================= */
const STAFF = {
  mudassar: {
    staffKey: "mudassar",
    fullName: "MUDASSAR",
    email: "mudassar@fleet.app",
    password: "mudassar1990",
    pin: "1990",
    role: "manager",
    colorClass: "mudassar",
    colorHex: "#1d4ed8",
    managerKey: "mudassar",
    managerName: "MUDASSAR",
    canDrive: true,
    defaultVehicle: "",
    defaultPhone: "",
  },
  saqlain: {
    staffKey: "saqlain",
    fullName: "SAQLAIN",
    email: "saqlain@fleet.app",
    password: "saqlain1234",
    pin: "1234",
    role: "driver",
    colorClass: "saqlain",
    colorHex: "#16a34a",
    managerKey: "mudassar",
    managerName: "MUDASSAR",
    canDrive: true,
    defaultVehicle: "",
    defaultPhone: "",
  },
  shujaat: {
    staffKey: "shujaat",
    fullName: "SHUJAAT",
    email: "shujaat@fleet.app",
    password: "shujaat1234",
    pin: "1234",
    role: "driver",
    colorClass: "shujaat",
    colorHex: "#ea580c",
    managerKey: "mudassar",
    managerName: "MUDASSAR",
    canDrive: true,
    defaultVehicle: "",
    defaultPhone: "",
  },
};

const STAFF_BY_EMAIL = Object.values(STAFF).reduce((acc, item) => {
  acc[item.email] = item;
  return acc;
}, {});

const DRIVER_ORDER = ["mudassar", "saqlain", "shujaat"];
const HISTORY_PAGE_SIZE = 30;

/* =========================================================
   STATE
========================================================= */
const state = {
  authUser: null,
  currentStaff: null,
  driverProfiles: {},
  shifts: [],

  unsubShifts: null,
  unsubProfiles: null,

  historyPage: 1,

  photoModalStaffKey: null,
  pendingPhotoFile: null,
  pendingPhotoPreviewUrl: "",

  pdfBusy: false,
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

function escapeHtml(value) {
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
    .map((x) => x[0]?.toUpperCase() || "")
    .join("") || "U";
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

function formatHourLabel(hour) {
  const hh = String(hour).padStart(2, "0");
  return `${hh}:00`;
}

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  show(toast);
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => hide(toast), 2600);
}

function cleanupSubs() {
  if (typeof state.unsubShifts === "function") {
    state.unsubShifts();
    state.unsubShifts = null;
  }
  if (typeof state.unsubProfiles === "function") {
    state.unsubProfiles();
    state.unsubProfiles = null;
  }
}

function statCard(label, value, sub = "") {
  return `
    <div class="stat-card">
      <div class="stat-label">${escapeHtml(label)}</div>
      <div class="stat-value">${escapeHtml(value)}</div>
      <div class="stat-sub">${escapeHtml(sub)}</div>
    </div>
  `;
}

function getBaseStaff(staffKey) {
  return STAFF[staffKey] || null;
}

function getDriverProfile(staffKey) {
  const base = getBaseStaff(staffKey);
  const saved = state.driverProfiles[staffKey] || {};
  if (!base) return null;

  return {
    ...base,
    ...saved,
    staffKey,
    fullName: saved.fullName || base.fullName,
    colorClass: base.colorClass,
    colorHex: base.colorHex,
    role: base.role,
    email: base.email,
    managerKey: base.managerKey,
    managerName: base.managerName,
    canDrive: true,
  };
}

function getVisibleProfiles() {
  if (!state.currentStaff) return [];
  if (state.currentStaff.role === "manager") {
    return DRIVER_ORDER.map((key) => getDriverProfile(key)).filter(Boolean);
  }
  return [getDriverProfile(state.currentStaff.staffKey)].filter(Boolean);
}

function getDrivableProfiles() {
  return DRIVER_ORDER.map((key) => getDriverProfile(key)).filter((p) => p && p.canDrive);
}

function canManageProfile(staffKey) {
  if (!state.currentStaff) return false;
  return state.currentStaff.role === "manager" || state.currentStaff.staffKey === staffKey;
}

/* =========================================================
   THEME
========================================================= */
const themeKey = "taxi_theme_mode";

function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem(themeKey, theme);

  const themeText = theme === "light" ? "Night mode" : "Day mode";
  if ($("themeToggleBtn")) $("themeToggleBtn").textContent = themeText;
  if ($("themeToggleAuthBtn")) $("themeToggleAuthBtn").textContent = themeText;
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
   LOGIN
========================================================= */
function updateLoginMode() {
  const selected = STAFF[$("loginStaff").value];
  if (!selected) return;

  $("loginBtn").textContent = `Sign in as ${selected.role === "manager" ? "manager" : "driver"}`;
  $("loginHint").textContent = "Enter your PIN to continue.";
  $("loginPin").value = "";
}

$("loginStaff")?.addEventListener("change", updateLoginMode);
updateLoginMode();

$("loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const selectedKey = $("loginStaff").value;
  const selected = STAFF[selectedKey];
  const pin = $("loginPin").value.trim();

  if (!selected) {
    showToast("Invalid staff selection.");
    return;
  }

  if (pin !== selected.pin) {
    showToast("Wrong PIN.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, selected.email, selected.password);
    $("loginPin").value = "";
    showToast("Signed in.");
  } catch (error) {
    console.error(error);
    showToast("Firebase user not found or wrong Firebase setup.");
  }
});

$("logoutBtn")?.addEventListener("click", async () => {
  try {
    cleanupSubs();
    await signOut(auth);
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
    state.authUser = null;
    state.currentStaff = null;
    state.driverProfiles = {};
    state.shifts = [];
    state.historyPage = 1;

    show($("authView"));
    hide($("appView"));
    return;
  }

  const currentStaff = STAFF_BY_EMAIL[user.email || ""];
  if (!currentStaff) {
    showToast("This account is not allowed in this app.");
    await signOut(auth);
    return;
  }

  state.authUser = user;
  state.currentStaff = currentStaff;

  await ensureInitialProfiles();

  hide($("authView"));
  show($("appView"));

  setHeaderProfile();
  attachNav();
  populateDriverSelects();
  setShiftDefaults();
  renderShiftPreview();
  subscribeProfiles();
  subscribeShifts();
});

/* =========================================================
   INITIAL DRIVER PROFILE SETUP
========================================================= */
async function ensureInitialProfiles() {
  if (!state.currentStaff) return;

  const targets =
    state.currentStaff.role === "manager"
      ? DRIVER_ORDER
      : [state.currentStaff.staffKey];

  for (const staffKey of targets) {
    const base = getBaseStaff(staffKey);
    if (!base) continue;

    const profileRef = doc(db, "driverProfiles", staffKey);
    const existing = await getDoc(profileRef);

    if (!existing.exists()) {
      await setDoc(profileRef, {
        staffKey: base.staffKey,
        fullName: base.fullName,
        role: base.role,
        email: base.email,
        managerKey: base.managerKey,
        managerName: base.managerName,
        colorClass: base.colorClass,
        colorHex: base.colorHex,
        vehicle: base.defaultVehicle || "",
        phone: base.defaultPhone || "",
        photoUrl: "",
        photoPath: "",
        updatedAt: serverTimestamp(),
      });
    } else if (state.currentStaff.role === "manager") {
      await setDoc(
        profileRef,
        {
          staffKey: base.staffKey,
          fullName: base.fullName,
          role: base.role,
          email: base.email,
          managerKey: base.managerKey,
          managerName: base.managerName,
          colorClass: base.colorClass,
          colorHex: base.colorHex,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  }
}

/* =========================================================
   SUBSCRIPTIONS
========================================================= */
function subscribeProfiles() {
  if (!state.currentStaff) return;

  if (state.currentStaff.role === "manager") {
    state.unsubProfiles = onSnapshot(collection(db, "driverProfiles"), (snap) => {
      const next = {};
      snap.docs.forEach((d) => {
        next[d.id] = d.data();
      });
      state.driverProfiles = next;
      renderEverythingThatUsesProfiles();
    });
    return;
  }

  state.unsubProfiles = onSnapshot(doc(db, "driverProfiles", state.currentStaff.staffKey), (snap) => {
    const next = {};
    if (snap.exists()) {
      next[snap.id] = snap.data();
    }
    state.driverProfiles = next;
    renderEverythingThatUsesProfiles();
  });
}

function subscribeShifts() {
  if (!state.currentStaff) return;

  const shiftsRef = collection(db, "shifts");

  if (state.currentStaff.role === "manager") {
    const q = query(shiftsRef, where("managerKey", "==", "mudassar"));
    state.unsubShifts = onSnapshot(q, (snap) => {
      state.shifts = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort(sortShiftsNewestFirst);
      renderAllShiftDependentViews();
    });
    return;
  }

  const q = query(shiftsRef, where("driverKey", "==", state.currentStaff.staffKey));
  state.unsubShifts = onSnapshot(q, (snap) => {
    state.shifts = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort(sortShiftsNewestFirst);
    renderAllShiftDependentViews();
  });
}

function sortShiftsNewestFirst(a, b) {
  const da = String(a.dateKey || "");
  const db = String(b.dateKey || "");
  if (da !== db) return db.localeCompare(da);

  const ca = a.createdAt?.seconds || 0;
  const cb = b.createdAt?.seconds || 0;
  return cb - ca;
}

/* =========================================================
   UI BOOTSTRAP
========================================================= */
function setHeaderProfile() {
  const profile = getDriverProfile(state.currentStaff.staffKey);
  if (!profile) return;

  $("sidebarName").textContent = profile.fullName;
  $("sidebarRole").textContent =
    profile.role === "manager" ? "Manager / Driver" : "Driver";
  $("sidebarVehicle").textContent = profile.vehicle || "No default vehicle";
  $("sidebarAvatar").textContent = initials(profile.fullName);
  $("topbarDate").textContent = dateTimeLabel();
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

  const titleMap = {
    dashboardView: ["Dashboard", "Live overview of earnings, fuel, spending and net"],
    shiftView: ["New Shift", "Manager can save full shift details on behalf of any driver"],
    historyView: ["Shift History", "Search by date, driver or car · 30 rows per page"],
    reportsView: ["Reports", "Daily, weekly, monthly and yearly analytics with PDFs"],
    profilesView: ["Drivers", "Photos, default vehicles and profile details"],
  };

  $("pageTitle").textContent = titleMap[viewId][0];
  $("pageSubtitle").textContent = titleMap[viewId][1];
}

function renderEverythingThatUsesProfiles() {
  setHeaderProfile();
  populateDriverSelects();
  renderProfiles();
  renderHistoryFilters();
  renderReportDriverFilter();
  renderDashboard();
  renderReports();
  renderHistoryTable();
}

function renderAllShiftDependentViews() {
  renderDashboard();
  renderHistoryTable();
  renderReports();
}

/* =========================================================
   PROFILE HELPERS
========================================================= */
function getProfileImageHtml(profile, size = "small") {
  const photoUrl = profile?.photoUrl || "";
  const initialsText = initials(profile?.fullName || "D");
  const sizeClass =
    size === "large" ? "profile-photo" : "mini-avatar";

  if (photoUrl) {
    return `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(profile.fullName)}" class="${sizeClass}" />`;
  }

  return `
    <div class="${sizeClass} fallback">
      ${escapeHtml(initialsText)}
    </div>
  `;
}

/* =========================================================
   SHIFT DEFAULTS + SELECTS
========================================================= */
function populateDriverSelects() {
  const driverSelect = $("sfDriverKey");
  const reportDriverFilter = $("reportDriverFilter");
  const historyDriverFilter = $("historyDriverFilter");

  const profiles = getDrivableProfiles();

  if (state.currentStaff?.role === "manager") {
    show($("driverSelectWrap"));
  } else {
    hide($("driverSelectWrap"));
  }

  if (driverSelect) {
    driverSelect.innerHTML = profiles
      .map((profile) => {
        return `<option value="${profile.staffKey}">${escapeHtml(profile.fullName)}</option>`;
      })
      .join("");
  }

  renderReportDriverFilter();
  renderHistoryFilters();

  if (state.currentStaff?.role === "manager") {
    if (!$("sfDriverKey").value) {
      $("sfDriverKey").value = "mudassar";
    }
  }

  if (reportDriverFilter && state.currentStaff?.role !== "manager") {
    reportDriverFilter.innerHTML = `<option value="${state.currentStaff.staffKey}">${escapeHtml(
      state.currentStaff.fullName
    )}</option>`;
  }

  if (historyDriverFilter && state.currentStaff?.role !== "manager") {
    historyDriverFilter.innerHTML = `<option value="${state.currentStaff.staffKey}">${escapeHtml(
      state.currentStaff.fullName
    )}</option>`;
  }
}

function renderReportDriverFilter() {
  const select = $("reportDriverFilter");
  if (!select || !state.currentStaff) return;

  if (state.currentStaff.role !== "manager") {
    select.innerHTML = `<option value="${state.currentStaff.staffKey}">${escapeHtml(
      state.currentStaff.fullName
    )}</option>`;
    return;
  }

  const options = [
    `<option value="all">All</option>`,
    ...getDrivableProfiles().map(
      (profile) =>
        `<option value="${profile.staffKey}">${escapeHtml(profile.fullName)}</option>`
    ),
  ];
  select.innerHTML = options.join("");
}

function renderHistoryFilters() {
  const select = $("historyDriverFilter");
  if (!select || !state.currentStaff) return;

  if (state.currentStaff.role !== "manager") {
    select.innerHTML = `<option value="${state.currentStaff.staffKey}">${escapeHtml(
      state.currentStaff.fullName
    )}</option>`;
    return;
  }

  const options = [
    `<option value="all">All</option>`,
    ...getDrivableProfiles().map(
      (profile) =>
        `<option value="${profile.staffKey}">${escapeHtml(profile.fullName)}</option>`
    ),
  ];
  select.innerHTML = options.join("");
}

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

  if (state.currentStaff?.role === "manager") {
    $("sfDriverKey").value = $("sfDriverKey").value || "mudassar";
    applyDriverVehicleDefault();
  } else if (state.currentStaff) {
    const ownProfile = getDriverProfile(state.currentStaff.staffKey);
    $("sfVehicle").value = ownProfile?.vehicle || "";
  }

  renderShiftPreview();
}

function applyDriverVehicleDefault() {
  const selectedDriver = getDriverProfile($("sfDriverKey").value);
  if (!selectedDriver) return;
  if (!$("sfVehicle").dataset.userModified || $("sfVehicle").value.trim() === "") {
    $("sfVehicle").value = selectedDriver.vehicle || "";
  }
}

$("sfDriverKey")?.addEventListener("change", () => {
  applyDriverVehicleDefault();
  renderShiftPreview();
});

$("sfVehicle")?.addEventListener("input", () => {
  $("sfVehicle").dataset.userModified = "true";
});

/* =========================================================
   TIME / CALCS
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

function calculateShiftFromFormRaw(raw) {
  const workedMinutes = minutesBetween(raw.dateKey, raw.startTime, raw.endTime);
  const workedHours = workedMinutes / 60;
  const totalKm = num(raw.km);

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
  const kmPerEuro = safeDiv(totalKm, totalIncome);

  return {
    workedMinutes,
    workedHours,
    totalKm,
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

function getShiftFormRaw() {
  return {
    dateKey: $("sfDate").value,
    km: $("sfKm").value,
    startTime: $("sfStartTime").value,
    endTime: $("sfEndTime").value,
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

/* =========================================================
   LIVE PREVIEW
========================================================= */
const shiftInputIds = [
  "sfDate",
  "sfDriverKey",
  "sfVehicle",
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

shiftInputIds.forEach((id) => {
  $(id)?.addEventListener("input", renderShiftPreview);
  $(id)?.addEventListener("change", renderShiftPreview);
});

$("resetShiftBtn")?.addEventListener("click", () => {
  $("shiftForm").reset();
  $("sfVehicle").dataset.userModified = "";
  setShiftDefaults();
  renderShiftPreview();
});

function renderShiftPreview() {
  try {
    const raw = getShiftFormRaw();
    const calc = calculateShiftFromFormRaw(raw);

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
      statCard("KM", calc.totalKm.toFixed(1), "Direct input"),
      statCard("Income", money(calc.totalIncome), "All sources"),
      statCard("Fuel", money(calc.totalFuel), "Fuel only"),
      statCard("Spending", money(calc.totalSpending), "Fuel + gastos + mantenimiento"),
      statCard("Net", money(calc.netProfit), "Income - spending"),
      statCard("KM/€", calc.kmPerEuro.toFixed(3), "Average"),
      statCard("Apps", money(calc.totalApps), "Cabify + Free Now + Uber"),
    ].join("");
  } catch (error) {
    console.error(error);
    $("shiftPreview").innerHTML = statCard("Preview", "—", "Fill the form");
  }
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
    $("sfVehicle").dataset.userModified = "";
    setShiftDefaults();
    renderShiftPreview();

    openView("historyView");
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    document.querySelector('[data-view="historyView"]').classList.add("active");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Could not save shift.");
  }
});

function buildShiftPayload() {
  if (!state.currentStaff) {
    throw new Error("No active staff session.");
  }

  const selectedDriverKey =
    state.currentStaff.role === "manager"
      ? $("sfDriverKey").value
      : state.currentStaff.staffKey;

  const selectedDriver = getDriverProfile(selectedDriverKey);
  if (!selectedDriver) {
    throw new Error("Invalid driver.");
  }

  const raw = getShiftFormRaw();
  if (!raw.dateKey) throw new Error("Date is required.");
  if (!raw.startTime || !raw.endTime) throw new Error("Start and end times are required.");
  if (num(raw.km) < 0) throw new Error("KM cannot be negative.");

  const calc = calculateShiftFromFormRaw(raw);

  return {
    driverKey: selectedDriver.staffKey,
    driverName: selectedDriver.fullName,
    driverColorClass: selectedDriver.colorClass,
    vehicle: $("sfVehicle").value.trim() || selectedDriver.vehicle || "",
    dateKey: raw.dateKey,
    startTime: raw.startTime,
    endTime: raw.endTime,
    notes: raw.notes,

    km: calc.totalKm,
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

    managerKey: "mudassar",
    managerName: "MUDASSAR",

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
    statCard("Mantenimiento", money(today.totalMaintenance), "Repairs / service"),
    statCard("Net", money(today.netProfit), "Income - spending"),
  ].join("");

  renderTopDriversList();
  renderPeakAnalyticsList();
}

function renderTopDriversList() {
  const groups = groupRowsBy(state.shifts, (row) => row.driverKey);
  const ranked = Object.entries(groups)
    .map(([staffKey, rows]) => {
      const profile = getDriverProfile(staffKey);
      return {
        profile,
        summary: summarizeRows(rows),
      };
    })
    .sort((a, b) => b.summary.totalIncome - a.summary.totalIncome)
    .slice(0, 6);

  $("topDriversList").innerHTML = ranked.length
    ? ranked
        .map(({ profile, summary }) => {
          return `
            <div class="stack-row">
              <div class="stack-row-left">
                <div class="driver-line ${escapeHtml(profile.colorClass)}"></div>
                ${getProfileImageHtml(profile, "small")}
                <div>
                  <strong>${escapeHtml(profile.fullName)}</strong>
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
  const rows = [...state.shifts];
  const bestDay = getBestDay(rows);
  const peakHour = getPeakHour(rows);
  const highestFuelDay = getHighestFuelDay(rows);
  const busiestDay = getBusiestDay(rows);

  const items = [
    {
      title: "Best Day",
      value: bestDay ? `${bestDay.key} · ${money(bestDay.summary.totalIncome)}` : "—",
      sub: bestDay ? `${bestDay.summary.count} shifts` : "No data",
    },
    {
      title: "Peak Hour",
      value: peakHour ? `${formatHourLabel(peakHour.hour)} · ${money(peakHour.amount)}` : "—",
      sub: peakHour ? "Estimated by shift time blocks" : "No data",
    },
    {
      title: "Highest Fuel Day",
      value: highestFuelDay ? `${highestFuelDay.key} · ${money(highestFuelDay.summary.totalFuel)}` : "—",
      sub: highestFuelDay ? "Fuel total" : "No data",
    },
    {
      title: "Busiest Day",
      value: busiestDay ? `${busiestDay.key} · ${busiestDay.summary.count} shifts` : "—",
      sub: busiestDay ? money(busiestDay.summary.totalIncome) : "No data",
    },
  ];

  $("peakAnalyticsList").innerHTML = items
    .map(
      (item) => `
        <div class="stack-row">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <div class="muted">${escapeHtml(item.sub)}</div>
          </div>
          <div><strong>${escapeHtml(item.value)}</strong></div>
        </div>
      `
    )
    .join("");
}

/* =========================================================
   HISTORY FILTERS + PAGINATION
========================================================= */
$("historySearch")?.addEventListener("input", resetAndRenderHistory);
$("historyDateFilter")?.addEventListener("change", resetAndRenderHistory);
$("historyDriverFilter")?.addEventListener("change", resetAndRenderHistory);
$("historyCarFilter")?.addEventListener("input", resetAndRenderHistory);

$("clearHistoryFiltersBtn")?.addEventListener("click", () => {
  $("historySearch").value = "";
  $("historyDateFilter").value = "";
  renderHistoryFilters();
  $("historyCarFilter").value = "";
  state.historyPage = 1;
  renderHistoryTable();
});

$("historyPrevBtn")?.addEventListener("click", () => {
  state.historyPage = Math.max(1, state.historyPage - 1);
  renderHistoryTable();
});

$("historyNextBtn")?.addEventListener("click", () => {
  const totalPages = getHistoryTotalPages();
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
    const matchesCar =
      !carFilter || String(row.vehicle || "").toLowerCase().includes(carFilter);

    return matchesSearch && matchesDate && matchesDriver && matchesCar;
  });
}

function getHistoryTotalPages() {
  const count = getFilteredHistoryRows().length;
  return Math.max(1, Math.ceil(count / HISTORY_PAGE_SIZE));
}

function renderHistoryTable() {
  const filtered = getFilteredHistoryRows();
  const totalPages = Math.max(1, Math.ceil(filtered.length / HISTORY_PAGE_SIZE));

  if (state.historyPage > totalPages) {
    state.historyPage = totalPages;
  }

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
      const profile = getDriverProfile(row.driverKey) || getBaseStaff(row.driverKey);
      const driverClass = profile?.colorClass || "mudassar";
      return `
        <tr class="history-row ${escapeHtml(driverClass)}">
          <td>
            <div class="history-driver-cell">
              ${getProfileImageHtml(profile, "small")}
              <div>
                <div class="driver-badge ${escapeHtml(driverClass)}">${escapeHtml(row.driverName)}</div>
                <div class="muted">${escapeHtml(row.managerName || "")}</div>
              </div>
            </div>
          </td>
          <td>${escapeHtml(formatDate(row.dateKey))}</td>
          <td>${escapeHtml(row.vehicle || "-")}</td>
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
  const driverKey =
    state.currentStaff?.role === "manager"
      ? $("reportDriverFilter").value
      : state.currentStaff?.staffKey || "all";
  const carFilter = $("reportCarFilter").value.trim().toLowerCase();

  let rows = filterRowsByRange(state.shifts, range);

  if (driverKey && driverKey !== "all") {
    rows = rows.filter((row) => row.driverKey === driverKey);
  }

  if (carFilter) {
    rows = rows.filter((row) =>
      String(row.vehicle || "").toLowerCase().includes(carFilter)
    );
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
}

function renderReportPeakList(rows) {
  const bestDay = getBestDay(rows);
  const peakHour = getPeakHour(rows);
  const highestFuelDay = getHighestFuelDay(rows);
  const worstDay = getWorstDay(rows);

  const items = [
    {
      title: "Peak Day",
      value: bestDay ? `${bestDay.key} · ${money(bestDay.summary.totalIncome)}` : "—",
      sub: bestDay ? `${bestDay.summary.count} shifts` : "No data",
    },
    {
      title: "Peak Hour",
      value: peakHour ? `${formatHourLabel(peakHour.hour)} · ${money(peakHour.amount)}` : "—",
      sub: peakHour ? "Estimated hourly performance" : "No data",
    },
    {
      title: "Highest Fuel Day",
      value: highestFuelDay ? `${highestFuelDay.key} · ${money(highestFuelDay.summary.totalFuel)}` : "—",
      sub: highestFuelDay ? "Fuel total" : "No data",
    },
    {
      title: "Worst Day",
      value: worstDay ? `${worstDay.key} · ${money(worstDay.summary.totalIncome)}` : "—",
      sub: worstDay ? "By income" : "No data",
    },
  ];

  $("reportPeakList").innerHTML = items
    .map(
      (item) => `
        <div class="stack-row">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <div class="muted">${escapeHtml(item.sub)}</div>
          </div>
          <div><strong>${escapeHtml(item.value)}</strong></div>
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
            <strong>${escapeHtml(title)}</strong>
            <div class="muted">${escapeHtml(sub)}</div>
          </div>
          <div><strong>${escapeHtml(value)}</strong></div>
        </div>
      `
    )
    .join("");
}

function renderDailyReportList(rows) {
  const grouped = groupRowsBy(rows, (row) => row.dateKey);
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
                <strong>${escapeHtml(day.key)}</strong>
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
            <strong>${escapeHtml(item.title)}</strong>
            <div class="muted">${escapeHtml(item.sub)}</div>
          </div>
          <div><strong>${escapeHtml(item.value)}</strong></div>
        </div>
      `
    )
    .join("");
}

/* =========================================================
   SUMMARY / GROUP HELPERS
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
  return rows.reduce(
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
}

function groupRowsBy(rows, keyFn) {
  return rows.reduce((acc, row) => {
    const key = keyFn(row);
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
}

function withKmPerEuro(summary) {
  return {
    ...summary,
    kmPerEuro: safeDiv(summary.totalKm, summary.totalIncome),
  };
}

function getBestDay(rows) {
  const groups = groupRowsBy(rows, (row) => row.dateKey);
  const ranked = Object.entries(groups)
    .map(([key, dayRows]) => ({ key, summary: withKmPerEuro(summarizeRows(dayRows)) }))
    .sort((a, b) => b.summary.totalIncome - a.summary.totalIncome);
  return ranked[0] || null;
}

function getWorstDay(rows) {
  const groups = groupRowsBy(rows, (row) => row.dateKey);
  const ranked = Object.entries(groups)
    .map(([key, dayRows]) => ({ key, summary: withKmPerEuro(summarizeRows(dayRows)) }))
    .sort((a, b) => a.summary.totalIncome - b.summary.totalIncome);
  return ranked[0] || null;
}

function getHighestFuelDay(rows) {
  const groups = groupRowsBy(rows, (row) => row.dateKey);
  const ranked = Object.entries(groups)
    .map(([key, dayRows]) => ({ key, summary: withKmPerEuro(summarizeRows(dayRows)) }))
    .sort((a, b) => b.summary.totalFuel - a.summary.totalFuel);
  return ranked[0] || null;
}

function getBusiestDay(rows) {
  const groups = groupRowsBy(rows, (row) => row.dateKey);
  const ranked = Object.entries(groups)
    .map(([key, dayRows]) => ({ key, summary: withKmPerEuro(summarizeRows(dayRows)) }))
    .sort((a, b) => b.summary.count - a.summary.count);
  return ranked[0] || null;
}

function getBestDriver(rows) {
  const groups = groupRowsBy(rows, (row) => row.driverKey);
  const ranked = Object.entries(groups)
    .map(([staffKey, driverRows]) => ({
      profile: getDriverProfile(staffKey),
      summary: withKmPerEuro(summarizeRows(driverRows)),
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

    const coveredHours = buildCoveredHours(startHour, endHour);
    if (!coveredHours.length) return;

    const allocated = safeDiv(num(row.totalIncome), coveredHours.length);
    coveredHours.forEach((hour) => {
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

  if (bestHour === null) return null;

  return { hour: bestHour, amount: bestAmount };
}

function extractHour(timeStr) {
  if (!timeStr || !timeStr.includes(":")) return null;
  const hour = Number(timeStr.split(":")[0]);
  return Number.isFinite(hour) ? hour : null;
}

function buildCoveredHours(startHour, endHour) {
  const result = [];
  let current = startHour;
  let guard = 0;

  while (guard < 30) {
    result.push(current);
    if (current === endHour) break;
    current = (current + 1) % 24;
    guard += 1;
  }

  return [...new Set(result)];
}

/* =========================================================
   PROFILES VIEW
========================================================= */
function renderProfiles() {
  const profiles = getVisibleProfiles();
  const drivers = profiles.filter((p) => p.role === "driver").length;
  const managers = profiles.filter((p) => p.role === "manager").length;

  $("profilesStats").innerHTML = [
    statCard("Profiles", String(profiles.length), "Visible"),
    statCard("Drivers", String(drivers), "Driver accounts"),
    statCard("Managers", String(managers), "Manager accounts"),
  ].join("");

  $("profilesGrid").innerHTML = profiles
    .map((profile) => renderProfileCard(profile))
    .join("");

  attachProfileCardEvents();
}

function renderProfileCard(profile) {
  const editable = canManageProfile(profile.staffKey);
  const title = profile.role === "manager" ? "Manager / Driver" : "Driver";

  return `
    <div class="card profile-card" data-profile-card="${escapeHtml(profile.staffKey)}">
      <div class="profile-color-bar ${escapeHtml(profile.colorClass)}"></div>

      <div class="profile-card-head">
        ${getProfileImageHtml(profile, "large")}
        <div>
          <div class="profile-name">${escapeHtml(profile.fullName)}</div>
          <div class="profile-role">${escapeHtml(title)}</div>
          <div class="driver-badge ${escapeHtml(profile.colorClass)}">${escapeHtml(profile.fullName)}</div>
        </div>
      </div>

      <div class="profile-meta-list">
        <div>Email: ${escapeHtml(profile.email)}</div>
        <div>Manager: ${escapeHtml(profile.managerName || "")}</div>
        <div>Colour: ${escapeHtml(profile.colorHex)}</div>
      </div>

      <div class="grid-2">
        <label>
          <span>Phone</span>
          <input
            type="text"
            data-profile-phone="${escapeHtml(profile.staffKey)}"
            value="${escapeHtml(profile.phone || "")}"
            ${editable ? "" : "disabled"}
          />
        </label>

        <label>
          <span>Default vehicle</span>
          <input
            type="text"
            data-profile-vehicle="${escapeHtml(profile.staffKey)}"
            value="${escapeHtml(profile.vehicle || "")}"
            ${editable ? "" : "disabled"}
          />
        </label>
      </div>

      <div class="profile-actions">
        ${
          editable
            ? `
              <button class="secondary-btn" type="button" data-edit-photo="${escapeHtml(profile.staffKey)}">
                Manage photo
              </button>
              <button class="primary-btn" type="button" data-save-profile="${escapeHtml(profile.staffKey)}">
                Save profile
              </button>
            `
            : ""
        }
      </div>
    </div>
  `;
}

function attachProfileCardEvents() {
  document.querySelectorAll("[data-save-profile]").forEach((btn) => {
    btn.onclick = async () => {
      const staffKey = btn.getAttribute("data-save-profile");
      await saveProfileMeta(staffKey);
    };
  });

  document.querySelectorAll("[data-edit-photo]").forEach((btn) => {
    btn.onclick = () => {
      const staffKey = btn.getAttribute("data-edit-photo");
      openPhotoModal(staffKey);
    };
  });
}

async function saveProfileMeta(staffKey) {
  try {
    const profile = getDriverProfile(staffKey);
    if (!profile) throw new Error("Profile not found.");

    const phone = document.querySelector(`[data-profile-phone="${staffKey}"]`)?.value?.trim() || "";
    const vehicle = document.querySelector(`[data-profile-vehicle="${staffKey}"]`)?.value?.trim() || "";

    await setDoc(
      doc(db, "driverProfiles", staffKey),
      {
        staffKey,
        fullName: profile.fullName,
        role: profile.role,
        email: profile.email,
        managerKey: profile.managerKey,
        managerName: profile.managerName,
        colorClass: profile.colorClass,
        colorHex: profile.colorHex,
        phone,
        vehicle,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    showToast("Profile saved.");
  } catch (error) {
    console.error(error);
    showToast("Could not save profile.");
  }
}

/* =========================================================
   PHOTO MODAL
========================================================= */
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

$("removeDriverPhotoBtn")?.addEventListener("click", async () => {
  await removeDriverPhoto();
});

$("saveDriverPhotoBtn")?.addEventListener("click", async () => {
  await saveDriverPhoto();
});

function openPhotoModal(staffKey) {
  const profile = getDriverProfile(staffKey);
  if (!profile) return;

  state.photoModalStaffKey = staffKey;
  state.pendingPhotoFile = null;
  revokePendingPreview();

  $("photoModalTitle").textContent = `${profile.fullName} — Driver Photo`;

  const img = $("photoPreviewImg");
  const avatar = $("photoPreviewAvatar");

  if (profile.photoUrl) {
    img.src = profile.photoUrl;
    show(img);
    hide(avatar);
  } else {
    img.src = "";
    hide(img);
    avatar.textContent = initials(profile.fullName);
    show(avatar);
  }

  $("driverPhotoUploadInput").value = "";
  $("driverPhotoCameraInput").value = "";
  $("photoModal").classList.remove("hidden");
  $("photoModal").setAttribute("aria-hidden", "false");
}

function closePhotoModal() {
  revokePendingPreview();
  state.photoModalStaffKey = null;
  state.pendingPhotoFile = null;
  $("driverPhotoUploadInput").value = "";
  $("driverPhotoCameraInput").value = "";
  $("photoModal").classList.add("hidden");
  $("photoModal").setAttribute("aria-hidden", "true");
}

function revokePendingPreview() {
  if (state.pendingPhotoPreviewUrl) {
    URL.revokeObjectURL(state.pendingPhotoPreviewUrl);
    state.pendingPhotoPreviewUrl = "";
  }
}

function handleSelectedPhotoFile(file) {
  if (!file || !state.photoModalStaffKey) return;

  state.pendingPhotoFile = file;
  revokePendingPreview();
  state.pendingPhotoPreviewUrl = URL.createObjectURL(file);

  $("photoPreviewImg").src = state.pendingPhotoPreviewUrl;
  show($("photoPreviewImg"));
  hide($("photoPreviewAvatar"));
}

async function saveDriverPhoto() {
  if (!state.photoModalStaffKey || !state.pendingPhotoFile) {
    showToast("Select a photo first.");
    return;
  }

  try {
    const profile = getDriverProfile(state.photoModalStaffKey);
    if (!profile) throw new Error("Profile not found.");

    const existingPath = profile.photoPath || "";
    if (existingPath) {
      try {
        await deleteObject(storageRef(storage, existingPath));
      } catch (err) {
        console.warn("Old photo delete skipped:", err);
      }
    }

    const extension = getFileExtension(state.pendingPhotoFile.name || "jpg");
    const path = `driverPhotos/${profile.staffKey}/photo_${Date.now()}.${extension}`;
    const ref = storageRef(storage, path);

    await uploadBytes(ref, state.pendingPhotoFile);
    const url = await getDownloadURL(ref);

    await setDoc(
      doc(db, "driverProfiles", profile.staffKey),
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
    showToast("Could not save driver photo.");
  }
}

async function removeDriverPhoto() {
  if (!state.photoModalStaffKey) return;

  try {
    const profile = getDriverProfile(state.photoModalStaffKey);
    if (!profile) throw new Error("Profile not found.");

    if (profile.photoPath) {
      try {
        await deleteObject(storageRef(storage, profile.photoPath));
      } catch (err) {
        console.warn("Delete photo warning:", err);
      }
    }

    await setDoc(
      doc(db, "driverProfiles", profile.staffKey),
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
}

function getFileExtension(filename) {
  const ext = String(filename).split(".").pop()?.toLowerCase() || "jpg";
  return ext.replace(/[^a-z0-9]/g, "") || "jpg";
}

/* =========================================================
   PDF EXPORT
========================================================= */
$("exportReportPdfBtn")?.addEventListener("click", async () => {
  if (state.pdfBusy) return;
  state.pdfBusy = true;
  try {
    await exportCurrentReportPdf();
  } catch (error) {
    console.error(error);
    showToast("Could not export PDF.");
  } finally {
    state.pdfBusy = false;
  }
});

async function exportCurrentReportPdf() {
  const rows = getReportRows();
  const summary = summarizeRows(rows);
  const range = $("reportRange").value;
  const driverKey =
    state.currentStaff?.role === "manager"
      ? $("reportDriverFilter").value
      : state.currentStaff?.staffKey || "all";

  const carFilter = $("reportCarFilter").value.trim();
  const selectedProfile =
    driverKey && driverKey !== "all" ? getDriverProfile(driverKey) : null;

  const { jsPDF } = await import("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm");
  const docPdf = new jsPDF({ unit: "mm", format: "a4" });

  const page = {
    width: docPdf.internal.pageSize.getWidth(),
    height: docPdf.internal.pageSize.getHeight(),
    margin: 14,
  };

  let y = 16;

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(20);
  docPdf.text("TAXI FLEET REPORT", page.margin, y);
  y += 8;

  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(10);
  docPdf.text(`Generated: ${dateTimeLabel()}`, page.margin, y);
  y += 6;
  docPdf.text(`Range: ${range.toUpperCase()}`, page.margin, y);
  y += 6;
  docPdf.text(`Driver: ${selectedProfile ? selectedProfile.fullName : "GLOBAL"}`, page.margin, y);
  y += 6;
  docPdf.text(`Vehicle filter: ${carFilter || "ALL"}`, page.margin, y);
  y += 10;

  if (selectedProfile) {
    y = await drawPdfDriverBlock(docPdf, selectedProfile, page.margin, y, page.width - page.margin * 2);
    y += 8;
  } else {
    y = drawPdfGlobalProfiles(docPdf, page.margin, y, page.width - page.margin * 2);
    y += 8;
  }

  y = drawPdfSectionTitle(docPdf, "SUMMARY", page.margin, y);
  y = drawPdfSummaryGrid(
    docPdf,
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
    page.margin,
    y,
    page.width - page.margin * 2
  );
  y += 6;

  y = drawPdfSectionTitle(docPdf, "BREAKDOWN", page.margin, y);
  y = drawPdfSummaryGrid(
    docPdf,
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
    page.margin,
    y,
    page.width - page.margin * 2
  );
  y += 6;

  const peakDay = getBestDay(rows);
  const peakHour = getPeakHour(rows);
  const fuelDay = getHighestFuelDay(rows);

  y = drawPdfSectionTitle(docPdf, "PEAK ANALYTICS", page.margin, y);
  y = drawPdfTextList(
    docPdf,
    [
      `Peak day: ${peakDay ? `${peakDay.key} · ${money(peakDay.summary.totalIncome)}` : "—"}`,
      `Peak hour: ${peakHour ? `${formatHourLabel(peakHour.hour)} · ${money(peakHour.amount)}` : "—"}`,
      `Highest fuel day: ${fuelDay ? `${fuelDay.key} · ${money(fuelDay.summary.totalFuel)}` : "—"}`,
    ],
    page.margin,
    y,
    page.width - page.margin * 2
  );
  y += 6;

  y = drawPdfSectionTitle(docPdf, "SHIFT LIST", page.margin, y);
  y = drawPdfShiftTable(docPdf, rows, page.margin, y, page);

  const reportLabel = selectedProfile ? selectedProfile.fullName : "GLOBAL";
  const fileName = `taxi-report-${reportLabel}-${range}-${todayISO()}.pdf`;
  docPdf.save(fileName);
  showToast("PDF exported.");
}

function drawPdfSectionTitle(docPdf, title, x, y) {
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(12);
  docPdf.text(title, x, y);
  docPdf.setDrawColor(170);
  docPdf.line(x, y + 1.5, 195, y + 1.5);
  return y + 7;
}

function drawPdfSummaryGrid(docPdf, pairs, x, y, width) {
  const cols = 2;
  const colWidth = width / cols;
  const rowHeight = 12;

  docPdf.setFontSize(10);

  pairs.forEach((pair, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const bx = x + col * colWidth;
    const by = y + row * rowHeight;

    docPdf.setDrawColor(220);
    docPdf.roundedRect(bx, by, colWidth - 3, rowHeight - 2, 2, 2);

    docPdf.setFont("helvetica", "normal");
    docPdf.text(pair[0], bx + 3, by + 5);

    docPdf.setFont("helvetica", "bold");
    docPdf.text(pair[1], bx + 3, by + 10);
  });

  return y + Math.ceil(pairs.length / cols) * rowHeight;
}

function drawPdfTextList(docPdf, lines, x, y, width) {
  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(10);

  lines.forEach((line) => {
    const wrapped = docPdf.splitTextToSize(line, width);
    docPdf.text(wrapped, x, y);
    y += wrapped.length * 5 + 1;
  });

  return y;
}

async function drawPdfDriverBlock(docPdf, profile, x, y, width) {
  const boxH = 28;

  docPdf.setDrawColor(220);
  docPdf.roundedRect(x, y, width, boxH, 3, 3);

  const imageX = x + 4;
  const imageY = y + 4;

  if (profile.photoUrl) {
    const dataUrl = await imageUrlToDataUrl(profile.photoUrl);
    if (dataUrl) {
      docPdf.addImage(dataUrl, "JPEG", imageX, imageY, 18, 18);
    } else {
      drawPdfAvatarCircle(docPdf, profile, imageX + 9, imageY + 9, 9);
    }
  } else {
    drawPdfAvatarCircle(docPdf, profile, imageX + 9, imageY + 9, 9);
  }

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(12);
  docPdf.text(profile.fullName, x + 28, y + 10);

  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(10);
  docPdf.text(`Role: ${profile.role === "manager" ? "Manager / Driver" : "Driver"}`, x + 28, y + 16);
  docPdf.text(`Vehicle: ${profile.vehicle || "-"}`, x + 28, y + 22);

  return y + boxH;
}

function drawPdfGlobalProfiles(docPdf, x, y, width) {
  const profiles = getVisibleProfiles();
  const cardWidth = (width - 8) / 2;
  const rowHeight = 20;

  profiles.forEach((profile, index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;
    const bx = x + col * (cardWidth + 8);
    const by = y + row * (rowHeight + 6);

    docPdf.setDrawColor(220);
    docPdf.roundedRect(bx, by, cardWidth, rowHeight, 2, 2);

    drawPdfAvatarCircle(docPdf, profile, bx + 7, by + 10, 5);

    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(10);
    docPdf.text(profile.fullName, bx + 16, by + 8);

    docPdf.setFont("helvetica", "normal");
    docPdf.setFontSize(9);
    docPdf.text(`Vehicle: ${profile.vehicle || "-"}`, bx + 16, by + 14);
  });

  return y + Math.ceil(profiles.length / 2) * (rowHeight + 6);
}

function drawPdfAvatarCircle(docPdf, profile, cx, cy, r) {
  const color = hexToRgb(profile.colorHex || "#1d4ed8");
  docPdf.setFillColor(color.r, color.g, color.b);
  docPdf.circle(cx, cy, r, "F");

  docPdf.setTextColor(255, 255, 255);
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(10);
  const text = initials(profile.fullName);
  docPdf.text(text, cx, cy + 1.5, { align: "center" });
  docPdf.setTextColor(0, 0, 0);
}

function drawPdfShiftTable(docPdf, rows, x, y, page) {
  const headers = ["Date", "Driver", "Car", "KM", "Income", "Fuel", "Spend", "Net"];
  const colWidths = [24, 28, 30, 16, 24, 18, 22, 20];
  const lineHeight = 7;
  const startX = x;

  function drawHeader() {
    let cursor = startX;
    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(9);
    headers.forEach((header, index) => {
      docPdf.setDrawColor(220);
      docPdf.rect(cursor, y, colWidths[index], lineHeight);
      docPdf.text(header, cursor + 2, y + 4.5);
      cursor += colWidths[index];
    });
    y += lineHeight;
  }

  drawHeader();

  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(8);

  rows.forEach((row, idx) => {
    if (y > page.height - 18) {
      docPdf.addPage();
      y = 16;
      drawHeader();
      docPdf.setFont("helvetica", "normal");
      docPdf.setFontSize(8);
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

    let cursor = startX;
    cells.forEach((cell, index) => {
      docPdf.setDrawColor(230);
      docPdf.rect(cursor, y, colWidths[index], lineHeight);
      docPdf.text(String(cell), cursor + 2, y + 4.5, {
        maxWidth: colWidths[index] - 4,
      });
      cursor += colWidths[index];
    });

    y += lineHeight;
  });

  return y;
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
  const full = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean.padEnd(6, "0");

  const numHex = parseInt(full, 16);
  return {
    r: (numHex >> 16) & 255,
    g: (numHex >> 8) & 255,
    b: numHex & 255,
  };
}

/* =========================================================
   INITIAL RENDERS
========================================================= */
renderShiftPreview();
renderDashboard();
renderReports();
renderHistoryTable();
renderProfiles();
