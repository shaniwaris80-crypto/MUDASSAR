
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

/**
 * ------------------------------------------------------------
 * 1) FIREBASE CONFIG
 * ------------------------------------------------------------
 * Replace with your Firebase project config
 */
const firebaseConfig = {
  apiKey: "PUT_YOUR_API_KEY",
  authDomain: "PUT_YOUR_AUTH_DOMAIN",
  projectId: "PUT_YOUR_PROJECT_ID",
  storageBucket: "PUT_YOUR_STORAGE_BUCKET",
  messagingSenderId: "PUT_YOUR_MESSAGING_SENDER_ID",
  appId: "PUT_YOUR_APP_ID",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

await setPersistence(auth, browserLocalPersistence);

/**
 * ------------------------------------------------------------
 * 2) STATE
 * ------------------------------------------------------------
 */
const state = {
  authUser: null,
  profile: null,
  shifts: [],
  users: [],
  unsubShifts: null,
  unsubUsers: null,
  currentView: "dashboardView",
};

/**
 * ------------------------------------------------------------
 * 3) DOM HELPERS
 * ------------------------------------------------------------
 */
const $ = (id) => document.getElementById(id);
const money = (n) => `€${Number(n || 0).toFixed(2)}`;
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function safeText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add("hidden"), 2600);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowDateLabel() {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());
}

function getInitials(name) {
  const parts = String(name || "U").trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "U";
}

/**
 * ------------------------------------------------------------
 * 4) AUTH TABS
 * ------------------------------------------------------------
 */
$("loginTabBtn").addEventListener("click", () => {
  $("loginTabBtn").classList.add("active");
  $("registerTabBtn").classList.remove("active");
  $("loginForm").classList.remove("hidden");
  $("registerForm").classList.add("hidden");
});

$("registerTabBtn").addEventListener("click", () => {
  $("registerTabBtn").classList.add("active");
  $("loginTabBtn").classList.remove("active");
  $("registerForm").classList.remove("hidden");
  $("loginForm").classList.add("hidden");
});

/**
 * ------------------------------------------------------------
 * 5) AUTH ACTIONS
 * ------------------------------------------------------------
 */
$("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const fullName = $("registerFullName").value.trim();
  const phone = $("registerPhone").value.trim();
  const email = $("registerEmail").value.trim();
  const password = $("registerPassword").value;
  const role = $("registerRole").value;

  if (!fullName || !email || !password) {
    showToast("Please complete the register form.");
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", cred.user.uid), {
      uid: cred.user.uid,
      fullName,
      phone,
      email,
      role,
      managerId: null,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    showToast("Account created.");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Registration failed.");
  }
});

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    showToast("Signed in.");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Login failed.");
  }
});

$("logoutBtn").addEventListener("click", async () => {
  try {
    await signOut(auth);
    showToast("Logged out.");
  } catch (error) {
    console.error(error);
    showToast("Could not log out.");
  }
});

/**
 * ------------------------------------------------------------
 * 6) AUTH STATE
 * ------------------------------------------------------------
 */
onAuthStateChanged(auth, async (user) => {
  cleanupSubscriptions();

  if (!user) {
    state.authUser = null;
    state.profile = null;
    state.shifts = [];
    state.users = [];
    $("authView").classList.remove("hidden");
    $("appView").classList.add("hidden");
    return;
  }

  try {
    state.authUser = user;
    let userSnap = await getDoc(doc(db, "users", user.uid));

    // Convenience fallback for first login if profile doc is missing.
    if (!userSnap.exists()) {
      const fallbackProfile = {
        uid: user.uid,
        fullName: user.email?.split("@")[0] || "Driver",
        email: user.email || "",
        phone: "",
        role: "driver",
        managerId: null,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, "users", user.uid), fallbackProfile);
      userSnap = await getDoc(doc(db, "users", user.uid));
    }

    const profile = userSnap.data();

    if (profile.active === false) {
      showToast("This account is disabled.");
      await signOut(auth);
      return;
    }

    state.profile = profile;
    bootApp();
  } catch (error) {
    console.error(error);
    showToast("Failed to load profile.");
  }
});

