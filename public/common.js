const APP_ROLE_KEY = "car_rental_role";
const ROLE_TO_ALLOWED_PAGES = {
  admin: new Set(["home", "fleet", "customers", "reservations", "maintenance"]),
  operations: new Set(["home", "fleet", "reservations", "maintenance"]),
  agent: new Set(["home", "customers", "reservations"]),
};

function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  if (!toast) {
    return;
  }

  toast.textContent = message;
  toast.classList.remove("hidden", "error");
  if (isError) {
    toast.classList.add("error");
  }

  setTimeout(() => {
    toast.classList.add("hidden");
    toast.classList.remove("error");
  }, 2800);
}

async function request(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const isFormData = options.body instanceof FormData;
  if (!isFormData && options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof data === "string" ? data || `Request failed: ${response.status}` : data?.error || `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return data;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

function collectCheckedValues(form, key) {
  return Array.from(form.querySelectorAll(`input[name="${key}"]:checked`)).map((item) => item.value);
}

function vehicleLabel(vehicle) {
  return `${vehicle.plateNumber} - ${vehicle.make} ${vehicle.model} (${formatMoney(vehicle.dailyRate)}/day, ${vehicle.status})`;
}

function getCurrentPageKey() {
  if (document.body.dataset.page) {
    return document.body.dataset.page;
  }

  const pathName = window.location.pathname;
  if (pathName === "/" || pathName === "/index.html") {
    return "home";
  }

  const fileName = pathName.split("/").pop() || "";
  return fileName.replace(".html", "") || "home";
}

function getRole() {
  const saved = localStorage.getItem(APP_ROLE_KEY);
  if (saved && Object.prototype.hasOwnProperty.call(ROLE_TO_ALLOWED_PAGES, saved)) {
    return saved;
  }
  return "admin";
}

function setRole(role) {
  if (!Object.prototype.hasOwnProperty.call(ROLE_TO_ALLOWED_PAGES, role)) {
    return;
  }
  localStorage.setItem(APP_ROLE_KEY, role);
}

function roleIncludes(role, csvList) {
  if (!csvList) {
    return true;
  }
  const allowedRoles = String(csvList)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return allowedRoles.includes(role);
}

function applyRoleVisibility(role) {
  document.querySelectorAll("[data-roles], [data-visible-for]").forEach((element) => {
    const roleConfig = element.getAttribute("data-roles") || element.getAttribute("data-visible-for");
    const visible = roleIncludes(role, roleConfig);
    element.classList.toggle("role-hidden", !visible);
  });
}

function updateActiveMenuLink() {
  const currentPage = getCurrentPageKey();
  document.querySelectorAll(".sidebar-menu a[data-page]").forEach((link) => {
    const isActive = link.getAttribute("data-page") === currentPage;
    link.classList.toggle("active", isActive);
  });
}

function enforceRolePageAccess(role) {
  const page = getCurrentPageKey();
  const allowedPages = ROLE_TO_ALLOWED_PAGES[role] || ROLE_TO_ALLOWED_PAGES.admin;
  if (allowedPages.has(page)) {
    return;
  }

  const fallback = Array.from(allowedPages)[0] || "home";
  const fallbackUrl = fallback === "home" ? "/" : `/${fallback}.html`;
  window.location.replace(fallbackUrl);
}

function setupRoleSelector() {
  const selector = document.getElementById("role-select");
  if (!selector) {
    return;
  }

  const role = getRole();
  selector.value = role;

  selector.addEventListener("change", () => {
    setRole(selector.value);
    const updatedRole = getRole();
    applyRoleVisibility(updatedRole);
    updateActiveMenuLink();
    enforceRolePageAccess(updatedRole);
  });
}

function initAppShell() {
  const role = getRole();
  applyRoleVisibility(role);
  updateActiveMenuLink();
  setupRoleSelector();
  enforceRolePageAccess(role);
}

initAppShell();

window.AppCommon = {
  showToast,
  request,
  formatMoney,
  collectCheckedValues,
  vehicleLabel,
  getRole,
};
