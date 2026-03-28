import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,c
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
  getDocs,
  limit,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-storage.js";

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

const FIXED_STAFF = {
  mudassar: { staffKey: "mudassar", fullName: "MUDASSAR", email: "mudassar@fleet.app", password: "mudassar1990", pin: "1990", role: "manager", colorHex: "#1d4ed8", managerKey: "mudassar", managerName: "MUDASSAR", systemUser: true },
  saqlain: { staffKey: "saqlain", fullName: "SAQLAIN", email: "saqlain@fleet.app", password: "saqlain1234", pin: "1234", role: "driver", colorHex: "#16a34a", managerKey: "mudassar", managerName: "MUDASSAR", systemUser: true },
  shujaat: { staffKey: "shujaat", fullName: "SHUJAAT", email: "shujaat@fleet.app", password: "shujaat1234", pin: "1234", role: "driver", colorHex: "#ea580c", managerKey: "mudassar", managerName: "MUDASSAR", systemUser: true },
};
const FIXED_BY_EMAIL = Object.values(FIXED_STAFF).reduce((acc, item) => (acc[item.email] = item, acc), {});
const HISTORY_PAGE_SIZE = 30;
const PENDING_KEY = "taxi_pending_local_shifts_v1";
const THEME_KEY = "taxi_theme_mode";

const state = {
  authUser: null,
  currentUser: null,
  mode: "cloud",
  driverProfiles: {},
  cars: {},
  shifts: [],
  historyPage: 1,
  pendingPhotoFile: null,
  pendingPhotoPreviewUrl: "",
  photoModalStaffKey: null,
  chartLibPromise: null,
  incomeChart: null,
  spendingChart: null,
  reportChart: null,
  appBreakdownChart: null,
  unsubProfiles: null,
  unsubCars: null,
  unsubShifts: null,
};

const $ = (id) => document.getElementById(id);
const show = (el) => el?.classList.remove("hidden");
const hide = (el) => el?.classList.add("hidden");
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const safeDiv = (a, b) => b > 0 ? a / b : 0;
const money = (v) => `€${num(v).toFixed(2)}`;
const todayISO = () => new Date().toISOString().slice(0, 10);
const initials = (name) => String(name || "U").trim().split(/\s+/).slice(0, 2).map(x => x[0]?.toUpperCase() || "").join("") || "U";
const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  show(toast);
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => hide(toast), 2600);
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(d);
}

function dateTimeLabel() {
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "full", timeStyle: "short" }).format(new Date());
}

function statCard(label, value, sub = "") {
  return `<div class="stat-card"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value">${escapeHtml(value)}</div><div class="stat-sub">${escapeHtml(sub)}</div></div>`;
}

function slugify(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function randomId(prefix = "id") { return `${prefix}-${Math.random().toString(36).slice(2, 10)}`; }
function truncateText(text, max = 40) { const s = String(text || ""); return s.length <= max ? s : `${s.slice(0, max - 1)}…`; }

function hexToRgb(hex) {
  const clean = String(hex || "").replace("#", "");
  const full = clean.length === 3 ? clean.split("").map(c => c + c).join("") : clean.padEnd(6, "0");
  const parsed = parseInt(full, 16);
  return { r: (parsed >> 16) & 255, g: (parsed >> 8) & 255, b: parsed & 255 };
}
function blendColor(hex, alpha = 0.14) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function getCssColor(variable, fallback) { return getComputedStyle(document.body).getPropertyValue(variable).trim() || fallback; }

function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
  const label = theme === "light" ? "Night mode" : "Day mode";
  if ($("themeToggleBtn")) $("themeToggleBtn").textContent = label;
  if ($("themeToggleAuthBtn")) $("themeToggleAuthBtn").textContent = label;
}
(function initTheme() { applyTheme(localStorage.getItem(THEME_KEY) || "light"); })();
$("themeToggleBtn")?.addEventListener("click", () => applyTheme((document.body.getAttribute("data-theme") || "light") === "light" ? "dark" : "light"));
$("themeToggleAuthBtn")?.addEventListener("click", () => applyTheme((document.body.getAttribute("data-theme") || "light") === "light" ? "dark" : "light"));

function cleanupSubs() {
  if (typeof state.unsubProfiles === "function") state.unsubProfiles();
  if (typeof state.unsubCars === "function") state.unsubCars();
  if (typeof state.unsubShifts === "function") state.unsubShifts();
  state.unsubProfiles = state.unsubCars = state.unsubShifts = null;
}
function destroyCharts() {
  ["incomeChart","spendingChart","reportChart","appBreakdownChart"].forEach(k => {
    if (state[k]) { try { state[k].destroy(); } catch (_) {} state[k] = null; }
  });
}
function getPendingLocalShifts() { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || "[]"); } catch { return []; } }
function setPendingLocalShifts(rows) { localStorage.setItem(PENDING_KEY, JSON.stringify(rows)); updateSyncButton(); }
function addPendingLocalShift(row) { const rows = getPendingLocalShifts(); rows.push(row); setPendingLocalShifts(rows); }
function updateSyncButton() {
  const btn = $("syncPendingBtn");
  const count = getPendingLocalShifts().length;
  if (!btn) return;
  if (count > 0) { btn.textContent = `Sincronizar turnos locales (${count})`; show(btn); } else hide(btn);
}

