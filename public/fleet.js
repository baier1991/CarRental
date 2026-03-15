const {
  request,
  showToast,
  collectCheckedValues,
  formatMoney,
  vehicleLabel,
  sessionReady,
  markPageReady,
  paginateItems,
  renderPaginationControls,
} =
  window.AppCommon;

const WORK_ORDER_STATUS_OPTIONS = ["open", "in_progress", "on_hold", "completed", "cancelled"];

const state = {
  vehicles: [],
  vehiclePage: 1,
  vehiclePageSize: 8,
  profileVehicleId: null,
  profileVehicle: null,
  profileDocuments: [],
  profileWorkOrders: [],
  profileDocumentPage: 1,
  profileDocumentPageSize: 6,
  profileWorkOrderPage: 1,
  profileWorkOrderPageSize: 6,
};

function renderVehicleList() {
  const container = document.getElementById("vehicle-list");
  if (state.vehicles.length === 0) {
    container.innerHTML = "<p>No vehicles yet.</p>";
    renderPaginationControls("vehicle-pagination", null);
    return;
  }

  const paginated = paginateItems(state.vehicles, state.vehiclePage, state.vehiclePageSize);
  state.vehiclePage = paginated.currentPage;

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Plate</th>
          <th>Vehicle</th>
          <th>Category</th>
          <th>Rates</th>
          <th>Status</th>
          <th>Branch / Location</th>
          <th>Compliance</th>
          <th>Profile</th>
        </tr>
      </thead>
      <tbody>
        ${paginated.items
          .map(
            (vehicle) => `
            <tr>
              <td>${vehicle.plateNumber}</td>
              <td>${vehicle.year} ${vehicle.make} ${vehicle.model}</td>
              <td>${vehicle.category || "n/a"}</td>
              <td>
                Day: ${formatMoney(vehicle.dailyRate)}<br />
                <small>Weekend: ${vehicle.weekendDailyRate ? formatMoney(vehicle.weekendDailyRate) : "n/a"}</small>
              </td>
              <td><span class="badge">${vehicle.status}</span></td>
              <td>${vehicle.branchCode || "n/a"}<br /><small>${vehicle.location || "n/a"}</small></td>
              <td>
                ${vehicle.registrationExpiryDate ? `Reg: ${vehicle.registrationExpiryDate}<br />` : ""}
                ${vehicle.insuranceExpiryDate ? `Ins: ${vehicle.insuranceExpiryDate}<br />` : ""}
                ${vehicle.nextServiceDate ? `Service: ${vehicle.nextServiceDate}` : ""}
              </td>
              <td><button type="button" data-profile-vehicle-id="${vehicle.id}">Open</button></td>
            </tr>
          `
          )
          .join("")}
      </tbody>
    </table>
  `;

  renderPaginationControls("vehicle-pagination", paginated, (nextPage) => {
    state.vehiclePage = nextPage;
    renderVehicleList();
  });
}

function getVehicleById(vehicleId) {
  return state.vehicles.find((item) => item.id === vehicleId);
}

function populateEditAndProfileSelects(preferredVehicleId = null) {
  const editSelect = document.getElementById("edit-vehicle-select");
  const profileSelect = document.getElementById("profile-vehicle-select");
  const previousEdit = editSelect.value;
  const previousProfile = profileSelect.value;
  const options = state.vehicles
    .map((vehicle) => `<option value="${vehicle.id}">${vehicleLabel(vehicle)}</option>`)
    .join("");

  editSelect.innerHTML = options;
  profileSelect.innerHTML = options;

  const desiredId =
    preferredVehicleId ||
    state.profileVehicleId ||
    previousProfile ||
    previousEdit ||
    (state.vehicles[0] ? state.vehicles[0].id : null);

  if (desiredId && getVehicleById(desiredId)) {
    editSelect.value = desiredId;
    profileSelect.value = desiredId;
    state.profileVehicleId = desiredId;
    return desiredId;
  }

  if (state.vehicles[0]) {
    editSelect.value = state.vehicles[0].id;
    profileSelect.value = state.vehicles[0].id;
    state.profileVehicleId = state.vehicles[0].id;
    return state.vehicles[0].id;
  }
  state.profileVehicleId = null;
  return null;
}

function populateEditForm(vehicleId) {
  const vehicle = getVehicleById(vehicleId);
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

function renderProfileSummary() {
  const container = document.getElementById("vehicle-profile-summary");
  const vehicle = state.profileVehicle || getVehicleById(state.profileVehicleId);
  if (!vehicle) {
    container.innerHTML = "<p>Select a vehicle profile to see details and maintenance history.</p>";
    return;
  }

  const alerts = Array.isArray(vehicle.alerts) ? vehicle.alerts : [];
  const alertsHtml =
    alerts.length > 0
      ? `<ul>${alerts.map((alert) => `<li><strong>${alert.type}:</strong> ${alert.message}</li>`).join("")}</ul>`
      : "<p>No active alerts for this vehicle.</p>";

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
        Odometer: ${vehicle.odometerKm || "n/a"} km<br />
        Next Service: ${vehicle.nextServiceDate || "n/a"}
      </div>
    </div>
    <hr />
    <strong>Alerts</strong>
    ${alertsHtml}
  `;
}

