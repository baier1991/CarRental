const { request, showToast, vehicleLabel, formatMoney, sessionReady } = window.AppCommon;

const state = {
  vehicles: [],
  workOrders: [],
  documents: [],
  selectedVehicleId: null,
};

function populateVehicleSelects() {
  const selects = [
    document.getElementById("document-vehicle-select"),
    document.getElementById("document-list-vehicle-select"),
    document.getElementById("work-order-vehicle"),
  ];

  selects.forEach((select) => {
    const previous = select.value;
    select.innerHTML = state.vehicles
      .map((vehicle) => `<option value="${vehicle.id}">${vehicleLabel(vehicle)}</option>`)
      .join("");
    if (previous) {
      select.value = previous;
    }
  });

  if (!state.selectedVehicleId && state.vehicles[0]) {
    state.selectedVehicleId = state.vehicles[0].id;
  }
  if (state.selectedVehicleId) {
    document.getElementById("document-list-vehicle-select").value = state.selectedVehicleId;
  }
}

function renderDocuments() {
  const container = document.getElementById("vehicle-document-list");
  if (state.documents.length === 0) {
    container.innerHTML = "<p>No documents uploaded for this vehicle.</p>";
    return;
  }

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
        ${state.documents
          .map(
            (document) => `
            <tr>
              <td>${document.documentType}</td>
              <td><a href="${document.relativePath}" target="_blank" rel="noreferrer">${document.originalName}</a></td>
              <td>${document.uploadedAt?.slice(0, 10) || "n/a"}</td>
              <td>${document.expiryDate || "n/a"}</td>
              <td><button type="button" data-delete-document-id="${document.id}">Delete</button></td>
            </tr>
          `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderWorkOrders() {
  const container = document.getElementById("work-order-list");
  if (state.workOrders.length === 0) {
    container.innerHTML = "<p>No work orders yet.</p>";
    return;
  }

  const statusOptions = ["open", "in_progress", "on_hold", "completed", "cancelled"];
  const vehicleMap = new Map(state.vehicles.map((vehicle) => [vehicle.id, `${vehicle.plateNumber}`]));
  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Vehicle</th>
          <th>Title</th>
          <th>Priority</th>
          <th>Status</th>
          <th>Scheduled</th>
          <th>Cost</th>
          <th>Update</th>
        </tr>
      </thead>
      <tbody>
        ${state.workOrders
          .map(
            (workOrder) => `
            <tr>
              <td>${vehicleMap.get(workOrder.vehicleId) || workOrder.vehicleId}</td>
              <td>${workOrder.title}</td>
              <td><span class="badge">${workOrder.priority}</span></td>
              <td><span class="badge">${workOrder.status}</span></td>
              <td>${workOrder.scheduledDate || "n/a"}</td>
              <td>${workOrder.actualCost ? formatMoney(workOrder.actualCost) : workOrder.costEstimate ? `Est: ${formatMoney(workOrder.costEstimate)}` : "n/a"}</td>
              <td>
                <select data-work-order-status-id="${workOrder.id}">
                  ${statusOptions
                    .map((status) => `<option value="${status}" ${status === workOrder.status ? "selected" : ""}>${status}</option>`)
                    .join("")}
                </select>
                <button type="button" data-work-order-id="${workOrder.id}" class="save-work-order-status">Save</button>
              </td>
            </tr>
          `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

async function loadDocuments(vehicleId) {
  state.selectedVehicleId = vehicleId;
  if (!vehicleId) {
    state.documents = [];
    renderDocuments();
    return;
  }
  state.documents = await request(`/api/vehicles/${vehicleId}/documents`);
  renderDocuments();
}

async function loadMaintenanceData() {
  const [vehicles, workOrders] = await Promise.all([request("/api/vehicles"), request("/api/work-orders")]);
  state.vehicles = vehicles;
  state.workOrders = workOrders;
  populateVehicleSelects();
  renderWorkOrders();
  await loadDocuments(state.selectedVehicleId || state.vehicles[0]?.id || null);
}

function attachHandlers() {
  const documentForm = document.getElementById("vehicle-document-form");
  const documentVehicleListSelect = document.getElementById("document-list-vehicle-select");
  const workOrderForm = document.getElementById("work-order-form");
  const documentList = document.getElementById("vehicle-document-list");
  const workOrderList = document.getElementById("work-order-list");

  documentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(documentForm);
    const vehicleId = formData.get("vehicleId");
    try {
      await request(`/api/vehicles/${vehicleId}/documents`, {
        method: "POST",
        body: formData,
      });
      showToast("Document uploaded.");
      documentForm.reset();
      await loadMaintenanceData();
    } catch (error) {
      showToast(error.message, true);
    }
  });

  documentVehicleListSelect.addEventListener("change", async () => {
    try {
      await loadDocuments(documentVehicleListSelect.value);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  documentList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const documentId = target.dataset.deleteDocumentId;
    if (!documentId || !state.selectedVehicleId) {
      return;
    }

    try {
      await request(`/api/vehicles/${state.selectedVehicleId}/documents/${documentId}`, {
        method: "DELETE",
      });
      showToast("Document deleted.");
      await loadDocuments(state.selectedVehicleId);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  workOrderForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(workOrderForm).entries());
    const vehicleId = payload.vehicleId;
    delete payload.vehicleId;
    try {
      await request(`/api/vehicles/${vehicleId}/work-orders`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showToast("Work order created.");
      workOrderForm.reset();
      await loadMaintenanceData();
    } catch (error) {
      showToast(error.message, true);
    }
  });

  workOrderList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (!target.classList.contains("save-work-order-status")) {
      return;
    }
    const workOrderId = target.dataset.workOrderId;
    if (!workOrderId) {
      return;
    }
    const select = workOrderList.querySelector(`select[data-work-order-status-id="${workOrderId}"]`);
    if (!(select instanceof HTMLSelectElement)) {
      return;
    }

    try {
      await request(`/api/work-orders/${workOrderId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: select.value }),
      });
      showToast("Work order updated.");
      await loadMaintenanceData();
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

async function bootstrap() {
  try {
    await sessionReady;
    attachHandlers();
    await loadMaintenanceData();
  } catch (error) {
    showToast(error.message, true);
  }
}

bootstrap();
