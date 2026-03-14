const { request, showToast } = window.AppCommon;

const form = document.getElementById("login-form");
const message = document.getElementById("login-message");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(form).entries());

  try {
    await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
      suppressAuthRedirect: true,
    });
    message.textContent = "Login successful. Redirecting...";
    window.location.replace("/");
  } catch (error) {
    showToast(error.message, true);
    message.innerHTML = `<span class="error-text">${error.message}</span>`;
  }
});
