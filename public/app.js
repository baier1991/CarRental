const state = {
  vehicles: [],
  customers: [],
  reservations: [],
  dashboard: null,
};

const ui = {
  dashboardMetrics: document.getElementById("dashboard-metrics"),
  vehicleList: document.getElementById("vehicle-list"),
  customerList: document.getElementById("customer-list"),
  reservationList: document.getElementById("reservation-list"),
  toast: document.getElementById("toast"),
  reservationCustomerSelect: document.getElementById("reservation-customer"),
  reservationVehicleSelect: document.getElementById("reservation-vehicle"),
  quoteVehicleSelect: document.getElementById("quote-vehicle"),
  quoteResult: document.getElementById("quote-result"),
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
  }, 2600);
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    const errorMessage = data?.error || `Request failed: ${response.status}`;
    throw new Error(errorMessage);
  }

  return data;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
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
          <th>Year</th>
          <th>Rate</th>
          <th>Status</th>
          <th>Location</th>
        </tr>
      </thead>
      <tbody>
        ${state.vehicles
          .map(
            (vehicle) => `
            <tr>
              <td>${vehicle.plateNumber}</td>
              <td>${vehicle.make} ${vehicle.model}</td>
              <td>${vehicle.year}</td>
              <td>${formatMoney(vehicle.dailyRate)}/day</td>
              <td><span class="badge">${vehicle.status}</span></td>
              <td>${vehicle.location}</td>
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

function populateSelectOptions() {
  ui.reservationCustomerSelect.innerHTML = state.customers
    .map((customer) => {
      const fullName = `${customer.firstName} ${customer.lastName}`;
      return `<option value="${customer.id}">${fullName} (${customer.email})</option>`;
    })
    .join("");

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
}

function collectCheckedValues(form, key) {
  return Array.from(form.querySelectorAll(`input[name="${key}"]:checked`)).map((item) => item.value);
}

async function loadData() {
  const [dashboard, vehicles, customers, reservations] = await Promise.all([
    request("/api/dashboard"),
    request("/api/vehicles"),
    request("/api/customers"),
    request("/api/reservations"),
  ]);

  state.dashboard = dashboard;
  state.vehicles = vehicles;
  state.customers = customers;
  state.reservations = reservations;

  renderDashboard();
  renderVehicles();
  renderCustomers();
  renderReservations();
  populateSelectOptions();
}

function attachFormHandlers() {
  const vehicleForm = document.getElementById("vehicle-form");
  const customerForm = document.getElementById("customer-form");
  const reservationForm = document.getElementById("reservation-form");
  const quoteForm = document.getElementById("quote-form");

  vehicleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(vehicleForm);
    const payload = Object.fromEntries(formData.entries());

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

  customerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(customerForm);
    const payload = Object.fromEntries(formData.entries());

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

  reservationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(reservationForm);
    const payload = Object.fromEntries(formData.entries());
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
    const formData = new FormData(quoteForm);
    const payload = Object.fromEntries(formData.entries());
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
