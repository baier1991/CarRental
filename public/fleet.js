const {
  request,
  showToast,
  confirmAction,
  collectCheckedValues,
  formatMoney,
  sessionReady,
  markPageReady,
  paginateItems,
  renderPaginationControls,
} =
  window.AppCommon;

const EDITABLE_ROLES = new Set(["owner", "admin", "agent"]);
const SEARCH_DEBOUNCE_MS = 220;
const DEFAULT_FILTERS = {
  search: "",
  status: "",
  category: "",
  branch: "",
  minRate: "",
  maxRate: "",
  sort: "plate_asc",
};
const SORT_OPTIONS = new Set(["plate_asc", "rate_asc", "rate_desc", "year_desc", "status_asc"]);

const state = {
  session: null,
  allVehicles: [],
  filteredVehicles: [],
  vehiclePage: 1,
  vehiclePageSize: 8,
  filters: { ...DEFAULT_FILTERS },
  searchDebounceTimer: null,
};

function canEditVehicles() {
  const role = state.session && state.session.user ? state.session.user.role : null;
  return EDITABLE_ROLES.has(role);
}

function normalizeVehicleForFiltering(vehicle) {
  const dailyRate = Number(vehicle?.dailyRate);
  const year = Number(vehicle?.year);
  const searchable = [
    vehicle?.plateNumber,
    vehicle?.make,
    vehicle?.model,
    vehicle?.branchCode,
    vehicle?.location,
    vehicle?.category,
    vehicle?.status,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  return {
    ...vehicle,
    _searchIndex: searchable,
    _dailyRate: Number.isFinite(dailyRate) ? dailyRate : 0,
    _year: Number.isFinite(year) ? year : 0,
  };
}

function normalizeRateFilterValue(rawValue) {
  const normalized = String(rawValue ?? "").trim();
  if (!normalized) {
    return "";
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return "";
  }
  return String(parsed);
}

function getDailyRateBounds() {
  if (!state.allVehicles.length) {
    return { min: 0, max: 0 };
  }
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  state.allVehicles.forEach((vehicle) => {
    const rate = Number(vehicle?._dailyRate);
    if (!Number.isFinite(rate)) {
      return;
    }
    if (rate < min) {
      min = rate;
    }
    if (rate > max) {
      max = rate;
    }
  });
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 0 };
  }
  return { min, max };
}

function getEffectiveRateFilters() {
  const minRateRaw = String(state.filters.minRate || "").trim();
  const maxRateRaw = String(state.filters.maxRate || "").trim();
  const minRate = Number(minRateRaw);
  const maxRate = Number(maxRateRaw);
  const hasMinInput = minRateRaw.length > 0 && Number.isFinite(minRate) && minRate >= 0;
  const hasMaxInput = maxRateRaw.length > 0 && Number.isFinite(maxRate) && maxRate >= 0;
  if (!state.allVehicles.length) {
    return { minRate, maxRate, hasMinRate: false, hasMaxRate: false };
  }
  const bounds = getDailyRateBounds();
  const hasMinRate = hasMinInput && minRate > bounds.min;
  const hasMaxRate = hasMaxInput && maxRate < bounds.max;
  return { minRate, maxRate, hasMinRate, hasMaxRate };
}

function sortVehicles(items, sortBy) {
  const sorted = [...items];
  switch (sortBy) {
    case "rate_asc":
      sorted.sort((a, b) => a._dailyRate - b._dailyRate);
      return sorted;
    case "rate_desc":
      sorted.sort((a, b) => b._dailyRate - a._dailyRate);
      return sorted;
    case "year_desc":
      sorted.sort((a, b) => b._year - a._year || String(a.plateNumber || "").localeCompare(String(b.plateNumber || "")));
      return sorted;
    case "status_asc":
      sorted.sort((a, b) => String(a.status || "").localeCompare(String(b.status || "")));
      return sorted;
    case "plate_asc":
    default:
      sorted.sort((a, b) => String(a.plateNumber || "").localeCompare(String(b.plateNumber || "")));
      return sorted;
  }
}

