const { request, formatMoney, showToast, sessionReady, markPageReady } = window.AppCommon;

function defaultDashboard() {
  return {
    fleetSize: 0,
    availableVehicles: 0,
    activeReservations: 0,
    activeCustomers: 0,
    utilizationRate: 0,
    expectedRevenue: 0,
    openWorkOrders: 0,
    overdueWorkOrders: 0,
    maintenanceSpend: 0,
    vehiclesNeedingAttention: 0,
    criticalVehicleAlerts: 0,
    upcomingPickups: [],
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function renderMetrics(dashboard) {
  const container = document.getElementById("dashboard-metrics");
  if (!container) {
    return;
  }

  const metrics = [
    { label: "Fleet Size", value: dashboard.fleetSize },
    { label: "Available Vehicles", value: dashboard.availableVehicles },
    { label: "Active Reservations", value: dashboard.activeReservations },
    { label: "Active Customers", value: dashboard.activeCustomers },
    { label: "Utilization", value: `${dashboard.utilizationRate}%` },
    { label: "Expected Revenue", value: formatMoney(dashboard.expectedRevenue) },
    { label: "Open Work Orders", value: dashboard.openWorkOrders || 0 },
    { label: "Overdue Work Orders", value: dashboard.overdueWorkOrders || 0 },
    { label: "Maintenance Spend", value: formatMoney(dashboard.maintenanceSpend || 0) },
    { label: "Vehicles Needing Attention", value: dashboard.vehiclesNeedingAttention || 0 },
    { label: "Critical Alerts", value: dashboard.criticalVehicleAlerts || 0 },
  ];

  container.innerHTML = metrics
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

function renderUpcomingPickups(dashboard, vehicles, customers) {
  const container = document.getElementById("upcoming-pickups");
  if (!container) {
    return;
  }
  const vehicleMap = new Map(vehicles.map((vehicle) => [vehicle.id, `${vehicle.plateNumber} ${vehicle.make} ${vehicle.model}`]));
  const customerMap = new Map(customers.map((customer) => [customer.id, `${customer.firstName} ${customer.lastName}`]));
  const pickups = dashboard.upcomingPickups || [];

  if (pickups.length === 0) {
    container.innerHTML = "<p>No upcoming pickups.</p>";
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Customer</th>
          <th>Vehicle</th>
          <th>Start</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${pickups
          .map(
            (pickup) => `
            <tr>
              <td>${customerMap.get(pickup.customerId) || pickup.customerId}</td>
              <td>${vehicleMap.get(pickup.vehicleId) || pickup.vehicleId}</td>
              <td>${pickup.startDate}</td>
              <td><span class="badge">${pickup.status}</span></td>
            </tr>
          `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderOpenWorkOrders(workOrders, vehicles) {
  const container = document.getElementById("open-work-orders");
  if (!container) {
    return;
  }
  const active = workOrders.filter((workOrder) => ["open", "in_progress", "on_hold"].includes(workOrder.status));
  const vehicleMap = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle.plateNumber]));

  if (active.length === 0) {
    container.innerHTML = "<p>No open work orders.</p>";
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Vehicle</th>
          <th>Title</th>
          <th>Priority</th>
          <th>Status</th>
          <th>Scheduled</th>
        </tr>
      </thead>
      <tbody>
        ${active
          .slice(0, 8)
          .map(
            (workOrder) => `
            <tr>
              <td>${vehicleMap.get(workOrder.vehicleId) || workOrder.vehicleId}</td>
              <td>${workOrder.title}</td>
              <td><span class="badge">${workOrder.priority}</span></td>
              <td><span class="badge">${workOrder.status}</span></td>
              <td>${workOrder.scheduledDate || "n/a"}</td>
            </tr>
          `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

async function bootstrap() {
  try {
    await sessionReady;

    const results = await Promise.allSettled([
      request("/api/dashboard"),
      request("/api/vehicles"),
      request("/api/customers"),
      request("/api/work-orders"),
    ]);

    const dashboard =
      results[0].status === "fulfilled" && results[0].value && typeof results[0].value === "object"
        ? results[0].value
        : defaultDashboard();
    const vehicles = results[1].status === "fulfilled" ? asArray(results[1].value) : [];
    const customers = results[2].status === "fulfilled" ? asArray(results[2].value) : [];
    const workOrders = results[3].status === "fulfilled" ? asArray(results[3].value) : [];

    renderMetrics(dashboard);
    renderUpcomingPickups(dashboard, vehicles, customers);
    renderOpenWorkOrders(workOrders, vehicles);

    const hasPartialFailure = results.some((result) => result.status === "rejected");
    if (hasPartialFailure) {
      showToast("Some dashboard widgets could not load. Showing available data.", true);
    }

    markPageReady("home");
  } catch (error) {
    showToast(error.message, true);
  }
}

bootstrap();
