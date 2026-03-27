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
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

/* =========================
   FIREBASE CONFIG
========================= */
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

await setPersistence(auth, browserLocalPersistence);

/* =========================
   FIXED STAFF LOGIN MAP
========================= */
const STAFF = {
  mudassar: {
    staffKey: "mudassar",
    fullName: "MUDASSAR",
    email: "mudassar@fleet.app",
    password: "mudassar1990",
    pin: "1990",
    role: "manager",
    canDrive: true,
    managerKey: null,
  },
  saqlain: {
    staffKey: "saqlain",
    fullName: "SAQLAIN",
    email: "saqlain@fleet.app",
    password: "saqlain1234",
    pin: "1234",
    role: "driver",
    canDrive: true,
    managerKey: "mudassar",
  },
  shujaat: {
    staffKey: "shujaat",
    fullName: "SHUJAAT",
    email: "shujaat@fleet.app",
    password: "shujaat1234",
    pin: "1234",
    role: "driver",
    canDrive: true,
    managerKey: "mudassar",
  },
};

const STAFF_BY_EMAIL = Object.values(STAFF).reduce((acc, item) => {
  acc[item.email] = item;
  return acc;
}, {});

/* =========================
   STATE
========================= */
const state = {
  authUser: null,
  profile: null,
  visibleUsers: [],
  shifts: [],
  unsubUsers: null,
  unsubShifts: null,
};

/* =========================
   HELPERS
========================= */
const $ = (id) => document.getElementById(id);

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(v) {
  return `€${num(v).toFixed(2)}`;
}

function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function initials(name) {
  return String(name || "U")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase() || "")
    .join("") || "U";
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.add("hidden"), 2600);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function dateLabel() {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());
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

function cleanupSubs() {
  if (typeof state.unsubUsers === "function") state.unsubUsers();
  if (typeof state.unsubShifts === "function") state.unsubShifts();
  state.unsubUsers = null;
  state.unsubShifts = null;
}

function getStaticStaffByKey(staffKey) {
  return STAFF[staffKey] || null;
}

function getStaticStaffName(staffKey) {
  return getStaticStaffByKey(staffKey)?.fullName || "";
}

/* =========================
   THEME
========================= */
const themeKey = "taxi_theme";

function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem(themeKey, theme);
  $("themeToggleBtn").textContent = theme === "light" ? "Night mode" : "Day mode";
}

(function initTheme() {
  const saved = localStorage.getItem(themeKey) || "light";
  document.body.setAttribute("data-theme", saved);
})();

$("themeToggleBtn")?.addEventListener("click", () => {
  const current = document.body.getAttribute("data-theme") || "light";
  applyTheme(current === "light" ? "dark" : "light");
});

/* =========================
   LOGIN
========================= */
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const selectedKey = $("loginStaff").value;
  const pin = $("loginPin").value.trim();
  const selected = STAFF[selectedKey];

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
  } catch (err) {
    console.error(err);
    showToast("Firebase user not found or wrong Firebase setup.");
  }
});

$("logoutBtn").addEventListener("click", async () => {
  try {
    await signOut(auth);
    showToast("Logged out.");
  } catch (err) {
    console.error(err);
    showToast("Logout failed.");
  }
});