function cleanupSubscriptions() {
  if (typeof state.unsubShifts === "function") {
    state.unsubShifts();
    state.unsubShifts = null;
  }
  if (typeof state.unsubUsers === "function") {
    state.unsubUsers();
    state.unsubUsers = null;
  }
}

/**
 * ------------------------------------------------------------
 * 7) BOOT APP
 * ------------------------------------------------------------
 */
function bootApp() {
  $("authView").classList.add("hidden");
  $("appView").classList.remove("hidden");

  $("sidebarName").textContent = state.profile.fullName || "User";
  $("sidebarRole").textContent = state.profile.role || "driver";
  $("sidebarAvatar").textContent = getInitials(state.profile.fullName);
  $("topbarDate").textContent = nowDateLabel();

  applyRoleVisibility();
  attachNav();
  subscribeUsers();
  subscribeShifts();
  setDefaultShiftFormValues();
  renderShiftPreview();
}

function applyRoleVisibility() {
  const role = state.profile.role;
  const profilesBtn = [...document.querySelectorAll(".nav-btn")].find(
    (btn) => btn.dataset.view === "usersView"
  );

  if (role === "driver") {
    profilesBtn?.classList.remove("hidden");
  } else {
    profilesBtn?.classList.remove("hidden");
  }

  $("driverSelectWrap").classList.toggle("hidden", role === "driver");
  $("reportDriverWrap").classList.toggle("hidden", role === "driver");
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
  state.currentView = viewId;
  document.querySelectorAll(".view").forEach((view) => view.classList.add("hidden"));
  $(viewId).classList.remove("hidden");

  const titles = {
    dashboardView: ["Dashboard", "Realtime totals and shift reporting"],
    shiftView: ["New Shift", "Create a shift with mileage, fuel and payments"],
    shiftsView: ["Shift History", "Review saved shifts"],
    reportsView: ["Reports", "Period totals and individual breakdowns"],
    usersView: ["Profiles", "Drivers, managers and team overview"],
  };

  $("pageTitle").textContent = titles[viewId]?.[0] || "Dashboard";
  $("pageSubtitle").textContent = titles[viewId]?.[1] || "";
}

/**
 * ------------------------------------------------------------
 * 8) SUBSCRIPTIONS
 * ------------------------------------------------------------
 */
function subscribeUsers() {
  const usersRef = collection(db, "users");
  const role = state.profile.role;

  if (role === "admin") {
    state.unsubUsers = onSnapshot(usersRef, (snap) => {
      state.users = snap.docs.map((d) => d.data());
      onUsersLoaded();
    });
    return;
  }

  if (role === "manager") {
    const q = query(usersRef, where("managerId", "==", state.authUser.uid));
    state.unsubUsers = onSnapshot(q, (snap) => {
      const team = snap.docs.map((d) => d.data());
      state.users = [state.profile, ...team];
      onUsersLoaded();
    });
    return;
  }

  state.users = [state.profile];
  onUsersLoaded();
}

function subscribeShifts() {
  const shiftsRef = collection(db, "shifts");
  const role = state.profile.role;

  if (role === "admin") {
    state.unsubShifts = onSnapshot(shiftsRef, (snap) => {
      state.shifts = normalizeShifts(snap.docs);
      renderAll();
    });
    return;
  }

  if (role === "manager") {
    const q = query(shiftsRef, where("managerId", "==", state.authUser.uid));
    state.unsubShifts = onSnapshot(q, (snap) => {
      state.shifts = normalizeShifts(snap.docs);
      renderAll();
    });
    return;
  }

  const q = query(shiftsRef, where("driverId", "==", state.authUser.uid));
  state.unsubShifts = onSnapshot(q, (snap) => {
    state.shifts = normalizeShifts(snap.docs);
    renderAll();
  });
}

function normalizeShifts(docs) {
  return docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const ad = a.dateKey || "";
      const bd = b.dateKey || "";
      if (ad !== bd) return bd.localeCompare(ad);
      return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
    });
}

function onUsersLoaded() {
  populateDriverSelect();
  populateReportDriverSelect();
  renderProfiles();
  renderDashboard();
  renderReports();
}