function renderProfileDocuments() {
  const container = document.getElementById("profile-document-list");
  if (!state.profileVehicleId) {
    container.innerHTML = "<p>Select a vehicle profile first.</p>";
    renderPaginationControls("profile-document-pagination", null);
    return;
  }
  if (state.profileDocuments.length === 0) {
    container.innerHTML = "<p>No documents uploaded for this vehicle.</p>";
    renderPaginationControls("profile-document-pagination", null);
    return;
  }

  const paginated = paginateItems(
    state.profileDocuments,
    state.profileDocumentPage,
    state.profileDocumentPageSize
  );
  state.profileDocumentPage = paginated.currentPage;

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
            const uploadedAt = document && document.uploadedAt ? String(document.uploadedAt).slice(0, 10) : "n/a";
            return `
              <tr>
                <td>${document.documentType}</td>
                <td><a href="${document.relativePath}" target="_blank" rel="noreferrer">${document.originalName}</a></td>
                <td>${uploadedAt}</td>
                <td>${document.expiryDate || "n/a"}</td>
                <td><button type="button" data-delete-profile-document-id="${document.id}">Delete</button></td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;

  renderPaginationControls("profile-document-pagination", paginated, (nextPage) => {
    state.profileDocumentPage = nextPage;
    renderProfileDocuments();
  });
}

function renderProfileWorkOrders() {
  const container = document.getElementById("profile-work-order-list");
  if (!state.profileVehicleId) {
    container.innerHTML = "<p>Select a vehicle profile first.</p>";
    renderPaginationControls("profile-work-order-pagination", null);
    return;
  }
  if (state.profileWorkOrders.length === 0) {
    container.innerHTML = "<p>No work orders for this vehicle yet.</p>";
    renderPaginationControls("profile-work-order-pagination", null);
    return;
  }

  const paginated = paginateItems(
    state.profileWorkOrders,
    state.profileWorkOrderPage,
    state.profileWorkOrderPageSize
  );
  state.profileWorkOrderPage = paginated.currentPage;

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
                  <select data-profile-work-order-status-id="${workOrder.id}">
                    ${WORK_ORDER_STATUS_OPTIONS.map(
                      (status) =>
                        `<option value="${status}" ${status === workOrder.status ? "selected" : ""}>${status}</option>`
                    ).join("")}
                  </select>
                  <button type="button" data-profile-work-order-id="${workOrder.id}" class="save-profile-work-order-status">Save</button>
                </td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;

  renderPaginationControls("profile-work-order-pagination", paginated, (nextPage) => {
    state.profileWorkOrderPage = nextPage;
    renderProfileWorkOrders();
  });
}

async function loadVehicleProfile(vehicleId) {
  if (!vehicleId) {
    state.profileVehicle = null;
    state.profileDocuments = [];
    state.profileWorkOrders = [];
    renderProfileSummary();
    renderProfileDocuments();
    renderProfileWorkOrders();
    return;
  }

  const profile = await request(`/api/vehicles/${vehicleId}`);
  state.profileVehicle = profile;
  state.profileVehicleId = vehicleId;
  state.profileDocuments = Array.isArray(profile.documents) ? profile.documents : [];
  state.profileWorkOrders = Array.isArray(profile.workOrders) ? profile.workOrders : [];
  state.profileDocumentPage = 1;
  state.profileWorkOrderPage = 1;
  renderProfileSummary();
  renderProfileDocuments();
  renderProfileWorkOrders();
}

async function activateVehicleProfile(vehicleId, { scrollToSummary = false } = {}) {
  if (!vehicleId || !getVehicleById(vehicleId)) {
    return;
  }

  state.profileVehicleId = vehicleId;
  const editSelect = document.getElementById("edit-vehicle-select");
  const profileSelect = document.getElementById("profile-vehicle-select");
  if (editSelect) {
    editSelect.value = vehicleId;
  }
  if (profileSelect) {
    profileSelect.value = vehicleId;
  }
  populateEditForm(vehicleId);
  await loadVehicleProfile(vehicleId);

  if (scrollToSummary) {
    const summary = document.getElementById("vehicle-profile-summary");
    if (summary && typeof summary.scrollIntoView === "function") {
      summary.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}

async function loadFleetData() {
  const editSelect = document.getElementById("edit-vehicle-select");
  const profileSelect = document.getElementById("profile-vehicle-select");
  const preferredId = profileSelect.value || editSelect.value || state.profileVehicleId;

  state.vehicles = await request("/api/vehicles");
  renderVehicleList();
  const activeVehicleId = populateEditAndProfileSelects(preferredId);
  if (activeVehicleId) {
    populateEditForm(activeVehicleId);
    await loadVehicleProfile(activeVehicleId);
  } else {
    await loadVehicleProfile(null);
  }
}

function attachHandlers() {
  const addForm = document.getElementById("vehicle-form");
  const editForm = document.getElementById("edit-vehicle-form");
  const editSelect = document.getElementById("edit-vehicle-select");
  const profileSelect = document.getElementById("profile-vehicle-select");
  const csvForm = document.getElementById("vehicle-csv-form");
  const csvFile = document.getElementById("vehicle-csv-file");
  const csvContent = document.getElementById("vehicle-csv-content");
  const csvResult = document.getElementById("csv-import-result");
  const vehicleList = document.getElementById("vehicle-list");
  const profileDocumentForm = document.getElementById("profile-document-form");
  const profileDocumentList = document.getElementById("profile-document-list");
  const profileWorkOrderForm = document.getElementById("profile-work-order-form");
  const profileWorkOrderList = document.getElementById("profile-work-order-list");

  addForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(addForm).entries());
    payload.features = collectCheckedValues(addForm, "features");

    try {
      await request("/api/vehicles", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showToast("Vehicle added.");
      addForm.reset();
      state.vehiclePage = 1;
      await loadFleetData();
    } catch (error) {
      showToast(error.message, true);
    }
  });

  editSelect.addEventListener("change", async () => {
    await activateVehicleProfile(editSelect.value);
  });

  profileSelect.addEventListener("change", async () => {
    await activateVehicleProfile(profileSelect.value);
  });

  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const vehicleId = editSelect.value;
    if (!vehicleId) {
      showToast("Select a vehicle to edit.", true);
      return;
    }

    const payload = Object.fromEntries(new FormData(editForm).entries());
    delete payload.vehicleId;
    payload.features = collectCheckedValues(editForm, "editFeatures");

    try {
      await request(`/api/vehicles/${vehicleId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      showToast("Vehicle updated.");
      state.profileVehicleId = vehicleId;
      await loadFleetData();
    } catch (error) {
      showToast(error.message, true);
    }
  });

  csvFile.addEventListener("change", async (event) => {
    const hasFiles = event && event.target && event.target.files && event.target.files.length > 0;
    const file = hasFiles ? event.target.files[0] : null;
    if (!file) {
      return;
    }
    csvContent.value = await file.text();
  });

  csvForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(csvForm);
    const payload = Object.fromEntries(formData.entries());
    payload.skipDuplicates = formData.get("skipDuplicates") === "on";

    try {
      const result = await request("/api/vehicles/import-csv", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      csvResult.innerHTML = `
        <strong>Import completed.</strong><br />
        Imported: ${result.importedCount}<br />
        Skipped: ${result.skippedCount}<br />
        ${
          result.errors.length
            ? result.errors
                .slice(0, 6)
                .map((item) => `Row ${item && item.row != null ? item.row : "-"}: ${item.error}`)
                .join("<br />")
            : "No row errors."
        }
      `;
      showToast("CSV import finished.");
      state.vehiclePage = 1;
      await loadFleetData();
    } catch (error) {
      showToast(error.message, true);
      csvResult.innerHTML = "<em>CSV import failed.</em>";
    }
  });

  vehicleList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const vehicleId = target.dataset.profileVehicleId;
    if (!vehicleId) {
      return;
    }
    await activateVehicleProfile(vehicleId, { scrollToSummary: true });
  });

  profileDocumentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.profileVehicleId) {
      showToast("Select a vehicle profile first.", true);
      return;
    }

    const formData = new FormData(profileDocumentForm);
    try {
      await request(`/api/vehicles/${state.profileVehicleId}/documents`, {
        method: "POST",
        body: formData,
      });
      showToast("Document uploaded to vehicle profile.");
      profileDocumentForm.reset();
      await loadVehicleProfile(state.profileVehicleId);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  profileDocumentList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const documentId = target.dataset.deleteProfileDocumentId;
    if (!documentId || !state.profileVehicleId) {
      return;
    }

    try {
      await request(`/api/vehicles/${state.profileVehicleId}/documents/${documentId}`, {
        method: "DELETE",
      });
      showToast("Profile document deleted.");
      await loadVehicleProfile(state.profileVehicleId);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  profileWorkOrderForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.profileVehicleId) {
      showToast("Select a vehicle profile first.", true);
      return;
    }

    const payload = Object.fromEntries(new FormData(profileWorkOrderForm).entries());
    try {
      await request(`/api/vehicles/${state.profileVehicleId}/work-orders`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showToast("Work order created for vehicle profile.");
      profileWorkOrderForm.reset();
      await loadVehicleProfile(state.profileVehicleId);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  profileWorkOrderList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (!target.classList.contains("save-profile-work-order-status")) {
      return;
    }
    const workOrderId = target.dataset.profileWorkOrderId;
    if (!workOrderId || !state.profileVehicleId) {
      return;
    }

    const select = profileWorkOrderList.querySelector(
      `select[data-profile-work-order-status-id="${workOrderId}"]`
    );
    if (!(select instanceof HTMLSelectElement)) {
      return;
    }

    try {
      await request(`/api/work-orders/${workOrderId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: select.value }),
      });
      showToast("Work order status updated.");
      await loadVehicleProfile(state.profileVehicleId);
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

async function bootstrap() {
  try {
    await sessionReady;
    attachHandlers();
    await loadFleetData();
    markPageReady("fleet");
  } catch (error) {
    showToast(error.message, true);
  }
}

bootstrap();
