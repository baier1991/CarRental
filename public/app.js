const state = {
  config: null,
  vehicles: [],
  customers: [],
  reservations: [],
  workOrders: [],
  vehicleDocuments: [],
  dashboard: null,
  selectedDocumentVehicleId: null,
};

const ui = {
  dashboardMetrics: document.getElementById("dashboard-metrics"),
  vehicleList: document.getElementById("vehicle-list"),
  customerList: document.getElementById("customer-list"),
  reservationList: document.getElementById("reservation-list"),
  workOrderList: document.getElementById("work-order-list"),
  vehicleDocumentList: document.getElementById("vehicle-document-list"),
  csvImportResult: document.getElementById("csv-import-result"),
  toast: document.getElementById("toast"),
  quoteResult: document.getElementById("quote-result"),
  reservationCustomerSelect: document.getElementById("reservation-customer"),
  reservationVehicleSelect: document.getElementById("reservation-vehicle"),
  quoteVehicleSelect: document.getElementById("quote-vehicle"),
  editVehicleSelect: document.getElementById("edit-vehicle-select"),
  editVehicleForm: document.getElementById("edit-vehicle-form"),
  documentVehicleSelect: document.getElementById("document-vehicle-select"),
  documentListVehicleSelect: document.getElementById("document-list-vehicle-select"),
  workOrderVehicleSelect: document.getElementById("work-order-vehicle"),
};