/**
 * ------------------------------------------------------------
 * 9) SHIFT FORM
 * ------------------------------------------------------------
 */
function setDefaultShiftFormValues() {
  $("sfDate").value = todayISO();
  $("sfCash").value = "0";
  $("sfCard").value = "0";
  $("sfFreeNow").value = "0";
  $("sfUber").value = "0";
  $("sfBolt").value = "0";
  $("sfOtherApps").value = "0";
  $("sfOtherIncome").value = "0";
  $("sfFuelExpenseTotal").value = "0";
  $("sfCleaningExpense").value = "0";
  $("sfParkingExpense").value = "0";
  $("sfOtherExpenses").value = "0";
  $("sfFuelSplitMode").value = "FULL";
}

[
  "sfDate",
  "sfDriverId",
  "sfVehicle",
  "sfStartTime",
  "sfEndTime",
  "sfStartMileage",
  "sfEndMileage",
  "sfCash",
  "sfCard",
  "sfFreeNow",
  "sfUber",
  "sfBolt",
  "sfOtherApps",
  "sfOtherIncome",
  "sfFuelExpenseTotal",
  "sfFuelSplitMode",
  "sfCleaningExpense",
  "sfParkingExpense",
  "sfOtherExpenses",
  "sfNotes",
].forEach((id) => {
  $(id)?.addEventListener("input", renderShiftPreview);
  $(id)?.addEventListener("change", renderShiftPreview);
});

$("shiftResetBtn").addEventListener("click", () => {
  $("shiftForm").reset();
  setDefaultShiftFormValues();
  renderShiftPreview();
});

$("shiftForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    const payload = buildShiftPayloadFromForm();
    await addDoc(collection(db, "shifts"), payload);
    showToast("Shift saved.");
    $("shiftForm").reset();
    setDefaultShiftFormValues();
    renderShiftPreview();
    openView("shiftsView");
    setActiveNav("shiftsView");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Could not save shift.");
  }
});

function setActiveNav(viewId) {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewId);
  });
}

function populateDriverSelect() {
  const select = $("sfDriverId");
  const role = state.profile.role;

  if (role === "driver") {
    select.innerHTML = "";
    return;
  }

  const drivers = state.users.filter((u) => u.role === "driver");
  select.innerHTML = drivers
    .map((driver) => `<option value="${driver.uid}">${safeText(driver.fullName)}</option>`)
    .join("");

  if (!drivers.length && role === "manager") {
    select.innerHTML = `<option value="">No drivers assigned</option>`;
  }
}

function populateReportDriverSelect() {
  const select = $("reportDriverFilter");
  const role = state.profile.role;

  if (role === "driver") {
    select.innerHTML = `<option value="${state.authUser.uid}">${safeText(state.profile.fullName)}</option>`;
    return;
  }

  const drivers = state.users.filter((u) => u.role === "driver");
  select.innerHTML =
    `<option value="all">All</option>` +
    drivers
      .map((driver) => `<option value="${driver.uid}">${safeText(driver.fullName)}</option>`)
      .join("");
}

function getDriverById(uid) {
  return state.users.find((u) => u.uid === uid) || null;
}

function splitFuelExpense(total, mode) {
  const value = num(total);
  if (mode === "DIVIDE_BY_2") return value / 2;
  if (mode === "DIVIDE_BY_3") return value / 3;
  return value;
}

