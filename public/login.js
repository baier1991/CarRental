const { request, showToast } = window.AppCommon;

const form = document.getElementById("login-form");
const message = document.getElementById("login-message");
const searchParams = new URLSearchParams(window.location.search);

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
      body: JSON.stringify(payload),
      suppressAuthRedirect: true,
    });
    await request("/api/auth/me", { suppressAuthRedirect: true });
    message.textContent = "Login successful. Redirecting...";
    window.location.replace("/index.html");
  } catch (error) {
    showToast(error.message, true);
    message.innerHTML = `<span class="error-text">${error.message}. Please verify tenant slug, email, and password.</span>`;
  }
});
