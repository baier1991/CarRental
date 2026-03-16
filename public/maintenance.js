const {
  request,
  showToast,
  confirmAction,
  formatMoney,
  sessionReady,
  markPageReady,
  paginateItems,
  renderPaginationControls,
} = window.AppCommon;

const ACTIVE_WORK_ORDER_STATUSES = new Set(["open", "in_progress", "on_hold"]);
const WORK_ORDER_STATUSES = ["open", "in_progress", "on_hold", "completed", "cancelled"];
const WORK_ORDER_PRIORITIES = ["critical", "high", "medium", "low"];
const DOCUMENT_TYPES = ["registration", "insurance", "inspection", "contract", "other"];
const SEARCH_DEBOUNCE_MS = 220;
const PRIORITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };

const DEFAULT_DOCUMENT_FILTERS = {
  vehicleId: "",
  compliance: "",
  documentType: "",
  search: "",
  sort: "expiry_asc",
};

const DEFAULT_WORK_ORDER_FILTERS = {
  search: "",
  status: "",
  priority: "",
  vehicleId: "",
  sort: "scheduled_asc",
};

const state = {
  session: null,
  vehicles: [],
  allDocuments: [],
  filteredDocuments: [],
  allWorkOrders: [],
  filteredWorkOrders: [],
  documentFilters: { ...DEFAULT_DOCUMENT_FILTERS },
  workOrderFilters: { ...DEFAULT_WORK_ORDER_FILTERS },
  documentPage: 1,
  documentPageSize: 8,
  workOrderPage: 1,
  workOrderPageSize: 8,
  documentSearchTimer: null,
  workOrderSearchTimer: null,
  autoReseedAttempted: false,
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function localTodayDateOnly() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateOnlyToTimestamp(dateOnly) {
  if (!dateOnly || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateOnly))) {
    return Number.NaN;
  }
  return Date.parse(`${dateOnly}T00:00:00.000Z`);
}

function daysUntil(dateOnly) {
  const target = dateOnlyToTimestamp(dateOnly);
  const today = dateOnlyToTimestamp(localTodayDateOnly());
  if (!Number.isFinite(target) || !Number.isFinite(today)) {
    return Number.NaN;
  }
  return Math.floor((target - today) / 86400000);
}

function getVehicleMap() {
  return new Map(state.vehicles.map((vehicle) => [vehicle.id, vehicle]));
}

function vehicleOptionLabel(vehicle) {
  if (!vehicle) {
    return "Unknown vehicle";
  }
  return `${vehicle.plateNumber || "n/a"} - ${vehicle.make || ""} ${vehicle.model || ""}`.trim();
}

function getVehicleShortLabel(vehicleId) {
  const vehicle = getVehicleMap().get(vehicleId);
  if (!vehicle) {
    return vehicleId || "n/a";
  }
  return `${vehicle.plateNumber || "n/a"}${vehicle.make || vehicle.model ? ` (${vehicle.make || ""} ${vehicle.model || ""})` : ""}`;
}

function getComplianceState(expiryDate) {
  if (!expiryDate) {
    return {
      key: "no_expiry",
      label: "No expiry",
      detail: "No expiry date set",
      badgeClass: "badge-muted",
      expiryTimestamp: Number.POSITIVE_INFINITY,
    };
  }
  const days = daysUntil(expiryDate);
  const expiryTimestamp = dateOnlyToTimestamp(expiryDate);
  if (!Number.isFinite(days) || !Number.isFinite(expiryTimestamp)) {
    return {
      key: "no_expiry",
      label: "No expiry",
      detail: "No valid expiry date",
      badgeClass: "badge-muted",
      expiryTimestamp: Number.POSITIVE_INFINITY,
    };
  }
  if (days < 0) {
    return {
      key: "expired",
      label: "Expired",
      detail: `Expired ${Math.abs(days)}d ago`,
      badgeClass: "badge-danger",
      expiryTimestamp,
    };
  }
  if (days <= 30) {
    return {
      key: "expiring_soon",
      label: "Expiring Soon",
      detail: `Due in ${days}d`,
      badgeClass: "badge-warning",
      expiryTimestamp,
    };
  }
  return {
    key: "valid",
    label: "Valid",
    detail: `Due in ${days}d`,
    badgeClass: "badge-success",
    expiryTimestamp,
  };
}

function getPriorityBadgeClass(priority) {
  const normalized = String(priority || "").toLowerCase();
  if (normalized === "critical") {
    return "badge-danger";
  }
  if (normalized === "high") {
    return "badge-warning";
  }
  if (normalized === "medium") {
    return "badge-success";
  }
  return "badge-muted";
}

function getStatusBadgeClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "completed") {
    return "badge-success";
  }
  if (normalized === "cancelled") {
    return "badge-muted";
  }
  if (normalized === "in_progress" || normalized === "on_hold") {
    return "badge-warning";
  }
  return "badge-danger";
}

function isWorkOrderOverdue(workOrder) {
  if (!workOrder || !workOrder.scheduledDate) {
    return false;
  }
  if (!ACTIVE_WORK_ORDER_STATUSES.has(String(workOrder.status || "").toLowerCase())) {
    return false;
  }
  return String(workOrder.scheduledDate) < localTodayDateOnly();
}

function decorateDocuments(rawDocuments) {
  const vehicleMap = getVehicleMap();
  return asArray(rawDocuments).map((item) => {
    const documentItem = item || {};
    const compliance = getComplianceState(documentItem.expiryDate);
    const vehicle = vehicleMap.get(documentItem.vehicleId);
    const vehicleText = vehicle ? `${vehicle.plateNumber || ""} ${vehicle.make || ""} ${vehicle.model || ""}` : "";
    const uploadedAtTs = Date.parse(documentItem.uploadedAt || "");
    const searchIndex = [
      documentItem.documentType,
      documentItem.originalName,
      documentItem.notes,
      vehicleText,
      documentItem.expiryDate,
    ]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");
    return {
      ...documentItem,
      _compliance: compliance,
      _uploadedAtTs: Number.isFinite(uploadedAtTs) ? uploadedAtTs : 0,
      _searchIndex: searchIndex,
    };
  });
}

function decorateWorkOrders(rawWorkOrders) {
  const vehicleMap = getVehicleMap();
  return asArray(rawWorkOrders).map((item) => {
    const workOrder = item || {};
    const vehicle = vehicleMap.get(workOrder.vehicleId);
    const vehicleText = vehicle ? `${vehicle.plateNumber || ""} ${vehicle.make || ""} ${vehicle.model || ""}` : "";
    const searchIndex = [
      workOrder.title,
      workOrder.description,
      workOrder.vendorName,
      workOrder.notes,
      workOrder.status,
      workOrder.priority,
      vehicleText,
    ]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");
    return {
      ...workOrder,
      _createdAtTs: Date.parse(workOrder.createdAt || "") || 0,
      _updatedAtTs: Date.parse(workOrder.updatedAt || "") || 0,
      _scheduledDateTs: dateOnlyToTimestamp(workOrder.scheduledDate),
      _isOverdue: isWorkOrderOverdue(workOrder),
      _searchIndex: searchIndex,
    };
  });
}

function sortDocuments(items, sortBy) {
  const sorted = [...items];
  const getExpirySortValue = (item) =>
    item && item._compliance && Number.isFinite(item._compliance.expiryTimestamp)
      ? item._compliance.expiryTimestamp
      : Number.POSITIVE_INFINITY;

  if (sortBy === "expiry_desc") {
    sorted.sort((a, b) => {
      const aValue = getExpirySortValue(a);
      const bValue = getExpirySortValue(b);
      const aFinite = Number.isFinite(aValue);
      const bFinite = Number.isFinite(bValue);
      if (aFinite !== bFinite) {
        return aFinite ? -1 : 1;
      }
      return bValue - aValue || b._uploadedAtTs - a._uploadedAtTs;
    });
    return sorted;
  }
  if (sortBy === "uploaded_desc") {
    sorted.sort((a, b) => b._uploadedAtTs - a._uploadedAtTs);
    return sorted;
  }
  if (sortBy === "uploaded_asc") {
    sorted.sort((a, b) => a._uploadedAtTs - b._uploadedAtTs);
    return sorted;
  }
  if (sortBy === "type_asc") {
    sorted.sort((a, b) => String(a.documentType || "").localeCompare(String(b.documentType || "")));
    return sorted;
  }
  sorted.sort((a, b) => {
    const aValue = getExpirySortValue(a);
    const bValue = getExpirySortValue(b);
    const aFinite = Number.isFinite(aValue);
    const bFinite = Number.isFinite(bValue);
    if (aFinite !== bFinite) {
      return aFinite ? -1 : 1;
    }
    return aValue - bValue || b._uploadedAtTs - a._uploadedAtTs;
  });
  return sorted;
}

