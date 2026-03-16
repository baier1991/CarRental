const { request, showToast } = window.AppCommon;

const form = document.getElementById("login-form");
const message = document.getElementById("login-message");
const searchParams = new URLSearchParams(window.location.search);
const nextPath = normalizeNextPath(searchParams.get("next"));

function normalizeNextPath(pathValue) {
  const next = String(pathValue || "").trim();
  if (!next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }
  if (
    next === "/login" ||
    next === "/login/" ||
    next.startsWith("/login.html") ||
    next.startsWith("/login?")
  ) {
    return "/";
  }
  if (next.startsWith("/api/")) {
    return "/";
  }
  return next || "/";
}

if (nextPath !== "/") {
  form.action = `/login?next=${encodeURIComponent(nextPath)}`;
}

const nextField = document.getElementById("login-next");
if (nextField) {
  nextField.value = nextPath !== "/" ? nextPath : "";
}

if (searchParams.get("error") === "invalid_credentials") {
  message.innerHTML =
    '<span class="error-text">Invalid credentials. Please verify tenant slug, email, and password.</span>';
}
if (searchParams.get("error") === "missing_fields") {
  message.innerHTML = '<span class="error-text">Please fill tenant slug, email, and password.</span>';
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(form).entries());

  try {
    await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        next: nextPath !== "/" ? nextPath : undefined,
      }),
      suppressAuthRedirect: true,
    });
    await request("/api/auth/me", { suppressAuthRedirect: true });
    message.textContent = "Login successful. Redirecting...";
    window.location.replace(nextPath || "/");
  } catch (error) {
    showToast(error.message, true);
    message.innerHTML = `<span class="error-text">${error.message}. Please verify tenant slug, email, and password.</span>`;
  }
});