/* =========================
   AUTH STATE
========================= */
onAuthStateChanged(auth, async (user) => {
  cleanupSubs();

  if (!user) {
    state.authUser = null;
    state.profile = null;
    state.visibleUsers = [];
    state.shifts = [];
    $("authView").classList.remove("hidden");
    $("appView").classList.add("hidden");
    return;
  }

  const staticStaff = STAFF_BY_EMAIL[user.email || ""];
  if (!staticStaff) {
    showToast("This user is not allowed in this app.");
    await signOut(auth);
    return;
  }

  try {
    const profileRef = doc(db, "users", user.uid);
    const profileSnap = await getDoc(profileRef);
    const existing = profileSnap.exists() ? profileSnap.data() : {};

    const mergedProfile = {
      uid: user.uid,
      staffKey: staticStaff.staffKey,
      fullName: staticStaff.fullName,
      email: staticStaff.email,
      role: staticStaff.role,
      canDrive: staticStaff.canDrive,
      managerKey: staticStaff.managerKey,
      active: existing.active !== false,
      createdAt: existing.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(profileRef, mergedProfile, { merge: true });

    if (mergedProfile.active === false) {
      showToast("This account is disabled.");
      await signOut(auth);
      return;
    }

    state.authUser = user;
    state.profile = {
      ...existing,
      ...mergedProfile,
    };

    bootApp();
  } catch (err) {
    console.error(err);
    showToast("Could not load profile.");
  }
});

/* =========================
   BOOT APP
========================= */
function bootApp() {
  $("authView").classList.add("hidden");
  $("appView").classList.remove("hidden");

  $("sidebarName").textContent = state.profile.fullName || "User";
  $("sidebarRole").textContent =
    state.profile.role === "manager" && state.profile.canDrive
      ? "Manager / Driver"
      : state.profile.role || "driver";
  $("sidebarAvatar").textContent = initials(state.profile.fullName);
  $("topbarDate").textContent = dateLabel();

  $("driverSelectWrap").classList.toggle("hidden", state.profile.role !== "manager");
  $("reportDriverWrap").classList.toggle("hidden", state.profile.role === "driver");

  attachNav();
  setDefaults();
  subscribeUsers();
  subscribeShifts();
  renderShiftPreview();
  applyTheme(document.body.getAttribute("data-theme") || "light");
}

/* =========================
   NAV
========================= */
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
  document.querySelectorAll(".view").forEach((view) => view.classList.add("hidden"));
  $(viewId).classList.remove("hidden");

  const map = {
    dashboardView: ["Dashboard", "Realtime totals and overview"],
    shiftView: ["New Shift", "Mileage, money and fuel"],
    shiftsView: ["Shift History", "Saved shifts"],
    reportsView: ["Reports", "Totals by period"],
    profilesView: ["Profiles", "Drivers and manager"],
  };

  $("pageTitle").textContent = map[viewId][0];
  $("pageSubtitle").textContent = map[viewId][1];
}

/* =========================
   USERS SUBSCRIPTION
========================= */
function subscribeUsers() {
  const usersRef = collection(db, "users");

  if (state.profile.role === "manager") {
    const q = query(usersRef, where("managerKey", "==", state.profile.staffKey));
    state.unsubUsers = onSnapshot(q, (snap) => {
      const team = snap.docs.map((d) => d.data());
      state.visibleUsers = [state.profile, ...team];
      afterUsersLoaded();
    });
    return;
  }

  state.visibleUsers = [state.profile];
  afterUsersLoaded();
}

function afterUsersLoaded() {
  populateDriverSelect();
  populateReportDriverSelect();
  renderProfiles();
  renderDashboard();
  renderReports();
}

/* =========================
   SHIFTS SUBSCRIPTION
========================= */
function subscribeShifts() {
  const shiftsRef = collection(db, "shifts");

  if (state.profile.role === "manager") {
    const q = query(shiftsRef, where("managerKey", "==", state.profile.staffKey));
    state.unsubShifts = onSnapshot(q, (snap) => {
      state.shifts = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(b.dateKey || "").localeCompare(String(a.dateKey || "")));
      renderAll();
    });
    return;
  }

  const q = query(shiftsRef, where("driverKey", "==", state.profile.staffKey));
  state.unsubShifts = onSnapshot(q, (snap) => {
    state.shifts = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(b.dateKey || "").localeCompare(String(a.dateKey || "")));
    renderAll();
  });
}

/* =========================
   FORM DEFAULTS
========================= */
function setDefaults() {
  $("sfDate").value = todayISO();
  $("sfFuelSplitMode").value = "FULL";

  [
    "sfCash",
    "sfCard",
    "sfFreeNow",
    "sfUber",
    "sfBolt",
    "sfOtherApps",
    "sfOtherIncome",
    "sfFuelExpenseTotal",
    "sfCleaningExpense",
    "sfParkingExpense",
    "sfOtherExpenses",
  ].forEach((id) => {
    $(id).value = "0";
  });
}