function showToast(message, isError = false) {
  ui.toast.textContent = message;
  ui.toast.classList.remove("hidden", "error");
  if (isError) {
    ui.toast.classList.add("error");
  }

  setTimeout(() => {
    ui.toast.classList.add("hidden");
    ui.toast.classList.remove("error");
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
    const errorMessage =
      typeof data === "string" ? data || `Request failed: ${response.status}` : data?.error || `Request failed: ${response.status}`;
    throw new Error(errorMessage);
  }

  return data;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

function collectCheckedValues(form, key) {
  return Array.from(form.querySelectorAll(`input[name="${key}"]:checked`)).map((item) => item.value);
}

function populateFormFromVehicle(vehicle) {
  if (!vehicle) {
    return;
  }

  const form = ui.editVehicleForm;
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

  fields.forEach((key) => {
    const input = form.elements[key];
    if (!input) {
      return;
    }
    input.value = vehicle[key] ?? "";
  });

  const featureSet = new Set(Array.isArray(vehicle.features) ? vehicle.features : []);
  Array.from(form.querySelectorAll('input[name="editFeatures"]')).forEach((checkbox) => {
    checkbox.checked = featureSet.has(checkbox.value);
  });
}

function renderDashboard() {
  if (!state.dashboard) {
    ui.dashboardMetrics.innerHTML = "";
    return;
  }

  const metricCards = [
    { label: "Fleet Size", value: state.dashboard.fleetSize },
    { label: "Available Vehicles", value: state.dashboard.availableVehicles },
    { label: "Active Reservations", value: state.dashboard.activeReservations },
    { label: "Active Customers", value: state.dashboard.activeCustomers },
    { label: "Utilization", value: `${state.dashboard.utilizationRate}%` },
    { label: "Expected Revenue", value: formatMoney(state.dashboard.expectedRevenue) },
    { label: "Open Work Orders", value: state.dashboard.openWorkOrders || 0 },
    { label: "Overdue Work Orders", value: state.dashboard.overdueWorkOrders || 0 },
    { label: "Maintenance Spend", value: formatMoney(state.dashboard.maintenanceSpend || 0) },
    { label: "Vehicles Needing Attention", value: state.dashboard.vehiclesNeedingAttention || 0 },
    { label: "Critical Fleet Alerts", value: state.dashboard.criticalVehicleAlerts || 0 },
  ];

  ui.dashboardMetrics.innerHTML = metricCards
    .map(
      (metric) => `
      <div class="metric">
        <div class="label">${metric.label}</div>
        <div class="value">${metric.value}</div>
      </div>
    `
    )
    .join("");
}

function renderVehicles() {
  if (state.vehicles.length === 0) {
    ui.vehicleList.innerHTML = "<p>No vehicles yet.</p>";
    return;
  }

  ui.vehicleList.innerHTML = `
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
        </tr>
      </thead>
      <tbody>
        ${state.vehicles
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
            </tr>
          `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderCustomers() {
  if (state.customers.length === 0) {
    ui.customerList.innerHTML = "<p>No customers yet.</p>";
    return;
  }

  ui.customerList.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Phone</th>
          <th>License</th>
        </tr>
      </thead>
      <tbody>
        ${state.customers
          .map(
            (customer) => `
            <tr>
              <td>${customer.firstName} ${customer.lastName}</td>
              <td>${customer.email}</td>
              <td>${customer.phone}</td>
              <td>${customer.licenseNumber}</td>
            </tr>
          `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderReservations() {
  if (state.reservations.length === 0) {
    ui.reservationList.innerHTML = "<p>No reservations yet.</p>";
    return;
  }

  const customerNameById = new Map(
    state.customers.map((customer) => [customer.id, `${customer.firstName} ${customer.lastName}`])
  );
  const vehicleNameById = new Map(
    state.vehicles.map((vehicle) => [vehicle.id, `${vehicle.plateNumber} (${vehicle.make} ${vehicle.model})`])
  );

  ui.reservationList.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Customer</th>
          <th>Vehicle</th>
          <th>Dates</th>
          <th>Status</th>
          <th>Price</th>
          <th>Add-ons</th>
        </tr>
      </thead>
      <tbody>
        ${state.reservations
          .map(
            (reservation) => `
            <tr>
              <td>${customerNameById.get(reservation.customerId) || reservation.customerId}</td>
              <td>${vehicleNameById.get(reservation.vehicleId) || reservation.vehicleId}</td>
              <td>${reservation.startDate} → ${reservation.endDate}</td>
              <td><span class="badge">${reservation.status}</span></td>
              <td>${formatMoney(reservation?.pricing?.total || 0)}</td>
              <td>${reservation.addOns.length ? reservation.addOns.join(", ") : "none"}</td>
            </tr>
          `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderWorkOrders() {
  if (state.workOrders.length === 0) {
    ui.workOrderList.innerHTML = "<p>No work orders yet.</p>";
    return;
  }

  const vehicleNameById = new Map(
    state.vehicles.map((vehicle) => [vehicle.id, `${vehicle.plateNumber} (${vehicle.make} ${vehicle.model})`])
  );
  const statusOptions = ["open", "in_progress", "on_hold", "completed", "cancelled"];

  ui.workOrderList.innerHTML = `
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
              <td>${vehicleNameById.get(workOrder.vehicleId) || workOrder.vehicleId}</td>
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
                <button type="button" class="work-order-status-btn" data-work-order-id="${workOrder.id}">
                  Save
                </button>
              </td>
            </tr>
          `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderVehicleDocuments() {
  if (state.vehicleDocuments.length === 0) {
    ui.vehicleDocumentList.innerHTML = "<p>No documents uploaded for this vehicle.</p>";
    return;
  }

  ui.vehicleDocumentList.innerHTML = `
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
        ${state.vehicleDocuments
          .map(
            (document) => `
            <tr>
              <td>${document.documentType}</td>
              <td><a href="${document.relativePath}" target="_blank" rel="noreferrer">${document.originalName}</a></td>
              <td>${document.uploadedAt?.slice(0, 10) || "n/a"}</td>
              <td>${document.expiryDate || "n/a"}</td>
              <td>
                <button type="button" data-document-delete-id="${document.id}">Delete</button>
              </td>
            </tr>
          `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function populateSelectOptions() {
  ui.reservationCustomerSelect.innerHTML = state.customers
    .map((customer) => {
      const fullName = `${customer.firstName} ${customer.lastName}`;
      return `<option value="${customer.id}">${fullName} (${customer.email})</option>`;
    })
    .join("");

  const previousVehicleSelections = {
    reservation: ui.reservationVehicleSelect.value,
    quote: ui.quoteVehicleSelect.value,
    edit: ui.editVehicleSelect.value,
    document: ui.documentVehicleSelect.value,
    documentList: ui.documentListVehicleSelect.value,
    workOrder: ui.workOrderVehicleSelect.value,
  };

  const vehicleOptions = state.vehicles
    .map((vehicle) => {
      const label = `${vehicle.plateNumber} - ${vehicle.make} ${vehicle.model} (${formatMoney(
        vehicle.dailyRate
      )}/day, ${vehicle.status})`;
      return `<option value="${vehicle.id}">${label}</option>`;
    })
    .join("");

  ui.reservationVehicleSelect.innerHTML = vehicleOptions;
  ui.quoteVehicleSelect.innerHTML = vehicleOptions;
  ui.editVehicleSelect.innerHTML = vehicleOptions;
  ui.documentVehicleSelect.innerHTML = vehicleOptions;
  ui.documentListVehicleSelect.innerHTML = vehicleOptions;
  ui.workOrderVehicleSelect.innerHTML = vehicleOptions;

  ui.reservationVehicleSelect.value = previousVehicleSelections.reservation || ui.reservationVehicleSelect.value;
  ui.quoteVehicleSelect.value = previousVehicleSelections.quote || ui.quoteVehicleSelect.value;
  ui.editVehicleSelect.value = previousVehicleSelections.edit || ui.editVehicleSelect.value;
  ui.documentVehicleSelect.value = previousVehicleSelections.document || ui.documentVehicleSelect.value;
  ui.documentListVehicleSelect.value = previousVehicleSelections.documentList || ui.documentListVehicleSelect.value;
  ui.workOrderVehicleSelect.value = previousVehicleSelections.workOrder || ui.workOrderVehicleSelect.value;

  if (!state.selectedDocumentVehicleId && state.vehicles[0]) {
    state.selectedDocumentVehicleId = state.vehicles[0].id;
  }
  if (state.selectedDocumentVehicleId) {
    ui.documentListVehicleSelect.value = state.selectedDocumentVehicleId;
  }

  if (ui.editVehicleSelect.value) {
    const selectedVehicle = state.vehicles.find((vehicle) => vehicle.id === ui.editVehicleSelect.value);
    populateFormFromVehicle(selectedVehicle);
  }
}

async function loadVehicleDocuments(vehicleId) {
  state.selectedDocumentVehicleId = vehicleId || null;
  if (!vehicleId) {
    state.vehicleDocuments = [];
    renderVehicleDocuments();
    return;
  }

  state.vehicleDocuments = await request(`/api/vehicles/${vehicleId}/documents`);
  renderVehicleDocuments();
}

async function loadData() {
  const [dashboard, vehicles, customers, reservations, workOrders, config] = await Promise.all([
    request("/api/dashboard"),
    request("/api/vehicles"),
    request("/api/customers"),
    request("/api/reservations"),
    request("/api/work-orders"),
    request("/api/config"),
  ]);

  state.dashboard = dashboard;
  state.vehicles = vehicles;
  state.customers = customers;
  state.reservations = reservations;
  state.workOrders = workOrders;
  state.config = config;

  renderDashboard();
  renderVehicles();
  renderCustomers();
  renderReservations();
  renderWorkOrders();
  populateSelectOptions();

  const targetVehicleId = state.selectedDocumentVehicleId || state.vehicles[0]?.id || null;
  await loadVehicleDocuments(targetVehicleId);
}

function attachFormHandlers() {
  const vehicleForm = document.getElementById("vehicle-form");
  const editVehicleForm = document.getElementById("edit-vehicle-form");
  const vehicleCsvForm = document.getElementById("vehicle-csv-form");
  const vehicleCsvFile = document.getElementById("vehicle-csv-file");
  const vehicleDocumentForm = document.getElementById("vehicle-document-form");
  const customerForm = document.getElementById("customer-form");
  const reservationForm = document.getElementById("reservation-form");
  const quoteForm = document.getElementById("quote-form");
  const workOrderForm = document.getElementById("work-order-form");

  vehicleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(vehicleForm).entries());
    payload.features = collectCheckedValues(vehicleForm, "features");

    try {
      await request("/api/vehicles", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showToast("Vehicle added.");
      vehicleForm.reset();
      await loadData();
    } catch (error) {
      showToast(error.message, true);
    }
  });

  ui.editVehicleSelect.addEventListener("change", () => {
    const selectedVehicle = state.vehicles.find((vehicle) => vehicle.id === ui.editVehicleSelect.value);
    populateFormFromVehicle(selectedVehicle);
  });

  editVehicleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const vehicleId = ui.editVehicleSelect.value;
    if (!vehicleId) {
      showToast("Please choose a vehicle to edit.", true);
      return;
    }

    const payload = Object.fromEntries(new FormData(editVehicleForm).entries());
    delete payload.vehicleId;
    payload.features = collectCheckedValues(editVehicleForm, "editFeatures");

    try {
      await request(`/api/vehicles/${vehicleId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      showToast("Vehicle updated.");
      await loadData();
    } catch (error) {
      showToast(error.message, true);
    }
  });

  vehicleCsvFile.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    document.getElementById("vehicle-csv-content").value = text;
  });

  vehicleCsvForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(vehicleCsvForm);
    const payload = Object.fromEntries(formData.entries());
    payload.skipDuplicates = formData.get("skipDuplicates") === "on";

    try {
      const result = await request("/api/vehicles/import-csv", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      ui.csvImportResult.innerHTML = `
        <strong>Import completed.</strong><br />
        Imported: ${result.importedCount}<br />
        Skipped: ${result.skippedCount}<br />
        ${
          result.errors.length
            ? `First errors:<br />${result.errors
                .slice(0, 5)
                .map((item) => `Row ${item.row ?? "-"}: ${item.error}`)
                .join("<br />")}`
            : "No row errors."
        }
      `;
      showToast("CSV import finished.");
      await loadData();
    } catch (error) {
      showToast(error.message, true);
      ui.csvImportResult.innerHTML = "<em>CSV import failed.</em>";
    }
  });

  vehicleDocumentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(vehicleDocumentForm);
    const vehicleId = formData.get("vehicleId");

    try {
      await request(`/api/vehicles/${vehicleId}/documents`, {
        method: "POST",
        body: formData,
      });
      showToast("Document uploaded.");
      vehicleDocumentForm.reset();
      ui.documentVehicleSelect.value = vehicleId;
      await loadVehicleDocuments(vehicleId);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  ui.documentListVehicleSelect.addEventListener("change", async () => {
    try {
      await loadVehicleDocuments(ui.documentListVehicleSelect.value);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  ui.vehicleDocumentList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const documentId = target.dataset.documentDeleteId;
    if (!documentId || !state.selectedDocumentVehicleId) {
      return;
    }

    try {
      await request(
        `/api/vehicles/${state.selectedDocumentVehicleId}/documents/${documentId}`,
        { method: "DELETE" }
      );
      showToast("Document deleted.");
      await loadVehicleDocuments(state.selectedDocumentVehicleId);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  customerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(customerForm).entries());

    try {
      await request("/api/customers", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showToast("Customer added.");
      customerForm.reset();
      await loadData();
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
      await loadData();
    } catch (error) {
      showToast(error.message, true);
    }
  });

  ui.workOrderList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (!target.classList.contains("work-order-status-btn")) {
      return;
    }
    const workOrderId = target.dataset.workOrderId;
    if (!workOrderId) {
      return;
    }

    const statusSelect = ui.workOrderList.querySelector(`select[data-work-order-status-id="${workOrderId}"]`);
    if (!(statusSelect instanceof HTMLSelectElement)) {
      return;
    }

    try {
      await request(`/api/work-orders/${workOrderId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: statusSelect.value }),
      });
      showToast("Work order updated.");
      await loadData();
    } catch (error) {
      showToast(error.message, true);
    }
  });

  reservationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(reservationForm).entries());
    payload.addOns = collectCheckedValues(reservationForm, "addOns");

    try {
      const reservation = await request("/api/reservations", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showToast(`Reservation created (${formatMoney(reservation.pricing.total)}).`);
      reservationForm.reset();
      await loadData();
    } catch (error) {
      showToast(error.message, true);
    }
  });

  quoteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(quoteForm).entries());
    payload.addOns = collectCheckedValues(quoteForm, "addOns");

    try {
      const quote = await request("/api/quotes", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const pricing = quote.pricing;
      ui.quoteResult.innerHTML = `
        <strong>Total:</strong> ${formatMoney(pricing.total)}<br />
        Rental days: ${quote.rentalDays}<br />
        Base: ${formatMoney(pricing.basePrice)} |
        Insurance: ${formatMoney(pricing.insurancePrice)} |
        Add-ons: ${formatMoney(pricing.addOnPrice)}<br />
        Tax: ${formatMoney(pricing.tax)}
      `;
      showToast("Quote calculated.");
    } catch (error) {
      showToast(error.message, true);
      ui.quoteResult.innerHTML = "<em>Could not calculate quote.</em>";
    }
  });
}

async function bootstrap() {
  try {
    attachFormHandlers();
    await loadData();
  } catch (error) {
    showToast(error.message, true);
  }
}

bootstrap();