function getFilteredVehicles() {
  const search = String(state.filters.search || "").trim().toLowerCase();
  const status = String(state.filters.status || "").trim().toLowerCase();
  const category = String(state.filters.category || "").trim().toLowerCase();
  const branch = String(state.filters.branch || "").trim().toUpperCase();
  const { minRate, maxRate, hasMinRate, hasMaxRate } = getEffectiveRateFilters();
  const filtered = state.allVehicles.filter((vehicle) => {
    if (status && String(vehicle.status || "").toLowerCase() !== status) {
      return false;
    }
    if (category && String(vehicle.category || "").toLowerCase() !== category) {
      return false;
    }
    if (branch && String(vehicle.branchCode || "").toUpperCase() !== branch) {
      return false;
    }
    if (hasMinRate && vehicle._dailyRate < minRate) {
      return false;
    }
    if (hasMaxRate && vehicle._dailyRate > maxRate) {
      return false;
    }
    if (!search) {
      return true;
    }
    return String(vehicle._searchIndex || "").includes(search);
  });
  return sortVehicles(filtered, state.filters.sort);
}

function renderFleetOverview() {
  const metricsContainer = document.getElementById("fleet-overview-metrics");
  if (!metricsContainer) {
    return;
  }

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

function renderVehicleList() {
  const container = document.getElementById("vehicle-list");
  if (!container) {
    return;
  }
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
    renderFleetPage();
  });
}

function populateCategoryFilter(selectedCategory = state.filters.category) {
  const categorySelect = document.getElementById("fleet-filter-category");
  if (!categorySelect) {
    return;
  }
  const categories = Array.from(
    new Set(
      state.allVehicles
        .map((vehicle) => String(vehicle.category || "").trim().toLowerCase())
        .filter(Boolean)
    )
  ).sort();

  categorySelect.innerHTML = `
    <option value="">All categories</option>
    ${categories.map((category) => `<option value="${category}">${category}</option>`).join("")}
  `;
  if (selectedCategory && categories.includes(selectedCategory)) {
    categorySelect.value = selectedCategory;
  }
}

function populateBranchFilter(selectedBranch = state.filters.branch) {
  const branchSelect = document.getElementById("fleet-filter-branch");
  if (!branchSelect) {
    return;
  }
  const branches = Array.from(
    new Set(
      state.allVehicles
        .map((vehicle) => String(vehicle.branchCode || "").trim().toUpperCase())
        .filter(Boolean)
    )
  ).sort();

  branchSelect.innerHTML = `
    <option value="">All branches</option>
    ${branches.map((branch) => `<option value="${branch}">${branch}</option>`).join("")}
  `;
  if (selectedBranch && branches.includes(selectedBranch)) {
    branchSelect.value = selectedBranch;
  }
}

function renderFilterSummary() {
  const summary = document.getElementById("fleet-filter-summary");
  if (!summary) {
    return;
  }
  const total = state.allVehicles.length;
  const visible = state.filteredVehicles.length;
  const rateFilters = getEffectiveRateFilters();
  const activeFilterCount = ["search", "status", "category", "branch"].reduce(
    (count, key) => count + (String(state.filters[key] || "").trim() ? 1 : 0),
    0
  ) + (rateFilters.hasMinRate ? 1 : 0) + (rateFilters.hasMaxRate ? 1 : 0);
  summary.textContent =
    activeFilterCount > 0
      ? `Showing ${visible} of ${total} vehicles (${activeFilterCount} active filters)`
      : `Showing ${visible} vehicles`;
}

function syncStatusQuickFilters() {
  const quickFilters = document.getElementById("fleet-status-quick-filters");
  if (!quickFilters) {
    return;
  }
  const activeStatus = String(state.filters.status || "").trim().toLowerCase();
  Array.from(quickFilters.querySelectorAll("button[data-status]")).forEach((button) => {
    const buttonStatus = String(button.dataset.status || "").trim().toLowerCase();
    button.classList.toggle("active", buttonStatus === activeStatus);
  });
}

function renderActiveFilterPills() {
  const container = document.getElementById("fleet-active-filters");
  if (!container) {
    return;
  }
  const pills = [];
  if (state.filters.search) {
    pills.push({ key: "search", label: `Search: ${state.filters.search}` });
  }
  if (state.filters.status) {
    pills.push({ key: "status", label: `Status: ${state.filters.status}` });
  }
  if (state.filters.category) {
    pills.push({ key: "category", label: `Category: ${state.filters.category}` });
  }
  if (state.filters.branch) {
    pills.push({ key: "branch", label: `Branch: ${state.filters.branch}` });
  }
  const rateFilters = getEffectiveRateFilters();
  if (rateFilters.hasMinRate) {
    pills.push({ key: "minRate", label: `Min rate: ${formatMoney(state.filters.minRate)}` });
  }
  if (rateFilters.hasMaxRate) {
    pills.push({ key: "maxRate", label: `Max rate: ${formatMoney(state.filters.maxRate)}` });
  }

  if (!pills.length) {
    container.classList.add("hidden");
    container.innerHTML = "";
    return;
  }

  container.classList.remove("hidden");
  container.innerHTML = "";
  pills.forEach((pill) => {
    const pillElement = document.createElement("span");
    pillElement.className = "filter-pill";
    pillElement.append(document.createTextNode(pill.label));

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.setAttribute("aria-label", `Clear ${pill.label}`);
    clearButton.dataset.clearFilter = pill.key;
    clearButton.textContent = "\u00D7";
    pillElement.append(clearButton);

    container.append(pillElement);
  });
}