function buildFallbackProfileFromFixed(base) {
  return {
    staffKey: base.staffKey,
    fullName: base.fullName,
    role: base.role,
    email: base.email,
    managerKey: base.managerKey,
    managerName: base.managerName,
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
  const merged = {};
  Object.keys(FIXED_STAFF).forEach((k) => { merged[k] = state.driverProfiles[k] || buildFallbackProfileFromFixed(FIXED_STAFF[k]); });
  Object.keys(state.driverProfiles).forEach((k) => { merged[k] = state.driverProfiles[k]; });
  return merged;
}
function getProfileByKey(staffKey) { return getAllProfiles()[staffKey] || null; }
function getVisibleProfiles() {
  const all = Object.values(getAllProfiles()).filter(p => p.active !== false).sort((a, b) => a.fullName.localeCompare(b.fullName));
  return state.currentUser?.role === "manager" ? all : all.filter(p => p.staffKey === state.currentUser?.staffKey);
}
function getSelectableDrivers() {
  return Object.values(getAllProfiles()).filter(p => p.active !== false).sort((a, b) => a.fullName.localeCompare(b.fullName));
}
function getAllCarsList() {
  return Object.entries(state.cars).map(([id, car]) => ({ id, ...car })).sort((a, b) => getCarLabel(a).localeCompare(getCarLabel(b)));
}
function getActiveCarsList() { return getAllCarsList().filter(c => c.status !== "inactive"); }
function getCarById(carId) { return carId && state.cars[carId] ? { id: carId, ...state.cars[carId] } : null; }
function getCarLabel(car) { return [car?.alias, car?.plate, car?.model].filter(Boolean).join(" · "); }
function getDefaultCarLabelForDriver(staffKey) { const p = getProfileByKey(staffKey); return p?.defaultCarId ? (getCarLabel(getCarById(p.defaultCarId)) || "") : ""; }
function getProfileImageHtml(profile, kind = "small") {
  const photoUrl = profile?.photoUrl || "";
  const initialsText = initials(profile?.fullName || "D");
  const sizeClass = kind === "large" ? "profile-photo" : "mini-avatar";
  if (photoUrl) return `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(profile.fullName)}" class="${sizeClass}" />`;
  return `<div class="${sizeClass} fallback">${escapeHtml(initialsText)}</div>`;
}
function getDriverBadgeHtml(profile) { return `<span class="driver-badge" style="background:${escapeHtml(profile.colorHex || '#1d4ed8')}">${escapeHtml(profile.fullName)}</span>`; }
function getDriverLineHtml(profile) { return `<div class="driver-line" style="background:${escapeHtml(profile.colorHex || '#1d4ed8')}"></div>`; }

function setSidebarProfilePhoto() {
  const profile = getProfileByKey(state.currentUser?.staffKey || "");
  if (!profile) return;
  const photo = $("sidebarPhoto");
  const avatar = $("sidebarAvatar");
  if (profile.photoUrl) {
    photo.src = profile.photoUrl;
    show(photo); hide(avatar);
  } else {
    hide(photo); avatar.textContent = initials(profile.fullName); show(avatar);
  }
}

function setHeaderInfo() {
  const profile = getProfileByKey(state.currentUser?.staffKey || "");
  if (!profile) return;
  $("sidebarName").textContent = profile.fullName;
  $("sidebarRole").textContent = profile.role === "manager" ? "Manager / Driver" : "Driver";
  $("sidebarVehicle").textContent = getDefaultCarLabelForDriver(profile.staffKey);
  $("topbarDate").textContent = dateTimeLabel();
  $("sessionBadge").textContent = state.mode === "cloud" ? "Live" : "Local";
  $("sessionModeText").textContent = state.mode === "cloud" ? "Taxi dashboard" : "Modo local de emergencia";
  setSidebarProfilePhoto();
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

function updateLoginMode() {
  $("loginHint").textContent = "Introduce tus credenciales para continuar.";
  $("loginPin").value = "";
}
$("loginStaff")?.addEventListener("change", updateLoginMode);
updateLoginMode();

$("loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const selectedKey = $("loginStaff").value;
  const selected = FIXED_STAFF[selectedKey];
  const pin = $("loginPin").value.trim();
  if (!selected) return showToast("Usuario no válido.");
  if (pin !== selected.pin) return showToast("PIN incorrecto.");
  try {
    await signInWithEmailAndPassword(auth, selected.email, selected.password);
    $("loginPin").value = "";
    showToast("Sesión iniciada.");
  } catch (error) {
    console.error(error);
    showToast("No se pudo iniciar sesión. Revisa Firebase Auth.");
  }
});

$("quickDriverModeBtn")?.addEventListener("click", async () => {
  const staffKey = $("quickDriverSelect").value;
  const base = FIXED_STAFF[staffKey] || buildFallbackProfileFromFixed({ staffKey, fullName: staffKey.toUpperCase(), role: "driver", colorHex: "#16a34a", managerKey: "mudassar", managerName: "MUDASSAR" });
  cleanupSubs();
  destroyCharts();
  state.authUser = null;
  state.currentUser = { ...base };
  state.mode = "local";
  await ensureInitialFixedProfiles();
  await ensureInitialManagerCarSeed();
  bootApp();
  showToast("Modo local de emergencia activado.");
});

$("logoutBtn")?.addEventListener("click", async () => {
  try {
    cleanupSubs(); destroyCharts();
    state.mode = "cloud";
    if (auth.currentUser) await signOut(auth);
    state.authUser = null; state.currentUser = null; state.driverProfiles = {}; state.cars = {}; state.shifts = []; state.historyPage = 1;
    show($("authView")); hide($("appView"));
    updateSyncButton();
    showToast("Sesión cerrada.");
  } catch (error) {
    console.error(error);
    showToast("No se pudo cerrar sesión.");
  }
});

onAuthStateChanged(auth, async (user) => {
  if (state.mode === "local") return;
  cleanupSubs();
  if (!user) {
    state.authUser = null; state.currentUser = null; state.driverProfiles = {}; state.cars = {}; state.shifts = []; state.historyPage = 1;
    show($("authView")); hide($("appView")); destroyCharts(); updateSyncButton();
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
  state.mode = "cloud";
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
  for (const key of Object.keys(FIXED_STAFF)) {
    const base = FIXED_STAFF[key];
    const ref = doc(db, "driverProfiles", key);
    const snap = await getDoc(ref);
    const prev = snap.exists() ? snap.data() : {};
    await setDoc(ref, {
      staffKey: base.staffKey,
      fullName: base.fullName,
      role: base.role,
      email: base.email,
      managerKey: base.managerKey,
      managerName: base.managerName,
      colorHex: prev.colorHex || base.colorHex,
      phone: prev.phone || "",
      defaultCarId: prev.defaultCarId || "",
      photoUrl: prev.photoUrl || "",
      photoPath: prev.photoPath || "",
      active: prev.active !== false,
      systemUser: true,
      operationalOnly: false,
      requestedLoginEmail: base.email,
      createdAt: prev.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
}

async function ensureInitialManagerCarSeed() {
  if (state.currentUser?.role !== "manager" && state.mode !== "local") return;
  const seedCars = [
    { id: "car-1", plate: "0001-AAA", model: "Toyota Prius", alias: "Taxi 1", status: "active", currentKm: 0, defaultDriverKey: "mudassar", itv: "", insurance: "", notes: "" },
    { id: "car-2", plate: "0002-BBB", model: "Skoda Octavia", alias: "Taxi 2", status: "active", currentKm: 0, defaultDriverKey: "saqlain", itv: "", insurance: "", notes: "" },
  ];
  for (const car of seedCars) {
    const ref = doc(db, "cars", car.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) await setDoc(ref, { ...car, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
}

function bootApp() {
  hide($("authView")); show($("appView"));
  setHeaderInfo(); attachNav(); bindGeneralEvents();
  if (state.mode === "cloud") {
    subscribeDriverProfiles(); subscribeCars(); subscribeShifts();
  } else {
    bootstrapLocalModeState();
  }
  renderShiftSelectors(); setShiftDefaults(); renderShiftPreview(); renderAllViews(); updateSyncButton();
}

let eventsBound = false;
function bindGeneralEvents() {
  if (eventsBound) return; eventsBound = true;
  ["sfDate","sfDriverKey","sfCarId","sfKm","sfStartTime","sfEndTime","sfNotes","sfTaximetroCash","sfTaximetroCard","sfCabifyCash","sfCabifyApp","sfFreeNowCash","sfFreeNowApp","sfUberApp","sfFuel1","sfFuel2","sfFuel3","sfFuelOther","sfParking","sfTolls","sfCleaning","sfOtherExpenses","sfWash","sfOil","sfTyres","sfWorkshop","sfItv","sfOtherMaintenance"].forEach((id) => {
    $(id)?.addEventListener("input", renderShiftPreview);
    $(id)?.addEventListener("change", renderShiftPreview);
  });
  $("sfDriverKey")?.addEventListener("change", () => { applyDriverDefaultCar(); renderShiftPreview(); });
  $("resetShiftBtn")?.addEventListener("click", () => { $("shiftForm").reset(); setShiftDefaults(); renderShiftPreview(); });
  $("shiftForm")?.addEventListener("submit", handleSaveShift);
  $("historySearch")?.addEventListener("input", resetAndRenderHistory);
  $("historyDateFilter")?.addEventListener("change", resetAndRenderHistory);
  $("historyDriverFilter")?.addEventListener("change", resetAndRenderHistory);
  $("historyCarFilter")?.addEventListener("input", resetAndRenderHistory);
  $("clearHistoryFiltersBtn")?.addEventListener("click", () => { $("historySearch").value = ""; $("historyDateFilter").value = ""; $("historyDriverFilter").value = "all"; $("historyCarFilter").value = ""; state.historyPage = 1; renderHistoryTable(); });
  $("historyPrevBtn")?.addEventListener("click", () => { state.historyPage = Math.max(1, state.historyPage - 1); renderHistoryTable(); });
  $("historyNextBtn")?.addEventListener("click", () => { state.historyPage = Math.min(getHistoryTotalPages(), state.historyPage + 1); renderHistoryTable(); });
  $("reportRange")?.addEventListener("change", renderReports);
  $("reportDriverFilter")?.addEventListener("change", renderReports);
  $("reportCarFilter")?.addEventListener("input", renderReports);
  $("exportReportPdfBtn")?.addEventListener("click", exportCurrentReportPdf);
  $("createDriverBtn")?.addEventListener("click", handleCreateDriver);
  $("createCarBtn")?.addEventListener("click", handleCreateCar);
  $("syncPendingBtn")?.addEventListener("click", syncPendingLocalShifts);
  $("closePhotoModalBtn")?.addEventListener("click", closePhotoModal);
  document.querySelectorAll("[data-close-photo-modal]").forEach((el) => el.addEventListener("click", closePhotoModal));
  $("driverPhotoUploadInput")?.addEventListener("change", (e) => handleSelectedPhotoFile(e.target.files?.[0] || null));
  $("driverPhotoCameraInput")?.addEventListener("change", (e) => handleSelectedPhotoFile(e.target.files?.[0] || null));
  $("saveDriverPhotoBtn")?.addEventListener("click", saveDriverPhoto);
  $("removeDriverPhotoBtn")?.addEventListener("click", removeDriverPhoto);
}

function bootstrapLocalModeState() {
  // Local mode uses cloud profiles/cars if previously loaded, otherwise fixed ones and local cars.
  if (!Object.keys(state.driverProfiles).length) {
    Object.keys(FIXED_STAFF).forEach((k) => { state.driverProfiles[k] = buildFallbackProfileFromFixed(FIXED_STAFF[k]); });
  }
  if (!Object.keys(state.cars).length) {
    state.cars = {
      "car-1": { plate: "0001-AAA", model: "Toyota Prius", alias: "Taxi 1", status: "active", currentKm: 0, defaultDriverKey: "mudassar", itv: "", insurance: "", notes: "" },
      "car-2": { plate: "0002-BBB", model: "Skoda Octavia", alias: "Taxi 2", status: "active", currentKm: 0, defaultDriverKey: "saqlain", itv: "", insurance: "", notes: "" },
    };
  }
  const localRows = getPendingLocalShifts().map((x) => ({ ...x, id: x.id || randomId("local") }));
  state.shifts = localRows.sort(sortShiftsNewestFirst);
}

function subscribeDriverProfiles() {
  if (state.currentUser?.role === "manager") {
    state.unsubProfiles = onSnapshot(collection(db, "driverProfiles"), (snap) => {
      const next = {};
      snap.docs.forEach((d) => { next[d.id] = d.data(); });
      state.driverProfiles = next; afterProfilesOrCarsChange();
    });
  } else {
    state.unsubProfiles = onSnapshot(doc(db, "driverProfiles", state.currentUser.staffKey), (snap) => {
      const next = {};
      if (snap.exists()) next[snap.id] = snap.data();
      state.driverProfiles = next; afterProfilesOrCarsChange();
    });
  }
}
function subscribeCars() {
  state.unsubCars = onSnapshot(collection(db, "cars"), (snap) => {
    const next = {};
    snap.docs.forEach((d) => { next[d.id] = d.data(); });
    state.cars = next; afterProfilesOrCarsChange();
  });
}
function subscribeShifts() {
  const shiftsRef = collection(db, "shifts");
  if (state.currentUser?.role === "manager") {
    state.unsubShifts = onSnapshot(query(shiftsRef, where("managerKey", "==", "mudassar"), limit(500)), (snap) => {
      state.shifts = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(sortShiftsNewestFirst); afterShiftsChange();
    });
  } else {
    state.unsubShifts = onSnapshot(query(shiftsRef, where("driverKey", "==", state.currentUser.staffKey), limit(500)), (snap) => {
      state.shifts = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(sortShiftsNewestFirst); afterShiftsChange();
    });
  }
}
function afterProfilesOrCarsChange() {
  setHeaderInfo(); renderShiftSelectors(); renderDriversStats(); renderDriversGrid(); renderCarsStats(); renderCarsGrid(); renderHistoryDriverFilter(); renderReportDriverFilter(); renderNewDriverCarOptions(); renderNewCarDriverOptions(); renderShiftPreview(); renderReports(); renderHistoryTable();
}
function afterShiftsChange() { renderDashboard(); renderHistoryTable(); renderReports(); }
function renderAllViews() { renderDashboard(); renderHistoryTable(); renderReports(); renderDriversStats(); renderDriversGrid(); renderCarsStats(); renderCarsGrid(); renderHistoryDriverFilter(); renderReportDriverFilter(); renderNewDriverCarOptions(); renderNewCarDriverOptions(); }

function renderShiftSelectors() {
  if (state.currentUser?.role === "manager") show($("driverSelectWrap")); else hide($("driverSelectWrap"));
  $("sfDriverKey").innerHTML = getSelectableDrivers().map((p) => `<option value="${p.staffKey}">${escapeHtml(p.fullName)}</option>`).join("");
  $("sfCarId").innerHTML = [`<option value="">Seleccionar coche</option>`, ...getActiveCarsList().map((c) => `<option value="${c.id}">${escapeHtml(getCarLabel(c))}</option>`)].join("");
  if (state.currentUser?.role === "manager") {
    if (!$("sfDriverKey").value) $("sfDriverKey").value = state.currentUser.staffKey;
    applyDriverDefaultCar();
  } else {
    const own = getProfileByKey(state.currentUser?.staffKey || "");
    $("sfCarId").value = own?.defaultCarId || "";
  }
}
function renderHistoryDriverFilter() {
  if (state.currentUser?.role !== "manager") {
    $("historyDriverFilter").innerHTML = `<option value="${state.currentUser.staffKey}">${escapeHtml(state.currentUser.fullName)}</option>`;
    return;
  }
  $("historyDriverFilter").innerHTML = [`<option value="all">All</option>`, ...getSelectableDrivers().map((p) => `<option value="${p.staffKey}">${escapeHtml(p.fullName)}</option>`)].join("");
}
function renderReportDriverFilter() {
  if (state.currentUser?.role !== "manager") {
    $("reportDriverFilter").innerHTML = `<option value="${state.currentUser.staffKey}">${escapeHtml(state.currentUser.fullName)}</option>`;
    return;
  }
  $("reportDriverFilter").innerHTML = [`<option value="all">All</option>`, ...getSelectableDrivers().map((p) => `<option value="${p.staffKey}">${escapeHtml(p.fullName)}</option>`)].join("");
}
function renderNewDriverCarOptions() {
  $("newDriverCarId").innerHTML = [`<option value="">Sin coche por defecto</option>`, ...getActiveCarsList().map((c) => `<option value="${c.id}">${escapeHtml(getCarLabel(c))}</option>`)].join("");
}
function renderNewCarDriverOptions() {
  $("newCarDriverKey").innerHTML = [`<option value="">Sin conductor por defecto</option>`, ...getSelectableDrivers().map((p) => `<option value="${p.staffKey}">${escapeHtml(p.fullName)}</option>`)].join("");
}
function applyDriverDefaultCar() {
  const selected = getProfileByKey($("sfDriverKey").value);
  $("sfCarId").value = selected?.defaultCarId || "";
}

function setShiftDefaults() {
  $("sfDate").value = todayISO();
  $("sfKm").value = "";
  $("sfStartTime").value = "";
  $("sfEndTime").value = "";
  $("sfNotes").value = "";
  ["sfTaximetroCash","sfTaximetroCard","sfCabifyCash","sfCabifyApp","sfFreeNowCash","sfFreeNowApp","sfUberApp","sfFuel1","sfFuel2","sfFuel3","sfFuelOther","sfParking","sfTolls","sfCleaning","sfOtherExpenses","sfWash","sfOil","sfTyres","sfWorkshop","sfItv","sfOtherMaintenance"].forEach((id) => { $(id).value = "0"; });
  if (state.currentUser?.role === "manager") { $("sfDriverKey").value = state.currentUser.staffKey; applyDriverDefaultCar(); }
  else { const own = getProfileByKey(state.currentUser?.staffKey || ""); $("sfCarId").value = own?.defaultCarId || ""; }
}

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
    dateKey: $("sfDate").value, km: $("sfKm").value, startTime: $("sfStartTime").value, endTime: $("sfEndTime").value, notes: $("sfNotes").value.trim(),
    taximetroCash: $("sfTaximetroCash").value, taximetroCard: $("sfTaximetroCard").value, cabifyCash: $("sfCabifyCash").value, cabifyApp: $("sfCabifyApp").value,
    freeNowCash: $("sfFreeNowCash").value, freeNowApp: $("sfFreeNowApp").value, uberApp: $("sfUberApp").value,
    fuel1: $("sfFuel1").value, fuel2: $("sfFuel2").value, fuel3: $("sfFuel3").value, fuelOther: $("sfFuelOther").value,
    parking: $("sfParking").value, tolls: $("sfTolls").value, cleaning: $("sfCleaning").value, otherExpenses: $("sfOtherExpenses").value,
    wash: $("sfWash").value, oil: $("sfOil").value, tyres: $("sfTyres").value, workshop: $("sfWorkshop").value, itv: $("sfItv").value, otherMaintenance: $("sfOtherMaintenance").value,
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
  const totalExpenses = num(raw.parking) + num(raw.tolls) + num(raw.cleaning) + num(raw.otherExpenses);
  const totalMaintenance = num(raw.wash) + num(raw.oil) + num(raw.tyres) + num(raw.workshop) + num(raw.itv) + num(raw.otherMaintenance);
  const totalSpending = totalFuel + totalExpenses + totalMaintenance;
  const netProfit = totalIncome - totalSpending;
  return { workedMinutes, workedHours, km, totalTaximetro, totalCabify, totalFreeNow, totalUber, totalCash, totalCard, totalApps, totalIncome, totalFuel, totalExpenses, totalMaintenance, totalSpending, netProfit, kmPerEuro: safeDiv(km, totalIncome), eurPerHour: safeDiv(totalIncome, workedHours) };
}
function renderShiftPreview() {
  const calc = calculateShift(getShiftFormRaw());
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
}

async function handleSaveShift(e) {
  e.preventDefault();
  try {
    const payload = buildShiftPayload();
    if (state.mode === "cloud" && state.authUser) {
      await addDoc(collection(db, "shifts"), payload);
      showToast("Turno guardado en cloud.");
    } else {
      addPendingLocalShift({ ...payload, id: randomId("local"), localOnly: true, createdAtLocal: Date.now() });
      state.shifts = getPendingLocalShifts().sort(sortShiftsNewestFirst);
      showToast("Turno guardado localmente.");
      afterShiftsChange();
    }
    $("shiftForm").reset(); setShiftDefaults(); renderShiftPreview();
    openView("historyView");
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    document.querySelector('[data-view="historyView"]').classList.add("active");
  } catch (error) {
    console.error(error);
    showToast(error.message || "No se pudo guardar el turno.");
  }
}

function buildShiftPayload() {
  const driverKey = state.currentUser?.role === "manager" ? $("sfDriverKey").value : state.currentUser?.staffKey;
  const profile = getProfileByKey(driverKey);
  if (!profile) throw new Error("Driver no válido.");
  const raw = getShiftFormRaw();
  if (!raw.dateKey) throw new Error("La fecha es obligatoria.");
  if (!raw.startTime || !raw.endTime) throw new Error("Las horas son obligatorias.");
  if (num(raw.km) < 0) throw new Error("Los KM no pueden ser negativos.");
  const calc = calculateShift(raw);
  const car = getCarById($("sfCarId").value);
  return {
    driverKey: profile.staffKey,
    driverName: profile.fullName,
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
    taximetroCash: num(raw.taximetroCash), taximetroCard: num(raw.taximetroCard), cabifyCash: num(raw.cabifyCash), cabifyApp: num(raw.cabifyApp), freeNowCash: num(raw.freeNowCash), freeNowApp: num(raw.freeNowApp), uberApp: num(raw.uberApp),
    totalTaximetro: calc.totalTaximetro, totalCabify: calc.totalCabify, totalFreeNow: calc.totalFreeNow, totalUber: calc.totalUber, totalCash: calc.totalCash, totalCard: calc.totalCard, totalApps: calc.totalApps, totalIncome: calc.totalIncome,
    fuel1: num(raw.fuel1), fuel2: num(raw.fuel2), fuel3: num(raw.fuel3), fuelOther: num(raw.fuelOther), totalFuel: calc.totalFuel,
    parking: num(raw.parking), tolls: num(raw.tolls), cleaning: num(raw.cleaning), otherExpenses: num(raw.otherExpenses), totalExpenses: calc.totalExpenses,
    wash: num(raw.wash), oil: num(raw.oil), tyres: num(raw.tyres), workshop: num(raw.workshop), itv: num(raw.itv), otherMaintenance: num(raw.otherMaintenance), totalMaintenance: calc.totalMaintenance,
    totalSpending: calc.totalSpending, netProfit: calc.netProfit, kmPerEuro: calc.kmPerEuro, eurPerHour: calc.eurPerHour,
    managerKey: "mudassar", managerName: "MUDASSAR", status: "CLOSED",
    createdByUid: state.authUser?.uid || "local-mode",
    createdByKey: state.currentUser?.staffKey || "local-mode",
    createdByRole: state.currentUser?.role || "driver",
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  };
}

function summarizeRows(rows) {
  const s = rows.reduce((acc, row) => {
    acc.count += 1; acc.totalHours += num(row.workedHours); acc.totalKm += num(row.km);
    acc.totalTaximetro += num(row.totalTaximetro); acc.totalCabify += num(row.totalCabify); acc.totalFreeNow += num(row.totalFreeNow); acc.totalUber += num(row.totalUber);
    acc.totalCash += num(row.totalCash); acc.totalCard += num(row.totalCard); acc.totalApps += num(row.totalApps); acc.totalIncome += num(row.totalIncome);
    acc.totalFuel += num(row.totalFuel); acc.totalExpenses += num(row.totalExpenses); acc.totalMaintenance += num(row.totalMaintenance); acc.totalSpending += num(row.totalSpending); acc.netProfit += num(row.netProfit);
    return acc;
  }, { count: 0, totalHours: 0, totalKm: 0, totalTaximetro: 0, totalCabify: 0, totalFreeNow: 0, totalUber: 0, totalCash: 0, totalCard: 0, totalApps: 0, totalIncome: 0, totalFuel: 0, totalExpenses: 0, totalMaintenance: 0, totalSpending: 0, netProfit: 0, kmPerEuro: 0, eurPerHour: 0 });
  s.kmPerEuro = safeDiv(s.totalKm, s.totalIncome); s.eurPerHour = safeDiv(s.totalIncome, s.totalHours);
  return s;
}
function groupRowsBy(rows, keyFn) { return rows.reduce((acc, row) => { const key = keyFn(row); if (!acc[key]) acc[key] = []; acc[key].push(row); return acc; }, {}); }
function filterRowsByRange(rows, range) {
  if (range === "all") return [...rows];
  const now = new Date(); const start = new Date(now); const end = new Date(now);
  if (range === "today") { start.setHours(0,0,0,0); end.setHours(23,59,59,999); }
  else if (range === "week") { const day = (start.getDay() + 6) % 7; start.setDate(start.getDate() - day); start.setHours(0,0,0,0); end.setTime(start.getTime()); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999); }
  else if (range === "month") { start.setDate(1); start.setHours(0,0,0,0); end.setMonth(end.getMonth()+1,0); end.setHours(23,59,59,999); }
  else if (range === "year") { start.setMonth(0,1); start.setHours(0,0,0,0); end.setMonth(11,31); end.setHours(23,59,59,999); }
  return rows.filter((row) => { const d = row.dateKey ? new Date(`${row.dateKey}T12:00:00`) : null; return d && d >= start && d <= end; });
}
function extractHour(timeStr) { if (!timeStr || !timeStr.includes(":")) return null; const h = Number(timeStr.split(":")[0]); return Number.isFinite(h) ? h : null; }
function buildCoveredHours(startHour, endHour) { const result = []; let current = startHour; let guard = 0; while (guard < 30) { result.push(current); if (current === endHour) break; current = (current + 1) % 24; guard += 1; } return [...new Set(result)]; }
function getPeakHour(rows) { const hourTotals = new Array(24).fill(0); rows.forEach((row) => { const sh = extractHour(row.startTime), eh = extractHour(row.endTime); if (sh === null || eh === null) return; const covered = buildCoveredHours(sh, eh); const distributed = safeDiv(num(row.totalIncome), covered.length || 1); covered.forEach((h) => hourTotals[h] += distributed); }); let bestHour = null, bestAmount = 0; hourTotals.forEach((amount, hour) => { if (amount > bestAmount) { bestHour = hour; bestAmount = amount; } }); return bestHour === null ? null : { hour: bestHour, amount: bestAmount }; }
function getBestDay(rows) { return Object.entries(groupRowsBy(rows, (r) => r.dateKey)).map(([key, rs]) => ({ key, summary: summarizeRows(rs) })).sort((a, b) => b.summary.totalIncome - a.summary.totalIncome)[0] || null; }
function getHighestFuelDay(rows) { return Object.entries(groupRowsBy(rows, (r) => r.dateKey)).map(([key, rs]) => ({ key, summary: summarizeRows(rs) })).sort((a, b) => b.summary.totalFuel - a.summary.totalFuel)[0] || null; }
function getWorstDay(rows) { return Object.entries(groupRowsBy(rows, (r) => r.dateKey)).map(([key, rs]) => ({ key, summary: summarizeRows(rs) })).sort((a, b) => a.summary.totalIncome - b.summary.totalIncome)[0] || null; }
function getBestDriver(rows) { return Object.entries(groupRowsBy(rows, (r) => r.driverKey)).map(([key, rs]) => ({ profile: getProfileByKey(key), summary: summarizeRows(rs) })).sort((a, b) => b.summary.totalIncome - a.summary.totalIncome)[0] || null; }

function renderDashboard() {
  const today = summarizeRows(filterRowsByRange(state.shifts, "today"));
  const week = summarizeRows(filterRowsByRange(state.shifts, "week"));
  const month = summarizeRows(filterRowsByRange(state.shifts, "month"));
  const year = summarizeRows(filterRowsByRange(state.shifts, "year"));
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
  $("todayIncomeSources").innerHTML = [statCard("Taxímetro", money(today.totalTaximetro), "Efectivo + tarjeta"), statCard("Cabify", money(today.totalCabify), "Efectivo + app"), statCard("Free Now", money(today.totalFreeNow), "Efectivo + app"), statCard("Uber", money(today.totalUber), "Solo app")].join("");
  $("todaySpendingSources").innerHTML = [statCard("Fuel", money(today.totalFuel), "Separado"), statCard("Gastos", money(today.totalExpenses), "Operativos"), statCard("Mantenimiento", money(today.totalMaintenance), "Servicio / taller"), statCard("Neto", money(today.netProfit), "Ingreso - gasto")].join("");
  renderTopDrivers(); renderPeakAnalytics(); queueChartRender();
}
function renderTopDrivers() {
  const ranked = Object.entries(groupRowsBy(state.shifts, (r) => r.driverKey)).map(([key, rs]) => ({ profile: getProfileByKey(key), summary: summarizeRows(rs) })).sort((a, b) => b.summary.totalIncome - a.summary.totalIncome).slice(0, 6);
  $("topDriversList").innerHTML = ranked.length ? ranked.map(({ profile, summary }) => `<div class="stack-row"><div class="stack-row-left">${getDriverLineHtml(profile)}${getProfileImageHtml(profile, "small")}<div><strong>${escapeHtml(profile.fullName)}</strong><div class="muted">${summary.count} turnos • ${summary.totalKm.toFixed(1)} km</div></div></div><div><strong>${money(summary.totalIncome)}</strong><div class="muted">Neto ${money(summary.netProfit)}</div></div></div>`).join("") : `<div class="center-empty">No hay turnos todavía.</div>`;
}
function renderPeakAnalytics() {
  const bestDay = getBestDay(state.shifts); const peakHour = getPeakHour(state.shifts); const fuelDay = getHighestFuelDay(state.shifts); const bestDriver = getBestDriver(state.shifts);
  const items = [
    { title: "Mejor día", value: bestDay ? `${bestDay.key} · ${money(bestDay.summary.totalIncome)}` : "—", sub: bestDay ? `${bestDay.summary.count} turnos` : "Sin datos" },
    { title: "Hora pico", value: peakHour ? `${String(peakHour.hour).padStart(2, "0")}:00 · ${money(peakHour.amount)}` : "—", sub: peakHour ? "Estimación por horas" : "Sin datos" },
    { title: "Día con más fuel", value: fuelDay ? `${fuelDay.key} · ${money(fuelDay.summary.totalFuel)}` : "—", sub: fuelDay ? "Fuel total" : "Sin datos" },
    { title: "Top driver", value: bestDriver ? bestDriver.profile.fullName : "—", sub: bestDriver ? money(bestDriver.summary.totalIncome) : "Sin datos" },
  ];
  $("peakAnalyticsList").innerHTML = items.map((item) => `<div class="stack-row"><div><strong>${escapeHtml(item.title)}</strong><div class="muted">${escapeHtml(item.sub)}</div></div><div><strong>${escapeHtml(item.value)}</strong></div></div>`).join("");
}

function resetAndRenderHistory() { state.historyPage = 1; renderHistoryTable(); }
function getFilteredHistoryRows() {
  const search = $("historySearch").value.trim().toLowerCase();
  const dateFilter = $("historyDateFilter").value;
  const driverFilter = $("historyDriverFilter").value;
  const carFilter = $("historyCarFilter").value.trim().toLowerCase();
  return state.shifts.filter((row) => {
    const combined = [row.driverName, row.vehicle, row.notes, row.dateKey, row.managerName].join(" ").toLowerCase();
    const matchesSearch = !search || combined.includes(search);
    const matchesDate = !dateFilter || row.dateKey === dateFilter;
    const matchesDriver = !driverFilter || driverFilter === "all" || row.driverKey === driverFilter;
    const matchesCar = !carFilter || String(row.vehicle || "").toLowerCase().includes(carFilter);
    return matchesSearch && matchesDate && matchesDriver && matchesCar;
  });
}
function getHistoryTotalPages() { return Math.max(1, Math.ceil(getFilteredHistoryRows().length / HISTORY_PAGE_SIZE)); }
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
  if (!pageRows.length) { $("historyTableBody").innerHTML = `<tr><td colspan="9"><div class="center-empty">No se encontraron turnos.</div></td></tr>`; return; }
  $("historyTableBody").innerHTML = pageRows.map((row) => {
    const profile = getProfileByKey(row.driverKey) || FIXED_STAFF.mudassar;
    return `<tr class="history-row" style="border-left:5px solid ${escapeHtml(profile.colorHex || '#1d4ed8')}"><td><div class="history-driver-cell">${getProfileImageHtml(profile, 'small')}<div>${getDriverBadgeHtml(profile)}<div class="muted">${escapeHtml(row.managerName || '')}</div></div></div></td><td>${escapeHtml(formatDate(row.dateKey))}</td><td>${escapeHtml(truncateText(row.vehicle || '-', 36))}</td><td>${num(row.workedHours).toFixed(2)}</td><td>${num(row.km).toFixed(1)}</td><td class="income-positive">${money(row.totalIncome)}</td><td class="warning-text">${money(row.totalFuel)}</td><td class="spending-negative">${money(row.totalSpending)}</td><td class="${num(row.netProfit) >= 0 ? 'income-positive' : 'spending-negative'}">${money(row.netProfit)}</td></tr>`;
  }).join("");
}

function getReportRows() {
  const range = $("reportRange").value;
  const driverKey = state.currentUser?.role === "manager" ? $("reportDriverFilter").value : state.currentUser?.staffKey || "all";
  const carFilter = $("reportCarFilter").value.trim().toLowerCase();
  let rows = filterRowsByRange(state.shifts, range);
  if (driverKey && driverKey !== "all") rows = rows.filter((row) => row.driverKey === driverKey);
  if (carFilter) rows = rows.filter((row) => String(row.vehicle || "").toLowerCase().includes(carFilter));
  return rows;
}
function renderReportProfileCard(rows) {
  const driverKey = state.currentUser?.role === "manager" ? $("reportDriverFilter").value : state.currentUser?.staffKey || "all";
  const profile = driverKey && driverKey !== "all" ? getProfileByKey(driverKey) : null;
  const summary = summarizeRows(rows);
  if (profile) {
    $("reportProfileName").textContent = profile.fullName;
    $("reportProfileMeta").textContent = `${summary.count} turnos · ${money(summary.totalIncome)} · ${summary.totalKm.toFixed(1)} km`;
    if (profile.photoUrl) { $("reportProfilePhoto").src = profile.photoUrl; show($("reportProfilePhoto")); hide($("reportProfileAvatar")); }
    else { hide($("reportProfilePhoto")); $("reportProfileAvatar").textContent = initials(profile.fullName); show($("reportProfileAvatar")); }
  } else {
    $("reportProfileName").textContent = "GLOBAL";
    $("reportProfileMeta").textContent = `${summary.count} turnos · ${money(summary.totalIncome)} · ${summary.totalKm.toFixed(1)} km`;
    hide($("reportProfilePhoto")); $("reportProfileAvatar").textContent = "G"; show($("reportProfileAvatar"));
  }
}
function renderReports() {
  const rows = getReportRows();
  const summary = summarizeRows(rows);
  renderReportProfileCard(rows);
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
  renderReportPeakList(rows); renderReportBreakdownList(summary); renderDailyReportList(rows); renderPeriodReportList(rows, summary); queueChartRender();
}
function renderReportPeakList(rows) {
  const bestDay = getBestDay(rows), worstDay = getWorstDay(rows), peakHour = getPeakHour(rows), fuelDay = getHighestFuelDay(rows);
  const items = [
    { title: "Peak day", value: bestDay ? `${bestDay.key} · ${money(bestDay.summary.totalIncome)}` : "—", sub: bestDay ? `${bestDay.summary.count} turnos` : "Sin datos" },
    { title: "Worst day", value: worstDay ? `${worstDay.key} · ${money(worstDay.summary.totalIncome)}` : "—", sub: worstDay ? "Por ingresos" : "Sin datos" },
    { title: "Peak hour", value: peakHour ? `${String(peakHour.hour).padStart(2,'0')}:00 · ${money(peakHour.amount)}` : "—", sub: peakHour ? "Estimación" : "Sin datos" },
    { title: "Highest fuel day", value: fuelDay ? `${fuelDay.key} · ${money(fuelDay.summary.totalFuel)}` : "—", sub: fuelDay ? "Fuel total" : "Sin datos" },
  ];
  $("reportPeakList").innerHTML = items.map((item) => `<div class="stack-row"><div><strong>${escapeHtml(item.title)}</strong><div class="muted">${escapeHtml(item.sub)}</div></div><div><strong>${escapeHtml(item.value)}</strong></div></div>`).join("");
}
function renderReportBreakdownList(summary) {
  const items = [["Taxímetro", money(summary.totalTaximetro), "Efectivo + tarjeta"],["Cabify", money(summary.totalCabify), "Efectivo + app"],["Free Now", money(summary.totalFreeNow), "Efectivo + app"],["Uber", money(summary.totalUber), "Solo app"],["Fuel", money(summary.totalFuel), "Solo combustible"],["Gastos", money(summary.totalExpenses), "Operativos"],["Mantenimiento", money(summary.totalMaintenance), "Servicio / taller"],["KM/€", summary.kmPerEuro.toFixed(3), "Media"]];
  $("reportBreakdownList").innerHTML = items.map(([title, value, sub]) => `<div class="stack-row"><div><strong>${escapeHtml(title)}</strong><div class="muted">${escapeHtml(sub)}</div></div><div><strong>${escapeHtml(value)}</strong></div></div>`).join("");
}
function renderDailyReportList(rows) {
  const days = Object.entries(groupRowsBy(rows, (r) => r.dateKey)).map(([key, rs]) => ({ key, summary: summarizeRows(rs) })).sort((a,b) => b.key.localeCompare(a.key)).slice(0, 12);
  $("dailyReportList").innerHTML = days.length ? days.map((day) => `<div class="stack-row"><div><strong>${escapeHtml(day.key)}</strong><div class="muted">${day.summary.count} turnos • ${day.summary.totalKm.toFixed(1)} km</div></div><div><strong>${money(day.summary.totalIncome)}</strong><div class="muted">Fuel ${money(day.summary.totalFuel)} · Neto ${money(day.summary.netProfit)}</div></div></div>`).join("") : `<div class="center-empty">No hay datos de reporte.</div>`;
}
function renderPeriodReportList(rows, summary) {
  const bestDriver = getBestDriver(rows); const avgIncome = safeDiv(summary.totalIncome, summary.count); const avgFuel = safeDiv(summary.totalFuel, summary.count); const avgNet = safeDiv(summary.netProfit, summary.count);
  const items = [{ title: "Ingreso medio por turno", value: money(avgIncome), sub: `${summary.count} turnos` },{ title: "Fuel medio por turno", value: money(avgFuel), sub: "Por turno" },{ title: "Neto medio por turno", value: money(avgNet), sub: "Por turno" },{ title: "Mejor driver", value: bestDriver ? bestDriver.profile.fullName : "—", sub: bestDriver ? money(bestDriver.summary.totalIncome) : "Sin datos" }];
  $("periodReportList").innerHTML = items.map((item) => `<div class="stack-row"><div><strong>${escapeHtml(item.title)}</strong><div class="muted">${escapeHtml(item.sub)}</div></div><div><strong>${escapeHtml(item.value)}</strong></div></div>`).join("");
}

async function ensureChartJs() {
  if (window.Chart) return window.Chart;
  if (state.chartLibPromise) return state.chartLibPromise;
  state.chartLibPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/chart.js";
    script.async = true;
    script.onload = () => resolve(window.Chart);
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return state.chartLibPromise;
}
function buildLastSevenDaysSeries(rows) {
  const labels = [], incomeData = [], fuelData = [], netData = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(); d.setDate(d.getDate() - i); const key = d.toISOString().slice(0,10); labels.push(key); const s = summarizeRows(rows.filter((r) => r.dateKey === key)); incomeData.push(s.totalIncome); fuelData.push(s.totalFuel); netData.push(s.netProfit);
  }
  return { labels, incomeData, fuelData, netData };
}
function buildGroupedSeriesByDay(rows) {
  const entries = Object.entries(groupRowsBy(rows, (r) => r.dateKey)).sort((a,b) => a[0].localeCompare(b[0]));
  return { labels: entries.map(([k]) => k), income: entries.map(([,rs]) => summarizeRows(rs).totalIncome), fuel: entries.map(([,rs]) => summarizeRows(rs).totalFuel), net: entries.map(([,rs]) => summarizeRows(rs).netProfit) };
}
let chartRenderQueued = false;
function queueChartRender() { if (chartRenderQueued) return; chartRenderQueued = true; Promise.resolve().then(async () => { chartRenderQueued = false; await renderCharts(); }); }
async function renderCharts() {
  try {
    const ChartLib = await ensureChartJs();
    if (!ChartLib) return;
    renderDashboardCharts(ChartLib); renderReportCharts(ChartLib);
  } catch (error) { console.warn("Chart.js no cargado", error); }
}
function renderDashboardCharts(ChartLib) {
  if (state.incomeChart) state.incomeChart.destroy(); if (state.spendingChart) state.spendingChart.destroy();
  const series = buildLastSevenDaysSeries(state.shifts);
  state.incomeChart = new ChartLib($("incomeChart"), { type: "line", data: { labels: series.labels, datasets: [{ label: "Ingresos", data: series.incomeData, borderColor: getCssColor("--primary", "#1d4ed8"), backgroundColor: blendColor(getCssColor("--primary", "#1d4ed8"), .18), fill: true, tension: .3 }, { label: "Neto", data: series.netData, borderColor: getCssColor("--success", "#16a34a"), backgroundColor: blendColor(getCssColor("--success", "#16a34a"), .12), fill: true, tension: .3 }] }, options: { responsive: true, maintainAspectRatio: false, animation: { duration: 300 }, scales: { y: { beginAtZero: true } } } });
  state.spendingChart = new ChartLib($("spendingChart"), { type: "bar", data: { labels: series.labels, datasets: [{ label: "Fuel", data: series.fuelData, backgroundColor: blendColor(getCssColor("--warning", "#d97706"), .65) }, { label: "Neto", data: series.netData, backgroundColor: blendColor(getCssColor("--success", "#16a34a"), .6) }] }, options: { responsive: true, maintainAspectRatio: false, animation: { duration: 300 }, scales: { y: { beginAtZero: true } } } });
}
function renderReportCharts(ChartLib) {
  if (state.reportChart) state.reportChart.destroy(); if (state.appBreakdownChart) state.appBreakdownChart.destroy();
  const rows = getReportRows(); const grouped = buildGroupedSeriesByDay(rows); const summary = summarizeRows(rows);
  state.reportChart = new ChartLib($("reportChart"), { type: "line", data: { labels: grouped.labels, datasets: [{ label: "Ingresos", data: grouped.income, borderColor: getCssColor("--primary", "#1d4ed8"), backgroundColor: blendColor(getCssColor("--primary", "#1d4ed8"), .16), fill: true, tension: .3 }, { label: "Fuel", data: grouped.fuel, borderColor: getCssColor("--warning", "#d97706"), backgroundColor: blendColor(getCssColor("--warning", "#d97706"), .12), fill: true, tension: .3 }, { label: "Neto", data: grouped.net, borderColor: getCssColor("--success", "#16a34a"), backgroundColor: blendColor(getCssColor("--success", "#16a34a"), .1), fill: true, tension: .3 }] }, options: { responsive: true, maintainAspectRatio: false, animation: { duration: 300 }, scales: { y: { beginAtZero: true } } } });
  state.appBreakdownChart = new ChartLib($("appBreakdownChart"), { type: "bar", data: { labels: ["Taxímetro","Cabify","Free Now","Uber"], datasets: [{ label: "Ingresos", data: [summary.totalTaximetro, summary.totalCabify, summary.totalFreeNow, summary.totalUber], backgroundColor: [blendColor("#1849a9", .65), blendColor("#067647", .65), blendColor("#b54708", .65), blendColor("#111827", .65)] }] }, options: { responsive: true, maintainAspectRatio: false, animation: { duration: 300 }, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } });
}

async function handleCreateDriver() {
  if (state.currentUser?.role !== "manager") return showToast("Solo el manager puede crear drivers.");
  try {
    const fullName = $("newDriverName").value.trim();
    const email = $("newDriverEmail").value.trim();
    const pin = $("newDriverPin").value.trim();
    const defaultCarId = $("newDriverCarId").value;
    const phone = $("newDriverPhone").value.trim();
    const colorHex = $("newDriverColor").value || "#16a34a";
    const alias = slugify($("newDriverAlias").value.trim() || fullName);
    if (!fullName) throw new Error("El nombre es obligatorio.");
    if (!alias) throw new Error("Alias no válido.");
    if (getAllProfiles()[alias]) throw new Error("Ese alias ya existe.");
    await setDoc(doc(db, "driverProfiles", alias), {
      staffKey: alias, fullName, role: "driver", email, managerKey: "mudassar", managerName: "MUDASSAR", colorHex,
      phone, defaultCarId, photoUrl: "", photoPath: "", active: true, systemUser: false, operationalOnly: true,
      requestedLoginEmail: email, requestedPinInfo: pin ? "PIN capturado en alta" : "", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    $("newDriverForm").reset(); $("newDriverColor").value = "#16a34a"; showToast("Driver creado.");
  } catch (error) { console.error(error); showToast(error.message || "No se pudo crear el driver."); }
}
async function saveDriverProfile(staffKey) {
  try {
    const profile = getProfileByKey(staffKey); if (!profile) throw new Error("Driver no encontrado.");
    const fullName = profile.systemUser ? profile.fullName : (document.querySelector(`[data-driver-name="${staffKey}"]`)?.value?.trim() || profile.fullName);
    const phone = document.querySelector(`[data-driver-phone="${staffKey}"]`)?.value?.trim() || "";
    const defaultCarId = document.querySelector(`[data-driver-default-car="${staffKey}"]`)?.value || "";
    const colorHex = document.querySelector(`[data-driver-color="${staffKey}"]`)?.value || profile.colorHex || "#1d4ed8";
    const active = !!document.querySelector(`[data-driver-active="${staffKey}"]`)?.checked;
    await setDoc(doc(db, "driverProfiles", staffKey), {
      staffKey, fullName, role: profile.role, email: profile.email || "", managerKey: profile.managerKey || "mudassar", managerName: profile.managerName || "MUDASSAR",
      colorHex, phone, defaultCarId, photoUrl: profile.photoUrl || "", photoPath: profile.photoPath || "", active, systemUser: !!profile.systemUser,
      operationalOnly: !!profile.operationalOnly, requestedLoginEmail: profile.requestedLoginEmail || profile.email || "", requestedPinInfo: profile.requestedPinInfo || "", updatedAt: serverTimestamp(), createdAt: profile.createdAt || serverTimestamp(),
    }, { merge: true });
    showToast("Driver guardado.");
  } catch (error) { console.error(error); showToast("No se pudo guardar el driver."); }
}
function renderDriversStats() {
  const profiles = getVisibleProfiles();
  const drivers = profiles.filter((p) => p.role === "driver").length;
  const managers = profiles.filter((p) => p.role === "manager").length;
  const withPhotos = profiles.filter((p) => p.photoUrl).length;
  const active = profiles.filter((p) => p.active !== false).length;
  $("driversStats").innerHTML = [statCard("Perfiles", String(profiles.length), "Visibles"), statCard("Drivers", String(drivers), "Conductores"), statCard("Managers", String(managers), "Gestión"), statCard("Con foto", String(withPhotos), "Imagen subida"), statCard("Activos", String(active), "Disponibles")].join("");
}
function renderDriversGrid() {
  const profiles = getVisibleProfiles();
  $("driversGrid").innerHTML = profiles.map((profile) => renderDriverCard(profile)).join("");
  if (state.currentUser?.role !== "manager") hide(document.querySelector(".driver-create-card")); else show(document.querySelector(".driver-create-card"));
  attachDriverCardEvents();
}
function renderDriverCard(profile) {
  const editable = state.currentUser?.role === "manager" || state.currentUser?.staffKey === profile.staffKey;
  const carOptions = [`<option value="">Sin coche por defecto</option>`, ...getActiveCarsList().map((car) => `<option value="${car.id}" ${profile.defaultCarId === car.id ? "selected" : ""}>${escapeHtml(getCarLabel(car))}</option>`)].join("");
  return `<div class="card profile-card" data-driver-card="${escapeHtml(profile.staffKey)}"><div class="profile-color-bar" style="background:${escapeHtml(profile.colorHex || '#1d4ed8')}"></div><div class="profile-card-head">${getProfileImageHtml(profile, 'large')}<div><div class="profile-name">${escapeHtml(profile.fullName)}</div><div class="profile-role">${escapeHtml(profile.role === 'manager' ? 'Manager / Driver' : 'Driver')}</div>${getDriverBadgeHtml(profile)}</div></div><div class="profile-meta-list"><div>Email: ${escapeHtml(profile.email || '-')}</div><div>Manager: ${escapeHtml(profile.managerName || '-')}</div><div>Acceso: ${escapeHtml(profile.systemUser ? 'Login real Firebase' : 'Perfil operativo')}</div></div><div class="grid-2"><label><span>Nombre</span><input type="text" data-driver-name="${escapeHtml(profile.staffKey)}" value="${escapeHtml(profile.fullName || '')}" ${editable && !profile.systemUser ? '' : 'disabled'} /></label><label><span>Teléfono</span><input type="text" data-driver-phone="${escapeHtml(profile.staffKey)}" value="${escapeHtml(profile.phone || '')}" ${editable ? '' : 'disabled'} /></label><label><span>Coche por defecto</span><select data-driver-default-car="${escapeHtml(profile.staffKey)}" ${editable ? '' : 'disabled'}>${carOptions}</select></label><label><span>Color</span><input type="color" data-driver-color="${escapeHtml(profile.staffKey)}" value="${escapeHtml(profile.colorHex || '#1d4ed8')}" ${editable ? '' : 'disabled'} /></label></div><div class="grid-2"><label><span>Activo</span><input type="checkbox" data-driver-active="${escapeHtml(profile.staffKey)}" ${profile.active !== false ? 'checked' : ''} ${editable ? '' : 'disabled'} /></label></div>${editable ? `<div class="profile-actions"><button class="secondary-btn" type="button" data-manage-photo="${escapeHtml(profile.staffKey)}">Gestionar foto</button><button class="primary-btn" type="button" data-save-driver="${escapeHtml(profile.staffKey)}">Guardar driver</button></div>` : ''}</div>`;
}
function attachDriverCardEvents() {
  document.querySelectorAll("[data-save-driver]").forEach((btn) => btn.onclick = () => saveDriverProfile(btn.getAttribute("data-save-driver")));
  document.querySelectorAll("[data-manage-photo]").forEach((btn) => btn.onclick = () => openPhotoModal(btn.getAttribute("data-manage-photo")));
}

async function handleCreateCar() {
  if (state.currentUser?.role !== "manager") return showToast("Solo el manager puede crear coches.");
  try {
    const plate = $("newCarPlate").value.trim(); const model = $("newCarModel").value.trim(); const alias = $("newCarAlias").value.trim(); const status = $("newCarStatus").value; const currentKm = num($("newCarKm").value); const defaultDriverKey = $("newCarDriverKey").value; const itv = $("newCarItv").value; const insurance = $("newCarInsurance").value; const notes = $("newCarNotes").value.trim();
    if (!plate && !alias) throw new Error("Introduce al menos matrícula o alias.");
    await setDoc(doc(db, "cars", randomId("car")), { plate, model, alias, status, currentKm, defaultDriverKey, itv, insurance, notes, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    $("newCarForm").reset(); $("newCarStatus").value = "active"; showToast("Coche creado.");
  } catch (error) { console.error(error); showToast(error.message || "No se pudo crear el coche."); }
}
async function saveCar(carId) {
  try {
    await updateDoc(doc(db, "cars", carId), {
      plate: document.querySelector(`[data-car-plate="${carId}"]`)?.value?.trim() || "",
      model: document.querySelector(`[data-car-model="${carId}"]`)?.value?.trim() || "",
      alias: document.querySelector(`[data-car-alias="${carId}"]`)?.value?.trim() || "",
      status: document.querySelector(`[data-car-status="${carId}"]`)?.value || "active",
      currentKm: num(document.querySelector(`[data-car-km="${carId}"]`)?.value),
      defaultDriverKey: document.querySelector(`[data-car-driver="${carId}"]`)?.value || "",
      itv: document.querySelector(`[data-car-itv="${carId}"]`)?.value || "",
      insurance: document.querySelector(`[data-car-insurance="${carId}"]`)?.value || "",
      notes: document.querySelector(`[data-car-notes="${carId}"]`)?.value?.trim() || "",
      updatedAt: serverTimestamp(),
    });
    showToast("Coche guardado.");
  } catch (error) { console.error(error); showToast("No se pudo guardar el coche."); }
}
function renderCarsStats() {
  const cars = getAllCarsList();
  $("carsStats").innerHTML = [statCard("Coches", String(cars.length), "Registrados"), statCard("Activos", String(cars.filter(c => c.status === 'active').length), "Disponibles"), statCard("Taller", String(cars.filter(c => c.status === 'workshop').length), "Fuera de servicio"), statCard("Inactivos", String(cars.filter(c => c.status === 'inactive').length), "No operativos")].join("");
}
function renderCarsGrid() {
  const cars = getAllCarsList();
  $("carsGrid").innerHTML = cars.length ? cars.map((car) => renderCarCard(car)).join("") : `<div class="center-empty">No hay coches todavía.</div>`;
  if (state.currentUser?.role !== "manager") hide(document.querySelector(".car-create-card")); else show(document.querySelector(".car-create-card"));
  attachCarCardEvents();
}
function renderCarCard(car) {
  const editable = state.currentUser?.role === "manager";
  const driverOptions = [`<option value="">Sin conductor por defecto</option>`, ...getSelectableDrivers().map((profile) => `<option value="${profile.staffKey}" ${car.defaultDriverKey === profile.staffKey ? 'selected' : ''}>${escapeHtml(profile.fullName)}</option>`)].join("");
  const statusColor = car.status === 'active' ? '#16a34a' : car.status === 'workshop' ? '#d97706' : '#6b7280';
  return `<div class="card profile-card" data-car-card="${escapeHtml(car.id)}"><div class="profile-color-bar" style="background:${escapeHtml(statusColor)}"></div><div class="profile-card-head"><div class="big-avatar">${escapeHtml((car.alias || car.plate || 'C').slice(0,1).toUpperCase())}</div><div><div class="profile-name">${escapeHtml(car.alias || 'Car')}</div><div class="profile-role">${escapeHtml(car.plate || '-')}</div><div class="muted">${escapeHtml(car.model || '-')}</div></div></div><div class="grid-2"><label><span>Matrícula</span><input type="text" data-car-plate="${escapeHtml(car.id)}" value="${escapeHtml(car.plate || '')}" ${editable ? '' : 'disabled'} /></label><label><span>Modelo</span><input type="text" data-car-model="${escapeHtml(car.id)}" value="${escapeHtml(car.model || '')}" ${editable ? '' : 'disabled'} /></label><label><span>Alias</span><input type="text" data-car-alias="${escapeHtml(car.id)}" value="${escapeHtml(car.alias || '')}" ${editable ? '' : 'disabled'} /></label><label><span>Estado</span><select data-car-status="${escapeHtml(car.id)}" ${editable ? '' : 'disabled'}><option value="active" ${car.status === 'active' ? 'selected' : ''}>Activo</option><option value="workshop" ${car.status === 'workshop' ? 'selected' : ''}>Taller</option><option value="inactive" ${car.status === 'inactive' ? 'selected' : ''}>Inactivo</option></select></label><label><span>KM actual</span><input type="number" step="0.1" min="0" data-car-km="${escapeHtml(car.id)}" value="${escapeHtml(String(num(car.currentKm)))}" ${editable ? '' : 'disabled'} /></label><label><span>Driver por defecto</span><select data-car-driver="${escapeHtml(car.id)}" ${editable ? '' : 'disabled'}>${driverOptions}</select></label><label><span>ITV</span><input type="date" data-car-itv="${escapeHtml(car.id)}" value="${escapeHtml(car.itv || '')}" ${editable ? '' : 'disabled'} /></label><label><span>Seguro</span><input type="date" data-car-insurance="${escapeHtml(car.id)}" value="${escapeHtml(car.insurance || '')}" ${editable ? '' : 'disabled'} /></label></div><label><span>Notas</span><input type="text" data-car-notes="${escapeHtml(car.id)}" value="${escapeHtml(car.notes || '')}" ${editable ? '' : 'disabled'} /></label>${editable ? `<div class="profile-actions"><button class="primary-btn" type="button" data-save-car="${escapeHtml(car.id)}">Guardar coche</button></div>` : ''}</div>`;
}
function attachCarCardEvents() { document.querySelectorAll("[data-save-car]").forEach((btn) => btn.onclick = () => saveCar(btn.getAttribute("data-save-car"))); }

function openPhotoModal(staffKey) {
  const profile = getProfileByKey(staffKey); if (!profile) return;
  state.photoModalStaffKey = staffKey; state.pendingPhotoFile = null; revokePendingPreview();
  $("photoModalTitle").textContent = `${profile.fullName} — Foto del driver`;
  if (profile.photoUrl) { $("photoPreviewImg").src = profile.photoUrl; show($("photoPreviewImg")); hide($("photoPreviewAvatar")); }
  else { hide($("photoPreviewImg")); $("photoPreviewAvatar").textContent = initials(profile.fullName); show($("photoPreviewAvatar")); }
  $("driverPhotoUploadInput").value = ""; $("driverPhotoCameraInput").value = ""; show($("photoModal")); $("photoModal").setAttribute("aria-hidden", "false");
}
function closePhotoModal() { revokePendingPreview(); state.photoModalStaffKey = null; state.pendingPhotoFile = null; $("driverPhotoUploadInput").value = ""; $("driverPhotoCameraInput").value = ""; hide($("photoModal")); $("photoModal").setAttribute("aria-hidden", "true"); }
function revokePendingPreview() { if (state.pendingPhotoPreviewUrl) { URL.revokeObjectURL(state.pendingPhotoPreviewUrl); state.pendingPhotoPreviewUrl = ""; } }
function handleSelectedPhotoFile(file) { if (!file || !state.photoModalStaffKey) return; state.pendingPhotoFile = file; revokePendingPreview(); state.pendingPhotoPreviewUrl = URL.createObjectURL(file); $("photoPreviewImg").src = state.pendingPhotoPreviewUrl; show($("photoPreviewImg")); hide($("photoPreviewAvatar")); }
async function saveDriverPhoto() {
  if (!state.photoModalStaffKey || !state.pendingPhotoFile) return showToast("Selecciona una foto primero.");
  try {
    const profile = getProfileByKey(state.photoModalStaffKey); if (!profile) throw new Error("Driver no encontrado.");
    if (state.mode === "local") {
      const dataUrl = await blobToDataUrl(state.pendingPhotoFile);
      await setDoc(doc(db, "driverProfiles", profile.staffKey), { photoUrl: dataUrl, photoPath: "local-data-url", updatedAt: serverTimestamp() }, { merge: true });
    } else {
      if (profile.photoPath) { try { await deleteObject(storageRef(storage, profile.photoPath)); } catch (_) {} }
      const ext = getFileExtension(state.pendingPhotoFile.name || "jpg");
      const path = `driverPhotos/${profile.staffKey}/photo_${Date.now()}.${ext}`;
      const ref = storageRef(storage, path);
      await uploadBytes(ref, state.pendingPhotoFile);
      const url = await getDownloadURL(ref);
      await setDoc(doc(db, "driverProfiles", profile.staffKey), { photoUrl: url, photoPath: path, updatedAt: serverTimestamp() }, { merge: true });
    }
    showToast("Foto guardada."); closePhotoModal();
  } catch (error) { console.error(error); showToast("No se pudo guardar la foto."); }
}
async function removeDriverPhoto() {
  if (!state.photoModalStaffKey) return;
  try {
    const profile = getProfileByKey(state.photoModalStaffKey); if (!profile) throw new Error("Driver no encontrado.");
    if (state.mode === "cloud" && profile.photoPath && profile.photoPath !== "local-data-url") { try { await deleteObject(storageRef(storage, profile.photoPath)); } catch (_) {} }
    await setDoc(doc(db, "driverProfiles", profile.staffKey), { photoUrl: "", photoPath: "", updatedAt: serverTimestamp() }, { merge: true });
    showToast("Foto eliminada."); closePhotoModal();
  } catch (error) { console.error(error); showToast("No se pudo eliminar la foto."); }
}
function getFileExtension(filename) { const ext = String(filename).split('.').pop()?.toLowerCase() || 'jpg'; return ext.replace(/[^a-z0-9]/g, '') || 'jpg'; }
function blobToDataUrl(blob) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = reject; reader.readAsDataURL(blob); }); }
async function imageUrlToDataUrl(url) { try { const response = await fetch(url); const blob = await response.blob(); return await blobToDataUrl(blob); } catch { return ""; } }

async function syncPendingLocalShifts() {
  if (state.mode !== "cloud" || !state.authUser) return showToast("Inicia sesión cloud para sincronizar.");
  const pending = getPendingLocalShifts();
  if (!pending.length) return showToast("No hay turnos locales pendientes.");
  try {
    for (const row of pending) {
      const payload = { ...row };
      delete payload.id; delete payload.localOnly; delete payload.createdAtLocal;
      payload.createdByUid = state.authUser.uid;
      payload.updatedAt = serverTimestamp();
      payload.createdAt = serverTimestamp();
      await addDoc(collection(db, "shifts"), payload);
    }
    setPendingLocalShifts([]);
    showToast("Turnos locales sincronizados.");
  } catch (error) { console.error(error); showToast("No se pudieron sincronizar todos los turnos."); }
}

async function exportCurrentReportPdf() {
  try {
    const rows = getReportRows(); const summary = summarizeRows(rows);
    const range = $("reportRange").value;
    const driverKey = state.currentUser?.role === "manager" ? $("reportDriverFilter").value : state.currentUser?.staffKey || "all";
    const carFilter = $("reportCarFilter").value.trim();
    const selectedProfile = driverKey && driverKey !== "all" ? getProfileByKey(driverKey) : null;
    const { jsPDF } = await import("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm");
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const page = { width: pdf.internal.pageSize.getWidth(), height: pdf.internal.pageSize.getHeight(), margin: 14 };
    let y = 16;
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(20); pdf.text("TAXI FLEET REPORT", page.margin, y); y += 8;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(10);
    pdf.text(`Generado: ${dateTimeLabel()}`, page.margin, y); y += 6;
    pdf.text(`Periodo: ${range.toUpperCase()}`, page.margin, y); y += 6;
    pdf.text(`Driver: ${selectedProfile ? selectedProfile.fullName : 'GLOBAL'}`, page.margin, y); y += 6;
    pdf.text(`Filtro coche: ${carFilter || 'ALL'}`, page.margin, y); y += 10;
    if (selectedProfile) { y = await drawPdfDriverBlock(pdf, selectedProfile, page.margin, y, page.width - page.margin * 2); y += 8; }
    y = drawPdfSectionTitle(pdf, 'RESUMEN', page.margin, y);
    y = drawPdfSummaryGrid(pdf, [["Ingresos", money(summary.totalIncome)],["Fuel", money(summary.totalFuel)],["Spending", money(summary.totalSpending)],["Neto", money(summary.netProfit)],["KM", summary.totalKm.toFixed(1)],["KM/€", summary.kmPerEuro.toFixed(3)],["€/hora", summary.eurPerHour.toFixed(2)],["Turnos", String(summary.count)]], page.margin, y, page.width - page.margin * 2); y += 6;
    y = drawPdfSectionTitle(pdf, 'BREAKDOWN', page.margin, y);
    y = drawPdfSummaryGrid(pdf, [["Taxímetro", money(summary.totalTaximetro)],["Cabify", money(summary.totalCabify)],["Free Now", money(summary.totalFreeNow)],["Uber", money(summary.totalUber)],["Fuel", money(summary.totalFuel)],["Gastos", money(summary.totalExpenses)],["Mantenimiento", money(summary.totalMaintenance)],["Apps", money(summary.totalApps)]], page.margin, y, page.width - page.margin * 2); y += 6;
    const peakDay = getBestDay(rows), peakHour = getPeakHour(rows), fuelDay = getHighestFuelDay(rows);
    y = drawPdfSectionTitle(pdf, 'PICOS', page.margin, y);
    y = drawPdfTextList(pdf, [`Peak day: ${peakDay ? `${peakDay.key} · ${money(peakDay.summary.totalIncome)}` : '—'}`, `Peak hour: ${peakHour ? `${String(peakHour.hour).padStart(2,'0')}:00 · ${money(peakHour.amount)}` : '—'}`, `Highest fuel day: ${fuelDay ? `${fuelDay.key} · ${money(fuelDay.summary.totalFuel)}` : '—'}`], page.margin, y, page.width - page.margin * 2); y += 6;
    y = drawPdfSectionTitle(pdf, 'TURNOS INCLUIDOS', page.margin, y);
    y = drawPdfShiftTable(pdf, rows, page.margin, y, page);
    pdf.save(`taxi-report-${selectedProfile ? selectedProfile.fullName : 'GLOBAL'}-${range}-${todayISO()}.pdf`);
    showToast('PDF exportado.');
  } catch (error) { console.error(error); showToast('No se pudo exportar el PDF.'); }
}
function drawPdfSectionTitle(pdf, title, x, y) { pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.text(title, x, y); pdf.setDrawColor(170); pdf.line(x, y + 1.5, 195, y + 1.5); return y + 7; }
function drawPdfSummaryGrid(pdf, pairs, x, y, width) { const cols = 2, colWidth = width / cols, rowHeight = 12; pdf.setFontSize(10); pairs.forEach((pair, idx) => { const row = Math.floor(idx / cols), col = idx % cols, bx = x + col * colWidth, by = y + row * rowHeight; pdf.setDrawColor(220); pdf.roundedRect(bx, by, colWidth - 3, rowHeight - 2, 2, 2); pdf.setFont('helvetica','normal'); pdf.text(pair[0], bx + 3, by + 5); pdf.setFont('helvetica','bold'); pdf.text(pair[1], bx + 3, by + 10); }); return y + Math.ceil(pairs.length / cols) * rowHeight; }
function drawPdfTextList(pdf, lines, x, y, width) { pdf.setFont('helvetica','normal'); pdf.setFontSize(10); lines.forEach((line) => { const wrapped = pdf.splitTextToSize(line, width); pdf.text(wrapped, x, y); y += wrapped.length * 5 + 1; }); return y; }
async function drawPdfDriverBlock(pdf, profile, x, y, width) { const boxH = 28; pdf.setDrawColor(220); pdf.roundedRect(x, y, width, boxH, 3, 3); const imgX = x + 4, imgY = y + 4; if (profile.photoUrl) { const dataUrl = await imageUrlToDataUrl(profile.photoUrl); if (dataUrl) pdf.addImage(dataUrl, 'JPEG', imgX, imgY, 18, 18); else drawPdfAvatarCircle(pdf, profile, imgX + 9, imgY + 9, 9); } else drawPdfAvatarCircle(pdf, profile, imgX + 9, imgY + 9, 9); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.text(profile.fullName, x + 28, y + 10); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.text(`Role: ${profile.role === 'manager' ? 'Manager / Driver' : 'Driver'}`, x + 28, y + 16); pdf.text(`Coche por defecto: ${getDefaultCarLabelForDriver(profile.staffKey) || '-'}`, x + 28, y + 22); return y + boxH; }
function drawPdfAvatarCircle(pdf, profile, cx, cy, r) { const rgb = hexToRgb(profile.colorHex || '#1d4ed8'); pdf.setFillColor(rgb.r, rgb.g, rgb.b); pdf.circle(cx, cy, r, 'F'); pdf.setTextColor(255,255,255); pdf.setFont('helvetica','bold'); pdf.setFontSize(10); pdf.text(initials(profile.fullName), cx, cy + 1.5, { align: 'center' }); pdf.setTextColor(0,0,0); }
function drawPdfShiftTable(pdf, rows, x, y, page) { const headers = ['Fecha','Driver','Coche','KM','Ingreso','Fuel','Spend','Neto']; const colWidths = [24,28,30,16,24,18,22,20]; const lineHeight = 7; const startX = x; const drawHeader = () => { let cursor = startX; pdf.setFont('helvetica','bold'); pdf.setFontSize(9); headers.forEach((header, index) => { pdf.setDrawColor(220); pdf.rect(cursor, y, colWidths[index], lineHeight); pdf.text(header, cursor + 2, y + 4.5); cursor += colWidths[index]; }); y += lineHeight; }; drawHeader(); pdf.setFont('helvetica','normal'); pdf.setFontSize(8); rows.forEach((row) => { if (y > page.height - 18) { pdf.addPage(); y = 16; drawHeader(); pdf.setFont('helvetica','normal'); pdf.setFontSize(8); } const cells = [row.dateKey || '', row.driverName || '', truncateText(row.vehicle || '-', 18), num(row.km).toFixed(1), money(row.totalIncome), money(row.totalFuel), money(row.totalSpending), money(row.netProfit)]; let cursor = startX; cells.forEach((cell, idx) => { pdf.setDrawColor(230); pdf.rect(cursor, y, colWidths[idx], lineHeight); pdf.text(String(cell), cursor + 2, y + 4.5, { maxWidth: colWidths[idx] - 4 }); cursor += colWidths[idx]; }); y += lineHeight; }); return y; }

renderShiftPreview(); renderDashboard(); renderHistoryTable(); renderReports(); renderDriversStats(); renderDriversGrid(); renderCarsStats(); renderCarsGrid();
