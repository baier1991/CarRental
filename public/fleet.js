const {
  request,
  showToast,
  collectCheckedValues,
  formatMoney,
  sessionReady,
  markPageReady,
  paginateItems,
  renderPaginationControls,
} =
  window.AppCommon;

const EDITABLE_ROLES = new Set(["owner", "admin", "agent"]);

const state = {
  session: null,
  vehicles: [],
  filteredVehicles: [],
  vehiclePage: 1,
  vehiclePageSize: 8,
  filters: {
    search: "",
    status: "",
    category: "",
  },
};

function canEditVehicles() {
  const role = state.session && state.session.user ? state.session.user.role : null;
  return EDITABLE_ROLES.has(role);
}

function getFilteredVehicles() {
  const search = String(state.filters.search || "").trim().toLowerCase();
  const status = String(state.filters.status || "").trim().toLowerCase();
  const category = String(state.filters.category || "").trim().toLowerCase();

  return state.vehicles.filter((vehicle) => {
    if (status && String(vehicle.status || "").toLowerCase() !== status) {
      return false;
    }
    if (category && String(vehicle.category || "").toLowerCase() !== category) {
      return false;
    }
    if (!search) {
      return true;
    }

    const searchable = [
      vehicle.plateNumber,
      vehicle.make,
      vehicle.model,
      vehicle.branchCode,
      vehicle.location,
    ]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");
    return searchable.includes(search);
  });
}

function renderFleetOverview() {
  const vehicles = state.filteredVehicles;
  const total = vehicles.length;
  const available = vehicles.filter((item) => item.status === "available").length;
  const maintenance = vehicles.filter((item) => item.status === "maintenance").length;
  const cleaning = vehicles.filter((item) => item.status === "cleaning").length;
  const inactive = vehicles.filter((item) => item.status === "inactive").length;
  const avgDailyRate =
    total === 0
      ? 0
      : vehicles.reduce((acc, item) => acc + Number(item.dailyRate || 0), 0) / total;

  const metrics = [
    { label: "Vehicles in view", value: total },
    { label: "Available", value: available },
    { label: "Maintenance", value: maintenance },
    { label: "Cleaning", value: cleaning },
    { label: "Inactive", value: inactive },
    { label: "Avg Daily Rate", value: formatMoney(avgDailyRate) },
  ];

  document.getElementById("fleet-overview-metrics").innerHTML = metrics
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

function renderVehicleList() {
  const container = document.getElementById("vehicle-list");
  if (state.filteredVehicles.length === 0) {
    container.innerHTML = "<p>No vehicles yet.</p>";
    renderPaginationControls("vehicle-pagination", null);
    return;
  }

  const paginated = paginateItems(state.filteredVehicles, state.vehiclePage, state.vehiclePageSize);
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
          <th>Action</th>
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
              <td><a href="/vehicle-profile.html?vehicleId=${encodeURIComponent(vehicle.id)}">Open Profile</a></td>
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

function populateCategoryFilter() {
  const categorySelect = document.getElementById("fleet-filter-category");
  const existing = String(categorySelect.value || "");
  const categories = Array.from(
    new Set(
      state.vehicles
        .map((vehicle) => String(vehicle.category || "").trim().toLowerCase())
        .filter(Boolean)
    )
  ).sort();

  categorySelect.innerHTML = `
    <option value="">All categories</option>
    ${categories.map((category) => `<option value="${category}">${category}</option>`).join("")}
  `;
  if (existing && categories.includes(existing)) {
    categorySelect.value = existing;
  }
}

function renderFleetPage() {
  state.filteredVehicles = getFilteredVehicles();
  renderFleetOverview();
  renderVehicleList();
}

async function loadFleetData() {
  state.vehicles = await request("/api/vehicles");
  populateCategoryFilter();
  state.vehiclePage = 1;
  renderFleetPage();
}

function applyFilterFormValues(formData) {
  state.filters.search = String(formData.get("search") || "");
  state.filters.status = String(formData.get("status") || "");
  state.filters.category = String(formData.get("category") || "");
}

function updateAddPanelVisibility() {
  const addPanel = document.getElementById("fleet-add-panel");
  const addButton = document.getElementById("fleet-add-toggle-btn");
  const visible = !addPanel.classList.contains("hidden");
  addButton.textContent = visible ? "Close Add Vehicle" : "+ Add Vehicle";
}

function toggleAddPanel(forceOpen = null) {
  const addPanel = document.getElementById("fleet-add-panel");
  if (!addPanel) {
    return;
  }
  const shouldOpen = forceOpen == null ? addPanel.classList.contains("hidden") : Boolean(forceOpen);
  addPanel.classList.toggle("hidden", !shouldOpen);
  updateAddPanelVisibility();
}

function setAddVehicleAvailability() {
  const addButton = document.getElementById("fleet-add-toggle-btn");
  const addPanel = document.getElementById("fleet-add-panel");
  const addForm = document.getElementById("vehicle-form");
  const editable = canEditVehicles();

  if (!editable) {
    if (addPanel) {
      addPanel.classList.add("hidden");
    }
    if (addButton) {
      addButton.setAttribute("disabled", "disabled");
      addButton.textContent = "No add permission";
    }
    if (addForm) {
      Array.from(addForm.elements).forEach((element) => {
        element.setAttribute("disabled", "disabled");
      });
    }
    return;
  }

  if (addButton) {
    addButton.removeAttribute("disabled");
    updateAddPanelVisibility();
  }
  if (addForm) {
    Array.from(addForm.elements).forEach((element) => {
      element.removeAttribute("disabled");
    });
  }
}

function attachHandlers() {
  const addForm = document.getElementById("vehicle-form");
  const addToggleButton = document.getElementById("fleet-add-toggle-btn");
  const filterForm = document.getElementById("fleet-filter-form");
  const resetFiltersButton = document.getElementById("fleet-filter-reset-btn");

  addToggleButton.addEventListener("click", () => {
    if (!canEditVehicles()) {
      showToast("You do not have permission to add vehicles.", true);
      return;
    }
    toggleAddPanel();
  });

  addForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!canEditVehicles()) {
      showToast("You do not have permission to add vehicles.", true);
      return;
    }

    const payload = Object.fromEntries(new FormData(addForm).entries());
    payload.features = collectCheckedValues(addForm, "features");

    try {
      await request("/api/vehicles", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showToast("Vehicle added.");
      addForm.reset();
      toggleAddPanel(false);
      await loadFleetData();
    } catch (error) {
      showToast(error.message, true);
    }
  });

  filterForm.addEventListener("input", () => {
    const formData = new FormData(filterForm);
    applyFilterFormValues(formData);
    state.vehiclePage = 1;
    renderFleetPage();
  });

  filterForm.addEventListener("change", () => {
    const formData = new FormData(filterForm);
    applyFilterFormValues(formData);
    state.vehiclePage = 1;
    renderFleetPage();
  });

  resetFiltersButton.addEventListener("click", () => {
    filterForm.reset();
    state.filters = {
      search: "",
      status: "",
      category: "",
    };
    state.vehiclePage = 1;
    renderFleetPage();
  });
}

async function bootstrap() {
  try {
    state.session = await sessionReady;
    attachHandlers();
    setAddVehicleAvailability();
    updateAddPanelVisibility();
    await loadFleetData();
    markPageReady("fleet");
  } catch (error) {
    showToast(error.message, true);
  }
}

bootstrap();
