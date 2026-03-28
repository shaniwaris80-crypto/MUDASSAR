import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getFirestore, doc, onSnapshot, collection } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCU5HPe6BgavLPG91g8P1_mPqtqaoXo8jo",
  authDomain: "mudassar-eaff1.firebaseapp.com",
  projectId: "mudassar-eaff1",
  storageBucket: "mudassar-eaff1.firebasestorage.app",
  messagingSenderId: "993162447687",
  appId: "1:993162447687:web:e61c85d4f823093cd29a62",
  measurementId: "G-TR8P3854MG",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const emailToStaffKey = {
  "mudassar@fleet.app": "mudassar",
  "saqlain@fleet.app": "saqlain",
  "shujaat@fleet.app": "shujaat",
};

let unsubCurrentProfile = null;
let unsubProfiles = null;
let unsubCars = null;
let profilesMap = {};
let carsMap = {};
let currentStaffKey = "";

function initials(name) {
  return String(name || "U")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase() || "")
    .join("") || "U";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getProfile(staffKey) {
  return profilesMap[staffKey] || null;
}

function getCarLabel(carId) {
  const car = carsMap[carId];
  if (!car) return "";
  return [car.alias, car.plate, car.model].filter(Boolean).join(" · ");
}

function setSidebarPhoto(profile) {
  const avatarEl = document.getElementById("sidebarAvatar");
  const vehicleEl = document.getElementById("sidebarVehicle");
  if (!avatarEl || !vehicleEl || !profile) return;

  const carLabel = getCarLabel(profile.defaultCarId) || profile.vehicle || "";
  vehicleEl.textContent = carLabel; // blank if no default car

  if (profile.photoUrl) {
    avatarEl.classList.add("sidebar-photo");
    avatarEl.innerHTML = `<img src="${escapeHtml(profile.photoUrl)}" alt="${escapeHtml(profile.fullName || "Driver")}" />`;
  } else {
    avatarEl.classList.remove("sidebar-photo");
    avatarEl.textContent = initials(profile.fullName || "D");
  }
}

function ensureReportDriverCard() {
  const reportsView = document.getElementById("reportsView");
  if (!reportsView) return null;
  let card = document.getElementById("reportDriverCard");
  if (card) return card;

  const anchor = reportsView.querySelector(".card");
  if (!anchor) return null;

  card = document.createElement("div");
  card.id = "reportDriverCard";
  card.className = "card hidden";
  anchor.insertAdjacentElement("afterend", card);
  return card;
}

function renderReportDriverCard() {
  const card = ensureReportDriverCard();
  if (!card) return;

  const reportRange = document.getElementById("reportRange");
  const driverFilter = document.getElementById("reportDriverFilter");
  if (!reportRange) return;

  let staffKey = currentStaffKey;
  if (driverFilter && driverFilter.value && driverFilter.value !== "all") {
    staffKey = driverFilter.value;
  } else if (driverFilter && driverFilter.value === "all") {
    card.classList.add("hidden");
    return;
  }

  const profile = getProfile(staffKey);
  if (!profile) {
    card.classList.add("hidden");
    return;
  }

  const color = profile.colorHex || "#1d4ed8";
  const photoHtml = profile.photoUrl
    ? `<img class="report-driver-photo" src="${escapeHtml(profile.photoUrl)}" alt="${escapeHtml(profile.fullName || "Driver")}" />`
    : `<div class="report-driver-fallback" style="background:${escapeHtml(color)}">${escapeHtml(initials(profile.fullName || "D"))}</div>`;

  const carLabel = getCarLabel(profile.defaultCarId) || profile.vehicle || "Sin coche asignado";
  const roleLabel = profile.role === "manager" ? "Manager / Driver" : "Driver";

  card.innerHTML = `
    <div class="report-driver-card">
      ${photoHtml}
      <div>
        <div class="report-driver-title">${escapeHtml(profile.fullName || "Driver")}</div>
        <div class="report-driver-sub">${escapeHtml(roleLabel)} · ${escapeHtml(carLabel)}</div>
        <div class="report-driver-sub">Periodo: ${escapeHtml(reportRange.value || "month")}</div>
      </div>
    </div>
  `;
  card.classList.remove("hidden");
}

function bindReportListeners() {
  const driverFilter = document.getElementById("reportDriverFilter");
  const reportRange = document.getElementById("reportRange");
  if (driverFilter && !driverFilter.dataset.photoPatchBound) {
    driverFilter.addEventListener("change", renderReportDriverCard);
    driverFilter.dataset.photoPatchBound = "1";
  }
  if (reportRange && !reportRange.dataset.photoPatchBound) {
    reportRange.addEventListener("change", renderReportDriverCard);
    reportRange.dataset.photoPatchBound = "1";
  }
}

function watchProfilesAndCars() {
  if (unsubProfiles) unsubProfiles();
  if (unsubCars) unsubCars();

  unsubProfiles = onSnapshot(collection(db, "driverProfiles"), (snap) => {
    profilesMap = {};
    snap.forEach((d) => {
      profilesMap[d.id] = d.data();
    });
    const current = getProfile(currentStaffKey);
    if (current) setSidebarPhoto(current);
    bindReportListeners();
    renderReportDriverCard();
  });

  unsubCars = onSnapshot(collection(db, "cars"), (snap) => {
    carsMap = {};
    snap.forEach((d) => {
      carsMap[d.id] = d.data();
    });
    const current = getProfile(currentStaffKey);
    if (current) setSidebarPhoto(current);
    renderReportDriverCard();
  });
}

function observeAppRenders() {
  const appView = document.getElementById("appView");
  if (!appView) return;
  const mo = new MutationObserver(() => {
    const current = getProfile(currentStaffKey);
    if (current) setSidebarPhoto(current);
    bindReportListeners();
    renderReportDriverCard();
  });
  mo.observe(appView, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
}

onAuthStateChanged(auth, (user) => {
  if (unsubCurrentProfile) {
    unsubCurrentProfile();
    unsubCurrentProfile = null;
  }
  if (!user) return;

  currentStaffKey = emailToStaffKey[user.email || ""] || "";
  if (!currentStaffKey) return;

  watchProfilesAndCars();
  observeAppRenders();

  unsubCurrentProfile = onSnapshot(doc(db, "driverProfiles", currentStaffKey), (snap) => {
    if (snap.exists()) {
      profilesMap[currentStaffKey] = snap.data();
      setSidebarPhoto(snap.data());
      renderReportDriverCard();
    }
  });
});
