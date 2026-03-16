const APP_BOOT_KEY = "__carRentalBoot";
const appBootState = window[APP_BOOT_KEY] || { bootDetected: false, pageStatus: {} };
appBootState.bootDetected = true;
window[APP_BOOT_KEY] = appBootState;

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

function confirmAction(message) {
  const text = String(message || "").trim() || "Are you sure?";
  if (typeof window.confirm !== "function") {
    return true;
  }
  return window.confirm(text);
}

function appendNoCacheParam(url) {
  const separator = String(url).includes("?") ? "&" : "?";
  return `${url}${separator}_ts=${Date.now()}`;
}

function normalizeNextPath(pathValue) {
  const nextPath = String(pathValue || "").trim();
  if (!nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/";
  }
  if (
    nextPath === "/login" ||
    nextPath === "/login/" ||
    nextPath.startsWith("/login.html") ||
    nextPath.startsWith("/login?")
  ) {
    return "/";
  }
  if (nextPath.startsWith("/api/")) {
    return "/";
  }
  return nextPath || "/";
}

function buildLoginUrl() {
  const nextPath = normalizeNextPath(
    `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`
  );
  if (nextPath === "/" || nextPath === "/index.html") {
    return "/login.html";
  }
  return `/login.html?next=${encodeURIComponent(nextPath)}`;
}

async function request(url, options = {}) {
  const { suppressAuthRedirect = false, ...fetchOptions } = options;
  const headers = new Headers(options.headers || {});
  const isFormData = options.body instanceof FormData;
  if (!isFormData && options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const method = String(fetchOptions.method || "GET").toUpperCase();
  const requestUrl = method === "GET" || method === "HEAD" ? appendNoCacheParam(url) : url;

  const response = await fetch(requestUrl, {
    ...fetchOptions,
    headers,
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : await response.text();

  if (response.status === 401 && !suppressAuthRedirect) {
    const currentPath = window.location.pathname;
    if (!currentPath.endsWith("/login.html")) {
      window.location.replace(buildLoginUrl());
    }
  }

  if (!response.ok) {
    const hasErrorMessage = data && typeof data === "object" && "error" in data;
    const message =
      typeof data === "string"
        ? data || `Request failed: ${response.status}`
        : hasErrorMessage
          ? data.error
          : `Request failed: ${response.status}`;
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
  const pageKey = fileName.replace(".html", "") || "home";
  if (pageKey === "vehicle-profile") {
    return "fleet";
  }
  return pageKey;
}

function markPageStatus(status, pageKey = getCurrentPageKey()) {
  appBootState.pageStatus[pageKey] = status;
}

function markPageReady(pageKey = getCurrentPageKey()) {
  markPageStatus("ready", pageKey);
}

function updateActiveMenuLink() {
  const currentPage = getCurrentPageKey();
  document.querySelectorAll(".sidebar-menu a[data-page]").forEach((link) => {
    const isActive = link.getAttribute("data-page") === currentPage;
    link.classList.toggle("active", isActive);
  });
}

function initSidebarToggle() {
  const toggleButton = document.getElementById("sidebar-toggle");
  const sidebarMenu = document.getElementById("sidebar-menu");
  if (!toggleButton || !sidebarMenu) {
    return;
  }

  const setOpen = (isOpen) => {
    document.body.classList.toggle("sidebar-open", isOpen);
    toggleButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
  };

  setOpen(false);
  toggleButton.addEventListener("click", () => {
    setOpen(!document.body.classList.contains("sidebar-open"));
  });

  sidebarMenu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setOpen(false));
  });
}

function applyResponsiveTableLabels(root = document) {
  root.querySelectorAll(".table-wrap table").forEach((table) => {
    table.classList.add("mobile-card-table");
    const headerLabels = Array.from(table.querySelectorAll("thead th")).map((header) =>
      String(header.textContent || "Value").trim()
    );

    table.querySelectorAll("tbody tr").forEach((row) => {
      Array.from(row.children).forEach((cell, index) => {
        if (cell.tagName === "TD") {
          cell.setAttribute("data-label", headerLabels[index] || "Value");
        }
      });
    });
  });
}

let isTableObserverStarted = false;
function startResponsiveTableObserver() {
  if (isTableObserverStarted || typeof MutationObserver === "undefined") {
    return;
  }
  isTableObserverStarted = true;

  const observer = new MutationObserver(() => {
    applyResponsiveTableLabels();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function paginateItems(items, currentPage = 1, pageSize = 10) {
  const safeItems = Array.isArray(items) ? items : [];
  const safePageSize = Number.isFinite(Number(pageSize)) && Number(pageSize) > 0 ? Number(pageSize) : 10;
  const totalItems = safeItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const safeCurrentPage = Math.min(Math.max(1, Number(currentPage) || 1), totalPages);
  const startIndex = (safeCurrentPage - 1) * safePageSize;
  const endIndex = Math.min(startIndex + safePageSize, totalItems);

  return {
    items: safeItems.slice(startIndex, endIndex),
    currentPage: safeCurrentPage,
    totalPages,
    totalItems,
    pageSize: safePageSize,
    startIndex,
    endIndex,
  };
}

function renderPaginationControls(containerId, paginationResult, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container) {
    return;
  }

  if (!paginationResult || paginationResult.totalPages <= 1) {
    container.classList.add("hidden");
    container.innerHTML = "";
    return;
  }

  const { currentPage, totalPages, totalItems, pageSize } = paginationResult;
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(totalItems, currentPage * pageSize);
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, currentPage + 2);

  const pageButtons = [];
  for (let page = startPage; page <= endPage; page += 1) {
    pageButtons.push(`
      <button
        type="button"
        class="pagination-btn ${page === currentPage ? "active" : ""}"
        data-page="${page}"
        ${page === currentPage ? "aria-current=\"page\"" : ""}
      >${page}</button>
    `);
  }

  container.classList.remove("hidden");
  container.innerHTML = `
    <div class="pagination-controls">
      <button type="button" class="pagination-btn" data-page="${currentPage - 1}" ${currentPage <= 1 ? "disabled" : ""}>Prev</button>
      <div class="pagination-pages">${pageButtons.join("")}</div>
      <button type="button" class="pagination-btn" data-page="${currentPage + 1}" ${currentPage >= totalPages ? "disabled" : ""}>Next</button>
      <span class="pagination-summary">Showing ${startItem}-${endItem} of ${totalItems}</span>
    </div>
  `;

  container.querySelectorAll("button[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.hasAttribute("disabled")) {
        return;
      }
      const nextPage = Number(button.getAttribute("data-page"));
      if (Number.isFinite(nextPage) && typeof onPageChange === "function") {
        onPageChange(nextPage);
      }
    });
  });
}

