const {
  request,
  showToast,
  collectCheckedValues,
  formatMoney,
  vehicleLabel,
  sessionReady,
  markPageReady,
  paginateItems,
  renderPaginationControls,
} =
  window.AppCommon;

const state = {
  vehicles: [],
  customers: [],
  reservations: [],
  reservationPage: 1,
  reservationPageSize: 8,
};

const INLINE_CUSTOMER_FIELD_NAMES = [
  "inlineCustomerFirstName",
  "inlineCustomerLastName",
  "inlineCustomerEmail",
  "inlineCustomerPhone",
  "inlineCustomerLicenseNumber",
];

function populateSelects() {
  const customerSelect = document.getElementById("reservation-customer");
  const reservationVehicleSelect = document.getElementById("reservation-vehicle");
  const quoteVehicleSelect = document.getElementById("quote-vehicle");

  customerSelect.innerHTML = state.customers
    .map((customer) => `<option value="${customer.id}">${customer.firstName} ${customer.lastName} (${customer.email})</option>`)
    .join("");

  const vehicleOptions = state.vehicles
    .map((vehicle) => `<option value="${vehicle.id}">${vehicleLabel(vehicle)}</option>`)
    .join("");
  reservationVehicleSelect.innerHTML = vehicleOptions;
  quoteVehicleSelect.innerHTML = vehicleOptions;
}

function setInlineCustomerMode(isEnabled) {
  const customerSelect = document.getElementById("reservation-customer");
  const inlineContainer = document.getElementById("reservation-inline-customer-fields");
  if (!customerSelect || !inlineContainer) {
    return;
  }

  inlineContainer.classList.toggle("hidden", !isEnabled);
  customerSelect.disabled = isEnabled;
  customerSelect.required = !isEnabled;

  INLINE_CUSTOMER_FIELD_NAMES.forEach((fieldName) => {
    const field = inlineContainer.querySelector(`[name="${fieldName}"]`);
    if (!(field instanceof HTMLInputElement)) {
      return;
    }
    field.required = isEnabled;
    if (!isEnabled) {
      field.value = "";
    }
  });
}

function renderReservations() {
  const container = document.getElementById("reservation-list");
  if (state.reservations.length === 0) {
    container.innerHTML = "<p>No reservations yet.</p>";
    renderPaginationControls("reservation-pagination", null);
    return;
  }

  const paginated = paginateItems(state.reservations, state.reservationPage, state.reservationPageSize);
  state.reservationPage = paginated.currentPage;

  const customerMap = new Map(state.customers.map((customer) => [customer.id, `${customer.firstName} ${customer.lastName}`]));
  const vehicleMap = new Map(state.vehicles.map((vehicle) => [vehicle.id, `${vehicle.plateNumber} (${vehicle.make} ${vehicle.model})`]));

  container.innerHTML = `
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
        ${paginated.items
          .map(
            (reservation) => {
              const totalPrice =
                reservation && reservation.pricing && typeof reservation.pricing.total === "number"
                  ? reservation.pricing.total
                  : 0;
              const addOnLabel =
                reservation && Array.isArray(reservation.addOns) && reservation.addOns.length
                  ? reservation.addOns.join(", ")
                  : "none";
              return `
            <tr>
              <td>${customerMap.get(reservation.customerId) || reservation.customerId}</td>
              <td>${vehicleMap.get(reservation.vehicleId) || reservation.vehicleId}</td>
              <td>${reservation.startDate} → ${reservation.endDate}</td>
              <td><span class="badge">${reservation.status}</span></td>
              <td>${formatMoney(totalPrice)}</td>
              <td>${addOnLabel}</td>
            </tr>
          `;
            }
          )
          .join("")}
      </tbody>
    </table>
  `;

  renderPaginationControls("reservation-pagination", paginated, (nextPage) => {
    state.reservationPage = nextPage;
    renderReservations();
  });
}

async function loadReservationData() {
  const [vehicles, customers, reservations] = await Promise.all([
    request("/api/vehicles"),
    request("/api/customers"),
    request("/api/reservations"),
  ]);
  state.vehicles = vehicles;
  state.customers = customers;
  state.reservations = reservations;
  state.reservationPage = 1;
  populateSelects();
  renderReservations();
}

function attachHandlers() {
  const reservationForm = document.getElementById("reservation-form");
  const quoteForm = document.getElementById("quote-form");
  const quoteResult = document.getElementById("quote-result");
  const inlineToggle = document.getElementById("reservation-create-customer-inline");

  setInlineCustomerMode(false);
  if (inlineToggle instanceof HTMLInputElement) {
    inlineToggle.addEventListener("change", () => {
      setInlineCustomerMode(inlineToggle.checked);
    });
  }

  reservationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(reservationForm);
    const payload = Object.fromEntries(formData.entries());
    payload.addOns = collectCheckedValues(reservationForm, "addOns");

    const shouldCreateInlineCustomer = formData.get("createCustomerInline") === "on";
    const inlineCustomerPayload = {
      firstName: String(payload.inlineCustomerFirstName || "").trim(),
      lastName: String(payload.inlineCustomerLastName || "").trim(),
      email: String(payload.inlineCustomerEmail || "").trim(),
      phone: String(payload.inlineCustomerPhone || "").trim(),
      licenseNumber: String(payload.inlineCustomerLicenseNumber || "").trim(),
    };
    delete payload.createCustomerInline;
    INLINE_CUSTOMER_FIELD_NAMES.forEach((fieldName) => delete payload[fieldName]);

    let inlineCustomerCreated = null;
    try {
      if (shouldCreateInlineCustomer) {
        const inlineFieldsMissing = Object.values(inlineCustomerPayload).some((value) => !value);
        if (inlineFieldsMissing) {
          throw new Error("Please complete all new customer fields.");
        }
        inlineCustomerCreated = await request("/api/customers", {
          method: "POST",
          body: JSON.stringify(inlineCustomerPayload),
        });
        payload.customerId = inlineCustomerCreated.id;
      }

      const reservation = await request("/api/reservations", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showToast(`Reservation created (${formatMoney(reservation.pricing.total)}).`);
      reservationForm.reset();
      setInlineCustomerMode(false);
      state.reservationPage = 1;
      await loadReservationData();
    } catch (error) {
      if (inlineCustomerCreated) {
        showToast(
          `${error.message} New customer was created and is now available in the customer list.`,
          true
        );
      } else {
        showToast(error.message, true);
      }
    }
  });

  quoteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(quoteForm).entries());
    payload.addOns = collectCheckedValues(quoteForm, "addOns");

    try {
      const quote = await request("/api/quotes", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      quoteResult.innerHTML = `
        <strong>Total:</strong> ${formatMoney(quote.pricing.total)}<br />
        Rental days: ${quote.rentalDays}<br />
        Base: ${formatMoney(quote.pricing.basePrice)} |
        Insurance: ${formatMoney(quote.pricing.insurancePrice)} |
        Add-ons: ${formatMoney(quote.pricing.addOnPrice)}<br />
        Tax: ${formatMoney(quote.pricing.tax)}
      `;
      showToast("Quote calculated.");
    } catch (error) {
      showToast(error.message, true);
      quoteResult.innerHTML = "<em>Could not calculate quote.</em>";
    }
  });
}

async function bootstrap() {
  try {
    await sessionReady;
    attachHandlers();
    await loadReservationData();
    markPageReady("reservations");
  } catch (error) {
    showToast(error.message, true);
  }
}

bootstrap();
