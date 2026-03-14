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

  if (response.status === 401 && !options.suppressAuthRedirect) {
    const currentPath = window.location.pathname;
    if (!currentPath.endsWith("/login.html")) {
      window.location.replace("/login.html");
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
  return fileName.replace(".html", "") || "home";
}

function updateActiveMenuLink() {
  const currentPage = getCurrentPageKey();
  document.querySelectorAll(".sidebar-menu a[data-page]").forEach((link) => {
    const isActive = link.getAttribute("data-page") === currentPage;
    link.classList.toggle("active", isActive);
  });
}

function initAppShell() {
  updateActiveMenuLink();
}

async function initializeSession() {
  const currentPath = window.location.pathname;
  const isLoginPage = currentPath.endsWith("/login.html");
  if (isLoginPage) {
    return null;
  }

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
    window.location.replace("/login.html");
    return null;
  }
}

const sessionReady = (async () => {
  initAppShell();
  return initializeSession();
})();

window.AppCommon = {
  showToast,
  request,
  formatMoney,
  collectCheckedValues,
  vehicleLabel,
  sessionReady,
};
