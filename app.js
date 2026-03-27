import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
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
   STATE
========================= */
const state = {
  authUser: null,
  profile: null,
  users: [],
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

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add("hidden"), 2500);
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

/* =========================
   THEME
========================= */
const themeKey = "taxi_theme";

function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  $("themeToggleBtn").textContent = theme === "light" ? "Night mode" : "Day mode";
  localStorage.setItem(themeKey, theme);
}

function initTheme() {
  const saved = localStorage.getItem(themeKey) || "light";
  document.body.setAttribute("data-theme", saved);
}

initTheme();

$("themeToggleBtn")?.addEventListener("click", () => {
  const current = document.body.getAttribute("data-theme") || "light";
  applyTheme(current === "light" ? "dark" : "light");
});

/* =========================
   AUTH TABS
========================= */
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

/* =========================
   AUTH ACTIONS
========================= */
$("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const fullName = $("registerFullName").value.trim();
  const phone = $("registerPhone").value.trim();
  const email = $("registerEmail").value.trim();
  const password = $("registerPassword").value;
  const role = $("registerRole").value;

  if (!fullName || !email || !password) {
    showToast("Complete all required fields.");
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
  } catch (err) {
    console.error(err);
    showToast(err.message || "Registration failed.");
  }
});

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    await signInWithEmailAndPassword(
      auth,
      $("loginEmail").value.trim(),
      $("loginPassword").value
    );
    showToast("Signed in.");
  } catch (err) {
    console.error(err);
    showToast(err.message || "Login failed.");
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
    state.users = [];
    state.shifts = [];
    $("authView").classList.remove("hidden");
    $("appView").classList.add("hidden");
    return;
  }

  try {
    const profileRef = doc(db, "users", user.uid);
    let profileSnap = await getDoc(profileRef);

    if (!profileSnap.exists()) {
      await setDoc(profileRef, {
        uid: user.uid,
        fullName: user.email?.split("@")[0] || "User",
        phone: "",
        email: user.email || "",
        role: "driver",
        managerId: null,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      profileSnap = await getDoc(profileRef);
    }

    const profile = profileSnap.data();

    if (profile.active === false) {
      showToast("This account is disabled.");
      await signOut(auth);
      return;
    }

    state.authUser = user;
    state.profile = profile;

    bootApp();
  } catch (err) {
    console.error(err);
    showToast("Could not load user profile.");
  }
});

/* =========================
   BOOT
========================= */
function bootApp() {
  $("authView").classList.add("hidden");
  $("appView").classList.remove("hidden");

  $("sidebarName").textContent = state.profile.fullName || "User";
  $("sidebarRole").textContent = state.profile.role || "driver";
  $("sidebarAvatar").textContent = initials(state.profile.fullName);
  $("topbarDate").textContent = dateLabel();

  $("driverSelectWrap").classList.toggle("hidden", state.profile.role === "driver");
  $("reportDriverWrap").classList.toggle("hidden", state.profile.role === "driver");

  attachNav();
  setDefaults();
  subscribeUsers();
  subscribeShifts();
  renderShiftPreview();
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
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  $(viewId).classList.remove("hidden");

  const map = {
    dashboardView: ["Dashboard", "Realtime totals"],
    shiftView: ["New Shift", "Enter mileage, money and expenses"],
    shiftsView: ["Shift History", "Saved shifts"],
    reportsView: ["Reports", "Period totals"],
    profilesView: ["Profiles", "Drivers and managers"],
  };

  $("pageTitle").textContent = map[viewId][0];
  $("pageSubtitle").textContent = map[viewId][1];
}

