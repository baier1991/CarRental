/* Safety fallback: render key lists when main page script fails. */
(function () {
  var APP_BOOT_KEY = "__carRentalBoot";

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatMoney(value) {
    var amount = Number(value);
    if (!isFinite(amount)) {
      amount = 0;
    }
    return "$" + amount.toFixed(2);
  }

  function requestJson(url, callback) {
    var xhr = new XMLHttpRequest();
    var requestUrl = String(url).indexOf("?") >= 0 ? url + "&_ts=" + Date.now() : url + "?_ts=" + Date.now();
    xhr.open("GET", requestUrl, true);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Cache-Control", "no-cache");
    xhr.setRequestHeader("Pragma", "no-cache");
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) {
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        callback(new Error("Request failed"), null);
        return;
      }
      try {
        callback(null, JSON.parse(xhr.responseText || "null"));
      } catch (_error) {
        callback(new Error("Invalid JSON"), null);
      }
    };
    xhr.send();
  }

  function isElementEffectivelyEmpty(element) {
    if (!element) {
      return false;
    }
    return String(element.textContent || "").trim().length === 0;
  }

  function getBootState() {
    var bootState = window[APP_BOOT_KEY];
    if (!bootState || typeof bootState !== "object") {
      return { bootDetected: false, pageStatus: {} };
    }
    if (!bootState.pageStatus || typeof bootState.pageStatus !== "object") {
      bootState.pageStatus = {};
    }
    return bootState;
  }

  function getPageKey() {
    if (isVehicleProfilePath()) {
      return "vehicle-profile";
    }
    return (document.body && document.body.getAttribute("data-page")) || "";
  }

  function isMainPageReady(page) {
    var bootState = getBootState();
    return Boolean(bootState.pageStatus && bootState.pageStatus[page] === "ready");
  }

  function normalizeFleetVehicles(vehicles) {
    var safeVehicles = Array.isArray(vehicles) ? vehicles : [];
    return safeVehicles.map(function (vehicle) {
      var dailyRate = Number(vehicle && vehicle.dailyRate);
      var year = Number(vehicle && vehicle.year);
      var searchIndex = [
        vehicle && vehicle.plateNumber,
        vehicle && vehicle.make,
        vehicle && vehicle.model,
        vehicle && vehicle.branchCode,
        vehicle && vehicle.location,
        vehicle && vehicle.category,
        vehicle && vehicle.status,
      ]
        .map(function (value) {
          return String(value || "").toLowerCase();
        })
        .join(" ");
      return {
        original: vehicle || {},
        searchIndex: searchIndex,
        dailyRate: isFinite(dailyRate) ? dailyRate : 0,
        year: isFinite(year) ? year : 0,
      };
    });
  }

  function sortFleetVehicles(items, sortBy) {
    var sorted = items.slice();
    if (sortBy === "rate_asc") {
      sorted.sort(function (a, b) { return a.dailyRate - b.dailyRate; });
      return sorted;
    }
    if (sortBy === "rate_desc") {
      sorted.sort(function (a, b) { return b.dailyRate - a.dailyRate; });
      return sorted;
    }
    if (sortBy === "year_desc") {
      sorted.sort(function (a, b) {
        if (b.year !== a.year) {
          return b.year - a.year;
        }
        return String(a.original && a.original.plateNumber || "").localeCompare(String(b.original && b.original.plateNumber || ""));
      });
      return sorted;
    }
    if (sortBy === "status_asc") {
      sorted.sort(function (a, b) {
        return String(a.original && a.original.status || "").localeCompare(String(b.original && b.original.status || ""));
      });
      return sorted;
    }
    sorted.sort(function (a, b) {
      return String(a.original && a.original.plateNumber || "").localeCompare(String(b.original && b.original.plateNumber || ""));
    });
    return sorted;
  }

  function getFleetFiltersFromForm() {
    var form = document.getElementById("fleet-filter-form");
    if (!form) {
      return {
        search: "",
        status: "",
        category: "",
        branch: "",
        minRate: "",
        maxRate: "",
        sort: "plate_asc",
      };
    }
    var minRateRaw = String(form.elements.minRate ? form.elements.minRate.value : "").trim();
    var maxRateRaw = String(form.elements.maxRate ? form.elements.maxRate.value : "").trim();
    var minRateNumber = Number(minRateRaw);
    var maxRateNumber = Number(maxRateRaw);
    if (isFinite(minRateNumber) && isFinite(maxRateNumber) && minRateNumber >= 0 && maxRateNumber >= 0 && minRateNumber > maxRateNumber) {
      var temp = minRateNumber;
      minRateNumber = maxRateNumber;
      maxRateNumber = temp;
    }
    return {
      search: String(form.elements.search ? form.elements.search.value : "").trim().toLowerCase(),
      status: String(form.elements.status ? form.elements.status.value : "").trim().toLowerCase(),
      category: String(form.elements.category ? form.elements.category.value : "").trim().toLowerCase(),
      branch: String(form.elements.branch ? form.elements.branch.value : "").trim().toUpperCase(),
      minRate: isFinite(minRateNumber) && minRateNumber >= 0 ? String(minRateNumber) : "",
      maxRate: isFinite(maxRateNumber) && maxRateNumber >= 0 ? String(maxRateNumber) : "",
      sort: String(form.elements.sort ? form.elements.sort.value : "plate_asc"),
    };
  }

  function clearFleetFallbackRateInputsIfNoUrlParams() {
    var params = new URLSearchParams(window.location.search || "");
    if (params.has("minRate") || params.has("maxRate")) {
      return;
    }
    var form = document.getElementById("fleet-filter-form");
    if (!form) {
      return;
    }
    if (form.elements.minRate && form.elements.minRate.value) {
      form.elements.minRate.value = "";
    }
    if (form.elements.maxRate && form.elements.maxRate.value) {
      form.elements.maxRate.value = "";
    }
  }

  function filterFleetVehicles(normalizedVehicles, filters) {
    var effectiveRateFilters = getFleetEffectiveRateFilters(normalizedVehicles, filters);
    var minRate = effectiveRateFilters.minRate;
    var maxRate = effectiveRateFilters.maxRate;
    var hasMinRate = effectiveRateFilters.hasMinRate;
    var hasMaxRate = effectiveRateFilters.hasMaxRate;
    var filtered = normalizedVehicles.filter(function (item) {
      var vehicle = item.original || {};
      if (filters.status && String(vehicle.status || "").toLowerCase() !== filters.status) {
        return false;
      }
      if (filters.category && String(vehicle.category || "").toLowerCase() !== filters.category) {
        return false;
      }
      if (filters.branch && String(vehicle.branchCode || "").toUpperCase() !== filters.branch) {
        return false;
      }
      if (hasMinRate && item.dailyRate < minRate) {
        return false;
      }
      if (hasMaxRate && item.dailyRate > maxRate) {
        return false;
      }
      if (filters.search && item.searchIndex.indexOf(filters.search) < 0) {
        return false;
      }
      return true;
    });
    return sortFleetVehicles(filtered, filters.sort);
  }

  function getFleetRateBounds(normalizedVehicles) {
    if (!normalizedVehicles || normalizedVehicles.length === 0) {
      return { min: 0, max: 0 };
    }
    var min = Number.POSITIVE_INFINITY;
    var max = Number.NEGATIVE_INFINITY;
    for (var i = 0; i < normalizedVehicles.length; i += 1) {
      var rate = Number(normalizedVehicles[i] && normalizedVehicles[i].dailyRate);
      if (!isFinite(rate)) {
        continue;
      }
      if (rate < min) {
        min = rate;
      }
      if (rate > max) {
        max = rate;
      }
    }
    if (!isFinite(min) || !isFinite(max)) {
      return { min: 0, max: 0 };
    }
    return { min: min, max: max };
  }

  function getFleetEffectiveRateFilters(normalizedVehicles, filters) {
    var minRaw = String(filters && filters.minRate || "").trim();
    var maxRaw = String(filters && filters.maxRate || "").trim();
    var minRate = Number(minRaw);
    var maxRate = Number(maxRaw);
    var hasMinInput = minRaw.length > 0 && isFinite(minRate) && minRate >= 0;
    var hasMaxInput = maxRaw.length > 0 && isFinite(maxRate) && maxRate >= 0;
    if (!normalizedVehicles || normalizedVehicles.length === 0) {
      return { minRate: minRate, maxRate: maxRate, hasMinRate: false, hasMaxRate: false };
    }
    var bounds = getFleetRateBounds(normalizedVehicles);
    return {
      minRate: minRate,
      maxRate: maxRate,
      hasMinRate: hasMinInput && minRate > bounds.min,
      hasMaxRate: hasMaxInput && maxRate < bounds.max,
    };
  }

  function renderFleetList(filteredItems) {
    var listContainer = document.getElementById("vehicle-list");
    if (!listContainer) {
      return;
    }
    if (filteredItems.length === 0) {
      listContainer.innerHTML = "<p>No vehicles yet.</p>";
      return;
    }

    var rows = [];
    for (var i = 0; i < filteredItems.length; i += 1) {
      var vehicle = filteredItems[i].original || {};
      rows.push(
        "<tr>" +
          "<td>" +
          escapeHtml(vehicle.plateNumber || "") +
          "</td>" +
          "<td>" +
          escapeHtml((vehicle.year || "") + " " + (vehicle.make || "") + " " + (vehicle.model || "")) +
          "</td>" +
          "<td>" +
          escapeHtml(vehicle.category || "n/a") +
          "</td>" +
          "<td>Day: " +
          escapeHtml(formatMoney(vehicle.dailyRate || 0)) +
          "</td>" +
          "<td><span class=\"badge\">" +
          escapeHtml(vehicle.status || "n/a") +
          "</span></td>" +
          "<td>" +
          escapeHtml(vehicle.branchCode || "n/a") +
          "<br /><small>" +
          escapeHtml(vehicle.location || "n/a") +
          "</small></td>" +
          "<td><a href=\"/vehicle-profile.html?vehicleId=" +
          encodeURIComponent(vehicle.id || "") +
          "\">Open Profile</a></td>" +
          "</tr>"
      );
    }

    listContainer.innerHTML =
      "<table>" +
      "<thead><tr><th>Plate</th><th>Vehicle</th><th>Category</th><th>Rates</th><th>Status</th><th>Branch / Location</th><th>Action</th></tr></thead>" +
      "<tbody>" +
      rows.join("") +
      "</tbody>" +
      "</table>";
  }

  function renderFleetMetrics(filteredItems) {
    var metricsContainer = document.getElementById("fleet-overview-metrics");
    if (!metricsContainer) {
      return;
    }
    var total = filteredItems.length;
    var available = 0;
    var sumDaily = 0;
    for (var i = 0; i < filteredItems.length; i += 1) {
      var vehicle = filteredItems[i].original || {};
      if (vehicle.status === "available") {
        available += 1;
      }
      sumDaily += Number(vehicle.dailyRate || 0);
    }
    var avgRate = total > 0 ? sumDaily / total : 0;
    metricsContainer.innerHTML =
      '<div class="metric"><div class="label">Vehicles in view</div><div class="value">' +
      total +
      '</div></div><div class="metric"><div class="label">Available</div><div class="value">' +
      available +
      '</div></div><div class="metric"><div class="label">Avg Daily Rate</div><div class="value">' +
      escapeHtml(formatMoney(avgRate)) +
      "</div></div>";
  }

  function renderFleetFilterSummary(totalCount, visibleCount, filters) {
    var summary = document.getElementById("fleet-filter-summary");
    if (!summary) {
      return;
    }
    var activeCount = 0;
    if (filters.search) activeCount += 1;
    if (filters.status) activeCount += 1;
    if (filters.category) activeCount += 1;
    if (filters.branch) activeCount += 1;
    if (filters._hasMinRate) activeCount += 1;
    if (filters._hasMaxRate) activeCount += 1;
    summary.textContent =
      activeCount > 0
        ? "Showing " + visibleCount + " of " + totalCount + " vehicles (" + activeCount + " active filters)"
        : "Showing " + visibleCount + " vehicles";
  }

  function syncFleetFallbackStatusQuickFilters(filters) {
    var quickFilters = document.getElementById("fleet-status-quick-filters");
    if (!quickFilters) {
      return;
    }
    var activeStatus = String(filters && filters.status || "").trim().toLowerCase();
    var buttons = quickFilters.querySelectorAll("button[data-status]");
    for (var i = 0; i < buttons.length; i += 1) {
      var buttonStatus = String(buttons[i].dataset.status || "").trim().toLowerCase();
      buttons[i].classList.toggle("active", buttonStatus === activeStatus);
    }
  }

  function renderFleetFallbackActiveFilters(filters) {
    var container = document.getElementById("fleet-active-filters");
    if (!container) {
      return;
    }
    var pills = [];
    if (filters.search) pills.push({ key: "search", label: "Search: " + filters.search });
    if (filters.status) pills.push({ key: "status", label: "Status: " + filters.status });
    if (filters.category) pills.push({ key: "category", label: "Category: " + filters.category });
    if (filters.branch) pills.push({ key: "branch", label: "Branch: " + filters.branch });
    if (filters._hasMinRate) pills.push({ key: "minRate", label: "Min rate: " + formatMoney(filters.minRate) });
    if (filters._hasMaxRate) pills.push({ key: "maxRate", label: "Max rate: " + formatMoney(filters.maxRate) });

    if (!pills.length) {
      container.classList.add("hidden");
      container.innerHTML = "";
      return;
    }

    var html = [];
    for (var i = 0; i < pills.length; i += 1) {
      html.push(
        '<span class="filter-pill">' +
          escapeHtml(pills[i].label) +
          '<button type="button" aria-label="Clear ' +
          escapeHtml(pills[i].label) +
          '" data-clear-filter="' +
          escapeHtml(pills[i].key) +
          '">&times;</button></span>'
      );
    }
    container.classList.remove("hidden");
    container.innerHTML = html.join("");
  }

  function populateFleetFallbackFilterOptions(normalizedVehicles) {
    var categorySelect = document.getElementById("fleet-filter-category");
    var branchSelect = document.getElementById("fleet-filter-branch");

    if (categorySelect && categorySelect.options.length <= 1) {
      var categories = [];
      for (var i = 0; i < normalizedVehicles.length; i += 1) {
        var category = String(normalizedVehicles[i].original && normalizedVehicles[i].original.category || "").trim().toLowerCase();
        if (category && categories.indexOf(category) < 0) {
          categories.push(category);
        }
      }
      categories.sort();
      var categoryOptions = ['<option value="">All categories</option>'];
      for (var j = 0; j < categories.length; j += 1) {
        categoryOptions.push('<option value="' + escapeHtml(categories[j]) + '">' + escapeHtml(categories[j]) + "</option>");
      }
      categorySelect.innerHTML = categoryOptions.join("");
    }

    if (branchSelect && branchSelect.options.length <= 1) {
      var branches = [];
      for (var k = 0; k < normalizedVehicles.length; k += 1) {
        var branch = String(normalizedVehicles[k].original && normalizedVehicles[k].original.branchCode || "").trim().toUpperCase();
        if (branch && branches.indexOf(branch) < 0) {
          branches.push(branch);
        }
      }
      branches.sort();
      var branchOptions = ['<option value="">All branches</option>'];
      for (var m = 0; m < branches.length; m += 1) {
        branchOptions.push('<option value="' + escapeHtml(branches[m]) + '">' + escapeHtml(branches[m]) + "</option>");
      }
      branchSelect.innerHTML = branchOptions.join("");
    }
  }

  function renderFleetFallback(vehicles) {
    clearFleetFallbackRateInputsIfNoUrlParams();
    var normalizedVehicles = normalizeFleetVehicles(vehicles);
    var filters = getFleetFiltersFromForm();
    var rateFilters = getFleetEffectiveRateFilters(normalizedVehicles, filters);
    filters._hasMinRate = rateFilters.hasMinRate;
    filters._hasMaxRate = rateFilters.hasMaxRate;
    var filtered = filterFleetVehicles(normalizedVehicles, filters);
    renderFleetMetrics(filtered);
    renderFleetList(filtered);
    renderFleetFilterSummary(normalizedVehicles.length, filtered.length, filters);
    syncFleetFallbackStatusQuickFilters(filters);
    renderFleetFallbackActiveFilters(filters);
  }

  function bindFleetFallbackInteractions() {
    var addButton = document.getElementById("fleet-add-toggle-btn");
    var addPanel = document.getElementById("fleet-add-panel");
    var addForm = document.getElementById("vehicle-form");

    if (addButton && addPanel && addButton.dataset.handlerBound !== "true" && addButton.dataset.fallbackBound !== "true") {
      addButton.dataset.fallbackBound = "true";
      if (addButton.hasAttribute("disabled")) {
        addButton.removeAttribute("disabled");
      }

      var syncAddButtonLabel = function () {
        var isOpen = !addPanel.classList.contains("hidden");
        addButton.textContent = isOpen ? "Close Add Vehicle" : "+ Add Vehicle";
      };

      syncAddButtonLabel();
      addButton.addEventListener("click", function () {
        addPanel.classList.toggle("hidden");
        syncAddButtonLabel();
      });
    }

    if (addForm && addForm.dataset.handlerBound !== "true" && addForm.dataset.fallbackSubmitBound !== "true") {
      addForm.dataset.fallbackSubmitBound = "true";
      addForm.addEventListener("submit", function (event) {
        event.preventDefault();
        var formData = new FormData(addForm);
        var payload = {};
        formData.forEach(function (value, key) {
          if (key === "features") {
            return;
          }
          payload[key] = value;
        });
        payload.features = formData.getAll("features");

        if (typeof window.confirm === "function" && !window.confirm("Create vehicle " + (payload.plateNumber || "") + "?")) {
          return;
        }

        var xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/vehicles", true);
        xhr.withCredentials = true;
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) {
            return;
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            window.location.reload();
            return;
          }
          var errorMessage = "Vehicle create failed.";
          try {
            var errorData = JSON.parse(xhr.responseText || "{}");
            if (errorData && errorData.error) {
              errorMessage = errorData.error;
            }
          } catch (_error) {
            // Ignore parse errors
          }
          if (window.AppCommon && typeof window.AppCommon.showToast === "function") {
            window.AppCommon.showToast(errorMessage, true);
          } else {
            window.alert(errorMessage);
          }
        };
        xhr.send(JSON.stringify(payload));
      });
    }
  }

  function bindFleetFallbackFiltering(vehicles) {
    clearFleetFallbackRateInputsIfNoUrlParams();
    var normalizedVehicles = normalizeFleetVehicles(vehicles);
    var filterForm = document.getElementById("fleet-filter-form");
    var resetButton = document.getElementById("fleet-filter-reset-btn");
    var quickFilters = document.getElementById("fleet-status-quick-filters");
    var activeFilters = document.getElementById("fleet-active-filters");
    if (!filterForm || filterForm.dataset.fallbackBound === "true") {
      return;
    }

    filterForm.dataset.fallbackBound = "true";
    populateFleetFallbackFilterOptions(normalizedVehicles);

    var searchTimer = null;
    var apply = function () {
      var filters = getFleetFiltersFromForm();
      var rateFilters = getFleetEffectiveRateFilters(normalizedVehicles, filters);
      filters._hasMinRate = rateFilters.hasMinRate;
      filters._hasMaxRate = rateFilters.hasMaxRate;
      var filtered = filterFleetVehicles(normalizedVehicles, filters);
      renderFleetMetrics(filtered);
      renderFleetList(filtered);
      renderFleetFilterSummary(normalizedVehicles.length, filtered.length, filters);
      syncFleetFallbackStatusQuickFilters(filters);
      renderFleetFallbackActiveFilters(filters);
    };

    filterForm.addEventListener("input", function () {
      if (searchTimer) {
        clearTimeout(searchTimer);
      }
      searchTimer = setTimeout(apply, 220);
    });

    filterForm.addEventListener("change", function () {
      if (searchTimer) {
        clearTimeout(searchTimer);
      }
      apply();
    });

    if (resetButton) {
      resetButton.addEventListener("click", function () {
        filterForm.reset();
        apply();
      });
    }

    if (quickFilters && quickFilters.dataset.fallbackBound !== "true") {
      quickFilters.dataset.fallbackBound = "true";
      quickFilters.addEventListener("click", function (event) {
        var target = event.target;
        if (!target || !target.closest) {
          return;
        }
        var button = target.closest("button[data-status]");
        if (!button) {
          return;
        }
        if (filterForm.elements.status) {
          filterForm.elements.status.value = String(button.dataset.status || "").trim().toLowerCase();
        }
        apply();
      });
    }

    if (activeFilters && activeFilters.dataset.fallbackBound !== "true") {
      activeFilters.dataset.fallbackBound = "true";
      activeFilters.addEventListener("click", function (event) {
        var target = event.target;
        if (!target || !target.closest) {
          return;
        }
        var clearButton = target.closest("button[data-clear-filter]");
        if (!clearButton) {
          return;
        }
        var key = String(clearButton.dataset.clearFilter || "");
        if (filterForm.elements[key]) {
          filterForm.elements[key].value = "";
        }
        apply();
      });
    }
    apply();
  }

  function renderCustomersFallback(customers, reservations) {
    var listContainer = document.getElementById("customer-list");
    if (!listContainer || !isElementEffectivelyEmpty(listContainer)) {
      return;
    }

    var safeCustomers = Array.isArray(customers) ? customers : [];
    if (safeCustomers.length === 0) {
      listContainer.innerHTML = "<p>No customers yet.</p>";
    } else {
      var rows = [];
      for (var i = 0; i < safeCustomers.length; i += 1) {
        var customer = safeCustomers[i] || {};
        var createdAt = customer.createdAt ? String(customer.createdAt).slice(0, 10) : "n/a";
        rows.push(
          "<tr>" +
            "<td>" +
            escapeHtml((customer.firstName || "") + " " + (customer.lastName || "")) +
            "</td>" +
            "<td>" +
            escapeHtml(customer.email || "") +
            "</td>" +
            "<td>" +
            escapeHtml(customer.phone || "") +
            "</td>" +
            "<td>" +
            escapeHtml(customer.licenseNumber || "") +
            "</td>" +
            "<td>" +
            escapeHtml(createdAt) +
            "</td>" +
            "</tr>"
        );
      }
      listContainer.innerHTML =
        "<table>" +
        "<thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>License</th><th>Created</th></tr></thead>" +
        "<tbody>" +
        rows.join("") +
        "</tbody>" +
        "</table>";
    }

    var metricsContainer = document.getElementById("customer-metrics");
    if (!metricsContainer || !isElementEffectivelyEmpty(metricsContainer)) {
      return;
    }
    var safeReservations = Array.isArray(reservations) ? reservations : [];
    var activeCustomerIds = {};
    for (var j = 0; j < safeReservations.length; j += 1) {
      if (safeReservations[j] && safeReservations[j].customerId) {
        activeCustomerIds[safeReservations[j].customerId] = true;
      }
    }
    var activeCount = Object.keys(activeCustomerIds).length;
    metricsContainer.innerHTML =
      '<div class="metric"><div class="label">Total Customers</div><div class="value">' +
      safeCustomers.length +
      '</div></div><div class="metric"><div class="label">Customers with Reservations</div><div class="value">' +
      activeCount +
      "</div></div>";
  }

  function renderHomeFallback(dashboard, vehicles, customers, workOrders) {
    var metricsContainer = document.getElementById("dashboard-metrics");
    if (metricsContainer && isElementEffectivelyEmpty(metricsContainer)) {
      var safeDashboard = dashboard && typeof dashboard === "object" ? dashboard : {};
      var metrics = [
        ["Fleet Size", safeDashboard.fleetSize || 0],
        ["Available Vehicles", safeDashboard.availableVehicles || 0],
        ["Active Reservations", safeDashboard.activeReservations || 0],
        ["Active Customers", safeDashboard.activeCustomers || 0],
        ["Utilization", String(safeDashboard.utilizationRate || 0) + "%"],
        ["Expected Revenue", formatMoney(safeDashboard.expectedRevenue || 0)],
        ["Open Work Orders", safeDashboard.openWorkOrders || 0],
      ];
      var metricHtml = [];
      for (var i = 0; i < metrics.length; i += 1) {
        metricHtml.push(
          '<div class="metric"><div class="label">' +
            escapeHtml(metrics[i][0]) +
            '</div><div class="value">' +
            escapeHtml(metrics[i][1]) +
            "</div></div>"
        );
      }
      metricsContainer.innerHTML = metricHtml.join("");
    }

    var upcomingContainer = document.getElementById("upcoming-pickups");
    if (upcomingContainer && isElementEffectivelyEmpty(upcomingContainer)) {
      var safeDashboardData = dashboard && typeof dashboard === "object" ? dashboard : {};
      var pickups = Array.isArray(safeDashboardData.upcomingPickups) ? safeDashboardData.upcomingPickups : [];
      if (pickups.length === 0) {
        upcomingContainer.innerHTML = "<p>No upcoming pickups.</p>";
      } else {
        var vehicleMap = {};
        var customerMap = {};
        var safeVehicles = Array.isArray(vehicles) ? vehicles : [];
        var safeCustomers = Array.isArray(customers) ? customers : [];
        for (var j = 0; j < safeVehicles.length; j += 1) {
          vehicleMap[safeVehicles[j].id] =
            (safeVehicles[j].plateNumber || "") +
            " " +
            (safeVehicles[j].make || "") +
            " " +
            (safeVehicles[j].model || "");
        }
        for (var k = 0; k < safeCustomers.length; k += 1) {
          customerMap[safeCustomers[k].id] = (safeCustomers[k].firstName || "") + " " + (safeCustomers[k].lastName || "");
        }

        var pickupRows = [];
        for (var p = 0; p < pickups.length; p += 1) {
          var pickup = pickups[p] || {};
          pickupRows.push(
            "<tr>" +
              "<td>" +
              escapeHtml(customerMap[pickup.customerId] || pickup.customerId || "") +
              "</td>" +
              "<td>" +
              escapeHtml(vehicleMap[pickup.vehicleId] || pickup.vehicleId || "") +
              "</td>" +
              "<td>" +
              escapeHtml(pickup.startDate || "") +
              "</td>" +
              "<td><span class=\"badge\">" +
              escapeHtml(pickup.status || "n/a") +
              "</span></td>" +
              "</tr>"
          );
        }

        upcomingContainer.innerHTML =
          "<table><thead><tr><th>Customer</th><th>Vehicle</th><th>Start</th><th>Status</th></tr></thead><tbody>" +
          pickupRows.join("") +
          "</tbody></table>";
      }
    }

    var openWorkOrdersContainer = document.getElementById("open-work-orders");
    if (openWorkOrdersContainer && isElementEffectivelyEmpty(openWorkOrdersContainer)) {
      var active = [];
      var safeWorkOrders = Array.isArray(workOrders) ? workOrders : [];
      for (var q = 0; q < safeWorkOrders.length; q += 1) {
        var status = safeWorkOrders[q] && safeWorkOrders[q].status;
        if (status === "open" || status === "in_progress" || status === "on_hold") {
          active.push(safeWorkOrders[q]);
        }
      }
      if (active.length === 0) {
        openWorkOrdersContainer.innerHTML = "<p>No open work orders.</p>";
      } else {
        var plateByVehicleId = {};
        var safeVehiclesForWorkOrders = Array.isArray(vehicles) ? vehicles : [];
        for (var r = 0; r < safeVehiclesForWorkOrders.length; r += 1) {
          plateByVehicleId[safeVehiclesForWorkOrders[r].id] = safeVehiclesForWorkOrders[r].plateNumber || "";
        }
        var workOrderRows = [];
        for (var s = 0; s < active.length && s < 8; s += 1) {
          var item = active[s] || {};
          workOrderRows.push(
            "<tr>" +
              "<td>" +
              escapeHtml(plateByVehicleId[item.vehicleId] || item.vehicleId || "") +
              "</td>" +
              "<td>" +
              escapeHtml(item.title || "") +
              "</td>" +
              "<td><span class=\"badge\">" +
              escapeHtml(item.priority || "n/a") +
              "</span></td>" +
              "<td><span class=\"badge\">" +
              escapeHtml(item.status || "n/a") +
              "</span></td>" +
              "<td>" +
              escapeHtml(item.scheduledDate || "n/a") +
              "</td>" +
              "</tr>"
          );
        }
        openWorkOrdersContainer.innerHTML =
          "<table><thead><tr><th>Vehicle</th><th>Title</th><th>Priority</th><th>Status</th><th>Scheduled</th></tr></thead><tbody>" +
          workOrderRows.join("") +
          "</tbody></table>";
      }
    }
  }

  function runHomePageFallback() {
    requestJson("/api/dashboard", function (dashboardError, dashboard) {
      if (dashboardError) {
        return;
      }
      requestJson("/api/vehicles", function (_vehiclesError, vehicles) {
        requestJson("/api/customers", function (_customersError, customers) {
          requestJson("/api/work-orders", function (_workOrdersError, workOrders) {
            renderHomeFallback(dashboard, vehicles || [], customers || [], workOrders || []);
          });
        });
      });
    });
  }

  function runFleetPageFallback() {
    requestJson("/api/vehicles", function (error, vehicles) {
      if (error) {
        return;
      }
      renderFleetFallback(vehicles);
      bindFleetFallbackInteractions();
      bindFleetFallbackFiltering(vehicles);
    });
  }

  function runCustomersPageFallback() {
    requestJson("/api/customers", function (customerError, customers) {
      if (customerError) {
        return;
      }
      requestJson("/api/reservations", function (_reservationError, reservations) {
        renderCustomersFallback(customers, reservations || []);
      });
    });
  }

  function renderReservationsFallback(customers, vehicles, reservations) {
    var customerSelect = document.getElementById("reservation-customer");
    var reservationVehicleSelect = document.getElementById("reservation-vehicle");
    var quoteVehicleSelect = document.getElementById("quote-vehicle");
    var inlineToggle = document.getElementById("reservation-create-customer-inline");
    var inlineContainer = document.getElementById("reservation-inline-customer-fields");

    var safeCustomers = Array.isArray(customers) ? customers : [];
    var safeVehicles = Array.isArray(vehicles) ? vehicles : [];
    var safeReservations = Array.isArray(reservations) ? reservations : [];

    if (customerSelect && customerSelect.options.length === 0) {
      if (safeCustomers.length === 0) {
        customerSelect.innerHTML = '<option value="">No customers available</option>';
      } else {
        var customerOptions = [];
        for (var i = 0; i < safeCustomers.length; i += 1) {
          var customer = safeCustomers[i] || {};
          customerOptions.push(
            '<option value="' +
              escapeHtml(customer.id || "") +
              '">' +
              escapeHtml((customer.firstName || "") + " " + (customer.lastName || "") + " (" + (customer.email || "") + ")") +
              "</option>"
          );
        }
        customerSelect.innerHTML = customerOptions.join("");
      }
    }

    if (reservationVehicleSelect && reservationVehicleSelect.options.length === 0) {
      if (safeVehicles.length === 0) {
        reservationVehicleSelect.innerHTML = '<option value="">No vehicles available</option>';
      } else {
        var reservationVehicleOptions = [];
        for (var j = 0; j < safeVehicles.length; j += 1) {
          var rv = safeVehicles[j] || {};
          reservationVehicleOptions.push(
            '<option value="' +
              escapeHtml(rv.id || "") +
              '">' +
              escapeHtml(
                (rv.plateNumber || "") +
                  " - " +
                  (rv.make || "") +
                  " " +
                  (rv.model || "") +
                  " ($" +
                  Number(rv.dailyRate || 0).toFixed(2) +
                  "/day, " +
                  (rv.status || "n/a") +
                  ")"
              ) +
              "</option>"
          );
        }
        reservationVehicleSelect.innerHTML = reservationVehicleOptions.join("");
      }
    }

    if (quoteVehicleSelect && quoteVehicleSelect.options.length === 0) {
      if (safeVehicles.length === 0) {
        quoteVehicleSelect.innerHTML = '<option value="">No vehicles available</option>';
      } else {
        var quoteVehicleOptions = [];
        for (var k = 0; k < safeVehicles.length; k += 1) {
          var qv = safeVehicles[k] || {};
          quoteVehicleOptions.push(
            '<option value="' +
              escapeHtml(qv.id || "") +
              '">' +
              escapeHtml(
                (qv.plateNumber || "") +
                  " - " +
                  (qv.make || "") +
                  " " +
                  (qv.model || "") +
                  " ($" +
                  Number(qv.dailyRate || 0).toFixed(2) +
                  "/day, " +
                  (qv.status || "n/a") +
                  ")"
              ) +
              "</option>"
          );
        }
        quoteVehicleSelect.innerHTML = quoteVehicleOptions.join("");
      }
    }

    if (inlineToggle && inlineContainer && !inlineToggle.dataset.fallbackBound) {
      inlineToggle.dataset.fallbackBound = "true";
      var applyInlineCustomerMode = function () {
        var isEnabled = inlineToggle.checked;
        inlineContainer.classList.toggle("hidden", !isEnabled);
        if (customerSelect) {
          customerSelect.disabled = isEnabled;
          customerSelect.required = !isEnabled;
        }

        var inlineFieldNames = [
          "inlineCustomerFirstName",
          "inlineCustomerLastName",
          "inlineCustomerEmail",
          "inlineCustomerPhone",
          "inlineCustomerLicenseNumber",
        ];
        for (var m = 0; m < inlineFieldNames.length; m += 1) {
          var field = inlineContainer.querySelector('[name="' + inlineFieldNames[m] + '"]');
          if (!field) {
            continue;
          }
          field.required = isEnabled;
          if (!isEnabled) {
            field.value = "";
          }
        }
      };
      applyInlineCustomerMode();
      inlineToggle.addEventListener("change", applyInlineCustomerMode);
    }

    var reservationForm = document.getElementById("reservation-form");
    if (
      reservationForm &&
      reservationForm.dataset.handlerBound !== "true" &&
      reservationForm.dataset.fallbackSubmitBound !== "true"
    ) {
      reservationForm.dataset.fallbackSubmitBound = "true";
      reservationForm.addEventListener("submit", function (event) {
        event.preventDefault();
        var formData = new FormData(reservationForm);
        var payload = {
          customerId: formData.get("customerId"),
          vehicleId: formData.get("vehicleId"),
          startDate: formData.get("startDate"),
          endDate: formData.get("endDate"),
          insuranceTier: formData.get("insuranceTier"),
          status: formData.get("status"),
          discountCode: formData.get("discountCode"),
          notes: formData.get("notes"),
          addOns: formData.getAll("addOns"),
        };

        var shouldCreateInline = formData.get("createCustomerInline") === "on";
        var reservationConfirmMessage = shouldCreateInline
          ? "Create a new customer and reservation?"
          : "Create this reservation?";
        if (typeof window.confirm === "function" && !window.confirm(reservationConfirmMessage)) {
          return;
        }
        var postReservation = function () {
          var xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/reservations", true);
          xhr.withCredentials = true;
          xhr.setRequestHeader("Content-Type", "application/json");
          xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) {
              return;
            }
            if (xhr.status >= 200 && xhr.status < 300) {
              window.location.reload();
              return;
            }
            var errorMessage = "Reservation create failed.";
            try {
              var errorData = JSON.parse(xhr.responseText || "{}");
              if (errorData && errorData.error) {
                errorMessage = errorData.error;
              }
            } catch (_e) {
              // Ignore parse errors
            }
            if (window.AppCommon && typeof window.AppCommon.showToast === "function") {
              window.AppCommon.showToast(errorMessage, true);
            } else {
              window.alert(errorMessage);
            }
          };
          xhr.send(JSON.stringify(payload));
        };

        if (!shouldCreateInline) {
          postReservation();
          return;
        }

        var inlinePayload = {
          firstName: formData.get("inlineCustomerFirstName"),
          lastName: formData.get("inlineCustomerLastName"),
          email: formData.get("inlineCustomerEmail"),
          phone: formData.get("inlineCustomerPhone"),
          licenseNumber: formData.get("inlineCustomerLicenseNumber"),
        };

        var inlineMissing = false;
        for (var im in inlinePayload) {
          if (!inlinePayload[im]) {
            inlineMissing = true;
            break;
          }
        }
        if (inlineMissing) {
          if (window.AppCommon && typeof window.AppCommon.showToast === "function") {
            window.AppCommon.showToast("Please complete all new customer fields.", true);
          } else {
            window.alert("Please complete all new customer fields.");
          }
          return;
        }

        var customerXhr = new XMLHttpRequest();
        customerXhr.open("POST", "/api/customers", true);
        customerXhr.withCredentials = true;
        customerXhr.setRequestHeader("Content-Type", "application/json");
        customerXhr.onreadystatechange = function () {
          if (customerXhr.readyState !== 4) {
            return;
          }
          if (customerXhr.status >= 200 && customerXhr.status < 300) {
            try {
              var createdCustomer = JSON.parse(customerXhr.responseText || "{}");
              payload.customerId = createdCustomer.id;
              postReservation();
            } catch (_err) {
              if (window.AppCommon && typeof window.AppCommon.showToast === "function") {
                window.AppCommon.showToast("New customer created but response parsing failed.", true);
              } else {
                window.alert("New customer created but response parsing failed.");
              }
            }
            return;
          }
          var customerError = "Customer create failed.";
          try {
            var customerErrorData = JSON.parse(customerXhr.responseText || "{}");
            if (customerErrorData && customerErrorData.error) {
              customerError = customerErrorData.error;
            }
          } catch (_error) {
            // Ignore parse errors
          }
          if (window.AppCommon && typeof window.AppCommon.showToast === "function") {
            window.AppCommon.showToast(customerError, true);
          } else {
            window.alert(customerError);
          }
        };
        customerXhr.send(JSON.stringify(inlinePayload));
      });
    }

    var quoteForm = document.getElementById("quote-form");
    if (
      quoteForm &&
      quoteForm.dataset.handlerBound !== "true" &&
      quoteForm.dataset.fallbackSubmitBound !== "true"
    ) {
      quoteForm.dataset.fallbackSubmitBound = "true";
      quoteForm.addEventListener("submit", function (event) {
        event.preventDefault();
        var quoteResult = document.getElementById("quote-result");
        var formData = new FormData(quoteForm);
        var quotePayload = {
          vehicleId: formData.get("vehicleId"),
          startDate: formData.get("startDate"),
          endDate: formData.get("endDate"),
          insuranceTier: formData.get("insuranceTier"),
          discountCode: formData.get("discountCode"),
          addOns: formData.getAll("addOns"),
        };
        if (typeof window.confirm === "function" && !window.confirm("Calculate this quote?")) {
          return;
        }
        var quoteXhr = new XMLHttpRequest();
        quoteXhr.open("POST", "/api/quotes", true);
        quoteXhr.withCredentials = true;
        quoteXhr.setRequestHeader("Content-Type", "application/json");
        quoteXhr.onreadystatechange = function () {
          if (quoteXhr.readyState !== 4) {
            return;
          }
          if (quoteXhr.status >= 200 && quoteXhr.status < 300) {
            try {
              var quoteData = JSON.parse(quoteXhr.responseText || "{}");
              if (quoteResult) {
                quoteResult.innerHTML =
                  "<strong>Total:</strong> " +
                  escapeHtml(formatMoney(quoteData.pricing && quoteData.pricing.total)) +
                  "<br />Rental days: " +
                  escapeHtml(quoteData.rentalDays) +
                  "<br />Base: " +
                  escapeHtml(formatMoney(quoteData.pricing && quoteData.pricing.basePrice)) +
                  " | Insurance: " +
                  escapeHtml(formatMoney(quoteData.pricing && quoteData.pricing.insurancePrice)) +
                  " | Add-ons: " +
                  escapeHtml(formatMoney(quoteData.pricing && quoteData.pricing.addOnPrice)) +
                  "<br />Tax: " +
                  escapeHtml(formatMoney(quoteData.pricing && quoteData.pricing.tax));
              }
            } catch (_e) {
              if (quoteResult) {
                quoteResult.innerHTML = "<em>Could not calculate quote.</em>";
              }
            }
            return;
          }
          if (quoteResult) {
            quoteResult.innerHTML = "<em>Could not calculate quote.</em>";
          }
        };
        quoteXhr.send(JSON.stringify(quotePayload));
      });
    }

    var listContainer = document.getElementById("reservation-list");
    if (listContainer && isElementEffectivelyEmpty(listContainer)) {
      if (safeReservations.length === 0) {
        listContainer.innerHTML = "<p>No reservations yet.</p>";
      } else {
        var customerMap = {};
        var vehicleMap = {};
        for (var n = 0; n < safeCustomers.length; n += 1) {
          customerMap[safeCustomers[n].id] = (safeCustomers[n].firstName || "") + " " + (safeCustomers[n].lastName || "");
        }
        for (var p = 0; p < safeVehicles.length; p += 1) {
          vehicleMap[safeVehicles[p].id] =
            (safeVehicles[p].plateNumber || "") + " (" + (safeVehicles[p].make || "") + " " + (safeVehicles[p].model || "") + ")";
        }

        var reservationRows = [];
        for (var q = 0; q < safeReservations.length; q += 1) {
          var item = safeReservations[q] || {};
          var total =
            item.pricing && typeof item.pricing.total === "number" ? item.pricing.total : 0;
          var addOns = Array.isArray(item.addOns) && item.addOns.length > 0 ? item.addOns.join(", ") : "none";
          reservationRows.push(
            "<tr>" +
              "<td>" +
              escapeHtml(customerMap[item.customerId] || item.customerId || "") +
              "</td>" +
              "<td>" +
              escapeHtml(vehicleMap[item.vehicleId] || item.vehicleId || "") +
              "</td>" +
              "<td>" +
              escapeHtml((item.startDate || "") + " -> " + (item.endDate || "")) +
              "</td>" +
              "<td><span class=\"badge\">" +
              escapeHtml(item.status || "n/a") +
              "</span></td>" +
              "<td>" +
              escapeHtml(formatMoney(total)) +
              "</td>" +
              "<td>" +
              escapeHtml(addOns) +
              "</td>" +
              "</tr>"
          );
        }

        listContainer.innerHTML =
          "<table><thead><tr><th>Customer</th><th>Vehicle</th><th>Dates</th><th>Status</th><th>Price</th><th>Add-ons</th></tr></thead><tbody>" +
          reservationRows.join("") +
          "</tbody></table>";
      }
    }
  }

  function runReservationsPageFallback() {
    requestJson("/api/customers", function (_customersError, customers) {
      requestJson("/api/vehicles", function (_vehiclesError, vehicles) {
        requestJson("/api/reservations", function (_reservationsError, reservations) {
          renderReservationsFallback(customers || [], vehicles || [], reservations || []);
        });
      });
    });
  }

  function isVehicleProfilePath() {
    var path = window.location.pathname || "";
    return path.endsWith("/vehicle-profile.html");
  }

  function renderVehicleProfileFallback(vehicles, profile) {
    var select = document.getElementById("profile-vehicle-select");
    var summary = document.getElementById("vehicle-profile-summary");
    var documentList = document.getElementById("profile-document-list");
    var workOrderList = document.getElementById("profile-work-order-list");

    var safeVehicles = Array.isArray(vehicles) ? vehicles : [];
    if (select && select.options.length === 0) {
      if (safeVehicles.length === 0) {
        select.innerHTML = '<option value="">No vehicles available</option>';
      } else {
        var options = [];
        for (var i = 0; i < safeVehicles.length; i += 1) {
          options.push(
            '<option value="' +
              escapeHtml(safeVehicles[i].id || "") +
              '">' +
              escapeHtml(
                (safeVehicles[i].plateNumber || "") + " - " + (safeVehicles[i].make || "") + " " + (safeVehicles[i].model || "")
              ) +
              "</option>"
          );
        }
        select.innerHTML = options.join("");
      }
    }

    if (!profile || typeof profile !== "object") {
      if (summary && isElementEffectivelyEmpty(summary)) {
        summary.innerHTML = "<p>Select a vehicle to see profile details.</p>";
      }
      return;
    }

    if (summary && isElementEffectivelyEmpty(summary)) {
      var alerts = Array.isArray(profile.alerts) ? profile.alerts : [];
      var alertsHtml =
        alerts.length > 0
          ? "<ul>" +
            alerts
              .map(function (alert) {
                return "<li><strong>" + escapeHtml(alert.type || "info") + ":</strong> " + escapeHtml(alert.message || "") + "</li>";
              })
              .join("") +
            "</ul>"
          : "<p>No alerts for this vehicle.</p>";

      summary.innerHTML =
        '<div class="grid-2"><div><strong>' +
        escapeHtml((profile.year || "") + " " + (profile.make || "") + " " + (profile.model || "")) +
        "</strong><br />Plate: " +
        escapeHtml(profile.plateNumber || "") +
        '<br />Status: <span class="badge">' +
        escapeHtml(profile.status || "n/a") +
        "</span><br />Category: " +
        escapeHtml(profile.category || "n/a") +
        "</div><div>Daily: " +
        escapeHtml(formatMoney(profile.dailyRate || 0)) +
        "<br />Weekend: " +
        escapeHtml(profile.weekendDailyRate ? formatMoney(profile.weekendDailyRate) : "n/a") +
        "<br />Location: " +
        escapeHtml(profile.location || "n/a") +
        "<br />Branch: " +
        escapeHtml(profile.branchCode || "n/a") +
        "</div></div><hr /><strong>Alerts</strong>" +
        alertsHtml;
    }

    if (documentList && isElementEffectivelyEmpty(documentList)) {
      var documents = Array.isArray(profile.documents) ? profile.documents : [];
      if (documents.length === 0) {
        documentList.innerHTML = "<p>No documents uploaded for this vehicle.</p>";
      } else {
        var documentRows = [];
        for (var j = 0; j < documents.length; j += 1) {
          var documentItem = documents[j] || {};
          documentRows.push(
            "<tr>" +
              "<td>" +
              escapeHtml(documentItem.documentType || "") +
              "</td>" +
              '<td><a href="' +
              escapeHtml(documentItem.relativePath || "#") +
              '" target="_blank" rel="noreferrer">' +
              escapeHtml(documentItem.originalName || "") +
              "</a></td>" +
              "<td>" +
              escapeHtml(documentItem.uploadedAt ? String(documentItem.uploadedAt).slice(0, 10) : "n/a") +
              "</td>" +
              "<td>" +
              escapeHtml(documentItem.expiryDate || "n/a") +
              "</td>" +
              "</tr>"
          );
        }
        documentList.innerHTML =
          "<table><thead><tr><th>Type</th><th>File</th><th>Uploaded</th><th>Expiry</th></tr></thead><tbody>" +
          documentRows.join("") +
          "</tbody></table>";
      }
    }

    if (workOrderList && isElementEffectivelyEmpty(workOrderList)) {
      var workOrders = Array.isArray(profile.workOrders) ? profile.workOrders : [];
      if (workOrders.length === 0) {
        workOrderList.innerHTML = "<p>No work orders for this vehicle yet.</p>";
      } else {
        var workOrderRows = [];
        for (var k = 0; k < workOrders.length; k += 1) {
          var workOrder = workOrders[k] || {};
          workOrderRows.push(
            "<tr>" +
              "<td>" +
              escapeHtml(workOrder.title || "") +
              "</td>" +
              "<td><span class=\"badge\">" +
              escapeHtml(workOrder.priority || "n/a") +
              "</span></td>" +
              "<td><span class=\"badge\">" +
              escapeHtml(workOrder.status || "n/a") +
              "</span></td>" +
              "<td>" +
              escapeHtml(workOrder.scheduledDate || "n/a") +
              "</td>" +
              "<td>" +
              escapeHtml(
                workOrder.actualCost ? formatMoney(workOrder.actualCost) : workOrder.costEstimate ? "Est: " + formatMoney(workOrder.costEstimate) : "n/a"
              ) +
              "</td>" +
              "</tr>"
          );
        }
        workOrderList.innerHTML =
          "<table><thead><tr><th>Title</th><th>Priority</th><th>Status</th><th>Scheduled</th><th>Cost</th></tr></thead><tbody>" +
          workOrderRows.join("") +
          "</tbody></table>";
      }
    }
  }

  function runVehicleProfileFallback() {
    requestJson("/api/vehicles", function (vehiclesError, vehicles) {
      if (vehiclesError) {
        return;
      }
      var safeVehicles = Array.isArray(vehicles) ? vehicles : [];
      var select = document.getElementById("profile-vehicle-select");
      var url = new URL(window.location.href);
      var queryVehicleId = String(url.searchParams.get("vehicleId") || "");
      var selectedVehicleId = queryVehicleId;
      if (!selectedVehicleId || !safeVehicles.some(function (vehicle) { return vehicle.id === selectedVehicleId; })) {
        selectedVehicleId = safeVehicles[0] ? safeVehicles[0].id : "";
      }

      renderVehicleProfileFallback(safeVehicles, null);
      if (select && selectedVehicleId) {
        select.value = selectedVehicleId;
      }
      if (!selectedVehicleId) {
        return;
      }

      var loadProfileFor = function (vehicleId) {
        requestJson("/api/vehicles/" + encodeURIComponent(vehicleId), function (_profileError, profile) {
          renderVehicleProfileFallback(safeVehicles, profile || null);
        });
      };

      if (select && select.dataset.handlerBound !== "true" && select.dataset.fallbackBound !== "true") {
        select.dataset.fallbackBound = "true";
        select.addEventListener("change", function () {
          var nextVehicleId = select.value;
          var nextUrl = new URL(window.location.href);
          if (nextVehicleId) {
            nextUrl.searchParams.set("vehicleId", nextVehicleId);
          } else {
            nextUrl.searchParams.delete("vehicleId");
          }
          window.history.replaceState({}, "", nextUrl.pathname + nextUrl.search);
          loadProfileFor(nextVehicleId);
        });
      }

      loadProfileFor(selectedVehicleId);
    });
  }

  function bootFallback() {
    var page = getPageKey();
    if (!page) {
      return;
    }
    if (isMainPageReady(page)) {
      return;
    }

    if (page === "vehicle-profile") {
      runVehicleProfileFallback();
      return;
    }

    if (page === "home") {
      runHomePageFallback();
      return;
    }
    if (page === "fleet") {
      runFleetPageFallback();
      return;
    }
    if (page === "customers") {
      runCustomersPageFallback();
      return;
    }
    if (page === "reservations") {
      runReservationsPageFallback();
    }
  }

  setTimeout(bootFallback, 1400);
})();
