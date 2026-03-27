
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
  deleteField,
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
   FIXED AUTH STAFF
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
  },
};

const STAFF_BY_EMAIL = Object.values(STAFF).reduce((acc, item) => {
  acc[item.email] = item;
  return acc;
}, {});

const HISTORY_PAGE_SIZE = 30;

/* =========================================================
   STATE
========================================================= */
const state = {
  authUser: null,
  currentStaff: null,
  driverProfiles: {},
  cars: {},
  shifts: [],

  unsubProfiles: null,
  unsubCars: null,
  unsubShifts: null,

  historyPage: 1,
  charts: {},

  photoModalTarget: null,
  pendingPhotoFile: null,
  pendingPhotoPreviewUrl: "",
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
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(d);
}

function formatHourLabel(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
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

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  show(toast);
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => hide(toast), 2600);
}

function cleanupSubs() {
  if (typeof state.unsubProfiles === "function") state.unsubProfiles();
  if (typeof state.unsubCars === "function") state.unsubCars();
  if (typeof state.unsubShifts === "function") state.unsubShifts();
  state.unsubProfiles = null;
  state.unsubCars = null;
  state.unsubShifts = null;
}

function resetCharts() {
  Object.values(state.charts).forEach((chart) => {
    try { chart.destroy(); } catch {}
  });
  state.charts = {};
}

/* =========================================================
   THEME
========================================================= */
const themeKey = "taxi_theme_mode";

function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem(themeKey, theme);
  const label = theme === "light" ? "Night mode" : "Day mode";
  if ($("themeToggleBtn")) $("themeToggleBtn").textContent = label;
  if ($("themeToggleAuthBtn")) $("themeToggleAuthBtn").textContent = label;
}

