/* Safety fallback: render key lists when main page script fails. */
(function () {
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

  function renderFleetFallback(vehicles) {
    var listContainer = document.getElementById("vehicle-list");
    if (!listContainer || !isElementEffectivelyEmpty(listContainer)) {
      return;
    }

    var safeVehicles = Array.isArray(vehicles) ? vehicles : [];
    if (safeVehicles.length === 0) {
      listContainer.innerHTML = "<p>No vehicles yet.</p>";
    } else {
      var rows = [];
      for (var i = 0; i < safeVehicles.length; i += 1) {
        var vehicle = safeVehicles[i] || {};
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

    var metricsContainer = document.getElementById("fleet-overview-metrics");
    if (!metricsContainer || !isElementEffectivelyEmpty(metricsContainer)) {
      return;
    }
    var total = safeVehicles.length;
    var available = 0;
    var sumDaily = 0;
    for (var j = 0; j < safeVehicles.length; j += 1) {
      if (safeVehicles[j] && safeVehicles[j].status === "available") {
        available += 1;
      }
      sumDaily += Number(safeVehicles[j] && safeVehicles[j].dailyRate ? safeVehicles[j].dailyRate : 0);
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

  function runFleetPageFallback() {
    requestJson("/api/vehicles", function (error, vehicles) {
      if (error) {
        return;
      }
      renderFleetFallback(vehicles);
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

  function bootFallback() {
    var page = (document.body && document.body.getAttribute("data-page")) || "";
    if (page === "fleet") {
      runFleetPageFallback();
      return;
    }
    if (page === "customers") {
      runCustomersPageFallback();
    }
  }

  setTimeout(bootFallback, 1400);
})();
