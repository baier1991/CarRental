const { request, showToast, sessionReady, markPageReady, paginateItems, renderPaginationControls } = window.AppCommon;

const state = {
  users: [],
  userPage: 1,
  userPageSize: 8,
};

function fullName(user) {
  return `${user.firstName || ""} ${user.lastName || ""}`.trim();
}

function populateUserSelect() {
  const select = document.getElementById("password-user-id");
  if (!select) {
    return;
  }
  const previous = select.value;
  select.innerHTML = state.users
    .map((user) => `<option value="${user.id}">${fullName(user)} (${user.email})</option>`)
    .join("");
  if (previous) {
    select.value = previous;
  }
}

function renderUsers() {
  const container = document.getElementById("user-list");
  if (!container) {
    return;
  }
  if (state.users.length === 0) {
    container.innerHTML = "<p>No users yet.</p>";
    renderPaginationControls("user-pagination", null);
    return;
  }

  const paginated = paginateItems(state.users, state.userPage, state.userPageSize);
  state.userPage = paginated.currentPage;

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Role</th>
          <th>Status</th>
          <th>Last Login</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${paginated.items
          .map(
            (user) => `
            <tr>
              <td>${fullName(user)}</td>
              <td>${user.email}</td>
              <td><span class="badge">${user.role}</span></td>
              <td>${user.isActive ? "active" : "inactive"}</td>
              <td>${user.lastLoginAt ? user.lastLoginAt.slice(0, 10) : "never"}</td>
              <td>
                <select data-role-user-id="${user.id}">
                  ${["owner", "admin", "agent", "viewer"]
                    .map((role) => `<option value="${role}" ${role === user.role ? "selected" : ""}>${role}</option>`)
                    .join("")}
                </select>
                <label style="display:inline-flex;align-items:center;gap:0.3rem">
                  <input type="checkbox" data-active-user-id="${user.id}" ${user.isActive ? "checked" : ""} />
                  active
                </label>
                <button type="button" data-save-user-id="${user.id}">Save</button>
              </td>
            </tr>
          `
          )
          .join("")}
      </tbody>
    </table>
  `;

  renderPaginationControls("user-pagination", paginated, (nextPage) => {
    state.userPage = nextPage;
    renderUsers();
  });
}

async function loadUsers() {
  state.users = await request("/api/users");
  state.userPage = 1;
  renderUsers();
  populateUserSelect();
}

function attachHandlers() {
  const userForm = document.getElementById("user-form");
  const passwordForm = document.getElementById("password-form");
  const userList = document.getElementById("user-list");

  if (userForm) {
    userForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(userForm);
      const payload = Object.fromEntries(formData.entries());
      payload.isActive = formData.get("isActive") === "on";

      try {
        await request("/api/users", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showToast("User created.");
        userForm.reset();
        state.userPage = 1;
        await loadUsers();
      } catch (error) {
        showToast(error.message, true);
      }
    });
  }

  if (passwordForm) {
    passwordForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(passwordForm).entries());
      const userId = payload.userId;

      try {
        await request(`/api/users/${userId}/password`, {
          method: "PATCH",
          body: JSON.stringify({
            newPassword: payload.newPassword,
          }),
        });
        showToast("Password updated.");
        passwordForm.reset();
        await loadUsers();
      } catch (error) {
        showToast(error.message, true);
      }
    });
  }

  if (userList) {
    userList.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const userId = target.dataset.saveUserId;
      if (!userId) {
        return;
      }

      const roleSelect = userList.querySelector(`select[data-role-user-id="${userId}"]`);
      const activeCheckbox = userList.querySelector(`input[data-active-user-id="${userId}"]`);
      if (!(roleSelect instanceof HTMLSelectElement) || !(activeCheckbox instanceof HTMLInputElement)) {
        return;
      }

      try {
        await request(`/api/users/${userId}`, {
          method: "PATCH",
          body: JSON.stringify({
            role: roleSelect.value,
            isActive: activeCheckbox.checked,
          }),
        });
        showToast("User updated.");
        state.userPage = 1;
        await loadUsers();
      } catch (error) {
        showToast(error.message, true);
      }
    });
  }
}

async function bootstrap() {
  try {
    await sessionReady;
    attachHandlers();
    await loadUsers();
    markPageReady("users");
  } catch (error) {
    showToast(error.message, true);
  }
}

bootstrap();