/* =========================
   SUBSCRIPTIONS
========================= */
function subscribeUsers() {
  const usersRef = collection(db, "users");
  const role = state.profile.role;

  if (role === "admin") {
    state.unsubUsers = onSnapshot(usersRef, (snap) => {
      state.users = snap.docs.map((d) => d.data());
      afterUsers();
    });
    return;
  }

  if (role === "manager") {
    const q = query(usersRef, where("managerId", "==", state.authUser.uid));
    state.unsubUsers = onSnapshot(q, (snap) => {
      state.users = [state.profile, ...snap.docs.map((d) => d.data())];
      afterUsers();
    });
    return;
  }

  state.users = [state.profile];
  afterUsers();
}

function subscribeShifts() {
  const shiftsRef = collection(db, "shifts");
  const role = state.profile.role;

  if (role === "admin") {
    state.unsubShifts = onSnapshot(shiftsRef, (snap) => {
      state.shifts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderAll();
    });
    return;
  }

  if (role === "manager") {
    const q = query(shiftsRef, where("managerId", "==", state.authUser.uid));
    state.unsubShifts = onSnapshot(q, (snap) => {
      state.shifts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderAll();
    });
    return;
  }

  const q = query(shiftsRef, where("driverId", "==", state.authUser.uid));
  state.unsubShifts = onSnapshot(q, (snap) => {
    state.shifts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAll();
  });
}

function afterUsers() {
  populateDriverSelect();
  populateReportDriverSelect();
  renderProfiles();
  renderDashboard();
  renderReports();
}

/* =========================
   SHIFT FORM
========================= */
function setDefaults() {
  $("sfDate").value = todayISO();
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
  ].forEach((id) => ($(id).value = "0"));
  $("sfFuelSplitMode").value = "FULL";
}

$("resetShiftBtn").addEventListener("click", () => {
  $("shiftForm").reset();
  setDefaults();
  renderShiftPreview();
});

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

function populateDriverSelect() {
  if (state.profile.role === "driver") return;
  const drivers = state.users.filter((u) => u.role === "driver");
  $("sfDriverId").innerHTML = drivers
    .map((d) => `<option value="${d.uid}">${esc(d.fullName)}</option>`)
    .join("");
}

function populateReportDriverSelect() {
  if (state.profile.role === "driver") {
    $("reportDriverFilter").innerHTML = `<option value="${state.authUser.uid}">${esc(state.profile.fullName)}</option>`;
    return;
  }

  const drivers = state.users.filter((u) => u.role === "driver");
  $("reportDriverFilter").innerHTML =
    `<option value="all">All</option>` +
    drivers.map((d) => `<option value="${d.uid}">${esc(d.fullName)}</option>`).join("");
}

function getUserById(uid) {
  return state.users.find((u) => u.uid === uid) || null;
}

function minutesBetween(dateStr, start, end) {
  if (!dateStr || !start || !end) return 0;
  const a = new Date(`${dateStr}T${start}:00`);
  const b = new Date(`${dateStr}T${end}:00`);
  let diff = b.getTime() - a.getTime();
  if (diff < 0) diff += 24 * 60 * 60 * 1000;
  return Math.round(diff / 60000);
}

function splitFuel(total, mode) {
  const v = num(total);
  if (mode === "DIVIDE_BY_2") return v / 2;
  if (mode === "DIVIDE_BY_3") return v / 3;
  return v;
}