function sortWorkOrders(items, sortBy) {
  const sorted = [...items];
  if (sortBy === "priority_desc") {
    sorted.sort((a, b) => {
      const rankDelta = (PRIORITY_RANK[String(b.priority || "").toLowerCase()] || 0) -
        (PRIORITY_RANK[String(a.priority || "").toLowerCase()] || 0);
      return rankDelta || b._updatedAtTs - a._updatedAtTs;
    });
    return sorted;
  }
  if (sortBy === "updated_desc") {
    sorted.sort((a, b) => b._updatedAtTs - a._updatedAtTs);
    return sorted;
  }
  if (sortBy === "created_desc") {
    sorted.sort((a, b) => b._createdAtTs - a._createdAtTs);
    return sorted;
  }
  sorted.sort((a, b) => {
    const aScheduled = Number.isFinite(a._scheduledDateTs) ? a._scheduledDateTs : Number.POSITIVE_INFINITY;
    const bScheduled = Number.isFinite(b._scheduledDateTs) ? b._scheduledDateTs : Number.POSITIVE_INFINITY;
    return aScheduled - bScheduled || b._updatedAtTs - a._updatedAtTs;
  });
  return sorted;
}

function setSubmitting(form, isSubmitting, loadingLabel) {
  if (!form) {
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }
  if (!button.dataset.defaultText) {
    button.dataset.defaultText = button.textContent || "";
  }
  button.disabled = isSubmitting;
  button.textContent = isSubmitting ? loadingLabel : button.dataset.defaultText;
}

function populateVehicleSelects() {
  const createDocumentVehicle = document.getElementById("document-vehicle-select");
  const createWorkOrderVehicle = document.getElementById("work-order-vehicle");
  const documentFilterVehicle = document.getElementById("document-list-vehicle-select");
  const workOrderFilterVehicle = document.getElementById("work-order-filter-vehicle");

  const hasVehicles = state.vehicles.length > 0;
  const createSelects = [createDocumentVehicle, createWorkOrderVehicle].filter(Boolean);
  const filterSelects = [documentFilterVehicle, workOrderFilterVehicle].filter(Boolean);

  createSelects.forEach((select) => {
    const previousValue = select.value;
    if (!hasVehicles) {
      select.innerHTML = '<option value="">No vehicles available</option>';
      select.value = "";
      return;
    }
    select.innerHTML = [
      '<option value="">Select vehicle</option>',
      ...state.vehicles.map((vehicle) => `<option value="${vehicle.id}">${escapeHtml(vehicleOptionLabel(vehicle))}</option>`),
    ].join("");
    if (previousValue && state.vehicles.some((vehicle) => vehicle.id === previousValue)) {
      select.value = previousValue;
    } else if (state.vehicles[0]) {
      select.value = state.vehicles[0].id;
    }
  });

  filterSelects.forEach((select) => {
    const previousValue = select.value;
    const allLabel = select.id === "document-list-vehicle-select" ? "All vehicles (documents)" : "All vehicles";
    if (!hasVehicles) {
      select.innerHTML = `<option value="">${allLabel}</option>`;
      select.value = "";
      return;
    }
    const options = [
      `<option value="">${allLabel}</option>`,
      ...state.vehicles.map((vehicle) => `<option value="${vehicle.id}">${escapeHtml(vehicleOptionLabel(vehicle))}</option>`),
    ];
    select.innerHTML = options.join("");
    const preferredValue = select.id === "document-list-vehicle-select"
      ? state.documentFilters.vehicleId
      : state.workOrderFilters.vehicleId;
    const nextValue = preferredValue || previousValue;
    if (nextValue && state.vehicles.some((vehicle) => vehicle.id === nextValue)) {
      select.value = nextValue;
    }
  });
}

function ensureVehicleDropdownsHealthy() {
  if (!state.vehicles.length) {
    return;
  }
  const selectIds = [
    "document-vehicle-select",
    "work-order-vehicle",
    "document-list-vehicle-select",
    "work-order-filter-vehicle",
  ];
  const hasBroken = selectIds.some((id) => {
    const select = document.getElementById(id);
    if (!(select instanceof HTMLSelectElement)) {
      return false;
    }
    if (select.options.length === 0) {
      return true;
    }
    if (select.options.length === 1 && String(select.options[0].value || "").trim() === "") {
      return true;
    }
    return false;
  });
  if (hasBroken) {
    populateVehicleSelects();
    syncDocumentFilterFormFromState();
    syncWorkOrderFilterFormFromState();
  }
}

function populateDocumentTypeFilter() {
  const select = document.getElementById("document-filter-type");
  if (!select) {
    return;
  }
  const dynamicTypes = state.allDocuments
    .map((item) => String(item.documentType || "").trim().toLowerCase())
    .filter(Boolean);
  const options = Array.from(new Set([...DOCUMENT_TYPES, ...dynamicTypes])).sort();
  select.innerHTML = `
    <option value="">All types</option>
    ${options.map((item) => `<option value="${item}">${item}</option>`).join("")}
  `;
  if (state.documentFilters.documentType && options.includes(state.documentFilters.documentType)) {
    select.value = state.documentFilters.documentType;
  }
}