(function initTheme() {
  applyTheme(localStorage.getItem(themeKey) || "light");
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
  $("loginHint").textContent = "Introduce tus credenciales para continuar.";
  $("loginPin").value = "";
}

$("loginStaff")?.addEventListener("change", updateLoginMode);
updateLoginMode();

$("loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const selected = STAFF[$("loginStaff").value];
  const pin = $("loginPin").value.trim();

  if (!selected) {
    showToast("Usuario no válido.");
    return;
  }

  if (pin !== selected.pin) {
    showToast("PIN incorrecto.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, selected.email, selected.password);
    $("loginPin").value = "";
    showToast("Acceso correcto.");
  } catch (error) {
    console.error(error);
    showToast("Problema de Firebase Auth o usuario no creado.");
  }
});

$("logoutBtn")?.addEventListener("click", async () => {
  try {
    cleanupSubs();
    resetCharts();
    await signOut(auth);
    showToast("Sesión cerrada.");
  } catch (error) {
    console.error(error);
    showToast("No se pudo cerrar sesión.");
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
    state.cars = {};
    state.shifts = [];
    state.historyPage = 1;
    resetCharts();

    show($("authView"));
    hide($("appView"));
    return;
  }

  const currentStaff = STAFF_BY_EMAIL[user.email || ""];
  if (!currentStaff) {
    showToast("Esta cuenta no está autorizada en esta app.");
    await signOut(auth);
    return;
  }

  state.authUser = user;
  state.currentStaff = currentStaff;

  try {
    await ensureBaseData();
    hide($("authView"));
    show($("appView"));

    bootApp();
  } catch (error) {
    console.error(error);
    showToast("No se pudo cargar la estructura inicial.");
  }
});

/* =========================================================
   BASE DATA SEED
========================================================= */
async function ensureBaseData() {
  const baseProfiles = Object.values(STAFF).map((staff) => ({
    ...staff,
    vehicle: "",
    phone: "",
    photoUrl: "",
    photoPath: "",
    isLoginEnabled: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));

  for (const profile of baseProfiles) {
    await setDoc(
      doc(db, "driverProfiles", profile.staffKey),
      profile,
      { merge: true }
    );
  }

  const carsSnap = await getDocs(collection(db, "cars"));
  if (carsSnap.empty && state.currentStaff.role === "manager") {
    const defaultCars = [
      {
        alias: "Taxi 1",
        plate: "0001-TAX",
        model: "Toyota Prius",
        status: "active",
        currentKm: 0,
        defaultDriverKey: "mudassar",
        itvDate: "",
        insuranceDate: "",
        notes: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      {
        alias: "Taxi 2",
        plate: "0002-TAX",
        model: "Toyota Prius+",
        status: "active",
        currentKm: 0,
        defaultDriverKey: "saqlain",
        itvDate: "",
        insuranceDate: "",
        notes: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      {
        alias: "Taxi 3",
        plate: "0003-TAX",
        model: "Skoda Octavia",
        status: "active",
        currentKm: 0,
        defaultDriverKey: "shujaat",
        itvDate: "",
        insuranceDate: "",
        notes: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    ];

    for (const car of defaultCars) {
      await addDoc(collection(db, "cars"), car);
    }
  }
}

/* =========================================================
   APP BOOT
========================================================= */
function bootApp() {
  setHeaderProfile();
  attachNav();
  subscribeDriverProfiles();
  subscribeCars();
  subscribeShifts();
  setShiftDefaults();
  renderShiftPreview();
}

function setHeaderProfile() {
  if (!state.currentStaff) return;
  const profile = getDriverProfile(state.currentStaff.staffKey);

  $("sidebarName").textContent = profile.fullName;
  $("sidebarRole").textContent = profile.role === "manager" ? "Manager / Driver" : "Driver";
  $("sidebarVehicle").textContent = getCarLabel(profile.defaultCarId) || profile.vehicle || "Sin coche por defecto";
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
    dashboardView: ["Dashboard", "Resumen en vivo de ingresos, combustible, gastos y neto"],
    shiftView: ["Nuevo turno", "El manager puede introducir datos en nombre de cualquier conductor"],
    historyView: ["Historial de turnos", "Buscar por fecha, driver o coche · 30 por página"],
    reportsView: ["Reportes", "Diario, semanal, mensual y anual con gráficos y PDF"],
    driversView: ["Drivers", "Crear nuevos, ver existentes, cambiar fotos y datos"],
    carsView: ["Cars", "Ver existentes, añadir nuevos y editar datos"],
  };

  $("pageTitle").textContent = titleMap[viewId][0];
  $("pageSubtitle").textContent = titleMap[viewId][1];
}

/* =========================================================
   SUBSCRIPTIONS
========================================================= */
function subscribeDriverProfiles() {
  state.unsubProfiles = onSnapshot(collection(db, "driverProfiles"), (snap) => {
    const next = {};
    snap.docs.forEach((d) => {
      next[d.id] = d.data();
    });
    state.driverProfiles = next;
    renderEverythingUsingProfiles();
  });
}

function subscribeCars() {
  state.unsubCars = onSnapshot(collection(db, "cars"), (snap) => {
    const next = {};
    snap.docs.forEach((d) => {
      next[d.id] = { id: d.id, ...d.data() };
    });
    state.cars = next;
    renderEverythingUsingCars();
  });
}

function subscribeShifts() {
  const shiftsRef = collection(db, "shifts");

  if (state.currentStaff.role === "manager") {
    const q = query(shiftsRef, where("managerKey", "==", "mudassar"));
    state.unsubShifts = onSnapshot(q, (snap) => {
      state.shifts = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(sortShiftsNewestFirst);
      renderAllShiftViews();
    });
    return;
  }

  const q = query(shiftsRef, where("driverKey", "==", state.currentStaff.staffKey));
  state.unsubShifts = onSnapshot(q, (snap) => {
    state.shifts = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(sortShiftsNewestFirst);
    renderAllShiftViews();
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

function renderEverythingUsingProfiles() {
  setHeaderProfile();
  populateDriverSelects();
  populateDriverCreationSelects();
  renderDriversView();
  renderHistoryFilters();
  renderReportDriverFilter();
  renderDashboard();
  renderReports();
  renderHistoryTable();
}

function renderEverythingUsingCars() {
  populateCarSelects();
  renderCarsView();
  renderHistoryTable();
  renderReports();
  setHeaderProfile();
}

function renderAllShiftViews() {
  renderDashboard();
  renderHistoryTable();
  renderReports();
}

/* =========================================================
   PROFILE + CARS GETTERS
========================================================= */
function getDriverProfile(staffKey) {
  const base = STAFF[staffKey] || {
    staffKey,
    fullName: staffKey,
    email: "",
    role: "driver",
    colorClass: "saqlain",
    colorHex: "#16a34a",
    managerKey: "mudassar",
    managerName: "MUDASSAR",
    canDrive: true,
  };
  const saved = state.driverProfiles[staffKey] || {};
  return {
    ...base,
    ...saved,
    staffKey,
  };
}

function getAllDriverProfiles() {
  return Object.keys(state.driverProfiles).length
    ? Object.values(state.driverProfiles).sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)))
    : Object.values(STAFF);
}

function getVisibleDriverProfiles() {
  if (!state.currentStaff) return [];
  if (state.currentStaff.role === "manager") return getAllDriverProfiles();
  return [getDriverProfile(state.currentStaff.staffKey)];
}

function getCarLabel(carId) {
  if (!carId || !state.cars[carId]) return "";
  const car = state.cars[carId];
  return [car.alias, car.plate].filter(Boolean).join(" · ");
}

function getVisibleCars() {
  const cars = Object.values(state.cars);
  return cars.sort((a, b) => String(a.alias || a.plate).localeCompare(String(b.alias || b.plate)));
}

function getProfileImageHtml(profile, size = "small") {
  const cls = size === "large" ? "profile-photo" : "mini-avatar";
  if (profile.photoUrl) {
    return `<img src="${escapeHtml(profile.photoUrl)}" alt="${escapeHtml(profile.fullName)}" class="${cls}" />`;
  }
  return `<div class="${cls} fallback">${escapeHtml(initials(profile.fullName))}</div>`;
}

function getDriverClass(profileOrKey) {
  const key = typeof profileOrKey === "string" ? profileOrKey : profileOrKey?.staffKey;
  const profile = getDriverProfile(key);
  if (profile.colorClass) return profile.colorClass;
  return key === "mudassar" ? "mudassar" : key === "shujaat" ? "shujaat" : "saqlain";
}

/* =========================================================
   FORMS POPULATION
========================================================= */
function populateDriverSelects() {
  const driverSelect = $("sfDriverKey");
  const reportDriver = $("reportDriverFilter");
  const historyDriver = $("historyDriverFilter");

  const profiles = getAllDriverProfiles().filter((p) => p.canDrive !== false);

  if (state.currentStaff.role === "manager") {
    show($("driverSelectWrap"));
  } else {
    hide($("driverSelectWrap"));
  }

  if (driverSelect) {
    driverSelect.innerHTML = profiles
      .map((profile) => `<option value="${escapeHtml(profile.staffKey)}">${escapeHtml(profile.fullName)}</option>`)
      .join("");
  }

  if (reportDriver) {
    if (state.currentStaff.role === "manager") {
      reportDriver.innerHTML = [`<option value="all">All</option>`]
        .concat(
          profiles.map((profile) => `<option value="${escapeHtml(profile.staffKey)}">${escapeHtml(profile.fullName)}</option>`)
        )
        .join("");
    } else {
      reportDriver.innerHTML = `<option value="${escapeHtml(state.currentStaff.staffKey)}">${escapeHtml(
        state.currentStaff.fullName
      )}</option>`;
    }
  }

  if (historyDriver) {
    if (state.currentStaff.role === "manager") {
      historyDriver.innerHTML = [`<option value="all">All</option>`]
        .concat(
          profiles.map((profile) => `<option value="${escapeHtml(profile.staffKey)}">${escapeHtml(profile.fullName)}</option>`)
        )
        .join("");
    } else {
      historyDriver.innerHTML = `<option value="${escapeHtml(state.currentStaff.staffKey)}">${escapeHtml(
        state.currentStaff.fullName
      )}</option>`;
    }
  }
}

function populateCarSelects() {
  const visibleCars = getVisibleCars();
  const shiftCar = $("sfCarId");
  const newDriverCar = $("newDriverCarId");

  const carOptions = [`<option value="">Sin coche</option>`]
    .concat(
      visibleCars.map((car) => `<option value="${escapeHtml(car.id)}">${escapeHtml(getCarLabel(car.id) || car.alias || car.plate)}</option>`)
    )
    .join("");

  if (shiftCar) shiftCar.innerHTML = carOptions;
  if (newDriverCar) newDriverCar.innerHTML = carOptions;
}

function populateDriverCreationSelects() {
  const carDriver = $("newCarDriverKey");
  if (!carDriver) return;
  const options = [`<option value="">Sin conductor</option>`]
    .concat(
      getAllDriverProfiles().map((profile) => `<option value="${escapeHtml(profile.staffKey)}">${escapeHtml(profile.fullName)}</option>`)
    )
    .join("");
  carDriver.innerHTML = options;
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
  ].forEach((id) => ($(id).value = "0"));

  if (state.currentStaff.role === "manager") {
    if (!$("sfDriverKey").value) $("sfDriverKey").value = "mudassar";
  }
  applyDriverDefaultsToShift();
}

function applyDriverDefaultsToShift() {
  const driverKey =
    state.currentStaff.role === "manager"
      ? $("sfDriverKey").value || "mudassar"
      : state.currentStaff.staffKey;

  const profile = getDriverProfile(driverKey);
  if (!profile) return;

  if (!$("sfCarId").dataset.userModified) {
    $("sfCarId").value = profile.defaultCarId || "";
  }
}

$("sfDriverKey")?.addEventListener("change", () => {
  applyDriverDefaultsToShift();
  renderShiftPreview();
});

$("sfCarId")?.addEventListener("change", () => {
  $("sfCarId").dataset.userModified = "true";
  renderShiftPreview();
});

/* =========================================================
   LIVE CALCULATIONS
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

function getShiftFormRaw() {
  return {
    dateKey: $("sfDate").value,
    carId: $("sfCarId").value,
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

function calculateShift(raw) {
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

  const totalFuel = num(raw.fuel1) + num(raw.fuel2) + num(raw.fuel3) + num(raw.fuelOther);

  const totalExpenses = num(raw.parking) + num(raw.tolls) + num(raw.cleaning) + num(raw.otherExpenses);

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

[
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
].forEach((id) => {
  $(id)?.addEventListener("input", renderShiftPreview);
  $(id)?.addEventListener("change", renderShiftPreview);
});

$("resetShiftBtn")?.addEventListener("click", () => {
  $("shiftForm").reset();
  $("sfCarId").dataset.userModified = "";
  setShiftDefaults();
  renderShiftPreview();
});

function renderShiftPreview() {
  const raw = getShiftFormRaw();
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
    statCard("Horas", calc.workedHours.toFixed(2), `${calc.workedMinutes} min`),
    statCard("KM", calc.totalKm.toFixed(1), "Input directo"),
    statCard("Ingresos", money(calc.totalIncome), "Total"),
    statCard("Fuel", money(calc.totalFuel), "Combustible"),
    statCard("Spending", money(calc.totalSpending), "Fuel + gastos + mantenimiento"),
    statCard("Neto", money(calc.netProfit), "Final"),
    statCard("KM/€", calc.kmPerEuro.toFixed(3), "Promedio"),
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
    showToast("Turno guardado.");

    $("shiftForm").reset();
    $("sfCarId").dataset.userModified = "";
    setShiftDefaults();
    renderShiftPreview();

    openView("historyView");
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    document.querySelector('[data-view="historyView"]').classList.add("active");
  } catch (error) {
    console.error(error);
    showToast(error.message || "No se pudo guardar el turno.");
  }
});

function buildShiftPayload() {
  const selectedDriverKey =
    state.currentStaff.role === "manager"
      ? $("sfDriverKey").value
      : state.currentStaff.staffKey;

  const driver = getDriverProfile(selectedDriverKey);
  if (!driver) throw new Error("Conductor no válido.");

  const raw = getShiftFormRaw();
  if (!raw.dateKey) throw new Error("La fecha es obligatoria.");
  if (!raw.startTime || !raw.endTime) throw new Error("Las horas son obligatorias.");
  if (num(raw.km) < 0) throw new Error("KM no puede ser negativo.");

  const calc = calculateShift(raw);
  const car = state.cars[raw.carId] || null;

  return {
    driverKey: driver.staffKey,
    driverName: driver.fullName,
    driverColorClass: getDriverClass(driver),
    carId: raw.carId || "",
    vehicle: car ? getCarLabel(car.id) : "",
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
   SUMMARY HELPERS
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
  const summary = rows.reduce(
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

  summary.kmPerEuro = safeDiv(summary.totalKm, summary.totalIncome);
  return summary;
}

function groupRowsBy(rows, keyFn) {
  return rows.reduce((acc, row) => {
    const key = keyFn(row);
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
}

function getBestDay(rows) {
  const groups = groupRowsBy(rows, (row) => row.dateKey);
  const list = Object.entries(groups).map(([key, dayRows]) => ({
    key,
    summary: summarizeRows(dayRows),
  }));
  list.sort((a, b) => b.summary.totalIncome - a.summary.totalIncome);
  return list[0] || null;
}

function getWorstDay(rows) {
  const groups = groupRowsBy(rows, (row) => row.dateKey);
  const list = Object.entries(groups).map(([key, dayRows]) => ({
    key,
    summary: summarizeRows(dayRows),
  }));
  list.sort((a, b) => a.summary.totalIncome - b.summary.totalIncome);
  return list[0] || null;
}

function getHighestFuelDay(rows) {
  const groups = groupRowsBy(rows, (row) => row.dateKey);
  const list = Object.entries(groups).map(([key, dayRows]) => ({
    key,
    summary: summarizeRows(dayRows),
  }));
  list.sort((a, b) => b.summary.totalFuel - a.summary.totalFuel);
  return list[0] || null;
}

function getBestDriver(rows) {
  const groups = groupRowsBy(rows, (row) => row.driverKey);
  const list = Object.entries(groups).map(([driverKey, driverRows]) => ({
    profile: getDriverProfile(driverKey),
    summary: summarizeRows(driverRows),
  }));
  list.sort((a, b) => b.summary.totalIncome - a.summary.totalIncome);
  return list[0] || null;
}

function getPeakHour(rows) {
  const buckets = new Array(24).fill(0);

  rows.forEach((row) => {
    const startHour = getHour(row.startTime);
    const endHour = getHour(row.endTime);
    if (startHour === null || endHour === null) return;

    const covered = buildCoveredHours(startHour, endHour);
    const allocated = safeDiv(num(row.totalIncome), covered.length || 1);
    covered.forEach((hour) => {
      buckets[hour] += allocated;
    });
  });

  let bestHour = null;
  let bestAmount = 0;
  buckets.forEach((amount, hour) => {
    if (amount > bestAmount) {
      bestAmount = amount;
      bestHour = hour;
    }
  });

  if (bestHour === null) return null;
  return { hour: bestHour, amount: bestAmount };
}

function getHour(timeStr) {
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
    statCard("Ingresos hoy", money(today.totalIncome), `${today.count} turnos`),
    statCard("Fuel hoy", money(today.totalFuel), "Solo combustible"),
    statCard("Spending hoy", money(today.totalSpending), "Total gasto"),
    statCard("Neto hoy", money(today.netProfit), "Resultado final"),
    statCard("Ingresos semana", money(week.totalIncome), `${week.totalKm.toFixed(1)} km`),
    statCard("Ingresos mes", money(month.totalIncome), `${month.totalHours.toFixed(1)} h`),
    statCard("Ingresos año", money(year.totalIncome), `${year.count} turnos`),
    statCard("KM/€ hoy", today.kmPerEuro.toFixed(3), "Promedio"),
  ].join("");

  $("todayIncomeSources").innerHTML = [
    statCard("Taxímetro", money(today.totalTaximetro), "Cash + card"),
    statCard("Cabify", money(today.totalCabify), "Cash + app"),
    statCard("Free Now", money(today.totalFreeNow), "Cash + app"),
    statCard("Uber", money(today.totalUber), "App only"),
  ].join("");

  $("todaySpendingSources").innerHTML = [
    statCard("Fuel", money(today.totalFuel), "Combustible"),
    statCard("Gastos", money(today.totalExpenses), "Operativo"),
    statCard("Mantenimiento", money(today.totalMaintenance), "Servicio"),
    statCard("Neto", money(today.netProfit), "Final"),
  ].join("");

  renderTopDriversList();
  renderPeakAnalyticsList();
  renderDashboardCharts(todayRows, weekRows, monthRows);
}

function renderTopDriversList() {
  const groups = groupRowsBy(state.shifts, (row) => row.driverKey);
  const list = Object.entries(groups)
    .map(([driverKey, rows]) => ({
      profile: getDriverProfile(driverKey),
      summary: summarizeRows(rows),
    }))
    .sort((a, b) => b.summary.totalIncome - a.summary.totalIncome)
    .slice(0, 6);

  $("topDriversList").innerHTML = list.length
    ? list.map(({ profile, summary }) => `
        <div class="stack-row">
          <div class="stack-row-left">
            <div class="driver-line ${escapeHtml(getDriverClass(profile))}"></div>
            ${getProfileImageHtml(profile, "small")}
            <div>
              <strong>${escapeHtml(profile.fullName)}</strong>
              <div class="muted">${summary.count} turnos • ${summary.totalKm.toFixed(1)} km</div>
            </div>
          </div>
          <div>
            <strong>${money(summary.totalIncome)}</strong>
            <div class="muted">Neto ${money(summary.netProfit)}</div>
          </div>
        </div>
      `).join("")
    : `<div class="center-empty">No hay turnos aún.</div>`;
}

function renderPeakAnalyticsList() {
  const bestDay = getBestDay(state.shifts);
  const peakHour = getPeakHour(state.shifts);
  const highestFuelDay = getHighestFuelDay(state.shifts);
  const worstDay = getWorstDay(state.shifts);

  const items = [
    {
      title: "Mejor día",
      value: bestDay ? `${bestDay.key} · ${money(bestDay.summary.totalIncome)}` : "—",
      sub: bestDay ? `${bestDay.summary.count} turnos` : "Sin datos",
    },
    {
      title: "Hora pico",
      value: peakHour ? `${formatHourLabel(peakHour.hour)} · ${money(peakHour.amount)}` : "—",
      sub: peakHour ? "Estimación por bloques de hora" : "Sin datos",
    },
    {
      title: "Día con más fuel",
      value: highestFuelDay ? `${highestFuelDay.key} · ${money(highestFuelDay.summary.totalFuel)}` : "—",
      sub: highestFuelDay ? "Combustible total" : "Sin datos",
    },
    {
      title: "Peor día",
      value: worstDay ? `${worstDay.key} · ${money(worstDay.summary.totalIncome)}` : "—",
      sub: worstDay ? "Por ingresos" : "Sin datos",
    },
  ];

  $("peakAnalyticsList").innerHTML = items.map((item) => `
    <div class="stack-row">
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <div class="muted">${escapeHtml(item.sub)}</div>
      </div>
      <div><strong>${escapeHtml(item.value)}</strong></div>
    </div>
  `).join("");
}

function renderDashboardCharts(todayRows, weekRows, monthRows) {
  const incomeData = buildDailySeries(monthRows);
  const spendingData = buildDailySeries(monthRows, "spending");

  renderChart("incomeChart", {
    type: "line",
    data: {
      labels: incomeData.labels,
      datasets: [
        {
          label: "Ingresos",
          data: incomeData.values,
          tension: 0.3,
          fill: false,
        },
      ],
    },
    options: chartOptions("Ingresos por día"),
  });

  renderChart("spendingChart", {
    type: "bar",
    data: {
      labels: spendingData.labels,
      datasets: [
        {
          label: "Fuel",
          data: spendingData.fuelValues,
        },
        {
          label: "Spending",
          data: spendingData.spendingValues,
        },
      ],
    },
    options: chartOptions("Fuel y spending por día"),
  });
}

function buildDailySeries(rows, mode = "income") {
  const grouped = groupRowsBy(rows, (row) => row.dateKey);
  const entries = Object.entries(grouped)
    .map(([dateKey, dateRows]) => ({
      dateKey,
      summary: summarizeRows(dateRows),
    }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  return {
    labels: entries.map((e) => e.dateKey),
    values: entries.map((e) => e.summary.totalIncome),
    fuelValues: entries.map((e) => e.summary.totalFuel),
    spendingValues: entries.map((e) => e.summary.totalSpending),
  };
}

function chartOptions(title) {
  const dark = document.body.getAttribute("data-theme") === "dark";
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: dark ? "#f8fafc" : "#101828",
        },
      },
      title: {
        display: false,
        text: title,
      },
    },
    scales: {
      x: {
        ticks: {
          color: dark ? "#98a2b3" : "#667085",
        },
        grid: {
          color: dark ? "rgba(255,255,255,0.08)" : "rgba(16,24,40,0.08)",
        },
      },
      y: {
        ticks: {
          color: dark ? "#98a2b3" : "#667085",
        },
        grid: {
          color: dark ? "rgba(255,255,255,0.08)" : "rgba(16,24,40,0.08)",
        },
      },
    },
  };
}

function renderChart(canvasId, config) {
  const canvas = $(canvasId);
  if (!canvas || !window.Chart) return;

  if (state.charts[canvasId]) {
    state.charts[canvasId].destroy();
  }

  state.charts[canvasId] = new window.Chart(canvas, config);
}

/* =========================================================
   HISTORY
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
    const carLabel = row.carId ? getCarLabel(row.carId) : row.vehicle || "";
    const searchTarget = [
      row.driverName,
      row.vehicle,
      carLabel,
      row.notes,
      row.dateKey,
      row.managerName,
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch = !searchText || searchTarget.includes(searchText);
    const matchesDate = !dateFilter || row.dateKey === dateFilter;
    const matchesDriver = !driverFilter || driverFilter === "all" || row.driverKey === driverFilter;
    const matchesCar = !carFilter || carLabel.toLowerCase().includes(carFilter);

    return matchesSearch && matchesDate && matchesDriver && matchesCar;
  });
}

function getHistoryTotalPages() {
  return Math.max(1, Math.ceil(getFilteredHistoryRows().length / HISTORY_PAGE_SIZE));
}

function renderHistoryTable() {
  const filtered = getFilteredHistoryRows();
  const totalPages = Math.max(1, Math.ceil(filtered.length / HISTORY_PAGE_SIZE));
  if (state.historyPage > totalPages) state.historyPage = totalPages;

  const start = (state.historyPage - 1) * HISTORY_PAGE_SIZE;
  const rows = filtered.slice(start, start + HISTORY_PAGE_SIZE);

  $("historyResultsCount").textContent = `${filtered.length} resultados`;
  $("historyCurrentPageInfo").textContent = `Page ${state.historyPage}`;
  $("historyPaginationInfo").textContent = `Page ${state.historyPage} of ${totalPages}`;

  $("historyPrevBtn").disabled = state.historyPage <= 1;
  $("historyNextBtn").disabled = state.historyPage >= totalPages;

  if (!rows.length) {
    $("historyTableBody").innerHTML = `
      <tr>
        <td colspan="9"><div class="center-empty">No se encontraron turnos.</div></td>
      </tr>
    `;
    return;
  }

  $("historyTableBody").innerHTML = rows.map((row) => {
    const profile = getDriverProfile(row.driverKey);
    const driverClass = getDriverClass(profile);
    const carLabel = row.carId ? getCarLabel(row.carId) : row.vehicle || "-";

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
        <td>${escapeHtml(carLabel)}</td>
        <td>${num(row.workedHours).toFixed(2)}</td>
        <td>${num(row.km).toFixed(1)}</td>
        <td class="income-positive">${money(row.totalIncome)}</td>
        <td class="warning-text">${money(row.totalFuel)}</td>
        <td class="spending-negative">${money(row.totalSpending)}</td>
        <td class="${num(row.netProfit) >= 0 ? "income-positive" : "spending-negative"}">${money(row.netProfit)}</td>
      </tr>
    `;
  }).join("");
}

/* =========================================================
   REPORTS
========================================================= */
$("reportRange")?.addEventListener("change", renderReports);
$("reportDriverFilter")?.addEventListener("change", renderReports);
$("reportCarFilter")?.addEventListener("input", renderReports);

function getReportRows() {
  const range = $("reportRange").value;
  const driverKey = state.currentStaff.role === "manager"
    ? $("reportDriverFilter").value
    : state.currentStaff.staffKey;
  const carFilter = $("reportCarFilter").value.trim().toLowerCase();

  let rows = filterRowsByRange(state.shifts, range);

  if (driverKey && driverKey !== "all") {
    rows = rows.filter((row) => row.driverKey === driverKey);
  }

  if (carFilter) {
    rows = rows.filter((row) => {
      const label = row.carId ? getCarLabel(row.carId) : row.vehicle || "";
      return label.toLowerCase().includes(carFilter);
    });
  }

  return rows;
}

function renderReports() {
  const rows = getReportRows();
  const summary = summarizeRows(rows);

  $("reportStats").innerHTML = [
    statCard("Ingresos", money(summary.totalIncome), `${summary.count} turnos`),
    statCard("Fuel", money(summary.totalFuel), "Separado"),
    statCard("Spending", money(summary.totalSpending), "Todo gasto"),
    statCard("Neto", money(summary.netProfit), "Resultado final"),
    statCard("KM", summary.totalKm.toFixed(1), "Input directo"),
    statCard("KM/€", summary.kmPerEuro.toFixed(3), "Promedio"),
    statCard("Horas", summary.totalHours.toFixed(2), "Trabajadas"),
    statCard("Apps", money(summary.totalApps), "Cabify + Free Now + Uber"),
  ].join("");

  renderReportPeakList(rows);
  renderReportBreakdownList(summary);
  renderDailyReportList(rows);
  renderPeriodReportList(rows, summary);
  renderReportCharts(rows, summary);
}

function renderReportPeakList(rows) {
  const bestDay = getBestDay(rows);
  const peakHour = getPeakHour(rows);
  const highestFuelDay = getHighestFuelDay(rows);
  const worstDay = getWorstDay(rows);

  const items = [
    {
      title: "Peak day",
      value: bestDay ? `${bestDay.key} · ${money(bestDay.summary.totalIncome)}` : "—",
      sub: bestDay ? `${bestDay.summary.count} turnos` : "Sin datos",
    },
    {
      title: "Peak hour",
      value: peakHour ? `${formatHourLabel(peakHour.hour)} · ${money(peakHour.amount)}` : "—",
      sub: peakHour ? "Estimación" : "Sin datos",
    },
    {
      title: "Highest fuel day",
      value: highestFuelDay ? `${highestFuelDay.key} · ${money(highestFuelDay.summary.totalFuel)}` : "—",
      sub: highestFuelDay ? "Fuel total" : "Sin datos",
    },
    {
      title: "Worst day",
      value: worstDay ? `${worstDay.key} · ${money(worstDay.summary.totalIncome)}` : "—",
      sub: worstDay ? "Por ingresos" : "Sin datos",
    },
  ];

  $("reportPeakList").innerHTML = items.map((item) => `
    <div class="stack-row">
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <div class="muted">${escapeHtml(item.sub)}</div>
      </div>
      <div><strong>${escapeHtml(item.value)}</strong></div>
    </div>
  `).join("");
}

function renderReportBreakdownList(summary) {
  const items = [
    ["Taxímetro", money(summary.totalTaximetro), "Cash + tarjeta"],
    ["Cabify", money(summary.totalCabify), "Efectivo + app"],
    ["Free Now", money(summary.totalFreeNow), "Efectivo + app"],
    ["Uber", money(summary.totalUber), "App solo"],
    ["Fuel", money(summary.totalFuel), "Combustible"],
    ["Gastos", money(summary.totalExpenses), "Operativo"],
    ["Mantenimiento", money(summary.totalMaintenance), "Servicio"],
    ["KM/€", summary.kmPerEuro.toFixed(3), "Promedio"],
  ];

  $("reportBreakdownList").innerHTML = items.map(([title, value, sub]) => `
    <div class="stack-row">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <div class="muted">${escapeHtml(sub)}</div>
      </div>
      <div><strong>${escapeHtml(value)}</strong></div>
    </div>
  `).join("");
}

function renderDailyReportList(rows) {
  const groups = groupRowsBy(rows, (row) => row.dateKey);
  const days = Object.entries(groups)
    .map(([key, dayRows]) => ({
      key,
      summary: summarizeRows(dayRows),
    }))
    .sort((a, b) => b.key.localeCompare(a.key))
    .slice(0, 12);

  $("dailyReportList").innerHTML = days.length
    ? days.map((day) => `
        <div class="stack-row">
          <div>
            <strong>${escapeHtml(day.key)}</strong>
            <div class="muted">${day.summary.count} turnos • ${day.summary.totalKm.toFixed(1)} km</div>
          </div>
          <div>
            <strong>${money(day.summary.totalIncome)}</strong>
            <div class="muted">Fuel ${money(day.summary.totalFuel)} · Neto ${money(day.summary.netProfit)}</div>
          </div>
        </div>
      `).join("")
    : `<div class="center-empty">No hay datos de reporte.</div>`;
}

function renderPeriodReportList(rows, summary) {
  const bestDriver = getBestDriver(rows);
  const items = [
    ["Ingreso medio por turno", money(safeDiv(summary.totalIncome, summary.count)), `${summary.count} turnos`],
    ["Fuel medio por turno", money(safeDiv(summary.totalFuel, summary.count)), "Por turno"],
    ["Neto medio por turno", money(safeDiv(summary.netProfit, summary.count)), "Por turno"],
    ["Mejor conductor", bestDriver ? bestDriver.profile.fullName : "—", bestDriver ? money(bestDriver.summary.totalIncome) : "Sin datos"],
  ];

  $("periodReportList").innerHTML = items.map(([title, value, sub]) => `
    <div class="stack-row">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <div class="muted">${escapeHtml(sub)}</div>
      </div>
      <div><strong>${escapeHtml(value)}</strong></div>
    </div>
  `).join("");
}

function renderReportCharts(rows, summary) {
  const daily = buildDailySeries(rows);
  renderChart("reportChart", {
    type: "line",
    data: {
      labels: daily.labels,
      datasets: [
        { label: "Ingresos", data: daily.income },
        { label: "Fuel", data: daily.fuel },
        { label: "Neto", data: daily.net },
      ],
    },
    options: chartOptions("Reporte"),
  });

  renderChart("appBreakdownChart", {
    type: "doughnut",
    data: {
      labels: ["Taxímetro", "Cabify", "Free Now", "Uber"],
      datasets: [
        {
          data: [
            summary.totalTaximetro,
            summary.totalCabify,
            summary.totalFreeNow,
            summary.totalUber,
          ],
        },
      ],
    },
    options: chartOptions("Apps"),
  });
}

function buildDailySeries(rows) {
  const groups = groupRowsBy(rows, (row) => row.dateKey);
  const entries = Object.entries(groups)
    .map(([dateKey, dateRows]) => ({
      dateKey,
      summary: summarizeRows(dateRows),
    }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  return {
    labels: entries.map((e) => e.dateKey),
    income: entries.map((e) => e.summary.totalIncome),
    fuel: entries.map((e) => e.summary.totalFuel),
    net: entries.map((e) => e.summary.netProfit),
  };
}

/* =========================================================
   DRIVERS CRUD
========================================================= */
$("createDriverBtn")?.addEventListener("click", async () => {
  if (state.currentStaff?.role !== "manager") {
    showToast("Solo manager puede crear drivers.");
    return;
  }

  const fullName = $("newDriverName").value.trim();
  const email = $("newDriverEmail").value.trim().toLowerCase();
  const pin = $("newDriverPin").value.trim();
  const phone = $("newDriverPhone").value.trim();
  const colorHex = $("newDriverColor").value || "#16a34a";
  const alias = sanitizeAlias($("newDriverAlias").value.trim() || fullName);
  const defaultCarId = $("newDriverCarId").value || "";

  if (!fullName || !alias) {
    showToast("Nombre y alias son obligatorios.");
    return;
  }

  if (state.driverProfiles[alias]) {
    showToast("Ese alias ya existe.");
    return;
  }

  try {
    await setDoc(doc(db, "driverProfiles", alias), {
      staffKey: alias,
      fullName,
      email,
      pinHint: "",
      rawPinForManagerUseOnly: pin,
      role: "driver",
      managerKey: "mudassar",
      managerName: "MUDASSAR",
      colorClass: pickColorClassFromHex(colorHex),
      colorHex,
      vehicle: "",
      phone,
      photoUrl: "",
      photoPath: "",
      defaultCarId,
      canDrive: true,
      isLoginEnabled: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    $("newDriverForm").reset();
    $("newDriverColor").value = "#16a34a";
    showToast("Driver creado. Para login real, crea también el usuario en Firebase Auth.");
  } catch (error) {
    console.error(error);
    showToast("No se pudo crear el driver.");
  }
});

function renderDriversView() {
  const drivers = getVisibleDriverProfiles();

  $("driversStats").innerHTML = [
    statCard("Drivers visibles", String(drivers.length), "Total"),
    statCard("Con foto", String(drivers.filter((d) => !!d.photoUrl).length), "Perfil"),
    statCard("Con coche por defecto", String(drivers.filter((d) => !!d.defaultCarId).length), "Asignados"),
  ].join("");

  $("driversGrid").innerHTML = drivers.map((driver) => renderDriverCard(driver)).join("");
  attachDriverCardEvents();
}

function renderDriverCard(driver) {
  const editable = state.currentStaff.role === "manager" || state.currentStaff.staffKey === driver.staffKey;
  return `
    <div class="card profile-card">
      <div class="profile-color-bar ${escapeHtml(getDriverClass(driver))}"></div>

      <div class="profile-card-head">
        ${getProfileImageHtml(driver, "large")}
        <div>
          <div class="profile-name">${escapeHtml(driver.fullName)}</div>
          <div class="profile-role">${escapeHtml(driver.role === "manager" ? "Manager / Driver" : "Driver")}</div>
          <div class="driver-badge ${escapeHtml(getDriverClass(driver))}">${escapeHtml(driver.fullName)}</div>
        </div>
      </div>

      <div class="profile-meta-list">
        <div>Email: ${escapeHtml(driver.email || "-")}</div>
        <div>Alias: ${escapeHtml(driver.staffKey)}</div>
        <div>Login Firebase: ${driver.isLoginEnabled ? "Sí" : "No"}</div>
      </div>

      <div class="grid-2">
        <label>
          <span>Teléfono</span>
          <input data-driver-phone="${escapeHtml(driver.staffKey)}" type="text" value="${escapeHtml(driver.phone || "")}" ${editable ? "" : "disabled"} />
        </label>

        <label>
          <span>Coche por defecto</span>
          <select data-driver-car="${escapeHtml(driver.staffKey)}" ${editable ? "" : "disabled"}>
            ${buildCarOptions(driver.defaultCarId || "")}
          </select>
        </label>

        <label>
          <span>Color</span>
          <input data-driver-color="${escapeHtml(driver.staffKey)}" type="color" value="${escapeHtml(driver.colorHex || "#16a34a")}" ${editable ? "" : "disabled"} />
        </label>

        <label>
          <span>Nombre</span>
          <input data-driver-name="${escapeHtml(driver.staffKey)}" type="text" value="${escapeHtml(driver.fullName || "")}" ${editable ? "" : "disabled"} />
        </label>
      </div>

      <div class="profile-actions">
        ${editable ? `
          <button class="secondary-btn" type="button" data-edit-photo="${escapeHtml(driver.staffKey)}">Foto</button>
          <button class="primary-btn" type="button" data-save-driver="${escapeHtml(driver.staffKey)}">Guardar</button>
        ` : ""}
      </div>
    </div>
  `;
}

function attachDriverCardEvents() {
  document.querySelectorAll("[data-edit-photo]").forEach((btn) => {
    btn.onclick = () => openPhotoModal(btn.getAttribute("data-edit-photo"));
  });

  document.querySelectorAll("[data-save-driver]").forEach((btn) => {
    btn.onclick = async () => {
      const staffKey = btn.getAttribute("data-save-driver");
      await saveDriverProfile(staffKey);
    };
  });
}

async function saveDriverProfile(staffKey) {
  try {
    const current = getDriverProfile(staffKey);
    const fullName = document.querySelector(`[data-driver-name="${staffKey}"]`)?.value?.trim() || current.fullName;
    const phone = document.querySelector(`[data-driver-phone="${staffKey}"]`)?.value?.trim() || "";
    const defaultCarId = document.querySelector(`[data-driver-car="${staffKey}"]`)?.value || "";
    const colorHex = document.querySelector(`[data-driver-color="${staffKey}"]`)?.value || current.colorHex || "#16a34a";

    await setDoc(
      doc(db, "driverProfiles", staffKey),
      {
        fullName,
        phone,
        defaultCarId,
        colorHex,
        colorClass: pickColorClassFromHex(colorHex, staffKey),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    showToast("Driver actualizado.");
  } catch (error) {
    console.error(error);
    showToast("No se pudo guardar el driver.");
  }
}

/* =========================================================
   CARS CRUD
========================================================= */
$("createCarBtn")?.addEventListener("click", async () => {
  if (state.currentStaff?.role !== "manager") {
    showToast("Solo manager puede crear coches.");
    return;
  }

  const plate = $("newCarPlate").value.trim().toUpperCase();
  const model = $("newCarModel").value.trim();
  const alias = $("newCarAlias").value.trim();
  const status = $("newCarStatus").value;
  const currentKm = num($("newCarKm").value);
  const defaultDriverKey = $("newCarDriverKey").value || "";
  const itvDate = $("newCarItv").value || "";
  const insuranceDate = $("newCarInsurance").value || "";
  const notes = $("newCarNotes").value.trim();

  if (!plate && !alias) {
    showToast("Matrícula o alias obligatorios.");
    return;
  }

  try {
    await addDoc(collection(db, "cars"), {
      plate,
      model,
      alias,
      status,
      currentKm,
      defaultDriverKey,
      itvDate,
      insuranceDate,
      notes,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    $("newCarForm").reset();
    $("newCarStatus").value = "active";
    showToast("Coche creado.");
  } catch (error) {
    console.error(error);
    showToast("No se pudo crear el coche.");
  }
});

function renderCarsView() {
  const cars = getVisibleCars();

  $("carsStats").innerHTML = [
    statCard("Coches", String(cars.length), "Total"),
    statCard("Activos", String(cars.filter((c) => c.status === "active").length), "Disponibles"),
    statCard("Taller", String(cars.filter((c) => c.status === "workshop").length), "Fuera de servicio"),
  ].join("");

  $("carsGrid").innerHTML = cars.map((car) => renderCarCard(car)).join("");
  attachCarCardEvents();
}

function renderCarCard(car) {
  const editable = state.currentStaff.role === "manager";
  return `
    <div class="card car-card">
      <div class="card-head">
        <div>
          <h3>${escapeHtml(car.alias || car.plate || "Coche")}</h3>
          <p class="muted">${escapeHtml(car.model || "")}</p>
        </div>
        <div class="car-status ${escapeHtml(car.status || "inactive")}">${escapeHtml(car.status || "inactive")}</div>
      </div>

      <div class="grid-2">
        <label>
          <span>Matrícula</span>
          <input data-car-plate="${escapeHtml(car.id)}" type="text" value="${escapeHtml(car.plate || "")}" ${editable ? "" : "disabled"} />
        </label>
        <label>
          <span>Alias</span>
          <input data-car-alias="${escapeHtml(car.id)}" type="text" value="${escapeHtml(car.alias || "")}" ${editable ? "" : "disabled"} />
        </label>
        <label>
          <span>Modelo</span>
          <input data-car-model="${escapeHtml(car.id)}" type="text" value="${escapeHtml(car.model || "")}" ${editable ? "" : "disabled"} />
        </label>
        <label>
          <span>Estado</span>
          <select data-car-status="${escapeHtml(car.id)}" ${editable ? "" : "disabled"}>
            <option value="active" ${car.status === "active" ? "selected" : ""}>Activo</option>
            <option value="workshop" ${car.status === "workshop" ? "selected" : ""}>Taller</option>
            <option value="inactive" ${car.status === "inactive" ? "selected" : ""}>Inactivo</option>
          </select>
        </label>
        <label>
          <span>KM actual</span>
          <input data-car-km="${escapeHtml(car.id)}" type="number" step="0.1" min="0" value="${escapeHtml(String(car.currentKm ?? 0))}" ${editable ? "" : "disabled"} />
        </label>
        <label>
          <span>Driver por defecto</span>
          <select data-car-driver="${escapeHtml(car.id)}" ${editable ? "" : "disabled"}>
            ${buildDriverOptions(car.defaultDriverKey || "")}
          </select>
        </label>
        <label>
          <span>ITV</span>
          <input data-car-itv="${escapeHtml(car.id)}" type="date" value="${escapeHtml(car.itvDate || "")}" ${editable ? "" : "disabled"} />
        </label>
        <label>
          <span>Seguro</span>
          <input data-car-insurance="${escapeHtml(car.id)}" type="date" value="${escapeHtml(car.insuranceDate || "")}" ${editable ? "" : "disabled"} />
        </label>
      </div>

      <label>
        <span>Notas</span>
        <input data-car-notes="${escapeHtml(car.id)}" type="text" value="${escapeHtml(car.notes || "")}" ${editable ? "" : "disabled"} />
      </label>

      ${editable ? `
        <div class="profile-actions">
          <button class="primary-btn" type="button" data-save-car="${escapeHtml(car.id)}">Guardar coche</button>
        </div>
      ` : ""}
    </div>
  `;
}

function attachCarCardEvents() {
  document.querySelectorAll("[data-save-car]").forEach((btn) => {
    btn.onclick = async () => {
      const carId = btn.getAttribute("data-save-car");
      await saveCar(carId);
    };
  });
}

async function saveCar(carId) {
  try {
    await setDoc(
      doc(db, "cars", carId),
      {
        plate: document.querySelector(`[data-car-plate="${carId}"]`)?.value?.trim().toUpperCase() || "",
        alias: document.querySelector(`[data-car-alias="${carId}"]`)?.value?.trim() || "",
        model: document.querySelector(`[data-car-model="${carId}"]`)?.value?.trim() || "",
        status: document.querySelector(`[data-car-status="${carId}"]`)?.value || "inactive",
        currentKm: num(document.querySelector(`[data-car-km="${carId}"]`)?.value),
        defaultDriverKey: document.querySelector(`[data-car-driver="${carId}"]`)?.value || "",
        itvDate: document.querySelector(`[data-car-itv="${carId}"]`)?.value || "",
        insuranceDate: document.querySelector(`[data-car-insurance="${carId}"]`)?.value || "",
        notes: document.querySelector(`[data-car-notes="${carId}"]`)?.value?.trim() || "",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    showToast("Coche actualizado.");
  } catch (error) {
    console.error(error);
    showToast("No se pudo actualizar el coche.");
  }
}

function buildCarOptions(selectedId = "") {
  return [`<option value="">Sin coche</option>`]
    .concat(
      getVisibleCars().map((car) => {
        const selected = car.id === selectedId ? "selected" : "";
        return `<option value="${escapeHtml(car.id)}" ${selected}>${escapeHtml(getCarLabel(car.id) || car.alias || car.plate)}</option>`;
      })
    )
    .join("");
}

function buildDriverOptions(selectedKey = "") {
  return [`<option value="">Sin conductor</option>`]
    .concat(
      getAllDriverProfiles().map((profile) => {
        const selected = profile.staffKey === selectedKey ? "selected" : "";
        return `<option value="${escapeHtml(profile.staffKey)}" ${selected}>${escapeHtml(profile.fullName)}</option>`;
      })
    )
    .join("");
}

function sanitizeAlias(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function pickColorClassFromHex(hex, staffKey = "") {
  if (staffKey === "mudassar" || hex.toLowerCase() === "#1d4ed8") return "mudassar";
  if (staffKey === "shujaat" || hex.toLowerCase() === "#ea580c") return "shujaat";
  return "saqlain";
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

  state.photoModalTarget = staffKey;
  state.pendingPhotoFile = null;
  revokePendingPreview();

  $("photoModalTitle").textContent = `${profile.fullName} — Foto`;
  if (profile.photoUrl) {
    $("photoPreviewImg").src = profile.photoUrl;
    show($("photoPreviewImg"));
    hide($("photoPreviewAvatar"));
  } else {
    hide($("photoPreviewImg"));
    $("photoPreviewAvatar").textContent = initials(profile.fullName);
    show($("photoPreviewAvatar"));
  }

  $("driverPhotoUploadInput").value = "";
  $("driverPhotoCameraInput").value = "";
  show($("photoModal"));
  $("photoModal").setAttribute("aria-hidden", "false");
}

function closePhotoModal() {
  revokePendingPreview();
  state.photoModalTarget = null;
  state.pendingPhotoFile = null;
  $("driverPhotoUploadInput").value = "";
  $("driverPhotoCameraInput").value = "";
  hide($("photoModal"));
  $("photoModal").setAttribute("aria-hidden", "true");
}

function revokePendingPreview() {
  if (state.pendingPhotoPreviewUrl) {
    URL.revokeObjectURL(state.pendingPhotoPreviewUrl);
    state.pendingPhotoPreviewUrl = "";
  }
}

function handleSelectedPhotoFile(file) {
  if (!file || !state.photoModalTarget) return;
  state.pendingPhotoFile = file;
  revokePendingPreview();
  state.pendingPhotoPreviewUrl = URL.createObjectURL(file);
  $("photoPreviewImg").src = state.pendingPhotoPreviewUrl;
  show($("photoPreviewImg"));
  hide($("photoPreviewAvatar"));
}

async function saveDriverPhoto() {
  if (!state.photoModalTarget || !state.pendingPhotoFile) {
    showToast("Selecciona una foto primero.");
    return;
  }

  try {
    const profile = getDriverProfile(state.photoModalTarget);
    if (!profile) throw new Error("Perfil no encontrado.");

    if (profile.photoPath) {
      try {
        await deleteObject(storageRef(storage, profile.photoPath));
      } catch (err) {
        console.warn("No se pudo borrar la foto anterior:", err);
      }
    }

    const ext = getFileExtension(state.pendingPhotoFile.name || "jpg");
    const path = `driverPhotos/${profile.staffKey}/photo_${Date.now()}.${ext}`;
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

    showToast("Foto guardada.");
    closePhotoModal();
  } catch (error) {
    console.error(error);
    showToast("No se pudo guardar la foto.");
  }
}

async function removeDriverPhoto() {
  if (!state.photoModalTarget) return;
  try {
    const profile = getDriverProfile(state.photoModalTarget);
    if (!profile) throw new Error("Perfil no encontrado.");

    if (profile.photoPath) {
      try {
        await deleteObject(storageRef(storage, profile.photoPath));
      } catch (err) {
        console.warn("No se pudo borrar en storage:", err);
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

    showToast("Foto eliminada.");
    closePhotoModal();
  } catch (error) {
    console.error(error);
    showToast("No se pudo eliminar la foto.");
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
  try {
    await exportCurrentReportPdf();
  } catch (error) {
    console.error(error);
    showToast("No se pudo exportar el PDF.");
  }
});

async function exportCurrentReportPdf() {
  if (!window.jspdf?.jsPDF) {
    showToast("jsPDF no está cargado.");
    return;
  }

  const rows = getReportRows();
  const summary = summarizeRows(rows);
  const range = $("reportRange").value;
  const driverKey =
    state.currentStaff.role === "manager"
      ? $("reportDriverFilter").value
      : state.currentStaff.staffKey;

  const carFilter = $("reportCarFilter").value.trim();
  const selectedProfile = driverKey && driverKey !== "all" ? getDriverProfile(driverKey) : null;

  const jsPDF = window.jspdf.jsPDF;
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
  pdf.text(`Generado: ${dateTimeLabel()}`, margin, y);
  y += 6;
  pdf.text(`Periodo: ${range.toUpperCase()}`, margin, y);
  y += 6;
  pdf.text(`Driver: ${selectedProfile ? selectedProfile.fullName : "GLOBAL"}`, margin, y);
  y += 6;
  pdf.text(`Coche filtro: ${carFilter || "ALL"}`, margin, y);
  y += 10;

  if (selectedProfile) {
    y = await drawPdfDriverBlock(pdf, selectedProfile, margin, y, pageWidth - margin * 2);
    y += 8;
  }

  y = drawPdfSectionTitle(pdf, "RESUMEN", margin, y);
  y = drawPdfSummaryGrid(pdf, [
    ["Total Income", money(summary.totalIncome)],
    ["Total Fuel", money(summary.totalFuel)],
    ["Total Spending", money(summary.totalSpending)],
    ["Net", money(summary.netProfit)],
    ["KM", summary.totalKm.toFixed(1)],
    ["KM/€", summary.kmPerEuro.toFixed(3)],
    ["Hours", summary.totalHours.toFixed(2)],
    ["Shifts", String(summary.count)],
  ], margin, y, pageWidth - margin * 2);
  y += 6;

  y = drawPdfSectionTitle(pdf, "BREAKDOWN", margin, y);
  y = drawPdfSummaryGrid(pdf, [
    ["Taxímetro", money(summary.totalTaximetro)],
    ["Cabify", money(summary.totalCabify)],
    ["Free Now", money(summary.totalFreeNow)],
    ["Uber", money(summary.totalUber)],
    ["Cash", money(summary.totalCash)],
    ["Card", money(summary.totalCard)],
    ["Apps", money(summary.totalApps)],
    ["Maintenance", money(summary.totalMaintenance)],
  ], margin, y, pageWidth - margin * 2);
  y += 6;

  const peakDay = getBestDay(rows);
  const peakHour = getPeakHour(rows);
  const fuelDay = getHighestFuelDay(rows);

  y = drawPdfSectionTitle(pdf, "PEAKS", margin, y);
  y = drawPdfTextList(pdf, [
    `Peak day: ${peakDay ? `${peakDay.key} · ${money(peakDay.summary.totalIncome)}` : "—"}`,
    `Peak hour: ${peakHour ? `${formatHourLabel(peakHour.hour)} · ${money(peakHour.amount)}` : "—"}`,
    `Highest fuel day: ${fuelDay ? `${fuelDay.key} · ${money(fuelDay.summary.totalFuel)}` : "—"}`,
  ], margin, y, pageWidth - margin * 2);
  y += 6;

  y = drawPdfSectionTitle(pdf, "SHIFT LIST", margin, y);
  y = drawPdfShiftTable(pdf, rows, margin, y, pageWidth, pageHeight);

  const fileLabel = selectedProfile ? selectedProfile.fullName : "GLOBAL";
  pdf.save(`taxi-report-${fileLabel}-${range}-${todayISO()}.pdf`);
  showToast("PDF exportado.");
}

function drawPdfSectionTitle(pdf, title, x, y) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(title, x, y);
  pdf.setDrawColor(190);
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

async function drawPdfDriverBlock(pdf, profile, x, y, width) {
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
  pdf.text(`Car: ${getCarLabel(profile.defaultCarId) || "-"}`, x + 28, y + 22);
  return y + boxH;
}

function drawPdfAvatarCircle(pdf, profile, cx, cy, r) {
  const rgb = hexToRgb(profile.colorHex || "#1d4ed8");
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
  const widths = [24, 28, 32, 16, 24, 18, 22, 20];
  const lineH = 7;

  function drawHeader() {
    let cursor = x;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    headers.forEach((header, idx) => {
      pdf.setDrawColor(220);
      pdf.rect(cursor, y, widths[idx], lineH);
      pdf.text(header, cursor + 2, y + 4.5);
      cursor += widths[idx];
    });
    y += lineH;
  }

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

    const carLabel = row.carId ? getCarLabel(row.carId) : row.vehicle || "";
    const cells = [
      row.dateKey || "",
      row.driverName || "",
      carLabel,
      num(row.km).toFixed(1),
      money(row.totalIncome),
      money(row.totalFuel),
      money(row.totalSpending),
      money(row.netProfit),
    ];

    let cursor = x;
    cells.forEach((cell, idx) => {
      pdf.setDrawColor(230);
      pdf.rect(cursor, y, widths[idx], lineH);
      pdf.text(String(cell), cursor + 2, y + 4.5, { maxWidth: widths[idx] - 4 });
      cursor += widths[idx];
    });

    y += lineH;
  });

  return y;
}

async function imageUrlToDataUrl(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return await blobToDataUrl(blob);
  } catch {
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
  const clean = String(hex || "").replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean.padEnd(6, "0");
  const n = parseInt(full, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

/* =========================================================
   INITIAL PLACEHOLDERS
========================================================= */
renderShiftPreview();
renderDashboard();
renderHistoryTable();
renderReports();
renderDriversView();
renderCarsView();