function renderFleetPage() {
  state.filteredVehicles = getFilteredVehicles();
  renderFilterSummary();
  renderActiveFilterPills();
  syncStatusQuickFilters();
  renderFleetOverview();
  renderVehicleList();
  syncFiltersToUrl();
}

async function loadFleetData() {
  const vehicles = await request("/api/vehicles");
  state.allVehicles = Array.isArray(vehicles) ? vehicles.map((vehicle) => normalizeVehicleForFiltering(vehicle)) : [];
  populateCategoryFilter();
  populateBranchFilter();
  syncFilterFormFromState();
  renderFleetPage();
}

function applyFilterFormValues(formData) {
  state.filters.search = String(formData.get("search") || "");
  state.filters.status = String(formData.get("status") || "");
  state.filters.category = String(formData.get("category") || "").trim().toLowerCase();
  state.filters.branch = String(formData.get("branch") || "").trim().toUpperCase();
  let minRate = normalizeRateFilterValue(formData.get("minRate"));
  let maxRate = normalizeRateFilterValue(formData.get("maxRate"));
  if (minRate && maxRate && Number(minRate) > Number(maxRate)) {
    [minRate, maxRate] = [maxRate, minRate];
  }
  state.filters.minRate = minRate;
  state.filters.maxRate = maxRate;
  const sort = String(formData.get("sort") || DEFAULT_FILTERS.sort);
  state.filters.sort = SORT_OPTIONS.has(sort) ? sort : DEFAULT_FILTERS.sort;
}

function syncFilterFormFromState() {
  const filterForm = document.getElementById("fleet-filter-form");
  if (!filterForm) {
    return;
  }
  if (filterForm.elements.search) {
    filterForm.elements.search.value = state.filters.search;
  }
  if (filterForm.elements.status) {
    filterForm.elements.status.value = state.filters.status;
  }
  if (filterForm.elements.category && typeof filterForm.elements.category.value !== "undefined") {
    filterForm.elements.category.value = state.filters.category;
  }
  if (filterForm.elements.branch && typeof filterForm.elements.branch.value !== "undefined") {
    filterForm.elements.branch.value = state.filters.branch;
  }
  if (filterForm.elements.minRate) {
    filterForm.elements.minRate.value = state.filters.minRate;
  }
  if (filterForm.elements.maxRate) {
    filterForm.elements.maxRate.value = state.filters.maxRate;
  }
  if (filterForm.elements.sort) {
    filterForm.elements.sort.value = state.filters.sort;
  }
}

function initializeFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  state.filters.search = params.get("search") || DEFAULT_FILTERS.search;
  state.filters.status = params.get("status") || DEFAULT_FILTERS.status;
  state.filters.category = params.get("category") || DEFAULT_FILTERS.category;
  state.filters.branch = params.get("branch") || DEFAULT_FILTERS.branch;
  state.filters.minRate = normalizeRateFilterValue(params.get("minRate"));
  state.filters.maxRate = normalizeRateFilterValue(params.get("maxRate"));
  const sort = params.get("sort") || DEFAULT_FILTERS.sort;
  state.filters.sort = SORT_OPTIONS.has(sort) ? sort : DEFAULT_FILTERS.sort;

  const page = Number(params.get("page"));
  state.vehiclePage = Number.isFinite(page) && page > 0 ? page : 1;
}

