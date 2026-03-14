/* Legacy-safe UI fallback for older mobile browsers. */
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
    xhr.open("GET", url, true);
    xhr.withCredentials = true;
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

  function getPageKey() {
    var body = document.body;
    if (body && body.getAttribute("data-page")) {
      return body.getAttribute("data-page");
    }

    var pathName = window.location.pathname || "";
    if (pathName === "/" || pathName === "/index.html") {
      return "home";
    }

    var parts = pathName.split("/");
    var fileName = parts.length ? parts[parts.length - 1] : "";
    if (!fileName) {
      return "home";
    }
    return fileName.replace(".html", "");
  }

  function renderFleet(vehicles) {
    var container = document.getElementById("vehicle-list");
    if (!container) {
      return;
    }
    if (!vehicles || !vehicles.length) {
      container.innerHTML = "<p>No vehicles yet.</p>";
      return;
    }

    var rows = [];
    var i;
    for (i = 0; i < vehicles.length; i += 1) {
      var vehicle = vehicles[i] || {};
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
          "<td>" +
          "Day: " +
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
          "<td>" +
          escapeHtml(vehicle.registrationExpiryDate || "") +
          "</td>" +
          "</tr>"
      );
    }

    container.innerHTML =
      "<table>" +
      "<thead><tr><th>Plate</th><th>Vehicle</th><th>Category</th><th>Rates</th><th>Status</th><th>Branch / Location</th><th>Compliance</th></tr></thead>" +
      "<tbody>" +
      rows.join("") +
      "</tbody>" +
      "</table>";

    var editSelect = document.getElementById("edit-vehicle-select");
    if (editSelect) {
      var options = [];
      for (i = 0; i < vehicles.length; i += 1) {
        var item = vehicles[i] || {};
        options.push(
          "<option value=\"" +
            escapeHtml(item.id || "") +
            "\">" +
            escapeHtml((item.plateNumber || "") + " - " + (item.make || "") + " " + (item.model || "")) +
            "</option>"
        );
      }
      editSelect.innerHTML = options.join("");
    }
  }

  function renderReservations(reservations, vehicles, customers) {
    var listContainer = document.getElementById("reservation-list");
    if (!listContainer) {
      return;
    }
    if (!reservations || !reservations.length) {
      listContainer.innerHTML = "<p>No reservations yet.</p>";
      return;
    }

    var customerMap = {};
    var vehicleMap = {};
    var i;
    for (i = 0; i < customers.length; i += 1) {
      customerMap[customers[i].id] = (customers[i].firstName || "") + " " + (customers[i].lastName || "");
    }
    for (i = 0; i < vehicles.length; i += 1) {
      vehicleMap[vehicles[i].id] =
        (vehicles[i].plateNumber || "") + " (" + (vehicles[i].make || "") + " " + (vehicles[i].model || "") + ")";
    }

    var rows = [];
    for (i = 0; i < reservations.length; i += 1) {
      var reservation = reservations[i] || {};
      var addOns = reservation.addOns && reservation.addOns.join ? reservation.addOns.join(", ") : "none";
      var total =
        reservation.pricing && typeof reservation.pricing.total === "number" ? reservation.pricing.total : 0;
      rows.push(
        "<tr>" +
          "<td>" +
          escapeHtml(customerMap[reservation.customerId] || reservation.customerId || "") +
          "</td>" +
          "<td>" +
          escapeHtml(vehicleMap[reservation.vehicleId] || reservation.vehicleId || "") +
          "</td>" +
          "<td>" +
          escapeHtml((reservation.startDate || "") + " -> " + (reservation.endDate || "")) +
          "</td>" +
          "<td><span class=\"badge\">" +
          escapeHtml(reservation.status || "n/a") +
          "</span></td>" +
          "<td>" +
          escapeHtml(formatMoney(total)) +
          "</td>" +
          "<td>" +
          escapeHtml(addOns || "none") +
          "</td>" +
          "</tr>"
      );
    }

    listContainer.innerHTML =
      "<table>" +
      "<thead><tr><th>Customer</th><th>Vehicle</th><th>Dates</th><th>Status</th><th>Price</th><th>Add-ons</th></tr></thead>" +
      "<tbody>" +
      rows.join("") +
      "</tbody>" +
      "</table>";

    var customerSelect = document.getElementById("reservation-customer");
    var reservationVehicleSelect = document.getElementById("reservation-vehicle");
    var quoteVehicleSelect = document.getElementById("quote-vehicle");
    if (customerSelect) {
      var customerOptions = [];
      for (i = 0; i < customers.length; i += 1) {
        customerOptions.push(
          "<option value=\"" +
            escapeHtml(customers[i].id || "") +
            "\">" +
            escapeHtml(
              (customers[i].firstName || "") + " " + (customers[i].lastName || "") + " (" + (customers[i].email || "") + ")"
            ) +
            "</option>"
        );
      }
      customerSelect.innerHTML = customerOptions.join("");
    }
    if (reservationVehicleSelect || quoteVehicleSelect) {
      var vehicleOptions = [];
      for (i = 0; i < vehicles.length; i += 1) {
        vehicleOptions.push(
          "<option value=\"" +
            escapeHtml(vehicles[i].id || "") +
            "\">" +
            escapeHtml((vehicles[i].plateNumber || "") + " - " + (vehicles[i].make || "") + " " + (vehicles[i].model || "")) +
            "</option>"
        );
      }
      if (reservationVehicleSelect) {
        reservationVehicleSelect.innerHTML = vehicleOptions.join("");
      }
      if (quoteVehicleSelect) {
        quoteVehicleSelect.innerHTML = vehicleOptions.join("");
      }
    }
  }

  function renderWorkOrders(workOrders, vehicles) {
    var container = document.getElementById("work-order-list");
    if (!container) {
      return;
    }
    if (!workOrders || !workOrders.length) {
      container.innerHTML = "<p>No work orders yet.</p>";
      return;
    }

    var vehicleMap = {};
    var i;
    for (i = 0; i < vehicles.length; i += 1) {
      vehicleMap[vehicles[i].id] = vehicles[i].plateNumber || vehicles[i].id || "";
    }

    var rows = [];
    for (i = 0; i < workOrders.length; i += 1) {
      var workOrder = workOrders[i] || {};
      rows.push(
        "<tr>" +
          "<td>" +
          escapeHtml(vehicleMap[workOrder.vehicleId] || workOrder.vehicleId || "") +
          "</td>" +
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
          "</tr>"
      );
    }

    container.innerHTML =
      "<table>" +
      "<thead><tr><th>Vehicle</th><th>Title</th><th>Priority</th><th>Status</th><th>Scheduled</th></tr></thead>" +
      "<tbody>" +
      rows.join("") +
      "</tbody>" +
      "</table>";
  }

  function renderDocuments(documents) {
    var container = document.getElementById("vehicle-document-list");
    if (!container) {
      return;
    }
    if (!documents || !documents.length) {
      container.innerHTML = "<p>No documents uploaded for this vehicle.</p>";
      return;
    }

    var rows = [];
    var i;
    for (i = 0; i < documents.length; i += 1) {
      var docItem = documents[i] || {};
      rows.push(
        "<tr>" +
          "<td>" +
          escapeHtml(docItem.documentType || "") +
          "</td>" +
          "<td><a href=\"" +
          escapeHtml(docItem.relativePath || "#") +
          "\" target=\"_blank\" rel=\"noreferrer\">" +
          escapeHtml(docItem.originalName || "") +
          "</a></td>" +
          "<td>" +
          escapeHtml(docItem.uploadedAt ? String(docItem.uploadedAt).slice(0, 10) : "n/a") +
          "</td>" +
          "<td>" +
          escapeHtml(docItem.expiryDate || "n/a") +
          "</td>" +
          "</tr>"
      );
    }

    container.innerHTML =
      "<table>" +
      "<thead><tr><th>Type</th><th>File</th><th>Uploaded</th><th>Expiry</th></tr></thead>" +
      "<tbody>" +
      rows.join("") +
      "</tbody>" +
      "</table>";
  }

  function renderHomeMetrics(dashboard) {
    var container = document.getElementById("dashboard-metrics");
    if (!container || !dashboard) {
      return;
    }
    var metrics = [
      { label: "Fleet Size", value: dashboard.fleetSize || 0 },
      { label: "Available Vehicles", value: dashboard.availableVehicles || 0 },
      { label: "Active Reservations", value: dashboard.activeReservations || 0 },
      { label: "Active Customers", value: dashboard.activeCustomers || 0 },
      { label: "Utilization", value: String(dashboard.utilizationRate || 0) + "%" },
      { label: "Expected Revenue", value: formatMoney(dashboard.expectedRevenue || 0) },
      { label: "Open Work Orders", value: dashboard.openWorkOrders || 0 },
    ];
    var blocks = [];
    var i;
    for (i = 0; i < metrics.length; i += 1) {
      blocks.push(
        "<div class=\"metric\"><div class=\"label\">" +
          escapeHtml(metrics[i].label) +
          "</div><div class=\"value\">" +
          escapeHtml(metrics[i].value) +
          "</div></div>"
      );
    }
    container.innerHTML = blocks.join("");
  }

  function runFleetFallback() {
    requestJson("/api/vehicles", function (error, vehicles) {
      if (error) {
        return;
      }
      renderFleet(vehicles && vehicles.join ? vehicles : []);
    });
  }

  function runReservationsFallback() {
    requestJson("/api/customers", function (errorCustomers, customers) {
      if (errorCustomers) {
        return;
      }
      requestJson("/api/vehicles", function (errorVehicles, vehicles) {
        if (errorVehicles) {
          return;
        }
        requestJson("/api/reservations", function (errorReservations, reservations) {
          if (errorReservations) {
            return;
          }
          renderReservations(
            reservations && reservations.join ? reservations : [],
            vehicles && vehicles.join ? vehicles : [],
            customers && customers.join ? customers : []
          );
        });
      });
    });
  }

  function runMaintenanceFallback() {
    requestJson("/api/vehicles", function (errorVehicles, vehicles) {
      if (errorVehicles) {
        return;
      }

      var safeVehicles = vehicles && vehicles.join ? vehicles : [];
      var selectIds = ["document-vehicle-select", "document-list-vehicle-select", "work-order-vehicle"];
      var i;
      for (i = 0; i < selectIds.length; i += 1) {
        var select = document.getElementById(selectIds[i]);
        if (!select) {
          continue;
        }
        var options = [];
        var j;
        for (j = 0; j < safeVehicles.length; j += 1) {
          options.push(
            "<option value=\"" +
              escapeHtml(safeVehicles[j].id || "") +
              "\">" +
              escapeHtml(
                (safeVehicles[j].plateNumber || "") +
                  " - " +
                  (safeVehicles[j].make || "") +
                  " " +
                  (safeVehicles[j].model || "")
              ) +
              "</option>"
          );
        }
        select.innerHTML = options.join("");
      }

      requestJson("/api/work-orders", function (errorWorkOrders, workOrders) {
        if (!errorWorkOrders) {
          renderWorkOrders(workOrders && workOrders.join ? workOrders : [], safeVehicles);
        }
      });

      var docSelect = document.getElementById("document-list-vehicle-select");
      if (!docSelect || !docSelect.value) {
        return;
      }

      function loadDocumentsForSelectedVehicle() {
        if (!docSelect.value) {
          renderDocuments([]);
          return;
        }
        requestJson("/api/vehicles/" + encodeURIComponent(docSelect.value) + "/documents", function (error, docs) {
          if (error) {
            return;
          }
          renderDocuments(docs && docs.join ? docs : []);
        });
      }

      loadDocumentsForSelectedVehicle();
      docSelect.addEventListener("change", loadDocumentsForSelectedVehicle);
    });
  }

  function runHomeFallback() {
    requestJson("/api/dashboard", function (errorDashboard, dashboard) {
      if (errorDashboard) {
        return;
      }
      renderHomeMetrics(dashboard || {});
    });
  }

  function run() {
    var page = getPageKey();
    if (page === "fleet") {
      runFleetFallback();
      return;
    }
    if (page === "reservations") {
      runReservationsFallback();
      return;
    }
    if (page === "maintenance") {
      runMaintenanceFallback();
      return;
    }
    if (page === "home") {
      runHomeFallback();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