function calculateShift(raw) {
  const workedMinutes = minutesBetween(raw.dateKey, raw.startTime, raw.endTime);
  const workedHours = workedMinutes / 60;
  const totalKm = num(raw.endMileage) - num(raw.startMileage);

  const totalApps =
    num(raw.freeNow) + num(raw.uber) + num(raw.bolt) + num(raw.otherApps);

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
  const role = state.profile.role;

  let driverId = state.authUser.uid;
  let driverName = state.profile.fullName;
  let managerId = state.profile.managerId || null;
  let managerName = getUserById(managerId)?.fullName || "";

  if (role === "manager" || role === "admin") {
    driverId = $("sfDriverId").value;
    if (!driverId) throw new Error("Select a driver.");
    const driver = getUserById(driverId);
    driverName = driver?.fullName || "Driver";
    managerId = role === "manager" ? state.authUser.uid : driver?.managerId || null;
    managerName = role === "manager"
      ? state.profile.fullName
      : getUserById(managerId)?.fullName || "";
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
    throw new Error("Date and times are required.");
  }

  if (raw.endMileage < raw.startMileage) {
    throw new Error("End mileage cannot be lower than start mileage.");
  }

  return {
    ...raw,
    ...calculateShift(raw),
    status: "CLOSED",
    createdBy: state.authUser.uid,
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
    $("shiftPreview").innerHTML = [
      statCard("Worked Hours", x.workedHours.toFixed(2), `${x.workedMinutes} min`),
      statCard("Total KM", x.totalKm.toFixed(1), "Mileage"),
      statCard("Apps Total", money(x.totalApps), "Free Now + Uber + Bolt + other"),
      statCard("Revenue", money(x.totalRevenue), "Before expenses"),
      statCard("Fuel Allocated", money(x.fuelExpenseAllocated), $("sfFuelSplitMode").value),
      statCard("Expenses", money(x.totalExpenses), "Fuel + cleaning + parking + other"),
      statCard("Net", money(x.netRevenue), "Revenue - expenses"),
    ].join("");
  } catch {
    $("shiftPreview").innerHTML = statCard("Preview", "—", "Fill shift data");
  }
}

/* =========================
   DASHBOARD / REPORTS
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

function filterShifts(type, driverId = "all") {
  let rows = [...state.shifts];

  if (driverId !== "all") {
    rows = rows.filter((s) => s.driverId === driverId);
  }

  if (type === "all") return rows;

  const [a, b] = rangeBounds(type);
  return rows.filter((s) => {
    const d = shiftDate(s);
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

$("reportRange").addEventListener("change", renderReports);
$("reportDriverFilter").addEventListener("change", renderReports);

function renderReports() {
  const range = $("reportRange").value;
  const driverId = state.profile.role === "driver"
    ? state.authUser.uid
    : $("reportDriverFilter").value;

  const rows = filterShifts(range, driverId);
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

  const rows = [...state.shifts].sort((a, b) => (b.dateKey || "").localeCompare(a.dateKey || ""));

  tbody.innerHTML = rows.map((s) => `
    <tr>
      <td>${esc(s.dateKey || "")}</td>
      <td>${esc(s.driverName || "")}</td>
      <td>${num(s.workedHours).toFixed(2)}</td>
      <td>${num(s.totalKm).toFixed(1)}</td>
      <td>${money(s.totalRevenue)}</td>
      <td>${money(s.totalExpenses)}</td>
      <td>${money(s.netRevenue)}</td>
    </tr>
  `).join("");
}

/* =========================
   PROFILES
========================= */
function renderProfiles() {
  const rows = state.profile.role === "driver" ? [state.profile] : state.users;
  const drivers = rows.filter((u) => u.role === "driver").length;
  const managers = rows.filter((u) => u.role === "manager").length;

  $("profilesStats").innerHTML = [
    statCard("Profiles", String(rows.length), "Visible"),
    statCard("Drivers", String(drivers), "Driver accounts"),
    statCard("Managers", String(managers), "Manager accounts"),
  ].join("");

  $("profilesList").innerHTML = rows.map((u) => `
    <div class="card">
      <div class="profile-box">
        <div class="avatar">${esc(initials(u.fullName))}</div>
        <div>
          <div class="profile-name">${esc(u.fullName || "User")}</div>
          <div class="profile-role">${esc(u.role || "driver")}</div>
        </div>
      </div>
      <p class="muted">Email: ${esc(u.email || "-")}</p>
      <p class="muted">Phone: ${esc(u.phone || "-")}</p>
      <p class="muted">Status: ${u.active === false ? "inactive" : "active"}</p>
    </div>
  `).join("");
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