function syncFiltersToUrl() {
  const url = new URL(window.location.href);
  const params = url.searchParams;

  const setParam = (key, value, defaultValue = "") => {
    if (String(value || "") === String(defaultValue || "")) {
      params.delete(key);
      return;
    }
    params.set(key, value);
  };

  setParam("search", String(state.filters.search || "").trim(), DEFAULT_FILTERS.search);
  setParam("status", state.filters.status, DEFAULT_FILTERS.status);
  setParam("category", state.filters.category, DEFAULT_FILTERS.category);
  setParam("branch", state.filters.branch, DEFAULT_FILTERS.branch);
  setParam("minRate", state.filters.minRate, DEFAULT_FILTERS.minRate);
  setParam("maxRate", state.filters.maxRate, DEFAULT_FILTERS.maxRate);
  setParam("sort", state.filters.sort, DEFAULT_FILTERS.sort);
  if (state.vehiclePage > 1) {
    params.set("page", String(state.vehiclePage));
  } else {
    params.delete("page");
  }
  window.history.replaceState({}, "", `${url.pathname}${params.toString() ? `?${params.toString()}` : ""}`);
}

function clearSearchDebounce() {
  if (state.searchDebounceTimer) {
    window.clearTimeout(state.searchDebounceTimer);
    state.searchDebounceTimer = null;
  }
}

function updateAddPanelVisibility() {
  const addPanel = document.getElementById("fleet-add-panel");
  const addButton = document.getElementById("fleet-add-toggle-btn");
  if (!addPanel || !addButton) {
    return;
  }
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
  const statusQuickFilters = document.getElementById("fleet-status-quick-filters");
  const activeFilters = document.getElementById("fleet-active-filters");

  if (addToggleButton) {
    addToggleButton.dataset.handlerBound = "true";
    addToggleButton.addEventListener("click", () => {
      if (!canEditVehicles()) {
        showToast("You do not have permission to add vehicles.", true);
        return;
      }
      toggleAddPanel();
    });
  }

  if (addForm) {
    addForm.dataset.handlerBound = "true";
    addForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!canEditVehicles()) {
        showToast("You do not have permission to add vehicles.", true);
        return;
      }

      const payload = Object.fromEntries(new FormData(addForm).entries());
      payload.features = collectCheckedValues(addForm, "features");

      if (!confirmAction(`Create vehicle ${payload.plateNumber || ""}?`)) {
        return;
      }

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
  }

  if (filterForm) {
    filterForm.dataset.handlerBound = "true";
    filterForm.addEventListener("input", () => {
      const formData = new FormData(filterForm);
      applyFilterFormValues(formData);
      clearSearchDebounce();
      state.searchDebounceTimer = window.setTimeout(() => {
        state.vehiclePage = 1;
        renderFleetPage();
      }, SEARCH_DEBOUNCE_MS);
    });

    filterForm.addEventListener("change", () => {
      clearSearchDebounce();
      const formData = new FormData(filterForm);
      applyFilterFormValues(formData);
      state.vehiclePage = 1;
      renderFleetPage();
    });
  }

  if (resetFiltersButton && filterForm) {
    resetFiltersButton.addEventListener("click", () => {
      clearSearchDebounce();
      state.filters = { ...DEFAULT_FILTERS };
      state.vehiclePage = 1;
      populateCategoryFilter();
      populateBranchFilter();
      syncFilterFormFromState();
      renderFleetPage();
    });
  }

  if (statusQuickFilters && filterForm) {
    statusQuickFilters.dataset.handlerBound = "true";
    statusQuickFilters.addEventListener("click", (event) => {
      if (!event.target || typeof event.target.closest !== "function") {
        return;
      }
      const button = event.target.closest("button[data-status]");
      if (!button) {
        return;
      }
      const nextStatus = String(button.dataset.status || "").trim().toLowerCase();
      state.filters.status = nextStatus;
      if (filterForm.elements.status) {
        filterForm.elements.status.value = nextStatus;
      }
      state.vehiclePage = 1;
      renderFleetPage();
    });
  }

  if (activeFilters && filterForm) {
    activeFilters.dataset.handlerBound = "true";
    activeFilters.addEventListener("click", (event) => {
      if (!event.target || typeof event.target.closest !== "function") {
        return;
      }
      const clearButton = event.target.closest("button[data-clear-filter]");
      if (!clearButton) {
        return;
      }
      const key = String(clearButton.dataset.clearFilter || "");
      if (!Object.prototype.hasOwnProperty.call(state.filters, key)) {
        return;
      }
      state.filters[key] = DEFAULT_FILTERS[key] ?? "";
      syncFilterFormFromState();
      state.vehiclePage = 1;
      renderFleetPage();
    });
  }
}

async function bootstrap() {
  try {
    state.session = await sessionReady;
    initializeFiltersFromUrl();
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
