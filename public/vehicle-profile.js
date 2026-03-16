const {
  request,
  showToast,
  confirmAction,
  formatMoney,
  collectCheckedValues,
  sessionReady,
  markPageReady,
  paginateItems,
  renderPaginationControls,
} = window.AppCommon;

const EDITABLE_ROLES = new Set(["owner", "admin", "agent"]);
const WORK_ORDER_STATUSES = ["open", "in_progress", "on_hold", "completed", "cancelled"];

const state = {
  session: null,
  canEdit: false,
  vehicles: [],
  selectedVehicleId: null,
  profileVehicle: null,
  profileDocuments: [],
  profileWorkOrders: [],
  documentPage: 1,
  documentPageSize: 6,
  workOrderPage: 1,
  workOrderPageSize: 6,
};

function getQueryVehicleId() {
  const params = new URLSearchParams(window.location.search);
  return String(params.get("vehicleId") || "").trim();
}

function updateQueryVehicleId(vehicleId) {
  const url = new URL(window.location.href);
  if (vehicleId) {
    url.searchParams.set("vehicleId", vehicleId);
  } else {
    url.searchParams.delete("vehicleId");
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
}

function setPermissionUi() {
  const note = document.getElementById("profile-permission-note");
  if (!note) {
    return;
  }

  if (state.canEdit) {
    note.classList.add("hidden");
    note.innerHTML = "";
    return;
  }

  note.classList.remove("hidden");
  note.innerHTML =
    "<strong>Read-only mode:</strong> Your role can view vehicle details, documents, and work orders but cannot edit.";
}

function setFormEnabled(formId, isEnabled) {
  const form = document.getElementById(formId);
  if (!form) {
    return;
  }
  Array.from(form.elements).forEach((element) => {
    if (isEnabled) {
      element.removeAttribute("disabled");
    } else {
      element.setAttribute("disabled", "disabled");
    }
  });
}

function applyEditPermissions() {
  setPermissionUi();
  setFormEnabled("edit-vehicle-form", state.canEdit);
  setFormEnabled("profile-document-form", state.canEdit);
  setFormEnabled("profile-work-order-form", state.canEdit);
}

function populateVehicleSelect() {
  const select = document.getElementById("profile-vehicle-select");
  if (!select) {
    return;
  }

  select.innerHTML = state.vehicles
    .map((vehicle) => `<option value="${vehicle.id}">${vehicle.plateNumber} - ${vehicle.make} ${vehicle.model}</option>`)
    .join("");

  if (state.selectedVehicleId) {
    select.value = state.selectedVehicleId;
  }
}

function renderProfileSummary() {
  const container = document.getElementById("vehicle-profile-summary");
  if (!state.profileVehicle) {
    container.innerHTML = "<p>Select a vehicle to see profile details.</p>";
    return;
  }

  const vehicle = state.profileVehicle;
  const alerts = Array.isArray(vehicle.alerts) ? vehicle.alerts : [];
  const alertsContent =
    alerts.length > 0
      ? `<ul>${alerts.map((alert) => `<li><strong>${alert.type}:</strong> ${alert.message}</li>`).join("")}</ul>`
      : "<p>No alerts for this vehicle.</p>";

  container.innerHTML = `
    <div class="grid-2">
      <div>
        <strong>${vehicle.year} ${vehicle.make} ${vehicle.model}</strong><br />
        Plate: ${vehicle.plateNumber}<br />
        Status: <span class="badge">${vehicle.status}</span><br />
        Category: ${vehicle.category || "n/a"}
      </div>
      <div>
        Daily: ${formatMoney(vehicle.dailyRate || 0)}<br />
        Weekend: ${vehicle.weekendDailyRate ? formatMoney(vehicle.weekendDailyRate) : "n/a"}<br />
        Location: ${vehicle.location || "n/a"}<br />
        Branch: ${vehicle.branchCode || "n/a"}
      </div>
    </div>
    <hr />
    <strong>Alerts</strong>
    ${alertsContent}
  `;
}

function populateEditForm() {
  const vehicle = state.profileVehicle;
  if (!vehicle) {
    return;
  }

  const form = document.getElementById("edit-vehicle-form");
  const fields = [
    "dailyRate",
    "weekendDailyRate",
    "weeklyRate",
    "monthlyRate",
    "status",
    "branchCode",
    "location",
    "odometerKm",
    "registrationExpiryDate",
    "insuranceExpiryDate",
    "inspectionDueDate",
    "nextServiceDate",
    "nextServiceAtKm",
    "securityDeposit",
    "notes",
  ];

  fields.forEach((field) => {
    if (!form.elements[field]) {
      return;
    }
    form.elements[field].value = vehicle[field] == null ? "" : vehicle[field];
  });

  const featureSet = new Set(Array.isArray(vehicle.features) ? vehicle.features : []);
  Array.from(form.querySelectorAll('input[name="editFeatures"]')).forEach((checkbox) => {
    checkbox.checked = featureSet.has(checkbox.value);
  });
}

function renderDocumentList() {
  const container = document.getElementById("profile-document-list");
  if (!state.selectedVehicleId) {
    container.innerHTML = "<p>Select a vehicle first.</p>";
    renderPaginationControls("profile-document-pagination", null);
    return;
  }
  if (state.profileDocuments.length === 0) {
    container.innerHTML = "<p>No documents uploaded for this vehicle.</p>";
    renderPaginationControls("profile-document-pagination", null);
    return;
  }

  const paginated = paginateItems(state.profileDocuments, state.documentPage, state.documentPageSize);
  state.documentPage = paginated.currentPage;

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Type</th>
          <th>File</th>
          <th>Uploaded</th>
          <th>Expiry</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${paginated.items
          .map((document) => {
            const uploadedAt = document.uploadedAt ? String(document.uploadedAt).slice(0, 10) : "n/a";
            return `
              <tr>
                <td>${document.documentType}</td>
                <td><a href="${document.relativePath}" target="_blank" rel="noreferrer">${document.originalName}</a></td>
                <td>${uploadedAt}</td>
                <td>${document.expiryDate || "n/a"}</td>
                <td>${
                  state.canEdit
                    ? `<button type="button" data-document-delete-id="${document.id}">Delete</button>`
                    : "<small>read-only</small>"
                }</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;

  renderPaginationControls("profile-document-pagination", paginated, (nextPage) => {
    state.documentPage = nextPage;
    renderDocumentList();
  });
}

function renderWorkOrderList() {
  const container = document.getElementById("profile-work-order-list");
  if (!state.selectedVehicleId) {
    container.innerHTML = "<p>Select a vehicle first.</p>";
    renderPaginationControls("profile-work-order-pagination", null);
    return;
  }
  if (state.profileWorkOrders.length === 0) {
    container.innerHTML = "<p>No work orders for this vehicle yet.</p>";
    renderPaginationControls("profile-work-order-pagination", null);
    return;
  }

  const paginated = paginateItems(state.profileWorkOrders, state.workOrderPage, state.workOrderPageSize);
  state.workOrderPage = paginated.currentPage;

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Title</th>
          <th>Priority</th>
          <th>Status</th>
          <th>Scheduled</th>
          <th>Cost</th>
          <th>Update</th>
        </tr>
      </thead>
      <tbody>
        ${paginated.items
          .map(
            (workOrder) => `
              <tr>
                <td>${workOrder.title}</td>
                <td><span class="badge">${workOrder.priority}</span></td>
                <td><span class="badge">${workOrder.status}</span></td>
                <td>${workOrder.scheduledDate || "n/a"}</td>
                <td>${workOrder.actualCost ? formatMoney(workOrder.actualCost) : workOrder.costEstimate ? `Est: ${formatMoney(workOrder.costEstimate)}` : "n/a"}</td>
                <td>
                  ${
                    state.canEdit
                      ? `
                    <select data-work-order-status-id="${workOrder.id}">
                      ${WORK_ORDER_STATUSES.map(
                        (status) =>
                          `<option value="${status}" ${status === workOrder.status ? "selected" : ""}>${status}</option>`
                      ).join("")}
                    </select>
                    <button type="button" data-work-order-save-id="${workOrder.id}" class="save-work-order-status">Save</button>
                  `
                      : "<small>read-only</small>"
                  }
                </td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;

  renderPaginationControls("profile-work-order-pagination", paginated, (nextPage) => {
    state.workOrderPage = nextPage;
    renderWorkOrderList();
  });
}

async function loadProfile(vehicleId) {
  if (!vehicleId) {
    state.profileVehicle = null;
    state.profileDocuments = [];
    state.profileWorkOrders = [];
    renderProfileSummary();
    renderDocumentList();
    renderWorkOrderList();
    return;
  }

  const profile = await request(`/api/vehicles/${vehicleId}`);
  state.selectedVehicleId = vehicleId;
  state.profileVehicle = profile;
  state.profileDocuments = Array.isArray(profile.documents) ? profile.documents : [];
  state.profileWorkOrders = Array.isArray(profile.workOrders) ? profile.workOrders : [];
  state.documentPage = 1;
  state.workOrderPage = 1;

  renderProfileSummary();
  populateEditForm();
  renderDocumentList();
  renderWorkOrderList();
}

async function loadVehicles() {
  state.vehicles = await request("/api/vehicles");
  populateVehicleSelect();
}

async function selectVehicle(vehicleId) {
  if (!vehicleId) {
    return;
  }
  const exists = state.vehicles.some((vehicle) => vehicle.id === vehicleId);
  if (!exists) {
    return;
  }
  state.selectedVehicleId = vehicleId;
  const select = document.getElementById("profile-vehicle-select");
  if (select) {
    select.value = vehicleId;
  }
  updateQueryVehicleId(vehicleId);
  await loadProfile(vehicleId);
}

function attachHandlers() {
  const vehicleSelect = document.getElementById("profile-vehicle-select");
  const editForm = document.getElementById("edit-vehicle-form");
  const documentForm = document.getElementById("profile-document-form");
  const documentList = document.getElementById("profile-document-list");
  const workOrderForm = document.getElementById("profile-work-order-form");
  const workOrderList = document.getElementById("profile-work-order-list");

  vehicleSelect.addEventListener("change", async () => {
    await selectVehicle(vehicleSelect.value);
  });

  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.canEdit || !state.selectedVehicleId) {
      showToast("You do not have permission to edit vehicles.", true);
      return;
    }

    const payload = Object.fromEntries(new FormData(editForm).entries());
    payload.features = collectCheckedValues(editForm, "editFeatures");
    if (!confirmAction("Save vehicle changes?")) {
      return;
    }

    try {
      await request(`/api/vehicles/${state.selectedVehicleId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      showToast("Vehicle updated.");
      await loadVehicles();
      await loadProfile(state.selectedVehicleId);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  documentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.canEdit || !state.selectedVehicleId) {
      showToast("You do not have permission to manage documents.", true);
      return;
    }

    const formData = new FormData(documentForm);
    if (!confirmAction("Upload this vehicle document?")) {
      return;
    }
    try {
      await request(`/api/vehicles/${state.selectedVehicleId}/documents`, {
        method: "POST",
        body: formData,
      });
      showToast("Document uploaded.");
      documentForm.reset();
      await loadProfile(state.selectedVehicleId);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  documentList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const documentId = target.dataset.documentDeleteId;
    if (!documentId || !state.selectedVehicleId || !state.canEdit) {
      return;
    }
    if (!confirmAction("Delete this vehicle document?")) {
      return;
    }

    try {
      await request(`/api/vehicles/${state.selectedVehicleId}/documents/${documentId}`, {
        method: "DELETE",
      });
      showToast("Document deleted.");
      await loadProfile(state.selectedVehicleId);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  workOrderForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.canEdit || !state.selectedVehicleId) {
      showToast("You do not have permission to manage work orders.", true);
      return;
    }

    const payload = Object.fromEntries(new FormData(workOrderForm).entries());
    if (!confirmAction("Create this work order?")) {
      return;
    }
    try {
      await request(`/api/vehicles/${state.selectedVehicleId}/work-orders`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showToast("Work order created.");
      workOrderForm.reset();
      await loadProfile(state.selectedVehicleId);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  workOrderList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const workOrderId = target.dataset.workOrderSaveId;
    if (!workOrderId || !state.selectedVehicleId || !state.canEdit) {
      return;
    }

    const select = workOrderList.querySelector(`select[data-work-order-status-id="${workOrderId}"]`);
    if (!(select instanceof HTMLSelectElement)) {
      return;
    }
    if (!confirmAction("Save this work order status change?")) {
      return;
    }

    try {
      await request(`/api/work-orders/${workOrderId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: select.value }),
      });
      showToast("Work order updated.");
      await loadProfile(state.selectedVehicleId);
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

async function bootstrap() {
  try {
    state.session = await sessionReady;
    state.canEdit = EDITABLE_ROLES.has(state.session && state.session.user ? state.session.user.role : "");
    applyEditPermissions();
    attachHandlers();

    await loadVehicles();
    if (state.vehicles.length === 0) {
      showToast("No vehicles found. Add one from Fleet page.", true);
      await loadProfile(null);
      markPageReady("vehicle-profile");
      return;
    }

    const queryVehicleId = getQueryVehicleId();
    const initialVehicleId = state.vehicles.some((vehicle) => vehicle.id === queryVehicleId)
      ? queryVehicleId
      : state.vehicles[0].id;
    await selectVehicle(initialVehicleId);
    markPageReady("vehicle-profile");
  } catch (error) {
    showToast(error.message, true);
  }
}

bootstrap();
