const { request, showToast, sessionReady, markPageReady, paginateItems, renderPaginationControls } =
  window.AppCommon;

const state = {
  customers: [],
  reservations: [],
  customerPage: 1,
  customerPageSize: 8,
};
const searchParams = new URLSearchParams(window.location.search);

function setFormMessage(message, isError = false) {
  const container = document.getElementById("customer-form-message");
  if (!container) {
    return;
  }
  const safeMessage = message || "";
  container.innerHTML = safeMessage
    ? `<span class="${isError ? "error-text" : ""}">${safeMessage}</span>`
    : "";
}

function renderCustomerList() {
  const container = document.getElementById("customer-list");
  if (!container) {
    return;
  }
  if (state.customers.length === 0) {
    container.innerHTML = "<p>No customers yet.</p>";
    renderPaginationControls("customer-pagination", null);
    return;
  }

  const paginated = paginateItems(state.customers, state.customerPage, state.customerPageSize);
  state.customerPage = paginated.currentPage;

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
        ${paginated.items
          .map(
            (customer) => {
              const createdAt = customer && customer.createdAt ? String(customer.createdAt).slice(0, 10) : "n/a";
              return `
            <tr>
              <td>${customer.firstName} ${customer.lastName}</td>
              <td>${customer.email}</td>
              <td>${customer.phone}</td>
              <td>${customer.licenseNumber}</td>
              <td>${createdAt}</td>
            </tr>
          `;
            }
          )
          .join("")}
      </tbody>
    </table>
  `;

  renderPaginationControls("customer-pagination", paginated, (nextPage) => {
    state.customerPage = nextPage;
    renderCustomerList();
  });
}

function renderMetrics() {
  const metricsContainer = document.getElementById("customer-metrics");
  if (!metricsContainer) {
    return;
  }
  const activeCustomerIds = new Set(state.reservations.map((reservation) => reservation.customerId));
  const metrics = [
    { label: "Total Customers", value: state.customers.length },
    { label: "Customers with Reservations", value: activeCustomerIds.size },
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

async function loadCustomers() {
  const customers = await request("/api/customers");
  let reservations = [];
  try {
    reservations = await request("/api/reservations");
  } catch (_error) {
    // Do not block customer data rendering if reservation endpoint fails.
    reservations = [];
  }
  state.customers = customers;
  state.reservations = reservations;
  state.customerPage = 1;
  renderCustomerList();
  renderMetrics();
}

function attachHandlers() {
  const form = document.getElementById("customer-form");
  if (!form) {
    return;
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      await request("/api/customers", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showToast("Customer added.");
      setFormMessage("Customer saved successfully.");
      form.reset();
      state.customerPage = 1;
      await loadCustomers();
    } catch (error) {
      showToast(error.message, true);
      setFormMessage(
        `${error.message} (Tip: email must be unique for each customer.)`,
        true
      );
    }
  });
}

async function bootstrap() {
  try {
    await sessionReady;
    attachHandlers();
    await loadCustomers();
    if (searchParams.get("status") === "customer_added") {
      setFormMessage("Customer saved successfully.");
    }
    if (searchParams.get("error")) {
      setFormMessage(searchParams.get("error"), true);
      showToast(searchParams.get("error"), true);
    }
    markPageReady("customers");
  } catch (error) {
    showToast(error.message, true);
  }
}

bootstrap();
