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

  function bootFallback() {
    var page = (document.body && document.body.getAttribute("data-page")) || "";
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