function diffMinutes(dateISO, startTime, endTime) {
  if (!dateISO || !startTime || !endTime) return 0;

  const start = new Date(`${dateISO}T${startTime}:00`);
  const end = new Date(`${dateISO}T${endTime}:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  let ms = end.getTime() - start.getTime();

  // overnight shift support
  if (ms < 0) {
    ms += 24 * 60 * 60 * 1000;
  }

  return Math.round(ms / 60000);
}

function calculateShiftTotals(raw) {
  const workedMinutes = diffMinutes(raw.dateKey, raw.startTime, raw.endTime);
  const workedHours = workedMinutes / 60;

  const startMileage = num(raw.startMileage);
  const endMileage = num(raw.endMileage);
  const totalKm = endMileage - startMileage;

  const cash = num(raw.cash);
  const card = num(raw.card);
  const freeNow = num(raw.freeNow);
  const uber = num(raw.uber);
  const bolt = num(raw.bolt);
  const otherApps = num(raw.otherApps);
  const otherIncome = num(raw.otherIncome);

  const fuelExpenseTotal = num(raw.fuelExpenseTotal);
  const fuelExpenseAllocated = splitFuelExpense(fuelExpenseTotal, raw.fuelSplitMode);

  const cleaningExpense = num(raw.cleaningExpense);
  const parkingExpense = num(raw.parkingExpense);
  const otherExpenses = num(raw.otherExpenses);

  const totalApps = freeNow + uber + bolt + otherApps;
  const totalRevenue = cash + card + totalApps + otherIncome;
  const totalExpenses = fuelExpenseAllocated + cleaningExpense + parkingExpense + otherExpenses;
  const netRevenue = totalRevenue - totalExpenses;

  return {
    workedMinutes,
    workedHours,
    totalKm,
    totalApps,
    totalRevenue,
    fuelExpenseAllocated,
    totalExpenses,
    netRevenue,
  };
}

function buildShiftPayloadFromForm() {
  const role = state.profile.role;

  let driverId = state.authUser.uid;
  let driverName = state.profile.fullName;
  let managerId = state.profile.managerId || null;
  let managerName = "";

  if (role === "manager" || role === "admin") {
    driverId = $("sfDriverId").value;
    if (!driverId) {
      throw new Error("Please select a driver.");
    }

    const driver = getDriverById(driverId);
    driverName = driver?.fullName || "Driver";
    managerId = role === "manager" ? state.authUser.uid : driver?.managerId || null;
    managerName =
      role === "manager"
        ? state.profile.fullName
        : getDriverById(driver?.managerId || "")?.fullName || "";
  } else {
    managerName = getDriverById(state.profile.managerId || "")?.fullName || "";
  }

  const raw = {
    driverId,
    driverName,
    managerId,
    managerName,
    vehicle: $("sfVehicle").value.trim(),
    dateKey: $("sfDate").value,
    startTime: $("sfStartTime").value,
    endTime: $("sfEndTime").value,
    startMileage: num($("sfStartMileage").value),
    endMileage: num($("sfEndMileage").value),
    cash: num($("sfCash").value),
    card: num($("sfCard").value),
    freeNow: num($("sfFreeNow").value),
    uber: num($("sfUber").value),
    bolt: num($("sfBolt").value),
    otherApps: num($("sfOtherApps").value),
    otherIncome: num($("sfOtherIncome").value),
    fuelExpenseTotal: num($("sfFuelExpenseTotal").value),
    fuelSplitMode: $("sfFuelSplitMode").value,
    cleaningExpense: num($("sfCleaningExpense").value),
    parkingExpense: num($("sfParkingExpense").value),
    otherExpenses: num($("sfOtherExpenses").value),
    notes: $("sfNotes").value.trim(),
  };

  if (!raw.dateKey || !raw.startTime || !raw.endTime) {
    throw new Error("Date, start time and end time are required.");
  }

  if (raw.endMileage < raw.startMileage) {
    throw new Error("End mileage cannot be lower than start mileage.");
  }

  const calculated = calculateShiftTotals(raw);

  return {
    ...raw,
    ...calculated,
    status: "CLOSED",
    createdBy: state.authUser.uid,
    createdByRole: state.profile.role,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function renderShiftPreview() {
  const preview = $("shiftPreview");

  try {
    const draft = {
      dateKey: $("sfDate").value || todayISO(),
      startTime: $("sfStartTime").value,
      endTime: $("sfEndTime").value,
      startMileage: $("sfStartMileage").value,
      endMileage: $("sfEndMileage").value,
      cash: $("sfCash").value,
      card: $("sfCard").value,
      freeNow: $("sfFreeNow").value,
      uber: $("sfUber").value,
      bolt: $("sfBolt").value,
      otherApps: $("sfOtherApps").value,
      otherIncome: $("sfOtherIncome").value,
      fuelExpenseTotal: $("sfFuelExpenseTotal").value,
      fuelSplitMode: $("sfFuelSplitMode").value,
      cleaningExpense: $("sfCleaningExpense").value,
      parkingExpense: $("sfParkingExpense").value,
      otherExpenses: $("sfOtherExpenses").value,
    };

    const totals = calculateShiftTotals(draft);

    preview.innerHTML = [
      statCardHTML("Worked Hours", totals.workedHours.toFixed(2), `${totals.workedMinutes} min`),
      statCardHTML("Total KM", totals.totalKm.toFixed(1), "Mileage delta"),
      statCardHTML("Apps Total", money(totals.totalApps), "Free Now + Uber + Bolt + other"),
      statCardHTML("Revenue", money(totals.totalRevenue), "Before expenses"),
      statCardHTML("Fuel Allocated", money(totals.fuelExpenseAllocated), $("sfFuelSplitMode").value),
      statCardHTML("Total Expenses", money(totals.totalExpenses), "Fuel + cleaning + parking + other"),
      statCardHTML("Net Revenue", money(totals.netRevenue), "Revenue - expenses"),
    ].join("");
  } catch {
    preview.innerHTML = statCardHTML("Live calculation", "—", "Fill the form to preview");
  }
}

/**
 * ------------------------------------------------------------
 * 10) DASHBOARD / REPORTS
 * ------------------------------------------------------------
 */
function statCardHTML(label, value, sub = "") {
  return `
    <div class="stat-card">
      <div class="stat-label">${safeText(label)}</div>
      <div class="stat-value">${safeText(value)}</div>
      <div class="stat-sub">${safeText(sub)}</div>
    </div>
  `;
}

function getDateRange(type) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (type === "today") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return [start, end];
  }

  if (type === "week") {
    const day = start.getDay();
    const diffToMonday = (day + 6) % 7;
    start.setDate(start.getDate() - diffToMonday);
    start.setHours(0, 0, 0, 0);

    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return [start, end];
  }

  if (type === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    end.setMonth(end.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    return [start, end];
  }

  if (type === "year") {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);

    end.setMonth(11, 31);
    end.setHours(23, 59, 59, 999);
    return [start, end];
  }

  return [null, null];
}

function shiftDateObj(shift) {
  return shift.dateKey ? new Date(`${shift.dateKey}T12:00:00`) : null;
}

function filterShiftsByRange(shifts, rangeType, fromDate, toDate, driverId = "all") {
  let result = [...shifts];

  if (driverId !== "all") {
    result = result.filter((s) => s.driverId === driverId);
  }

  if (rangeType === "all") {
    return result;
  }

  if (rangeType === "custom") {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`) : null;
    return result.filter((shift) => {
      const d = shiftDateObj(shift);
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }

  const [start, end] = getDateRange(rangeType);
  return result.filter((shift) => {
    const d = shiftDateObj(shift);
    return d && d >= start && d <= end;
  });
}

function summarizeShifts(shifts) {
  return shifts.reduce(
    (acc, shift) => {
      acc.shifts += 1;
      acc.hours += num(shift.workedHours);
      acc.km += num(shift.totalKm);
      acc.cash += num(shift.cash);
      acc.card += num(shift.card);
      acc.freeNow += num(shift.freeNow);
      acc.uber += num(shift.uber);
      acc.bolt += num(shift.bolt);
      acc.otherApps += num(shift.otherApps);
      acc.otherIncome += num(shift.otherIncome);
      acc.apps += num(shift.totalApps);
      acc.revenue += num(shift.totalRevenue);
      acc.expenses += num(shift.totalExpenses);
      acc.net += num(shift.netRevenue);
      return acc;
    },
    {
      shifts: 0,
      hours: 0,
      km: 0,
      cash: 0,
      card: 0,
      freeNow: 0,
      uber: 0,
      bolt: 0,
      otherApps: 0,
      otherIncome: 0,
      apps: 0,
      revenue: 0,
      expenses: 0,
      net: 0,
    }
  );
}

function breakdownBy(shifts, keyFn) {
  const map = new Map();

  for (const shift of shifts) {
    const key = keyFn(shift);
    const current = map.get(key) || [];
    current.push(shift);
    map.set(key, current);
  }

  return [...map.entries()].map(([key, items]) => ({
    key,
    items,
    summary: summarizeShifts(items),
  }));
}

function renderDashboard() {
  const today = summarizeShifts(filterShiftsByRange(state.shifts, "today"));
  const week = summarizeShifts(filterShiftsByRange(state.shifts, "week"));
  const month = summarizeShifts(filterShiftsByRange(state.shifts, "month"));
  const year = summarizeShifts(filterShiftsByRange(state.shifts, "year"));

  $("dashboardStats").innerHTML = [
    statCardHTML("Today Revenue", money(today.revenue), `${today.shifts} shifts • ${today.hours.toFixed(1)} h`),
    statCardHTML("Week Revenue", money(week.revenue), `${week.km.toFixed(1)} km`),
    statCardHTML("Month Revenue", money(month.revenue), `${month.shifts} shifts`),
    statCardHTML("Year Revenue", money(year.revenue), `${year.net.toFixed(2)} net`),
    statCardHTML("Today Net", money(today.net), `Expenses ${money(today.expenses)}`),
    statCardHTML("Today Cash", money(today.cash), `Card ${money(today.card)}`),
    statCardHTML("Today Apps", money(today.apps), `Free Now / Uber / Bolt / other`),
    statCardHTML("Today KM", today.km.toFixed(1), `${today.hours.toFixed(1)} total hours`),
  ].join("");

  $("todaySources").innerHTML = [
    statCardHTML("Cash", money(today.cash)),
    statCardHTML("Card", money(today.card)),
    statCardHTML("Free Now", money(today.freeNow)),
    statCardHTML("Uber", money(today.uber)),
    statCardHTML("Bolt", money(today.bolt)),
    statCardHTML("Other Apps", money(today.otherApps)),
  ].join("");

  const driverGroups = breakdownBy(state.shifts, (s) => s.driverName || "Unknown")
    .sort((a, b) => b.summary.revenue - a.summary.revenue)
    .slice(0, 6);

  $("topDrivers").innerHTML = driverGroups.length
    ? driverGroups
        .map(
          (row) => `
            <div class="stack-row">
              <div>
                <strong>${safeText(row.key)}</strong>
                <div class="muted">${row.summary.shifts} shifts • ${row.summary.hours.toFixed(1)} hours</div>
              </div>
              <div>
                <strong>${money(row.summary.revenue)}</strong>
                <div class="muted">Net ${money(row.summary.net)}</div>
              </div>
            </div>
          `
        )
        .join("")
    : `<div class="stack-row"><div><strong>No shifts yet</strong><div class="muted">Save your first shift</div></div></div>`;
}

$("reportRange").addEventListener("change", renderReports);
$("reportFrom").addEventListener("change", renderReports);
$("reportTo").addEventListener("change", renderReports);
$("reportDriverFilter").addEventListener("change", renderReports);

function renderReports() {
  const range = $("reportRange").value;
  const from = $("reportFrom").value;
  const to = $("reportTo").value;
  const driverFilter =
    state.profile.role === "driver" ? state.authUser.uid : $("reportDriverFilter").value;

  const filtered = filterShiftsByRange(state.shifts, range, from, to, driverFilter);
  const summary = summarizeShifts(filtered);

  $("reportStats").innerHTML = [
    statCardHTML("Shifts", String(summary.shifts), "Total saved shifts"),
    statCardHTML("Hours", summary.hours.toFixed(2), "Worked hours"),
    statCardHTML("KM", summary.km.toFixed(1), "Mileage total"),
    statCardHTML("Revenue", money(summary.revenue), "Gross"),
    statCardHTML("Expenses", money(summary.expenses), "Allocated expenses"),
    statCardHTML("Net", money(summary.net), "After expenses"),
    statCardHTML("Cash", money(summary.cash), "Cash source"),
    statCardHTML("Card", money(summary.card), "Card source"),
  ].join("");

  const byDriver = breakdownBy(filtered, (s) => s.driverName || "Unknown")
    .sort((a, b) => b.summary.revenue - a.summary.revenue);

  $("reportBreakdownDrivers").innerHTML = byDriver.length
    ? byDriver
        .map(
          (row) => `
            <div class="stack-row">
              <div>
                <strong>${safeText(row.key)}</strong>
                <div class="muted">${row.summary.shifts} shifts • ${row.summary.km.toFixed(1)} km</div>
              </div>
              <div>
                <strong>${money(row.summary.revenue)}</strong>
                <div class="muted">Net ${money(row.summary.net)}</div>
              </div>
            </div>
          `
        )
        .join("")
    : `<div class="stack-row"><div><strong>No data</strong><div class="muted">No shifts in this range</div></div></div>`;

  const byDay = breakdownBy(filtered, (s) => s.dateKey || "Unknown")
    .sort((a, b) => String(b.key).localeCompare(String(a.key)));

  $("reportBreakdownDays").innerHTML = byDay.length
    ? byDay
        .map(
          (row) => `
            <div class="stack-row">
              <div>
                <strong>${safeText(row.key)}</strong>
                <div class="muted">${row.summary.shifts} shifts • ${row.summary.hours.toFixed(1)} h</div>
              </div>
              <div>
                <strong>${money(row.summary.revenue)}</strong>
                <div class="muted">Expenses ${money(row.summary.expenses)}</div>
              </div>
            </div>
          `
        )
        .join("")
    : `<div class="stack-row"><div><strong>No data</strong><div class="muted">No shifts in this range</div></div></div>`;
}

/**
 * ------------------------------------------------------------
 * 11) SHIFTS TABLE
 * ------------------------------------------------------------
 */
function renderShiftsTable() {
  const tbody = $("shiftsTableBody");

  if (!state.shifts.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="muted">No shifts yet.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = state.shifts
    .map(
      (shift) => `
        <tr>
          <td>${safeText(shift.dateKey || "")}</td>
          <td>${safeText(shift.driverName || "")}</td>
          <td>${num(shift.workedHours).toFixed(2)}</td>
          <td>${num(shift.totalKm).toFixed(1)}</td>
          <td>${money(shift.cash)}</td>
          <td>${money(shift.card)}</td>
          <td>${money(shift.totalApps)}</td>
          <td>${money(shift.totalExpenses)}</td>
          <td>${money(shift.netRevenue)}</td>
        </tr>
      `
    )
    .join("");
}

/**
 * ------------------------------------------------------------
 * 12) PROFILES
 * ------------------------------------------------------------
 */
function renderProfiles() {
  const users = state.profile.role === "driver" ? [state.profile] : state.users;
  const drivers = users.filter((u) => u.role === "driver").length;
  const managers = users.filter((u) => u.role === "manager").length;
  const admins = users.filter((u) => u.role === "admin").length;

  $("profilesStats").innerHTML = [
    statCardHTML("Visible Profiles", String(users.length), "Accounts in this scope"),
    statCardHTML("Drivers", String(drivers), "Driver users"),
    statCardHTML("Managers", String(managers), "Manager users"),
    statCardHTML("Admins", String(admins), "Admin users"),
  ].join("");

  $("profilesList").innerHTML = users.length
    ? users
        .map(
          (user) => `
            <div class="card profile-card">
              <div class="profile-card-top">
                <div class="avatar">${safeText(getInitials(user.fullName))}</div>
                <div>
                  <div class="profile-name">${safeText(user.fullName || "User")}</div>
                  <div class="profile-role">${safeText(user.role || "driver")}</div>
                </div>
              </div>

              <div class="profile-meta">Email: ${safeText(user.email || "-")}</div>
              <div class="profile-meta">Phone: ${safeText(user.phone || "-")}</div>
              <div class="profile-meta">Status: ${user.active === false ? "inactive" : "active"}</div>
              <div class="profile-meta">Manager ID: ${safeText(user.managerId || "-")}</div>
            </div>
          `
        )
        .join("")
    : `<div class="card">No profiles available.</div>`;
}

/**
 * ------------------------------------------------------------
 * 13) RENDER ALL
 * ------------------------------------------------------------
 */
function renderAll() {
  renderDashboard();
  renderShiftsTable();
  renderReports();
  renderProfiles();
}
