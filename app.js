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
   FIXED LOGIN USERS
   Login estable con Email/Password real en Firebase Auth.
   Los nuevos drivers creados desde la app son operativos.
   Si luego quieres que tengan login real, habrá que crear
   también su usuario en Firebase Authentication.
========================================================= */
const FIXED_STAFF = {
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
    systemUser: true,
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
    systemUser: true,
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
    systemUser: true,
  },
};

const FIXED_BY_EMAIL = Object.values(FIXED_STAFF).reduce((acc, item) => {
  acc[item.email] = item;
  return acc;
}, {});

const HISTORY_PAGE_SIZE = 30;

/* =========================================================
   STATE
========================================================= */
const state = {
  authUser: null,
  currentUser: null,

  driverProfiles: {},
  cars: {},
  shifts: [],

  unsubProfiles: null,
  unsubCars: null,
  unsubShifts: null,

  historyPage: 1,

  photoModalStaffKey: null,
  pendingPhotoFile: null,
  pendingPhotoPreviewUrl: "",

  incomeChart: null,
  spendingChart: null,
  reportChart: null,
  appBreakdownChart: null,

  chartLibPromise: null,
  chartRenderQueued: false,
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

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(d);
}

function dateTimeLabel() {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());
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
  if (typeof state.unsubProfiles === "function") state.unsubProfiles();
  if (typeof state.unsubCars === "function") state.unsubCars();
  if (typeof state.unsubShifts === "function") state.unsubShifts();
  state.unsubProfiles = null;
  state.unsubCars = null;
  state.unsubShifts = null;
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

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function randomId(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function truncateText(text, max = 40) {
  const str = String(text || "");
  return str.length <= max ? str : `${str.slice(0, max - 1)}…`;
}

function hexToRgb(hex) {
  const clean = String(hex || "").replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean.padEnd(6, "0");

  const parsed = parseInt(full, 16);
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
}

function blendColor(hex, alpha = 0.14) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
  $("loginHint").textContent = "Introduce tus credenciales para continuar.";
  $("loginBtn").textContent = "Entrar";
  $("loginPin").value = "";
}

$("loginStaff")?.addEventListener("change", updateLoginMode);
updateLoginMode();

$("loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const selectedKey = $("loginStaff").value;
  const selected = FIXED_STAFF[selectedKey];
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
    showToast("Sesión iniciada.");
  } catch (error) {
    console.error(error);
    showToast("No se pudo iniciar sesión. Revisa Firebase Auth.");
  }
});

$("logoutBtn")?.addEventListener("click", async () => {
  try {
    cleanupSubs();
    destroyCharts();
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
    state.currentUser = null;
    state.driverProfiles = {};
    state.cars = {};
    state.shifts = {};
    state.historyPage = 1;
    show($("authView"));
    hide($("appView"));
    destroyCharts();
    return;
  }

  const fixedUser = FIXED_BY_EMAIL[user.email || ""];
  if (!fixedUser) {
    showToast("Cuenta no autorizada.");
    await signOut(auth);
    return;
  }

  state.authUser = user;
  state.currentUser = fixedUser;

  try {
    await ensureInitialFixedProfiles();
    await ensureInitialManagerCarSeed();
    bootApp();
  } catch (error) {
    console.error(error);
    showToast("Error cargando la aplicación.");
  }
});

async function ensureInitialFixedProfiles() {
  const keys = Object.keys(FIXED_STAFF);
  for (const staffKey of keys) {
    const base = FIXED_STAFF[staffKey];
    const ref = doc(db, "driverProfiles", staffKey);
    const snap = await getDoc(ref);

    const payload = {
      staffKey: base.staffKey,
      fullName: base.fullName,
      role: base.role,
      email: base.email,
      managerKey: base.managerKey,
      managerName: base.managerName,
      colorClass: base.colorClass,
      colorHex: base.colorHex,
      phone: snap.exists() ? snap.data().phone || "" : "",
      defaultCarId: snap.exists() ? snap.data().defaultCarId || "" : "",
      photoUrl: snap.exists() ? snap.data().photoUrl || "" : "",
      photoPath: snap.exists() ? snap.data().photoPath || "" : "",
      active: snap.exists() ? snap.data().active !== false : true,
      systemUser: true,
      operationalOnly: false,
      requestedLoginEmail: base.email,
      updatedAt: serverTimestamp(),
      createdAt: snap.exists() ? snap.data().createdAt || serverTimestamp() : serverTimestamp(),
    };

    await setDoc(ref, payload, { merge: true });
  }
}

async function ensureInitialManagerCarSeed() {
  if (state.currentUser?.role !== "manager") return;

  const seedCars = [
    {
      id: "car-1",
      plate: "0001-AAA",
      model: "Toyota Prius",
      alias: "Taxi 1",
      status: "active",
      currentKm: 0,
      defaultDriverKey: "mudassar",
      itv: "",
      insurance: "",
      notes: "",
    },
    {
      id: "car-2",
      plate: "0002-BBB",
      model: "Skoda Octavia",
      alias: "Taxi 2",
      status: "active",
      currentKm: 0,
      defaultDriverKey: "saqlain",
      itv: "",
      insurance: "",
      notes: "",
    },
  ];

  for (const car of seedCars) {
    const ref = doc(db, "cars", car.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        ...car,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
    }
  }
}

/* =========================================================
   BOOT APP
========================================================= */
function bootApp() {
  hide($("authView"));
  show($("appView"));

  setHeaderInfo();
  attachNav();
  bindGeneralEvents();

  subscribeDriverProfiles();
  subscribeCars();
  subscribeShifts();

  setShiftDefaults();
  renderShiftPreview();
  openView("dashboardView");
}

function setHeaderInfo() {
  const profile = getProfileByKey(state.currentUser.staffKey);
  $("sidebarName").textContent = profile.fullName;
  $("sidebarRole").textContent =
    profile.role === "manager" ? "Manager / Driver" : "Driver";
  $("sidebarVehicle").textContent = getDefaultCarLabelForDriver(profile.staffKey) || "Sin coche por defecto";
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
    shiftView: ["Nuevo turno", "Manager puede guardar un turno en nombre de cualquier conductor"],
    historyView: ["Historial", "Buscar por fecha, driver o coche · 30 por página"],
    reportsView: ["Reportes", "Diario, semanal, mensual y anual con gráficos y PDF"],
    driversView: ["Drivers", "Crear, editar, activar, cambiar foto y color"],
    carsView: ["Cars", "Ver existentes, añadir nuevos y editar datos"],
  };

  $("pageTitle").textContent = titleMap[viewId][0];
  $("pageSubtitle").textContent = titleMap[viewId][1];
}

/* =========================================================
   GENERAL EVENTS
========================================================= */
let generalEventsBound = false;

