const { request, showToast } = window.AppCommon;

const state = {
  customers: [],
  reservations: [],
};

function renderCustomerList() {
  const container = document.getElementById("customer-list");
  if (state.customers.length === 0) {
    container.innerHTML = "<p>No customers yet.</p>";
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Phone</th>
          <th>License</th>
          <th>Created</th>
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
              <td>${customer.createdAt?.slice(0, 10) || "n/a"}</td>
            </tr>
          `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderMetrics() {
  const activeCustomerIds = new Set(state.reservations.map((reservation) => reservation.customerId));
  const metrics = [
    { label: "Total Customers", value: state.customers.length },
    { label: "Customers with Reservations", value: activeCustomerIds.size },
  ];

  document.getElementById("customer-metrics").innerHTML = metrics
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

async function loadCustomers() {
  const [customers, reservations] = await Promise.all([
    request("/api/customers"),
    request("/api/reservations"),
  ]);
  state.customers = customers;
  state.reservations = reservations;
  renderCustomerList();
  renderMetrics();
}

function attachHandlers() {
  const form = document.getElementById("customer-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      await request("/api/customers", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showToast("Customer added.");
      form.reset();
      await loadCustomers();
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

async function bootstrap() {
  try {
    attachHandlers();
    await loadCustomers();
  } catch (error) {
    showToast(error.message, true);
  }
}

bootstrap();