function updateFormAvailability() {
  const hasVehicles = state.vehicles.length > 0;
  const documentForm = document.getElementById("vehicle-document-form");
  const workOrderForm = document.getElementById("work-order-form");
  const documentHint = document.getElementById("document-form-hint");
  const workOrderHint = document.getElementById("work-order-form-hint");

  [documentForm, workOrderForm].forEach((form) => {
    if (!form) {
      return;
    }
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = !hasVehicles;
    }
  });

  if (documentHint) {
    documentHint.classList.toggle("hidden", hasVehicles);
    documentHint.textContent = hasVehicles ? "" : "Add a vehicle before uploading compliance documents.";
  }
  if (workOrderHint) {
    workOrderHint.classList.toggle("hidden", hasVehicles);
    workOrderHint.textContent = hasVehicles ? "" : "Add a vehicle before creating work orders.";
  }
}

function renderOverviewMetrics() {
  const metricsContainer = document.getElementById("maintenance-overview-metrics");
  if (!metricsContainer) {
    return;
  }
  const totalDocs = state.allDocuments.length;
  const expiredDocs = state.allDocuments.filter((item) => item._compliance.key === "expired").length;
  const expiringSoonDocs = state.allDocuments.filter((item) => item._compliance.key === "expiring_soon").length;
  const openWorkOrders = state.allWorkOrders.filter((item) => ACTIVE_WORK_ORDER_STATUSES.has(String(item.status || ""))).length;
  const overdueWorkOrders = state.allWorkOrders.filter((item) => item._isOverdue).length;
  const criticalOrHighOpen = state.allWorkOrders.filter((item) => {
    const priority = String(item.priority || "").toLowerCase();
    return ACTIVE_WORK_ORDER_STATUSES.has(String(item.status || "")) && (priority === "critical" || priority === "high");
  }).length;

  const metrics = [
    { label: "Documents", value: totalDocs },
    { label: "Expired Docs", value: expiredDocs },
    { label: "Expiring in 30d", value: expiringSoonDocs },
    { label: "Open Work Orders", value: openWorkOrders },
    { label: "Overdue Work Orders", value: overdueWorkOrders },
    { label: "Critical/High Open", value: criticalOrHighOpen },
  ];

  metricsContainer.innerHTML = metrics
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

function applyDocumentFilterFormValues(formData) {
  state.documentFilters.vehicleId = String(formData.get("vehicleId") || "").trim();
  state.documentFilters.compliance = String(formData.get("compliance") || "").trim();
  state.documentFilters.documentType = String(formData.get("documentType") || "").trim().toLowerCase();
  state.documentFilters.search = String(formData.get("search") || "").trim().toLowerCase();
  state.documentFilters.sort = String(formData.get("sort") || DEFAULT_DOCUMENT_FILTERS.sort);
}

function applyWorkOrderFilterFormValues(formData) {
  state.workOrderFilters.search = String(formData.get("search") || "").trim().toLowerCase();
  state.workOrderFilters.status = String(formData.get("status") || "").trim().toLowerCase();
  state.workOrderFilters.priority = String(formData.get("priority") || "").trim().toLowerCase();
  state.workOrderFilters.vehicleId = String(formData.get("vehicleId") || "").trim();
  state.workOrderFilters.sort = String(formData.get("sort") || DEFAULT_WORK_ORDER_FILTERS.sort);
}

function syncDocumentFilterFormFromState() {
  const form = document.getElementById("document-filter-form");
  if (!form) {
    return;
  }
  if (form.elements.vehicleId) {
    form.elements.vehicleId.value = state.documentFilters.vehicleId;
  }
  if (form.elements.compliance) {
    form.elements.compliance.value = state.documentFilters.compliance;
  }
  if (form.elements.documentType) {
    form.elements.documentType.value = state.documentFilters.documentType;
  }
  if (form.elements.search) {
    form.elements.search.value = state.documentFilters.search;
  }
  if (form.elements.sort) {
    form.elements.sort.value = state.documentFilters.sort;
  }
}

function syncWorkOrderFilterFormFromState() {
  const form = document.getElementById("work-order-filter-form");
  if (!form) {
    return;
  }
  if (form.elements.search) {
    form.elements.search.value = state.workOrderFilters.search;
  }
  if (form.elements.status) {
    form.elements.status.value = state.workOrderFilters.status;
  }
  if (form.elements.priority) {
    form.elements.priority.value = state.workOrderFilters.priority;
  }
  if (form.elements.vehicleId) {
    form.elements.vehicleId.value = state.workOrderFilters.vehicleId;
  }
  if (form.elements.sort) {
    form.elements.sort.value = state.workOrderFilters.sort;
  }
}

function renderDocumentFilterSummary() {
  const summary = document.getElementById("document-filter-summary");
  if (!summary) {
    return;
  }
  const total = state.allDocuments.length;
  const visible = state.filteredDocuments.length;
  const activeCount = ["vehicleId", "compliance", "documentType", "search"].reduce(
    (count, key) => count + (String(state.documentFilters[key] || "").trim() ? 1 : 0),
    0
  );
  summary.textContent =
    activeCount > 0
      ? `Showing ${visible} of ${total} documents (${activeCount} active filters)`
      : `Showing ${visible} documents`;
}

function renderWorkOrderFilterSummary() {
  const summary = document.getElementById("work-order-filter-summary");
  if (!summary) {
    return;
  }
  const total = state.allWorkOrders.length;
  const visible = state.filteredWorkOrders.length;
  const activeCount = ["search", "status", "priority", "vehicleId"].reduce(
    (count, key) => count + (String(state.workOrderFilters[key] || "").trim() ? 1 : 0),
    0
  );
  summary.textContent =
    activeCount > 0
      ? `Showing ${visible} of ${total} work orders (${activeCount} active filters)`
      : `Showing ${visible} work orders`;
}

function applyDocumentFilters(options = {}) {
  const { resetPage = false } = options;
  const filtered = state.allDocuments.filter((item) => {
    if (state.documentFilters.vehicleId && item.vehicleId !== state.documentFilters.vehicleId) {
      return false;
    }
    if (state.documentFilters.compliance && item._compliance.key !== state.documentFilters.compliance) {
      return false;
    }
    if (state.documentFilters.documentType && String(item.documentType || "").toLowerCase() !== state.documentFilters.documentType) {
      return false;
    }
    if (state.documentFilters.search && !String(item._searchIndex || "").includes(state.documentFilters.search)) {
      return false;
    }
    return true;
  });
  state.filteredDocuments = sortDocuments(filtered, state.documentFilters.sort);
  if (resetPage) {
    state.documentPage = 1;
  }
  renderDocumentFilterSummary();
  renderDocuments();
}

function applyWorkOrderFilters(options = {}) {
  const { resetPage = false } = options;
  const filtered = state.allWorkOrders.filter((item) => {
    if (state.workOrderFilters.vehicleId && item.vehicleId !== state.workOrderFilters.vehicleId) {
      return false;
    }
    if (state.workOrderFilters.status && String(item.status || "").toLowerCase() !== state.workOrderFilters.status) {
      return false;
    }
    if (state.workOrderFilters.priority && String(item.priority || "").toLowerCase() !== state.workOrderFilters.priority) {
      return false;
    }
    if (state.workOrderFilters.search && !String(item._searchIndex || "").includes(state.workOrderFilters.search)) {
      return false;
    }
    return true;
  });
  state.filteredWorkOrders = sortWorkOrders(filtered, state.workOrderFilters.sort);
  if (resetPage) {
    state.workOrderPage = 1;
  }
  renderWorkOrderFilterSummary();
  renderWorkOrders();
}

function renderDocuments() {
  const container = document.getElementById("vehicle-document-list");
  if (!container) {
    return;
  }
  if (state.filteredDocuments.length === 0) {
    container.innerHTML = state.allDocuments.length === 0
      ? "<p>No compliance documents uploaded yet.</p>"
      : "<p>No documents match the current filters.</p>";
    renderPaginationControls("document-pagination", null);
    return;
  }

  const paginated = paginateItems(state.filteredDocuments, state.documentPage, state.documentPageSize);
  state.documentPage = paginated.currentPage;

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Vehicle</th>
          <th>Type</th>
          <th>Compliance</th>
          <th>File</th>
          <th>Uploaded</th>
          <th>Expiry</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${paginated.items
          .map((item) => {
            const uploadedAt = item.uploadedAt ? String(item.uploadedAt).slice(0, 10) : "n/a";
            const compliance = item._compliance || getComplianceState(item.expiryDate);
            return `
            <tr>
              <td>${escapeHtml(getVehicleShortLabel(item.vehicleId))}</td>
              <td>${escapeHtml(item.documentType || "n/a")}</td>
              <td>
                <span class="badge ${compliance.badgeClass}">${escapeHtml(compliance.label)}</span><br />
                <small>${escapeHtml(compliance.detail)}</small>
              </td>
              <td><a href="${escapeHtml(item.relativePath || "#")}" target="_blank" rel="noreferrer">${escapeHtml(item.originalName || "document")}</a></td>
              <td>${escapeHtml(uploadedAt)}</td>
              <td>${escapeHtml(item.expiryDate || "n/a")}</td>
              <td>
                <button
                  type="button"
                  data-delete-document-id="${escapeHtml(item.id)}"
                  data-delete-document-vehicle-id="${escapeHtml(item.vehicleId)}"
                >
                  Delete
                </button>
              </td>
            </tr>
          `;
          })
          .join("")}
      </tbody>
    </table>
  `;

  renderPaginationControls("document-pagination", paginated, (nextPage) => {
    state.documentPage = nextPage;
    renderDocuments();
  });
}

function renderWorkOrders() {
  const container = document.getElementById("work-order-list");
  if (!container) {
    return;
  }
  if (state.filteredWorkOrders.length === 0) {
    container.innerHTML = state.allWorkOrders.length === 0
      ? "<p>No work orders yet.</p>"
      : "<p>No work orders match the current filters.</p>";
    renderPaginationControls("work-order-pagination", null);
    return;
  }

  const paginated = paginateItems(state.filteredWorkOrders, state.workOrderPage, state.workOrderPageSize);
  state.workOrderPage = paginated.currentPage;

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
        ${paginated.items
          .map((workOrder) => `
            <tr>
              <td>${escapeHtml(getVehicleShortLabel(workOrder.vehicleId))}</td>
              <td>${escapeHtml(workOrder.title || "n/a")}</td>
              <td><span class="badge ${getPriorityBadgeClass(workOrder.priority)}">${escapeHtml(workOrder.priority || "n/a")}</span></td>
              <td>
                <span class="badge ${getStatusBadgeClass(workOrder.status)}">${escapeHtml(workOrder.status || "n/a")}</span>
                ${workOrder._isOverdue ? '<br /><small><span class="badge badge-danger">Overdue</span></small>' : ""}
              </td>
              <td>${escapeHtml(workOrder.scheduledDate || "n/a")}</td>
              <td>
                ${workOrder.actualCost != null
                  ? formatMoney(workOrder.actualCost)
                  : workOrder.costEstimate != null
                    ? `Est: ${formatMoney(workOrder.costEstimate)}`
                    : "n/a"}
              </td>
              <td>
                <div class="table-inline-controls">
                  <select data-work-order-status-id="${escapeHtml(workOrder.id)}">
                    ${WORK_ORDER_STATUSES
                      .map((status) => `<option value="${status}" ${status === workOrder.status ? "selected" : ""}>${status}</option>`)
                      .join("")}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Actual cost"
                    data-work-order-actual-cost-id="${escapeHtml(workOrder.id)}"
                    value="${workOrder.actualCost != null ? escapeHtml(workOrder.actualCost) : ""}"
                  />
                  <button type="button" data-work-order-id="${escapeHtml(workOrder.id)}" class="save-work-order-status">Save</button>
                </div>
              </td>
            </tr>
          `)
          .join("")}
      </tbody>
    </table>
  `;

  renderPaginationControls("work-order-pagination", paginated, (nextPage) => {
    state.workOrderPage = nextPage;
    renderWorkOrders();
  });
}

async function loadAllDocumentsWithFallback() {
  try {
    return asArray(await request("/api/vehicle-documents"));
  } catch (primaryError) {
    if (!state.vehicles.length) {
      throw primaryError;
    }
    const settled = await Promise.allSettled(
      state.vehicles.map((vehicle) => request(`/api/vehicles/${vehicle.id}/documents`))
    );
    const aggregated = [];
    settled.forEach((result) => {
      if (result.status === "fulfilled") {
        aggregated.push(...asArray(result.value));
      }
    });
    if (aggregated.length > 0 || settled.some((result) => result.status === "fulfilled")) {
      return aggregated;
    }
    throw primaryError;
  }
}

async function refreshDocuments() {
  const rawDocuments = await loadAllDocumentsWithFallback();
  state.allDocuments = decorateDocuments(rawDocuments);
  populateDocumentTypeFilter();
  syncDocumentFilterFormFromState();
  applyDocumentFilters({ resetPage: true });
  renderOverviewMetrics();
}

async function refreshWorkOrders() {
  const rawWorkOrders = await request("/api/work-orders");
  state.allWorkOrders = decorateWorkOrders(rawWorkOrders);
  syncWorkOrderFilterFormFromState();
  applyWorkOrderFilters({ resetPage: true });
  renderOverviewMetrics();
}

async function loadMaintenanceData() {
  const [vehiclesResult, workOrdersResult] = await Promise.allSettled([request("/api/vehicles"), request("/api/work-orders")]);
  const failures = [];

  if (vehiclesResult.status === "fulfilled") {
    state.vehicles = asArray(vehiclesResult.value);
  } else {
    state.vehicles = [];
    failures.push("vehicles");
  }

  if (workOrdersResult.status === "fulfilled") {
    state.allWorkOrders = decorateWorkOrders(workOrdersResult.value);
  } else {
    state.allWorkOrders = [];
    failures.push("work orders");
  }

  try {
    const documents = await loadAllDocumentsWithFallback();
    state.allDocuments = decorateDocuments(documents);
  } catch (_error) {
    state.allDocuments = [];
    failures.push("documents");
  }

  const userRole = state.session && state.session.user ? state.session.user.role : "";
  if (state.vehicles.length === 0 && !state.autoReseedAttempted && userRole === "owner") {
    state.autoReseedAttempted = true;
    try {
      const reseedResult = await request("/api/admin/reseed-tenant-demo", {
        method: "POST",
      });
      if (reseedResult && reseedResult.applied) {
        showToast("Demo maintenance data restored.");
        await loadMaintenanceData();
        return;
      }
    } catch (_reseedError) {
      // Ignore reseed errors and continue with current page state.
    }
  }

  populateVehicleSelects();
  updateFormAvailability();
  populateDocumentTypeFilter();
  syncDocumentFilterFormFromState();
  syncWorkOrderFilterFormFromState();
  applyDocumentFilters({ resetPage: true });
  applyWorkOrderFilters({ resetPage: true });
  renderOverviewMetrics();

  if (failures.length > 0) {
    showToast(`Some maintenance data failed to load: ${failures.join(", ")}.`, true);
  }
}

function clearDocumentSearchDebounce() {
  if (state.documentSearchTimer) {
    window.clearTimeout(state.documentSearchTimer);
    state.documentSearchTimer = null;
  }
}

function clearWorkOrderSearchDebounce() {
  if (state.workOrderSearchTimer) {
    window.clearTimeout(state.workOrderSearchTimer);
    state.workOrderSearchTimer = null;
  }
}

function attachHandlers() {
  const documentForm = document.getElementById("vehicle-document-form");
  const workOrderForm = document.getElementById("work-order-form");
  const documentList = document.getElementById("vehicle-document-list");
  const workOrderList = document.getElementById("work-order-list");
  const documentFilterForm = document.getElementById("document-filter-form");
  const workOrderFilterForm = document.getElementById("work-order-filter-form");
  const documentFilterResetButton = document.getElementById("document-filter-reset-btn");
  const workOrderFilterResetButton = document.getElementById("work-order-filter-reset-btn");

  if (documentForm) {
    documentForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(documentForm);
      const vehicleId = String(formData.get("vehicleId") || "");
      if (!vehicleId) {
        showToast("Vehicle is required.", true);
        return;
      }
      if (!confirmAction("Upload this compliance document?")) {
        return;
      }
      setSubmitting(documentForm, true, "Uploading...");
      try {
        await request(`/api/vehicles/${vehicleId}/documents`, {
          method: "POST",
          body: formData,
        });
        showToast("Document uploaded.");
        const selectedVehicle = vehicleId;
        documentForm.reset();
        const vehicleSelect = document.getElementById("document-vehicle-select");
        if (vehicleSelect && selectedVehicle) {
          vehicleSelect.value = selectedVehicle;
        }
        await refreshDocuments();
      } catch (error) {
        showToast(error.message, true);
      } finally {
        setSubmitting(documentForm, false, "Uploading...");
      }
    });
  }

  if (workOrderForm) {
    workOrderForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(workOrderForm).entries());
      const vehicleId = String(payload.vehicleId || "");
      delete payload.vehicleId;
      if (!vehicleId) {
        showToast("Vehicle is required.", true);
        return;
      }
      if (!confirmAction("Create this work order?")) {
        return;
      }
      setSubmitting(workOrderForm, true, "Creating...");
      try {
        await request(`/api/vehicles/${vehicleId}/work-orders`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showToast("Work order created.");
        const selectedVehicle = vehicleId;
        workOrderForm.reset();
        const vehicleSelect = document.getElementById("work-order-vehicle");
        if (vehicleSelect && selectedVehicle) {
          vehicleSelect.value = selectedVehicle;
        }
        await refreshWorkOrders();
      } catch (error) {
        showToast(error.message, true);
      } finally {
        setSubmitting(workOrderForm, false, "Creating...");
      }
    });
  }

  if (documentList) {
    documentList.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const button = target.closest("button[data-delete-document-id]");
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }
      const documentId = button.dataset.deleteDocumentId;
      const vehicleId = button.dataset.deleteDocumentVehicleId;
      if (!documentId || !vehicleId) {
        return;
      }
      if (!confirmAction("Delete this document?")) {
        return;
      }

      button.disabled = true;
      try {
        await request(`/api/vehicles/${vehicleId}/documents/${documentId}`, {
          method: "DELETE",
        });
        showToast("Document deleted.");
        await refreshDocuments();
      } catch (error) {
        showToast(error.message, true);
      } finally {
        button.disabled = false;
      }
    });
  }

  if (workOrderList) {
    workOrderList.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const button = target.closest("button.save-work-order-status");
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }
      const workOrderId = button.dataset.workOrderId;
      if (!workOrderId) {
        return;
      }
      const statusSelect = workOrderList.querySelector(`select[data-work-order-status-id="${workOrderId}"]`);
      const costInput = workOrderList.querySelector(`input[data-work-order-actual-cost-id="${workOrderId}"]`);
      if (!(statusSelect instanceof HTMLSelectElement)) {
        return;
      }

      const payload = { status: statusSelect.value };
      if (costInput instanceof HTMLInputElement && String(costInput.value).trim()) {
        const parsed = Number(costInput.value);
        if (!Number.isFinite(parsed) || parsed < 0) {
          showToast("Actual cost must be a valid positive number.", true);
          return;
        }
        payload.actualCost = parsed;
      }

      if (!confirmAction("Save this work order update?")) {
        return;
      }

      button.disabled = true;
      try {
        await request(`/api/work-orders/${workOrderId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        showToast("Work order updated.");
        await refreshWorkOrders();
      } catch (error) {
        showToast(error.message, true);
      } finally {
        button.disabled = false;
      }
    });
  }

  if (documentFilterForm) {
    documentFilterForm.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const formData = new FormData(documentFilterForm);
      applyDocumentFilterFormValues(formData);
      if (target.id === "document-filter-search") {
        clearDocumentSearchDebounce();
        state.documentSearchTimer = window.setTimeout(() => applyDocumentFilters({ resetPage: true }), SEARCH_DEBOUNCE_MS);
        return;
      }
      applyDocumentFilters({ resetPage: true });
    });
    documentFilterForm.addEventListener("change", () => {
      clearDocumentSearchDebounce();
      const formData = new FormData(documentFilterForm);
      applyDocumentFilterFormValues(formData);
      applyDocumentFilters({ resetPage: true });
    });
  }

  if (workOrderFilterForm) {
    workOrderFilterForm.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const formData = new FormData(workOrderFilterForm);
      applyWorkOrderFilterFormValues(formData);
      if (target.id === "work-order-filter-search") {
        clearWorkOrderSearchDebounce();
        state.workOrderSearchTimer = window.setTimeout(() => applyWorkOrderFilters({ resetPage: true }), SEARCH_DEBOUNCE_MS);
        return;
      }
      applyWorkOrderFilters({ resetPage: true });
    });
    workOrderFilterForm.addEventListener("change", () => {
      clearWorkOrderSearchDebounce();
      const formData = new FormData(workOrderFilterForm);
      applyWorkOrderFilterFormValues(formData);
      applyWorkOrderFilters({ resetPage: true });
    });
  }

  if (documentFilterResetButton) {
    documentFilterResetButton.addEventListener("click", () => {
      clearDocumentSearchDebounce();
      state.documentFilters = { ...DEFAULT_DOCUMENT_FILTERS };
      syncDocumentFilterFormFromState();
      applyDocumentFilters({ resetPage: true });
    });
  }

  if (workOrderFilterResetButton) {
    workOrderFilterResetButton.addEventListener("click", () => {
      clearWorkOrderSearchDebounce();
      state.workOrderFilters = { ...DEFAULT_WORK_ORDER_FILTERS };
      syncWorkOrderFilterFormFromState();
      applyWorkOrderFilters({ resetPage: true });
    });
  }

  document.addEventListener("focusin", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (!target.matches("#document-vehicle-select, #work-order-vehicle, #document-list-vehicle-select, #work-order-filter-vehicle")) {
      return;
    }
    ensureVehicleDropdownsHealthy();
  });
}

async function bootstrap() {
  try {
    state.session = await sessionReady;
    attachHandlers();
    await loadMaintenanceData();
    window.setTimeout(() => ensureVehicleDropdownsHealthy(), 200);
    markPageReady("maintenance");
  } catch (error) {
    showToast(error.message, true);
  }
}

bootstrap();