function bindGeneralEvents() {
  if (generalEventsBound) return;
  generalEventsBound = true;

  /* shift form live calc */
  const ids = [
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

  ids.forEach((id) => {
    $(id)?.addEventListener("input", renderShiftPreview);
    $(id)?.addEventListener("change", renderShiftPreview);
  });

  $("sfDriverKey")?.addEventListener("change", () => {
    applyDriverDefaultCar();
    renderShiftPreview();
  });

  $("resetShiftBtn")?.addEventListener("click", () => {
    $("shiftForm").reset();
    setShiftDefaults();
    renderShiftPreview();
  });

  $("shiftForm")?.addEventListener("submit", handleSaveShift);

  /* history filters */
  $("historySearch")?.addEventListener("input", resetAndRenderHistory);
  $("historyDateFilter")?.addEventListener("change", resetAndRenderHistory);
  $("historyDriverFilter")?.addEventListener("change", resetAndRenderHistory);
  $("historyCarFilter")?.addEventListener("input", resetAndRenderHistory);

  $("clearHistoryFiltersBtn")?.addEventListener("click", () => {
    $("historySearch").value = "";
    $("historyDateFilter").value = "";
    $("historyDriverFilter").value = "all";
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

  /* reports */
  $("reportRange")?.addEventListener("change", renderReports);
  $("reportDriverFilter")?.addEventListener("change", renderReports);
  $("reportCarFilter")?.addEventListener("input", renderReports);
  $("exportReportPdfBtn")?.addEventListener("click", exportCurrentReportPdf);

  /* drivers */
  $("createDriverBtn")?.addEventListener("click", handleCreateDriver);

  /* cars */
  $("createCarBtn")?.addEventListener("click", handleCreateCar);

  /* photo modal */
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

  $("saveDriverPhotoBtn")?.addEventListener("click", saveDriverPhoto);
  $("removeDriverPhotoBtn")?.addEventListener("click", removeDriverPhoto);
}

/* =========================================================
   SUBSCRIPTIONS
========================================================= */
function subscribeDriverProfiles() {
  if (!state.currentUser) return;

  if (state.currentUser.role === "manager") {
    state.unsubProfiles = onSnapshot(collection(db, "driverProfiles"), (snap) => {
      const next = {};
      snap.docs.forEach((d) => {
        next[d.id] = d.data();
      });
      state.driverProfiles = next;
      afterProfilesAndCarsChange();
    });
    return;
  }

  const profileRef = doc(db, "driverProfiles", state.currentUser.staffKey);
  state.unsubProfiles = onSnapshot(profileRef, (snap) => {
    const next = {};
    if (snap.exists()) next[snap.id] = snap.data();

    // keep fixed users locally for manager names/colors and filters
    Object.keys(FIXED_STAFF).forEach((key) => {
      if (!next[key] && key === state.currentUser.staffKey) {
        next[key] = buildFallbackProfileFromFixed(FIXED_STAFF[key]);
      }
    });

    state.driverProfiles = next;
    afterProfilesAndCarsChange();
  });
}

function subscribeCars() {
  state.unsubCars = onSnapshot(collection(db, "cars"), (snap) => {
    const next = {};
    snap.docs.forEach((d) => {
      next[d.id] = d.data();
    });
    state.cars = next;
    afterProfilesAndCarsChange();
  });
}

function subscribeShifts() {
  if (!state.currentUser) return;

  const shiftsRef = collection(db, "shifts");

  if (state.currentUser.role === "manager") {
    const q = query(shiftsRef, where("managerKey", "==", "mudassar"));
    state.unsubShifts = onSnapshot(q, (snap) => {
      state.shifts = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort(sortShiftsNewestFirst);
      afterShiftsChange();
    });
    return;
  }

  const q = query(shiftsRef, where("driverKey", "==", state.currentUser.staffKey));
  state.unsubShifts = onSnapshot(q, (snap) => {
    state.shifts = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort(sortShiftsNewestFirst);
    afterShiftsChange();
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
   PROFILE / CAR HELPERS
========================================================= */
function buildFallbackProfileFromFixed(base) {
  return {
    staffKey: base.staffKey,
    fullName: base.fullName,
    role: base.role,
    email: base.email,
    managerKey: base.managerKey,
    managerName: base.managerName,
    colorClass: base.colorClass,
    colorHex: base.colorHex,
    phone: "",
    defaultCarId: "",
    photoUrl: "",
    photoPath: "",
    active: true,
    systemUser: true,
    operationalOnly: false,
  };
}

function getAllProfiles() {
  const fixedFallbacks = Object.keys(FIXED_STAFF).reduce((acc, key) => {
    if (!state.driverProfiles[key]) acc[key] = buildFallbackProfileFromFixed(FIXED_STAFF[key]);
    return acc;
  }, {});

  return { ...fixedFallbacks, ...state.driverProfiles };
}

function getProfileByKey(staffKey) {
  const all = getAllProfiles();
  if (all[staffKey]) return all[staffKey];

  if (FIXED_STAFF[staffKey]) {
    return buildFallbackProfileFromFixed(FIXED_STAFF[staffKey]);
  }

  return null;
}

function getVisibleProfiles() {
  const all = Object.values(getAllProfiles())
    .filter((p) => p.active !== false)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  if (state.currentUser?.role === "manager") return all;
  return all.filter((p) => p.staffKey === state.currentUser.staffKey);
}

function getSelectableDrivers() {
  return Object.values(getAllProfiles())
    .filter((p) => p.active !== false)
    .filter((p) => p.role === "driver" || p.role === "manager")
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

function getAllCarsList() {
  return Object.entries(state.cars)
    .map(([id, car]) => ({ id, ...car }))
    .sort((a, b) => getCarLabel(a).localeCompare(getCarLabel(b)));
}

function getActiveCarsList() {
  return getAllCarsList().filter((car) => car.status !== "inactive");
}

function getCarById(carId) {
  if (!carId || !state.cars[carId]) return null;
  return { id: carId, ...state.cars[carId] };
}

function getCarLabel(car) {
  if (!car) return "";
  const alias = car.alias || "";
  const plate = car.plate || "";
  const model = car.model || "";
  return [alias, plate, model].filter(Boolean).join(" · ");
}

function getDefaultCarLabelForDriver(staffKey) {
  const profile = getProfileByKey(staffKey);
  if (!profile?.defaultCarId) return "";
  const car = getCarById(profile.defaultCarId);
  return car ? getCarLabel(car) : "";
}

function getDriverDisplayColor(profile) {
  return profile?.colorHex || "#1d4ed8";
}

function getDriverBadgeHtml(profile) {
  const color = getDriverDisplayColor(profile);
  return `<span class="driver-badge" style="background:${escapeHtml(color)}">${escapeHtml(
    profile.fullName
  )}</span>`;
}

function getDriverLineHtml(profile) {
  const color = getDriverDisplayColor(profile);
  return `<div class="driver-line" style="background:${escapeHtml(color)}"></div>`;
}

function getProfileImageHtml(profile, kind = "small") {
  const photoUrl = profile?.photoUrl || "";
  const initialsText = initials(profile?.fullName || "D");
  const sizeClass = kind === "large" ? "profile-photo" : "mini-avatar";

  if (photoUrl) {
    return `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(
      profile.fullName
    )}" class="${sizeClass}" />`;
  }

  return `<div class="${sizeClass} fallback">${escapeHtml(initialsText)}</div>`;
}

/* =========================================================
   AFTER DATA CHANGES
========================================================= */
function afterProfilesAndCarsChange() {
  setHeaderInfo();
  renderShiftSelectors();
  renderDriversStats();
  renderDriversGrid();
  renderCarsStats();
  renderCarsGrid();
  renderHistoryDriverFilter();
  renderReportDriverFilter();
  renderNewDriverCarOptions();
  renderNewCarDriverOptions();
  renderShiftPreview();
}

function afterShiftsChange() {
  renderDashboard();
  renderHistoryTable();
  renderReports();
}

/* =========================================================
   SELECTORS / OPTIONS
========================================================= */
function renderShiftSelectors() {
  if (!state.currentUser) return;

  if (state.currentUser.role === "manager") {
    show($("driverSelectWrap"));
  } else {
    hide($("driverSelectWrap"));
  }

  const driverOptions = getSelectableDrivers()
    .map(
      (profile) =>
        `<option value="${profile.staffKey}">${escapeHtml(profile.fullName)}</option>`
    )
    .join("");

  $("sfDriverKey").innerHTML = driverOptions;

  const carOptions = [
    `<option value="">Seleccionar coche</option>`,
    ...getActiveCarsList().map(
      (car) => `<option value="${car.id}">${escapeHtml(getCarLabel(car))}</option>`
    ),
  ].join("");

  $("sfCarId").innerHTML = carOptions;

  if (state.currentUser.role === "manager") {
    if (!$("sfDriverKey").value) $("sfDriverKey").value = state.currentUser.staffKey;
    applyDriverDefaultCar();
  } else {
    const ownProfile = getProfileByKey(state.currentUser.staffKey);
    if (ownProfile?.defaultCarId) $("sfCarId").value = ownProfile.defaultCarId;
  }
}

function renderHistoryDriverFilter() {
  if (!state.currentUser) return;

  if (state.currentUser.role !== "manager") {
    $("historyDriverFilter").innerHTML = `<option value="${state.currentUser.staffKey}">${escapeHtml(
      state.currentUser.fullName
    )}</option>`;
    return;
  }

  const options = [
    `<option value="all">All</option>`,
    ...getSelectableDrivers().map(
      (profile) =>
        `<option value="${profile.staffKey}">${escapeHtml(profile.fullName)}</option>`
    ),
  ];

  $("historyDriverFilter").innerHTML = options.join("");
}

function renderReportDriverFilter() {
  if (!state.currentUser) return;

  if (state.currentUser.role !== "manager") {
    $("reportDriverFilter").innerHTML = `<option value="${state.currentUser.staffKey}">${escapeHtml(
      state.currentUser.fullName
    )}</option>`;
    return;
  }

  const options = [
    `<option value="all">All</option>`,
    ...getSelectableDrivers().map(
      (profile) =>
        `<option value="${profile.staffKey}">${escapeHtml(profile.fullName)}</option>`
    ),
  ];

  $("reportDriverFilter").innerHTML = options.join("");
}

function renderNewDriverCarOptions() {
  if (!$("newDriverCarId")) return;
  $("newDriverCarId").innerHTML = [
    `<option value="">Sin coche por defecto</option>`,
    ...getActiveCarsList().map(
      (car) => `<option value="${car.id}">${escapeHtml(getCarLabel(car))}</option>`
    ),
  ].join("");
}

function renderNewCarDriverOptions() {
  if (!$("newCarDriverKey")) return;
  $("newCarDriverKey").innerHTML = [
    `<option value="">Sin conductor por defecto</option>`,
    ...getSelectableDrivers().map(
      (profile) =>
        `<option value="${profile.staffKey}">${escapeHtml(profile.fullName)}</option>`
    ),
  ].join("");
}

function applyDriverDefaultCar() {
  const selectedDriver = getProfileByKey($("sfDriverKey").value);
  if (!selectedDriver) return;

  if (selectedDriver.defaultCarId) {
    $("sfCarId").value = selectedDriver.defaultCarId;
  } else if (state.currentUser.role === "manager") {
    $("sfCarId").value = "";
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

  if (state.currentUser?.role === "manager") {
    $("sfDriverKey").value = state.currentUser.staffKey;
    applyDriverDefaultCar();
  } else if (state.currentUser) {
    const ownProfile = getProfileByKey(state.currentUser.staffKey);
    $("sfCarId").value = ownProfile?.defaultCarId || "";
  }
}

/* =========================================================
   SHIFT CALCULATION
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
  const km = num(raw.km);

  const totalTaximetro = num(raw.taximetroCash) + num(raw.taximetroCard);
  const totalCabify = num(raw.cabifyCash) + num(raw.cabifyApp);
  const totalFreeNow = num(raw.freeNowCash) + num(raw.freeNowApp);
  const totalUber = num(raw.uberApp);

  const totalCash = num(raw.taximetroCash) + num(raw.cabifyCash) + num(raw.freeNowCash);
  const totalCard = num(raw.taximetroCard);
  const totalApps = num(raw.cabifyApp) + num(raw.freeNowApp) + num(raw.uberApp);
  const totalIncome = totalTaximetro + totalCabify + totalFreeNow + totalUber;

  const totalFuel = num(raw.fuel1) + num(raw.fuel2) + num(raw.fuel3) + num(raw.fuelOther);

  const totalExpenses =
    num(raw.parking) + num(raw.tolls) + num(raw.cleaning) + num(raw.otherExpenses);

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
  const eurPerHour = safeDiv(totalIncome, workedHours);

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
    eurPerHour,
  };
}

function renderShiftPreview() {
  try {
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
      statCard("KM", calc.km.toFixed(1), "Input directo"),
      statCard("Ingresos", money(calc.totalIncome), "Todas las fuentes"),
      statCard("Fuel", money(calc.totalFuel), "Solo combustible"),
      statCard("Spending", money(calc.totalSpending), "Fuel + gastos + mantenimiento"),
      statCard("Neto", money(calc.netProfit), "Ingresos - gastos"),
      statCard("KM/€", calc.kmPerEuro.toFixed(3), "Media"),
      statCard("€/hora", calc.eurPerHour.toFixed(2), "Media"),
    ].join("");
  } catch (error) {
    console.error(error);
    $("shiftPreview").innerHTML = statCard("Preview", "—", "Completa el turno");
  }
}

/* =========================================================
   SAVE SHIFT
========================================================= */
async function handleSaveShift(e) {
  e.preventDefault();

  try {
    const payload = buildShiftPayload();
    await addDoc(collection(db, "shifts"), payload);

    showToast("Turno guardado.");
    $("shiftForm").reset();
    setShiftDefaults();
    renderShiftPreview();

    openView("historyView");
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    document.querySelector('[data-view="historyView"]').classList.add("active");
  } catch (error) {
    console.error(error);
    showToast(error.message || "No se pudo guardar el turno.");
  }
}

function buildShiftPayload() {
  if (!state.currentUser) throw new Error("No hay sesión activa.");

  const driverKey =
    state.currentUser.role === "manager"
      ? $("sfDriverKey").value
      : state.currentUser.staffKey;

  const profile = getProfileByKey(driverKey);
  if (!profile) throw new Error("Driver no válido.");

  const carId = $("sfCarId").value;
  const car = carId ? getCarById(carId) : null;

  const raw = getShiftFormRaw();

  if (!raw.dateKey) throw new Error("La fecha es obligatoria.");
  if (!raw.startTime || !raw.endTime) throw new Error("Las horas son obligatorias.");
  if (num(raw.km) < 0) throw new Error("Los KM no pueden ser negativos.");

  const calc = calculateShift(raw);

  return {
    driverKey: profile.staffKey,
    driverName: profile.fullName,
    driverColorClass: profile.colorClass || "",
    driverColorHex: profile.colorHex || "#1d4ed8",

    carId: car?.id || "",
    vehicle: car ? getCarLabel(car) : "",

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
    eurPerHour: calc.eurPerHour,

    managerKey: "mudassar",
    managerName: "MUDASSAR",

    status: "CLOSED",
    createdByUid: state.authUser.uid,
    createdByKey: state.currentUser.staffKey,
    createdByRole: state.currentUser.role,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

/* =========================================================
   SUMMARY HELPERS
========================================================= */
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
      eurPerHour: 0,
    }
  );

  summary.kmPerEuro = safeDiv(summary.totalKm, summary.totalIncome);
  summary.eurPerHour = safeDiv(summary.totalIncome, summary.totalHours);
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
  }

  return rows.filter((row) => {
    const d = row.dateKey ? new Date(`${row.dateKey}T12:00:00`) : null;
    return d && d >= start && d <= end;
  });
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

function getPeakHour(rows) {
  const hourTotals = new Array(24).fill(0);

  rows.forEach((row) => {
    const startHour = extractHour(row.startTime);
    const endHour = extractHour(row.endTime);
    if (startHour === null || endHour === null) return;

    const coveredHours = buildCoveredHours(startHour, endHour);
    if (!coveredHours.length) return;

    const distributed = safeDiv(num(row.totalIncome), coveredHours.length);
    coveredHours.forEach((hour) => {
      hourTotals[hour] += distributed;
    });
  });

  let bestHour = null;
  let bestAmount = 0;

  hourTotals.forEach((amount, hour) => {
    if (amount > bestAmount) {
      bestHour = hour;
      bestAmount = amount;
    }
  });

  if (bestHour === null) return null;
  return { hour: bestHour, amount: bestAmount };
}

function getBestDay(rows) {
  const groups = groupRowsBy(rows, (row) => row.dateKey);
  return Object.entries(groups)
    .map(([key, groupedRows]) => ({ key, summary: summarizeRows(groupedRows) }))
    .sort((a, b) => b.summary.totalIncome - a.summary.totalIncome)[0] || null;
}

function getHighestFuelDay(rows) {
  const groups = groupRowsBy(rows, (row) => row.dateKey);
  return Object.entries(groups)
    .map(([key, groupedRows]) => ({ key, summary: summarizeRows(groupedRows) }))
    .sort((a, b) => b.summary.totalFuel - a.summary.totalFuel)[0] || null;
}

function getWorstDay(rows) {
  const groups = groupRowsBy(rows, (row) => row.dateKey);
  return Object.entries(groups)
    .map(([key, groupedRows]) => ({ key, summary: summarizeRows(groupedRows) }))
    .sort((a, b) => a.summary.totalIncome - b.summary.totalIncome)[0] || null;
}

function getBestDriver(rows) {
  const groups = groupRowsBy(rows, (row) => row.driverKey);
  return Object.entries(groups)
    .map(([key, groupedRows]) => ({
      profile: getProfileByKey(key),
      summary: summarizeRows(groupedRows),
    }))
    .sort((a, b) => b.summary.totalIncome - a.summary.totalIncome)[0] || null;
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
    statCard("Spending hoy", money(today.totalSpending), "Todo el gasto"),
    statCard("Neto hoy", money(today.netProfit), "Resultado final"),
    statCard("Ingresos semana", money(week.totalIncome), `${week.totalKm.toFixed(1)} km`),
    statCard("Ingresos mes", money(month.totalIncome), `${month.totalHours.toFixed(1)} h`),
    statCard("Ingresos año", money(year.totalIncome), `${year.count} turnos`),
    statCard("KM/€ hoy", today.kmPerEuro.toFixed(3), "Media"),
  ].join("");

  $("todayIncomeSources").innerHTML = [
    statCard("Taxímetro", money(today.totalTaximetro), "Efectivo + tarjeta"),
    statCard("Cabify", money(today.totalCabify), "Efectivo + app"),
    statCard("Free Now", money(today.totalFreeNow), "Efectivo + app"),
    statCard("Uber", money(today.totalUber), "Solo app"),
  ].join("");

  $("todaySpendingSources").innerHTML = [
    statCard("Fuel", money(today.totalFuel), "Separado"),
    statCard("Gastos", money(today.totalExpenses), "Operativos"),
    statCard("Mantenimiento", money(today.totalMaintenance), "Servicio / taller"),
    statCard("Neto", money(today.netProfit), "Ingreso - gasto"),
  ].join("");

  renderTopDrivers();
  renderPeakAnalytics();
  queueChartRender();
}

function renderTopDrivers() {
  const groups = groupRowsBy(state.shifts, (row) => row.driverKey);
  const ranked = Object.entries(groups)
    .map(([driverKey, rows]) => ({
      profile: getProfileByKey(driverKey),
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
                ${getDriverLineHtml(profile)}
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
          `;
        })
        .join("")
    : `<div class="center-empty">No hay turnos todavía.</div>`;
}

function renderPeakAnalytics() {
  const bestDay = getBestDay(state.shifts);
  const peakHour = getPeakHour(state.shifts);
  const fuelDay = getHighestFuelDay(state.shifts);
  const bestDriver = getBestDriver(state.shifts);

  const items = [
    {
      title: "Mejor día",
      value: bestDay ? `${bestDay.key} · ${money(bestDay.summary.totalIncome)}` : "—",
      sub: bestDay ? `${bestDay.summary.count} turnos` : "Sin datos",
    },
    {
      title: "Hora pico",
      value: peakHour ? `${String(peakHour.hour).padStart(2, "0")}:00 · ${money(peakHour.amount)}` : "—",
      sub: peakHour ? "Estimación por horas" : "Sin datos",
    },
    {
      title: "Día con más fuel",
      value: fuelDay ? `${fuelDay.key} · ${money(fuelDay.summary.totalFuel)}` : "—",
      sub: fuelDay ? "Fuel total" : "Sin datos",
    },
    {
      title: "Top driver",
      value: bestDriver ? bestDriver.profile.fullName : "—",
      sub: bestDriver ? money(bestDriver.summary.totalIncome) : "Sin datos",
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
   HISTORY
========================================================= */
function resetAndRenderHistory() {
  state.historyPage = 1;
  renderHistoryTable();
}

function getFilteredHistoryRows() {
  const search = $("historySearch").value.trim().toLowerCase();
  const dateFilter = $("historyDateFilter").value;
  const driverFilter = $("historyDriverFilter").value;
  const carFilter = $("historyCarFilter").value.trim().toLowerCase();

  return state.shifts.filter((row) => {
    const combined = [
      row.driverName,
      row.vehicle,
      row.notes,
      row.dateKey,
      row.managerName,
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch = !search || combined.includes(search);
    const matchesDate = !dateFilter || row.dateKey === dateFilter;
    const matchesDriver =
      !driverFilter || driverFilter === "all" || row.driverKey === driverFilter;
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
          <div class="center-empty">No se encontraron turnos.</div>
        </td>
      </tr>
    `;
    return;
  }

  $("historyTableBody").innerHTML = pageRows
    .map((row) => {
      const profile = getProfileByKey(row.driverKey) || FIXED_STAFF.mudassar;
      const borderStyle = `border-left:5px solid ${getDriverDisplayColor(profile)};`;

      return `
        <tr class="history-row" style="${escapeHtml(borderStyle)}">
          <td>
            <div class="history-driver-cell">
              ${getProfileImageHtml(profile, "small")}
              <div>
                ${getDriverBadgeHtml(profile)}
                <div class="muted">${escapeHtml(row.managerName || "")}</div>
              </div>
            </div>
          </td>
          <td>${escapeHtml(formatDate(row.dateKey))}</td>
          <td>${escapeHtml(truncateText(row.vehicle || "-", 36))}</td>
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
function getReportRows() {
  const range = $("reportRange").value;
  const driverKey =
    state.currentUser?.role === "manager"
      ? $("reportDriverFilter").value
      : state.currentUser?.staffKey || "all";
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
    statCard("Ingresos", money(summary.totalIncome), `${summary.count} turnos`),
    statCard("Fuel", money(summary.totalFuel), "Separado"),
    statCard("Spending", money(summary.totalSpending), "Todo el gasto"),
    statCard("Neto", money(summary.netProfit), "Resultado final"),
    statCard("KM", summary.totalKm.toFixed(1), "Input directo"),
    statCard("KM/€", summary.kmPerEuro.toFixed(3), "Media"),
    statCard("€/hora", summary.eurPerHour.toFixed(2), "Media"),
    statCard("Apps", money(summary.totalApps), "Cabify + Free Now + Uber"),
  ].join("");

  renderReportPeakList(rows);
  renderReportBreakdownList(summary);
  renderDailyReportList(rows);
  renderPeriodReportList(rows, summary);

  queueChartRender();
}

function renderReportPeakList(rows) {
  const bestDay = getBestDay(rows);
  const worstDay = getWorstDay(rows);
  const peakHour = getPeakHour(rows);
  const fuelDay = getHighestFuelDay(rows);

  const items = [
    {
      title: "Peak day",
      value: bestDay ? `${bestDay.key} · ${money(bestDay.summary.totalIncome)}` : "—",
      sub: bestDay ? `${bestDay.summary.count} turnos` : "Sin datos",
    },
    {
      title: "Worst day",
      value: worstDay ? `${worstDay.key} · ${money(worstDay.summary.totalIncome)}` : "—",
      sub: worstDay ? "Por ingresos" : "Sin datos",
    },
    {
      title: "Peak hour",
      value: peakHour ? `${String(peakHour.hour).padStart(2, "0")}:00 · ${money(peakHour.amount)}` : "—",
      sub: peakHour ? "Estimación" : "Sin datos",
    },
    {
      title: "Highest fuel day",
      value: fuelDay ? `${fuelDay.key} · ${money(fuelDay.summary.totalFuel)}` : "—",
      sub: fuelDay ? "Fuel total" : "Sin datos",
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
    ["Taxímetro", money(summary.totalTaximetro), "Efectivo + tarjeta"],
    ["Cabify", money(summary.totalCabify), "Efectivo + app"],
    ["Free Now", money(summary.totalFreeNow), "Efectivo + app"],
    ["Uber", money(summary.totalUber), "Solo app"],
    ["Fuel", money(summary.totalFuel), "Solo combustible"],
    ["Gastos", money(summary.totalExpenses), "Operativos"],
    ["Mantenimiento", money(summary.totalMaintenance), "Servicio / taller"],
    ["KM/€", summary.kmPerEuro.toFixed(3), "Media"],
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
  const groups = groupRowsBy(rows, (row) => row.dateKey);
  const days = Object.entries(groups)
    .map(([key, groupedRows]) => ({
      key,
      summary: summarizeRows(groupedRows),
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
                <div class="muted">${day.summary.count} turnos • ${day.summary.totalKm.toFixed(
                  1
                )} km</div>
              </div>
              <div>
                <strong>${money(day.summary.totalIncome)}</strong>
                <div class="muted">Fuel ${money(day.summary.totalFuel)} · Neto ${money(
            day.summary.netProfit
          )}</div>
              </div>
            </div>
          `
        )
        .join("")
    : `<div class="center-empty">No hay datos de reporte.</div>`;
}

function renderPeriodReportList(rows, summary) {
  const bestDriver = getBestDriver(rows);
  const avgIncome = safeDiv(summary.totalIncome, summary.count);
  const avgFuel = safeDiv(summary.totalFuel, summary.count);
  const avgNet = safeDiv(summary.netProfit, summary.count);

  const items = [
    {
      title: "Ingreso medio por turno",
      value: money(avgIncome),
      sub: `${summary.count} turnos`,
    },
    {
      title: "Fuel medio por turno",
      value: money(avgFuel),
      sub: "Por turno",
    },
    {
      title: "Neto medio por turno",
      value: money(avgNet),
      sub: "Por turno",
    },
    {
      title: "Mejor driver",
      value: bestDriver ? bestDriver.profile.fullName : "—",
      sub: bestDriver ? money(bestDriver.summary.totalIncome) : "Sin datos",
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
   CHARTS
========================================================= */
function destroyCharts() {
  ["incomeChart", "spendingChart", "reportChart", "appBreakdownChart"].forEach((key) => {
    if (state[key]) {
      try {
        state[key].destroy();
      } catch (_) {}
      state[key] = null;
    }
  });
}

function queueChartRender() {
  if (state.chartRenderQueued) return;
  state.chartRenderQueued = true;

  Promise.resolve().then(async () => {
    state.chartRenderQueued = false;
    await renderCharts();
  });
}

async function ensureChartJs() {
  if (window.Chart) return window.Chart;
  if (state.chartLibPromise) return state.chartLibPromise;

  state.chartLibPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-chartjs="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Chart));
      existing.addEventListener("error", reject);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/chart.js";
    script.async = true;
    script.dataset.chartjs = "true";
    script.onload = () => resolve(window.Chart);
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return state.chartLibPromise;
}

function getCssColor(variableName, fallback = "#1d4ed8") {
  const value = getComputedStyle(document.body).getPropertyValue(variableName).trim();
  return value || fallback;
}

function buildLastSevenDaysSeries(rows) {
  const labels = [];
  const incomeData = [];
  const fuelData = [];
  const netData = [];

  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    labels.push(key);

    const dayRows = rows.filter((row) => row.dateKey === key);
    const summary = summarizeRows(dayRows);

    incomeData.push(summary.totalIncome);
    fuelData.push(summary.totalFuel);
    netData.push(summary.netProfit);
  }

  return { labels, incomeData, fuelData, netData };
}

function buildGroupedSeriesByDay(rows) {
  const groups = groupRowsBy(rows, (row) => row.dateKey);
  const entries = Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));

  return {
    labels: entries.map(([key]) => key),
    income: entries.map(([, groupedRows]) => summarizeRows(groupedRows).totalIncome),
    fuel: entries.map(([, groupedRows]) => summarizeRows(groupedRows).totalFuel),
    net: entries.map(([, groupedRows]) => summarizeRows(groupedRows).netProfit),
  };
}

async function renderCharts() {
  try {
    const ChartLib = await ensureChartJs();
    if (!ChartLib) return;

    renderDashboardCharts(ChartLib);
    renderReportCharts(ChartLib);
  } catch (error) {
    console.warn("Chart.js no cargado:", error);
  }
}

function renderDashboardCharts(ChartLib) {
  if (!$("incomeChart") || !$("spendingChart")) return;

  if (state.incomeChart) state.incomeChart.destroy();
  if (state.spendingChart) state.spendingChart.destroy();

  const series = buildLastSevenDaysSeries(state.shifts);

  state.incomeChart = new ChartLib($("incomeChart"), {
    type: "line",
    data: {
      labels: series.labels,
      datasets: [
        {
          label: "Ingresos",
          data: series.incomeData,
          borderColor: getCssColor("--driver-mudassar", "#1d4ed8"),
          backgroundColor: blendColor(getCssColor("--driver-mudassar", "#1d4ed8"), 0.18),
          fill: true,
          tension: 0.3,
        },
        {
          label: "Neto",
          data: series.netData,
          borderColor: getCssColor("--success", "#16a34a"),
          backgroundColor: blendColor(getCssColor("--success", "#16a34a"), 0.12),
          fill: true,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: { legend: { display: true } },
      scales: { y: { beginAtZero: true } },
    },
  });

  state.spendingChart = new ChartLib($("spendingChart"), {
    type: "bar",
    data: {
      labels: series.labels,
      datasets: [
        {
          label: "Fuel",
          data: series.fuelData,
          backgroundColor: blendColor(getCssColor("--warning", "#d97706"), 0.65),
        },
        {
          label: "Neto",
          data: series.netData,
          backgroundColor: blendColor(getCssColor("--success", "#16a34a"), 0.6),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: { legend: { display: true } },
      scales: { y: { beginAtZero: true } },
    },
  });
}

function renderReportCharts(ChartLib) {
  if (!$("reportChart") || !$("appBreakdownChart")) return;

  if (state.reportChart) state.reportChart.destroy();
  if (state.appBreakdownChart) state.appBreakdownChart.destroy();

  const rows = getReportRows();
  const grouped = buildGroupedSeriesByDay(rows);
  const summary = summarizeRows(rows);

  state.reportChart = new ChartLib($("reportChart"), {
    type: "line",
    data: {
      labels: grouped.labels,
      datasets: [
        {
          label: "Ingresos",
          data: grouped.income,
          borderColor: getCssColor("--driver-mudassar", "#1d4ed8"),
          backgroundColor: blendColor(getCssColor("--driver-mudassar", "#1d4ed8"), 0.16),
          fill: true,
          tension: 0.3,
        },
        {
          label: "Fuel",
          data: grouped.fuel,
          borderColor: getCssColor("--warning", "#d97706"),
          backgroundColor: blendColor(getCssColor("--warning", "#d97706"), 0.12),
          fill: true,
          tension: 0.3,
        },
        {
          label: "Neto",
          data: grouped.net,
          borderColor: getCssColor("--success", "#16a34a"),
          backgroundColor: blendColor(getCssColor("--success", "#16a34a"), 0.1),
          fill: true,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: { legend: { display: true } },
      scales: { y: { beginAtZero: true } },
    },
  });

  state.appBreakdownChart = new ChartLib($("appBreakdownChart"), {
    type: "bar",
    data: {
      labels: ["Taxímetro", "Cabify", "Free Now", "Uber"],
      datasets: [
        {
          label: "Ingresos",
          data: [
            summary.totalTaximetro,
            summary.totalCabify,
            summary.totalFreeNow,
            summary.totalUber,
          ],
          backgroundColor: [
            blendColor(getCssColor("--taximetro-text", "#1849a9"), 0.65),
            blendColor(getCssColor("--cabify-text", "#067647"), 0.65),
            blendColor(getCssColor("--freenow-text", "#b54708"), 0.65),
            blendColor(getCssColor("--uber-text", "#111827"), 0.65),
          ],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } },
    },
  });
}

/* =========================================================
   DRIVERS MODULE
========================================================= */
function renderDriversStats() {
  const profiles = getVisibleProfiles();
  const drivers = profiles.filter((p) => p.role === "driver").length;
  const managers = profiles.filter((p) => p.role === "manager").length;
  const withPhotos = profiles.filter((p) => p.photoUrl).length;
  const active = profiles.filter((p) => p.active !== false).length;

  $("driversStats").innerHTML = [
    statCard("Perfiles", String(profiles.length), "Visibles"),
    statCard("Drivers", String(drivers), "Conductores"),
    statCard("Managers", String(managers), "Gestión"),
    statCard("Con foto", String(withPhotos), "Imagen subida"),
    statCard("Activos", String(active), "Disponibles"),
  ].join("");
}

function renderDriversGrid() {
  const profiles = getVisibleProfiles();

  $("driversGrid").innerHTML = profiles
    .map((profile) => renderDriverCard(profile))
    .join("");

  if (state.currentUser?.role !== "manager") {
    hide(document.querySelector(".driver-create-card"));
  } else {
    show(document.querySelector(".driver-create-card"));
  }

  attachDriverCardEvents();
}

function renderDriverCard(profile) {
  const editable = state.currentUser?.role === "manager" || state.currentUser?.staffKey === profile.staffKey;

  const carOptions = [
    `<option value="">Sin coche por defecto</option>`,
    ...getActiveCarsList().map((car) => {
      const selected = profile.defaultCarId === car.id ? "selected" : "";
      return `<option value="${car.id}" ${selected}>${escapeHtml(getCarLabel(car))}</option>`;
    }),
  ].join("");

  const activeChecked = profile.active !== false ? "checked" : "";
  const systemText = profile.systemUser
    ? "Login real Firebase"
    : "Perfil operativo (sin login automático)";

  return `
    <div class="card profile-card" data-driver-card="${escapeHtml(profile.staffKey)}">
      <div class="profile-color-bar" style="background:${escapeHtml(profile.colorHex || "#1d4ed8")}"></div>

      <div class="profile-card-head">
        ${getProfileImageHtml(profile, "large")}
        <div>
          <div class="profile-name">${escapeHtml(profile.fullName)}</div>
          <div class="profile-role">${escapeHtml(
            profile.role === "manager" ? "Manager / Driver" : "Driver"
          )}</div>
          ${getDriverBadgeHtml(profile)}
        </div>
      </div>

      <div class="profile-meta-list">
        <div>Email: ${escapeHtml(profile.email || "-")}</div>
        <div>Manager: ${escapeHtml(profile.managerName || "-")}</div>
        <div>Acceso: ${escapeHtml(systemText)}</div>
      </div>

      <div class="grid-2">
        <label>
          <span>Nombre</span>
          <input
            type="text"
            data-driver-name="${escapeHtml(profile.staffKey)}"
            value="${escapeHtml(profile.fullName || "")}"
            ${editable ? "" : "disabled"}
            ${profile.systemUser ? "disabled" : ""}
          />
        </label>

        <label>
          <span>Teléfono</span>
          <input
            type="text"
            data-driver-phone="${escapeHtml(profile.staffKey)}"
            value="${escapeHtml(profile.phone || "")}"
            ${editable ? "" : "disabled"}
          />
        </label>

        <label>
          <span>Coche por defecto</span>
          <select
            data-driver-default-car="${escapeHtml(profile.staffKey)}"
            ${editable ? "" : "disabled"}
          >
            ${carOptions}
          </select>
        </label>

        <label>
          <span>Color</span>
          <input
            type="color"
            data-driver-color="${escapeHtml(profile.staffKey)}"
            value="${escapeHtml(profile.colorHex || "#1d4ed8")}"
            ${editable ? "" : "disabled"}
          />
        </label>
      </div>

      <div class="grid-2">
        <label>
          <span>Activo</span>
          <input
            type="checkbox"
            data-driver-active="${escapeHtml(profile.staffKey)}"
            ${activeChecked}
            ${editable ? "" : "disabled"}
          />
        </label>
      </div>

      <div class="profile-actions">
        ${
          editable
            ? `
          <button class="secondary-btn" type="button" data-manage-photo="${escapeHtml(profile.staffKey)}">
            Gestionar foto
          </button>
          <button class="primary-btn" type="button" data-save-driver="${escapeHtml(profile.staffKey)}">
            Guardar driver
          </button>
        `
            : ""
        }
      </div>
    </div>
  `;
}

function attachDriverCardEvents() {
  document.querySelectorAll("[data-save-driver]").forEach((btn) => {
    btn.onclick = async () => {
      const staffKey = btn.getAttribute("data-save-driver");
      await saveDriverProfile(staffKey);
    };
  });

  document.querySelectorAll("[data-manage-photo]").forEach((btn) => {
    btn.onclick = () => {
      const staffKey = btn.getAttribute("data-manage-photo");
      openPhotoModal(staffKey);
    };
  });
}

async function handleCreateDriver() {
  if (state.currentUser?.role !== "manager") {
    showToast("Solo el manager puede crear drivers.");
    return;
  }

  try {
    const fullName = $("newDriverName").value.trim();
    const email = $("newDriverEmail").value.trim();
    const pin = $("newDriverPin").value.trim();
    const defaultCarId = $("newDriverCarId").value;
    const phone = $("newDriverPhone").value.trim();
    const colorHex = $("newDriverColor").value || "#16a34a";
    const aliasInput = $("newDriverAlias").value.trim();

    if (!fullName) throw new Error("El nombre es obligatorio.");

    const generatedKey = slugify(aliasInput || fullName);
    if (!generatedKey) throw new Error("Alias no válido.");
    if (state.driverProfiles[generatedKey] || FIXED_STAFF[generatedKey]) {
      throw new Error("Ese alias ya existe.");
    }

    // El PIN se pide porque el usuario lo quiere en el formulario,
    // pero aquí no se usa para Firebase Auth automático.
    // Se guarda referencia mínima operativa.
    await setDoc(doc(db, "driverProfiles", generatedKey), {
      staffKey: generatedKey,
      fullName,
      role: "driver",
      email,
      managerKey: "mudassar",
      managerName: "MUDASSAR",
      colorClass: generatedKey,
      colorHex,
      phone,
      defaultCarId,
      photoUrl: "",
      photoPath: "",
      active: true,
      systemUser: false,
      operationalOnly: true,
      requestedLoginEmail: email,
      requestedPinInfo: pin ? "PIN capturado en alta" : "",
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    });

    $("newDriverForm").reset();
    $("newDriverColor").value = "#16a34a";
    showToast("Driver creado.");
  } catch (error) {
    console.error(error);
    showToast(error.message || "No se pudo crear el driver.");
  }
}

async function saveDriverProfile(staffKey) {
  try {
    const profile = getProfileByKey(staffKey);
    if (!profile) throw new Error("Driver no encontrado.");

    const fullNameInput = document.querySelector(`[data-driver-name="${staffKey}"]`);
    const phoneInput = document.querySelector(`[data-driver-phone="${staffKey}"]`);
    const defaultCarSelect = document.querySelector(`[data-driver-default-car="${staffKey}"]`);
    const colorInput = document.querySelector(`[data-driver-color="${staffKey}"]`);
    const activeInput = document.querySelector(`[data-driver-active="${staffKey}"]`);

    const fullName = profile.systemUser
      ? profile.fullName
      : fullNameInput?.value?.trim() || profile.fullName;

    const phone = phoneInput?.value?.trim() || "";
    const defaultCarId = defaultCarSelect?.value || "";
    const colorHex = colorInput?.value || profile.colorHex || "#1d4ed8";
    const active = !!activeInput?.checked;

    await setDoc(
      doc(db, "driverProfiles", staffKey),
      {
        staffKey,
        fullName,
        role: profile.role,
        email: profile.email || "",
        managerKey: profile.managerKey || "mudassar",
        managerName: profile.managerName || "MUDASSAR",
        colorClass: profile.colorClass || staffKey,
        colorHex,
        phone,
        defaultCarId,
        photoUrl: profile.photoUrl || "",
        photoPath: profile.photoPath || "",
        active,
        systemUser: !!profile.systemUser,
        operationalOnly: !!profile.operationalOnly,
        requestedLoginEmail: profile.requestedLoginEmail || profile.email || "",
        requestedPinInfo: profile.requestedPinInfo || "",
        updatedAt: serverTimestamp(),
        createdAt: profile.createdAt || serverTimestamp(),
      },
      { merge: true }
    );

    showToast("Driver guardado.");
  } catch (error) {
    console.error(error);
    showToast("No se pudo guardar el driver.");
  }
}

/* =========================================================
   CARS MODULE
========================================================= */
function renderCarsStats() {
  const cars = getAllCarsList();
  const active = cars.filter((c) => c.status === "active").length;
  const workshop = cars.filter((c) => c.status === "workshop").length;
  const inactive = cars.filter((c) => c.status === "inactive").length;

  $("carsStats").innerHTML = [
    statCard("Coches", String(cars.length), "Registrados"),
    statCard("Activos", String(active), "Disponibles"),
    statCard("Taller", String(workshop), "Fuera de servicio"),
    statCard("Inactivos", String(inactive), "No operativos"),
  ].join("");
}

function renderCarsGrid() {
  const cars = getAllCarsList();

  $("carsGrid").innerHTML = cars.length
    ? cars.map((car) => renderCarCard(car)).join("")
    : `<div class="center-empty">No hay coches todavía.</div>`;

  if (state.currentUser?.role !== "manager") {
    hide(document.querySelector(".car-create-card"));
  } else {
    show(document.querySelector(".car-create-card"));
  }

  attachCarCardEvents();
}

function renderCarCard(car) {
  const editable = state.currentUser?.role === "manager";
  const driverOptions = [
    `<option value="">Sin conductor por defecto</option>`,
    ...getSelectableDrivers().map((profile) => {
      const selected = car.defaultDriverKey === profile.staffKey ? "selected" : "";
      return `<option value="${profile.staffKey}" ${selected}>${escapeHtml(profile.fullName)}</option>`;
    }),
  ].join("");

  return `
    <div class="card profile-card" data-car-card="${escapeHtml(car.id)}">
      <div class="profile-color-bar" style="background:${escapeHtml(
        car.status === "active"
          ? "#16a34a"
          : car.status === "workshop"
          ? "#d97706"
          : "#6b7280"
      )}"></div>

      <div class="profile-card-head">
        <div class="big-avatar">${escapeHtml((car.alias || car.plate || "C").slice(0, 1).toUpperCase())}</div>
        <div>
          <div class="profile-name">${escapeHtml(car.alias || "Car")}</div>
          <div class="profile-role">${escapeHtml(car.plate || "-")}</div>
          <div class="muted">${escapeHtml(car.model || "-")}</div>
        </div>
      </div>

      <div class="grid-2">
        <label>
          <span>Matrícula</span>
          <input type="text" data-car-plate="${escapeHtml(car.id)}" value="${escapeHtml(
    car.plate || ""
  )}" ${editable ? "" : "disabled"} />
        </label>

        <label>
          <span>Modelo</span>
          <input type="text" data-car-model="${escapeHtml(car.id)}" value="${escapeHtml(
    car.model || ""
  )}" ${editable ? "" : "disabled"} />
        </label>

        <label>
          <span>Alias</span>
          <input type="text" data-car-alias="${escapeHtml(car.id)}" value="${escapeHtml(
    car.alias || ""
  )}" ${editable ? "" : "disabled"} />
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
          <input type="number" step="0.1" min="0" data-car-km="${escapeHtml(car.id)}" value="${escapeHtml(
    String(num(car.currentKm))
  )}" ${editable ? "" : "disabled"} />
        </label>

        <label>
          <span>Driver por defecto</span>
          <select data-car-driver="${escapeHtml(car.id)}" ${editable ? "" : "disabled"}>
            ${driverOptions}
          </select>
        </label>

        <label>
          <span>ITV</span>
          <input type="date" data-car-itv="${escapeHtml(car.id)}" value="${escapeHtml(
    car.itv || ""
  )}" ${editable ? "" : "disabled"} />
        </label>

        <label>
          <span>Seguro</span>
          <input type="date" data-car-insurance="${escapeHtml(car.id)}" value="${escapeHtml(
    car.insurance || ""
  )}" ${editable ? "" : "disabled"} />
        </label>
      </div>

      <label>
        <span>Notas</span>
        <input type="text" data-car-notes="${escapeHtml(car.id)}" value="${escapeHtml(
    car.notes || ""
  )}" ${editable ? "" : "disabled"} />
      </label>

      ${
        editable
          ? `
        <div class="profile-actions">
          <button class="primary-btn" type="button" data-save-car="${escapeHtml(car.id)}">Guardar coche</button>
        </div>
      `
          : ""
      }
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

async function handleCreateCar() {
  if (state.currentUser?.role !== "manager") {
    showToast("Solo el manager puede crear coches.");
    return;
  }

  try {
    const plate = $("newCarPlate").value.trim();
    const model = $("newCarModel").value.trim();
    const alias = $("newCarAlias").value.trim();
    const status = $("newCarStatus").value;
    const currentKm = num($("newCarKm").value);
    const defaultDriverKey = $("newCarDriverKey").value;
    const itv = $("newCarItv").value;
    const insurance = $("newCarInsurance").value;
    const notes = $("newCarNotes").value.trim();

    if (!plate && !alias) throw new Error("Introduce al menos matrícula o alias.");

    const id = randomId("car");

    await setDoc(doc(db, "cars", id), {
      plate,
      model,
      alias,
      status,
      currentKm,
      defaultDriverKey,
      itv,
      insurance,
      notes,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    });

    $("newCarForm").reset();
    $("newCarStatus").value = "active";
    showToast("Coche creado.");
  } catch (error) {
    console.error(error);
    showToast(error.message || "No se pudo crear el coche.");
  }
}

async function saveCar(carId) {
  try {
    const plate = document.querySelector(`[data-car-plate="${carId}"]`)?.value?.trim() || "";
    const model = document.querySelector(`[data-car-model="${carId}"]`)?.value?.trim() || "";
    const alias = document.querySelector(`[data-car-alias="${carId}"]`)?.value?.trim() || "";
    const status = document.querySelector(`[data-car-status="${carId}"]`)?.value || "active";
    const currentKm = num(document.querySelector(`[data-car-km="${carId}"]`)?.value);
    const defaultDriverKey =
      document.querySelector(`[data-car-driver="${carId}"]`)?.value || "";
    const itv = document.querySelector(`[data-car-itv="${carId}"]`)?.value || "";
    const insurance = document.querySelector(`[data-car-insurance="${carId}"]`)?.value || "";
    const notes = document.querySelector(`[data-car-notes="${carId}"]`)?.value?.trim() || "";

    await updateDoc(doc(db, "cars", carId), {
      plate,
      model,
      alias,
      status,
      currentKm,
      defaultDriverKey,
      itv,
      insurance,
      notes,
      updatedAt: serverTimestamp(),
    });

    showToast("Coche guardado.");
  } catch (error) {
    console.error(error);
    showToast("No se pudo guardar el coche.");
  }
}

/* =========================================================
   PHOTO MODAL
========================================================= */
function openPhotoModal(staffKey) {
  const profile = getProfileByKey(staffKey);
  if (!profile) return;

  state.photoModalStaffKey = staffKey;
  state.pendingPhotoFile = null;
  revokePendingPreview();

  $("photoModalTitle").textContent = `${profile.fullName} — Foto del driver`;

  if (profile.photoUrl) {
    $("photoPreviewImg").src = profile.photoUrl;
    show($("photoPreviewImg"));
    hide($("photoPreviewAvatar"));
  } else {
    $("photoPreviewImg").src = "";
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
  state.photoModalStaffKey = null;
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
    showToast("Selecciona una foto primero.");
    return;
  }

  try {
    const profile = getProfileByKey(state.photoModalStaffKey);
    if (!profile) throw new Error("Driver no encontrado.");

    if (profile.photoPath) {
      try {
        await deleteObject(storageRef(storage, profile.photoPath));
      } catch (_) {}
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
  if (!state.photoModalStaffKey) return;

  try {
    const profile = getProfileByKey(state.photoModalStaffKey);
    if (!profile) throw new Error("Driver no encontrado.");

    if (profile.photoPath) {
      try {
        await deleteObject(storageRef(storage, profile.photoPath));
      } catch (_) {}
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
async function exportCurrentReportPdf() {
  try {
    const rows = getReportRows();
    const summary = summarizeRows(rows);
    const range = $("reportRange").value;
    const driverKey =
      state.currentUser?.role === "manager"
        ? $("reportDriverFilter").value
        : state.currentUser?.staffKey || "all";
    const carFilter = $("reportCarFilter").value.trim();
    const selectedProfile =
      driverKey && driverKey !== "all" ? getProfileByKey(driverKey) : null;

    const { jsPDF } = await import("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm");
    const pdf = new jsPDF({ unit: "mm", format: "a4" });

    const page = {
      width: pdf.internal.pageSize.getWidth(),
      height: pdf.internal.pageSize.getHeight(),
      margin: 14,
    };

    let y = 16;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(20);
    pdf.text("TAXI FLEET REPORT", page.margin, y);
    y += 8;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(`Generado: ${dateTimeLabel()}`, page.margin, y);
    y += 6;
    pdf.text(`Periodo: ${range.toUpperCase()}`, page.margin, y);
    y += 6;
    pdf.text(`Driver: ${selectedProfile ? selectedProfile.fullName : "GLOBAL"}`, page.margin, y);
    y += 6;
    pdf.text(`Filtro coche: ${carFilter || "ALL"}`, page.margin, y);
    y += 10;

    if (selectedProfile) {
      y = await drawPdfDriverBlock(pdf, selectedProfile, page.margin, y, page.width - page.margin * 2);
      y += 8;
    }

    y = drawPdfSectionTitle(pdf, "RESUMEN", page.margin, y);
    y = drawPdfSummaryGrid(
      pdf,
      [
        ["Ingresos", money(summary.totalIncome)],
        ["Fuel", money(summary.totalFuel)],
        ["Spending", money(summary.totalSpending)],
        ["Neto", money(summary.netProfit)],
        ["KM", summary.totalKm.toFixed(1)],
        ["KM/€", summary.kmPerEuro.toFixed(3)],
        ["€/hora", summary.eurPerHour.toFixed(2)],
        ["Turnos", String(summary.count)],
      ],
      page.margin,
      y,
      page.width - page.margin * 2
    );
    y += 6;

    y = drawPdfSectionTitle(pdf, "BREAKDOWN", page.margin, y);
    y = drawPdfSummaryGrid(
      pdf,
      [
        ["Taxímetro", money(summary.totalTaximetro)],
        ["Cabify", money(summary.totalCabify)],
        ["Free Now", money(summary.totalFreeNow)],
        ["Uber", money(summary.totalUber)],
        ["Fuel", money(summary.totalFuel)],
        ["Gastos", money(summary.totalExpenses)],
        ["Mantenimiento", money(summary.totalMaintenance)],
        ["Apps", money(summary.totalApps)],
      ],
      page.margin,
      y,
      page.width - page.margin * 2
    );
    y += 6;

    const peakDay = getBestDay(rows);
    const peakHour = getPeakHour(rows);
    const fuelDay = getHighestFuelDay(rows);

    y = drawPdfSectionTitle(pdf, "PICOS", page.margin, y);
    y = drawPdfTextList(
      pdf,
      [
        `Peak day: ${peakDay ? `${peakDay.key} · ${money(peakDay.summary.totalIncome)}` : "—"}`,
        `Peak hour: ${peakHour ? `${String(peakHour.hour).padStart(2, "0")}:00 · ${money(peakHour.amount)}` : "—"}`,
        `Highest fuel day: ${fuelDay ? `${fuelDay.key} · ${money(fuelDay.summary.totalFuel)}` : "—"}`,
      ],
      page.margin,
      y,
      page.width - page.margin * 2
    );
    y += 6;

    y = drawPdfSectionTitle(pdf, "TURNOS INCLUIDOS", page.margin, y);
    y = drawPdfShiftTable(pdf, rows, page.margin, y, page);

    const reportLabel = selectedProfile ? selectedProfile.fullName : "GLOBAL";
    const fileName = `taxi-report-${reportLabel}-${range}-${todayISO()}.pdf`;
    pdf.save(fileName);

    showToast("PDF exportado.");
  } catch (error) {
    console.error(error);
    showToast("No se pudo exportar el PDF.");
  }
}

function drawPdfSectionTitle(pdf, title, x, y) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(title, x, y);
  pdf.setDrawColor(170);
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

  const imgX = x + 4;
  const imgY = y + 4;

  if (profile.photoUrl) {
    const dataUrl = await imageUrlToDataUrl(profile.photoUrl);
    if (dataUrl) {
      pdf.addImage(dataUrl, "JPEG", imgX, imgY, 18, 18);
    } else {
      drawPdfAvatarCircle(pdf, profile, imgX + 9, imgY + 9, 9);
    }
  } else {
    drawPdfAvatarCircle(pdf, profile, imgX + 9, imgY + 9, 9);
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(profile.fullName, x + 28, y + 10);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(`Role: ${profile.role === "manager" ? "Manager / Driver" : "Driver"}`, x + 28, y + 16);
  pdf.text(`Coche por defecto: ${getDefaultCarLabelForDriver(profile.staffKey) || "-"}`, x + 28, y + 22);

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

function drawPdfShiftTable(pdf, rows, x, y, page) {
  const headers = ["Fecha", "Driver", "Coche", "KM", "Ingreso", "Fuel", "Spend", "Neto"];
  const colWidths = [24, 28, 30, 16, 24, 18, 22, 20];
  const lineHeight = 7;
  const startX = x;

  function drawHeader() {
    let cursor = startX;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    headers.forEach((header, index) => {
      pdf.setDrawColor(220);
      pdf.rect(cursor, y, colWidths[index], lineHeight);
      pdf.text(header, cursor + 2, y + 4.5);
      cursor += colWidths[index];
    });
    y += lineHeight;
  }

  drawHeader();
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);

  rows.forEach((row) => {
    if (y > page.height - 18) {
      pdf.addPage();
      y = 16;
      drawHeader();
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
    }

    const cells = [
      row.dateKey || "",
      row.driverName || "",
      truncateText(row.vehicle || "-", 18),
      num(row.km).toFixed(1),
      money(row.totalIncome),
      money(row.totalFuel),
      money(row.totalSpending),
      money(row.netProfit),
    ];

    let cursor = startX;
    cells.forEach((cell, index) => {
      pdf.setDrawColor(230);
      pdf.rect(cursor, y, colWidths[index], lineHeight);
      pdf.text(String(cell), cursor + 2, y + 4.5, {
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
    console.warn("No se pudo cargar imagen para PDF:", error);
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

/* =========================================================
   INITIAL EMPTY RENDERS
========================================================= */
renderShiftPreview();
renderDashboard();
renderHistoryTable();
renderReports();
renderDriversStats();
renderDriversGrid();
renderCarsStats();
renderCarsGrid();