$("resetShiftBtn").addEventListener("click", () => {
  $("shiftForm").reset();
  setDefaults();
  renderShiftPreview();
});

[
  "sfDate",
  "sfDriverKey",
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

function getVisibleUserByStaffKey(staffKey) {
  return state.visibleUsers.find((u) => u.staffKey === staffKey) || null;
}

function getDrivableUsers() {
  if (state.profile.role === "manager") {
    return state.visibleUsers.filter((u) => u.role === "driver" || u.staffKey === state.profile.staffKey);
  }
  return [state.profile];
}

function populateDriverSelect() {
  const select = $("sfDriverKey");

  if (state.profile.role !== "manager") {
    select.innerHTML = "";
    return;
  }

  const drivers = getDrivableUsers();
  select.innerHTML = drivers
    .map((user) => `<option value="${user.staffKey}">${esc(user.fullName)}</option>`)
    .join("");
}

function populateReportDriverSelect() {
  const select = $("reportDriverFilter");

  if (state.profile.role === "driver") {
    select.innerHTML = `<option value="${state.profile.staffKey}">${esc(state.profile.fullName)}</option>`;
    return;
  }

  const drivers = getDrivableUsers();
  select.innerHTML =
    `<option value="all">All</option>` +
    drivers.map((u) => `<option value="${u.staffKey}">${esc(u.fullName)}</option>`).join("");
}

/* =========================
   SHIFT CALCULATIONS
========================= */
function minutesBetween(dateStr, start, end) {
  if (!dateStr || !start || !end) return 0;

  const a = new Date(`${dateStr}T${start}:00`);
  const b = new Date(`${dateStr}T${end}:00`);

  let diff = b.getTime() - a.getTime();
  if (diff < 0) diff += 24 * 60 * 60 * 1000;

  return Math.round(diff / 60000);
}

function splitFuel(total, mode) {
  const value = num(total);
  if (mode === "DIVIDE_BY_2") return value / 2;
  if (mode === "DIVIDE_BY_3") return value / 3;
  return value;
}

function calculateShift(raw) {
  const workedMinutes = minutesBetween(raw.dateKey, raw.startTime, raw.endTime);
  const workedHours = workedMinutes / 60;
  const totalKm = num(raw.endMileage) - num(raw.startMileage);

  const totalApps =
    num(raw.freeNow) +
    num(raw.uber) +
    num(raw.bolt) +
    num(raw.otherApps);

  const totalRevenue =
    num(raw.cash) +
    num(raw.card) +
    totalApps +
    num(raw.otherIncome);

  const fuelExpenseAllocated = splitFuel(raw.fuelExpenseTotal, raw.fuelSplitMode);

  const totalExpenses =
    fuelExpenseAllocated +
    num(raw.cleaningExpense) +
    num(raw.parkingExpense) +
    num(raw.otherExpenses);

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

function buildShiftPayload() {
  const isManager = state.profile.role === "manager";

  let driverKey = state.profile.staffKey;
  let driverProfile = state.profile;

  if (isManager) {
    driverKey = $("sfDriverKey").value || state.profile.staffKey;
    driverProfile = getVisibleUserByStaffKey(driverKey) || state.profile;
  }

  const managerKey = isManager ? state.profile.staffKey : state.profile.managerKey;
  const managerName = managerKey
    ? getVisibleUserByStaffKey(managerKey)?.fullName || getStaticStaffName(managerKey)
    : "";

  const raw = {
    driverUid: driverProfile.uid || null,
    driverKey,
    driverName: driverProfile.fullName || getStaticStaffName(driverKey),
    managerKey: managerKey || null,
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

  return {
    ...raw,
    ...calculateShift(raw),
    status: "CLOSED",
    createdByUid: state.authUser.uid,
    createdByKey: state.profile.staffKey,
    createdByRole: state.profile.role,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

$("shiftForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    const payload = buildShiftPayload();
    await addDoc(collection(db, "shifts"), payload);

    showToast("Shift saved.");
    $("shiftForm").reset();
    setDefaults();
    renderShiftPreview();
    openView("shiftsView");
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    document.querySelector('[data-view="shiftsView"]').classList.add("active");
  } catch (err) {
    console.error(err);
    showToast(err.message || "Could not save shift.");
  }
});

function renderShiftPreview() {
  const preview = $("shiftPreview");

  try {
    const raw = {
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

    const x = calculateShift(raw);

    preview.innerHTML = [
      statCard("Worked Hours", x.workedHours.toFixed(2), `${x.workedMinutes} min`),
      statCard("Total KM", x.totalKm.toFixed(1), "Mileage"),
      statCard("Apps Total", money(x.totalApps), "Free Now + Uber + Bolt + other"),
      statCard("Revenue", money(x.totalRevenue), "Before expenses"),
      statCard("Fuel Allocated", money(x.fuelExpenseAllocated), $("sfFuelSplitMode").value),
      statCard("Expenses", money(x.totalExpenses), "Fuel + cleaning + parking + other"),
      statCard("Net", money(x.netRevenue), "Revenue - expenses"),
    ].join("");
  } catch {
    preview.innerHTML = statCard("Preview", "—", "Fill shift data");
  }
}

/* =========================
   REPORT HELPERS
========================= */
function shiftDate(shift) {
  return shift.dateKey ? new Date(`${shift.dateKey}T12:00:00`) : null;
}

function rangeBounds(type) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (type === "today") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return [start, end];
  }

  if (type === "week") {
    const day = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - day);
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

function filterShifts(range, driverKey = "all") {
  let rows = [...state.shifts];

  if (driverKey !== "all") {
    rows = rows.filter((s) => s.driverKey === driverKey);
  }

  if (range === "all") return rows;

  const [a, b] = rangeBounds(range);
  return rows.filter((shift) => {
    const d = shiftDate(shift);
    return d && d >= a && d <= b;
  });
}

function summarize(rows) {
  return rows.reduce(
    (acc, s) => {
      acc.shifts += 1;
      acc.hours += num(s.workedHours);
      acc.km += num(s.totalKm);
      acc.cash += num(s.cash);
      acc.card += num(s.card);
      acc.apps += num(s.totalApps);
      acc.revenue += num(s.totalRevenue);
      acc.expenses += num(s.totalExpenses);
      acc.net += num(s.netRevenue);
      acc.freeNow += num(s.freeNow);
      acc.uber += num(s.uber);
      acc.bolt += num(s.bolt);
      return acc;
    },
    {
      shifts: 0,
      hours: 0,
      km: 0,
      cash: 0,
      card: 0,
      apps: 0,
      revenue: 0,
      expenses: 0,
      net: 0,
      freeNow: 0,
      uber: 0,
      bolt: 0,
    }
  );
}

/* =========================
   DASHBOARD
========================= */
function renderDashboard() {
  const today = summarize(filterShifts("today"));
  const week = summarize(filterShifts("week"));
  const month = summarize(filterShifts("month"));
  const year = summarize(filterShifts("year"));

  $("dashboardStats").innerHTML = [
    statCard("Today Revenue", money(today.revenue), `${today.shifts} shifts`),
    statCard("Today Net", money(today.net), `Expenses ${money(today.expenses)}`),
    statCard("Week Revenue", money(week.revenue), `${week.hours.toFixed(1)} h`),
    statCard("Month Revenue", money(month.revenue), `${month.km.toFixed(1)} km`),
    statCard("Year Revenue", money(year.revenue), `${year.shifts} shifts`),
    statCard("Today Cash", money(today.cash), `Card ${money(today.card)}`),
    statCard("Today Apps", money(today.apps), "All apps"),
    statCard("Today KM", today.km.toFixed(1), "Mileage"),
  ].join("");

  $("todaySources").innerHTML = [
    statCard("Cash", money(today.cash)),
    statCard("Card", money(today.card)),
    statCard("Free Now", money(today.freeNow)),
    statCard("Uber", money(today.uber)),
    statCard("Bolt", money(today.bolt)),
    statCard("Apps Total", money(today.apps)),
  ].join("");

  const grouped = {};
  for (const s of state.shifts) {
    const key = s.driverName || "Unknown";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  }

  const top = Object.entries(grouped)
    .map(([name, items]) => ({ name, sum: summarize(items) }))
    .sort((a, b) => b.sum.revenue - a.sum.revenue)
    .slice(0, 6);

  $("topDrivers").innerHTML = top.length
    ? top.map((x) => `
        <div class="stack-row">
          <div>
            <strong>${esc(x.name)}</strong>
            <div class="muted">${x.sum.shifts} shifts • ${x.sum.hours.toFixed(1)} h</div>
          </div>
          <div>
            <strong>${money(x.sum.revenue)}</strong>
            <div class="muted">Net ${money(x.sum.net)}</div>
          </div>
        </div>
      `).join("")
    : `<div class="stack-row"><div><strong>No shifts yet</strong></div></div>`;
}

/* =========================
   REPORTS
========================= */
$("reportRange").addEventListener("change", renderReports);
$("reportDriverFilter").addEventListener("change", renderReports);

function renderReports() {
  const range = $("reportRange").value;
  const driverKey =
    state.profile.role === "driver"
      ? state.profile.staffKey
      : $("reportDriverFilter").value;

  const rows = filterShifts(range, driverKey);
  const sum = summarize(rows);

  $("reportStats").innerHTML = [
    statCard("Shifts", String(sum.shifts), "Total"),
    statCard("Hours", sum.hours.toFixed(2), "Worked"),
    statCard("KM", sum.km.toFixed(1), "Mileage"),
    statCard("Revenue", money(sum.revenue), "Gross"),
    statCard("Expenses", money(sum.expenses), "Allocated"),
    statCard("Net", money(sum.net), "After expenses"),
    statCard("Cash", money(sum.cash), "Cash total"),
    statCard("Card", money(sum.card), "Card total"),
  ].join("");
}

/* =========================
   SHIFTS TABLE
========================= */
function renderShiftsTable() {
  const tbody = $("shiftsTableBody");

  if (!state.shifts.length) {
    tbody.innerHTML = `<tr><td colspan="7">No shifts yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.shifts
    .map((s) => `
      <tr>
        <td>${esc(s.dateKey || "")}</td>
        <td>${esc(s.driverName || "")}</td>
        <td>${num(s.workedHours).toFixed(2)}</td>
        <td>${num(s.totalKm).toFixed(1)}</td>
        <td>${money(s.totalRevenue)}</td>
        <td>${money(s.totalExpenses)}</td>
        <td>${money(s.netRevenue)}</td>
      </tr>
    `)
    .join("");
}

/* =========================
   PROFILES
========================= */
function renderProfiles() {
  const rows = state.visibleUsers;
  const drivers = rows.filter((u) => u.role === "driver").length;
  const managers = rows.filter((u) => u.role === "manager").length;

  $("profilesStats").innerHTML = [
    statCard("Profiles", String(rows.length), "Visible"),
    statCard("Drivers", String(drivers), "Driver accounts"),
    statCard("Managers", String(managers), "Manager accounts"),
  ].join("");

  $("profilesList").innerHTML = rows
    .map((u) => `
      <div class="card">
        <div class="profile-box">
          <div class="avatar">${esc(initials(u.fullName))}</div>
          <div>
            <div class="profile-name">${esc(u.fullName || "User")}</div>
            <div class="profile-role">
              ${esc(u.role === "manager" && u.canDrive ? "Manager / Driver" : (u.role || "driver"))}
            </div>
          </div>
        </div>
        <p class="muted">Email: ${esc(u.email || "-")}</p>
        <p class="muted">Staff key: ${esc(u.staffKey || "-")}</p>
        <p class="muted">Manager key: ${esc(u.managerKey || "-")}</p>
        <p class="muted">Status: ${u.active === false ? "inactive" : "active"}</p>
      </div>
    `)
    .join("");
}

/* =========================
   RENDER ALL
========================= */
function renderAll() {
  renderDashboard();
  renderShiftsTable();
  renderReports();
  renderProfiles();
}