function initAppShell() {
  updateActiveMenuLink();
  initSidebarToggle();
  applyResponsiveTableLabels();
  startResponsiveTableObserver();
}

async function initializeSession() {
  const currentPath = window.location.pathname;
  const isLoginPage = currentPath.endsWith("/login.html");
  if (isLoginPage) {
    return null;
  }

  markPageStatus("boot");

  try {
    const session = await request("/api/auth/me", { suppressAuthRedirect: true });
    const summary = document.getElementById("session-summary");
    if (summary) {
      summary.innerHTML = `
        <strong>${session.tenant.name}</strong><br />
        <small>${session.user.firstName || ""} ${session.user.lastName || ""} (${session.user.role})</small>
      `;
    }

    const logoutButton = document.getElementById("logout-btn");
    if (logoutButton) {
      logoutButton.addEventListener("click", async () => {
        if (!confirmAction("Log out now?")) {
          return;
        }
        try {
          await request("/api/auth/logout", { method: "POST", suppressAuthRedirect: true });
        } catch (_error) {
          // Ignore logout errors and redirect anyway.
        }
        window.location.replace("/login.html");
      });
    }

    return session;
  } catch (_error) {
    window.location.replace(buildLoginUrl());
    return null;
  }
}

const sessionReady = (async () => {
  initAppShell();
  return initializeSession();
})();

window.AppCommon = {
  showToast,
  confirmAction,
  request,
  formatMoney,
  collectCheckedValues,
  vehicleLabel,
  sessionReady,
  markPageReady,
  applyResponsiveTableLabels,
  paginateItems,
  renderPaginationControls,
};
