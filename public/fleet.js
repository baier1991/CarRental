const { request, showToast, collectCheckedValues, formatMoney, vehicleLabel, sessionReady } =
  window.AppCommon;

const state = {
  vehicles: [],
};

function renderVehicleList() {
  const container = document.getElementById("vehicle-list");
  if (state.vehicles.length === 0) {
    container.innerHTML = "<p>No vehicles yet.</p>";
    return;
  }

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
          <th>Compliance</th>
        </tr>
      </thead>
      <tbody>
        ${state.vehicles
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
              <td>
                ${vehicle.registrationExpiryDate ? `Reg: ${vehicle.registrationExpiryDate}<br />` : ""}
                ${vehicle.insuranceExpiryDate ? `Ins: ${vehicle.insuranceExpiryDate}<br />` : ""}
                ${vehicle.nextServiceDate ? `Service: ${vehicle.nextServiceDate}` : ""}
              </td>
            </tr>
          `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function populateEditSelect() {
  const editSelect = document.getElementById("edit-vehicle-select");
  const current = editSelect.value;
  editSelect.innerHTML = state.vehicles
    .map((vehicle) => `<option value="${vehicle.id}">${vehicleLabel(vehicle)}</option>`)
    .join("");
  if (current) {
    editSelect.value = current;
  }

  if (!editSelect.value && state.vehicles[0]) {
    editSelect.value = state.vehicles[0].id;
  }
}

function populateEditForm(vehicleId) {
  const vehicle = state.vehicles.find((item) => item.id === vehicleId);
  if (!vehicle) {
    return;
  }

  const form = document.getElementById("edit-vehicle-form");
  const fields = [
    "dailyRate",
    "weekendDailyRate",
    "weeklyRate",
    "monthlyRate",
    "status",
    "branchCode",
    "location",
    "odometerKm",
    "registrationExpiryDate",
    "insuranceExpiryDate",
    "inspectionDueDate",
    "nextServiceDate",
    "nextServiceAtKm",
    "securityDeposit",
    "notes",
  ];

  fields.forEach((field) => {
    if (!form.elements[field]) {
      return;
    }
    form.elements[field].value = vehicle[field] == null ? "" : vehicle[field];
  });

  const featureSet = new Set(Array.isArray(vehicle.features) ? vehicle.features : []);
  Array.from(form.querySelectorAll('input[name="editFeatures"]')).forEach((checkbox) => {
    checkbox.checked = featureSet.has(checkbox.value);
  });
}

async function loadFleetData() {
  state.vehicles = await request("/api/vehicles");
  renderVehicleList();
  populateEditSelect();
  populateEditForm(document.getElementById("edit-vehicle-select").value);
}

function attachHandlers() {
  const addForm = document.getElementById("vehicle-form");
  const editForm = document.getElementById("edit-vehicle-form");
  const editSelect = document.getElementById("edit-vehicle-select");
  const csvForm = document.getElementById("vehicle-csv-form");
  const csvFile = document.getElementById("vehicle-csv-file");
  const csvContent = document.getElementById("vehicle-csv-content");
  const csvResult = document.getElementById("csv-import-result");

  addForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(addForm).entries());
    payload.features = collectCheckedValues(addForm, "features");

    try {
      await request("/api/vehicles", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showToast("Vehicle added.");
      addForm.reset();
      await loadFleetData();
    } catch (error) {
      showToast(error.message, true);
    }
  });

  editSelect.addEventListener("change", () => {
    populateEditForm(editSelect.value);
  });

  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const vehicleId = editSelect.value;
    if (!vehicleId) {
      showToast("Select a vehicle to edit.", true);
      return;
    }

    const payload = Object.fromEntries(new FormData(editForm).entries());
    delete payload.vehicleId;
    payload.features = collectCheckedValues(editForm, "editFeatures");

    try {
      await request(`/api/vehicles/${vehicleId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      showToast("Vehicle updated.");
      await loadFleetData();
    } catch (error) {
      showToast(error.message, true);
    }
  });

  csvFile.addEventListener("change", async (event) => {
    const hasFiles = event && event.target && event.target.files && event.target.files.length > 0;
    const file = hasFiles ? event.target.files[0] : null;
    if (!file) {
      return;
    }
    csvContent.value = await file.text();
  });

  csvForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(csvForm);
    const payload = Object.fromEntries(formData.entries());
    payload.skipDuplicates = formData.get("skipDuplicates") === "on";

    try {
      const result = await request("/api/vehicles/import-csv", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      csvResult.innerHTML = `
        <strong>Import completed.</strong><br />
        Imported: ${result.importedCount}<br />
        Skipped: ${result.skippedCount}<br />
        ${
          result.errors.length
            ? result.errors
                .slice(0, 6)
                .map((item) => `Row ${item && item.row != null ? item.row : "-"}: ${item.error}`)
                .join("<br />")
            : "No row errors."
        }
      `;
      showToast("CSV import finished.");
      await loadFleetData();
    } catch (error) {
      showToast(error.message, true);
      csvResult.innerHTML = "<em>CSV import failed.</em>";
    }
  });
}

async function bootstrap() {
  try {
    await sessionReady;
    attachHandlers();
    await loadFleetData();
  } catch (error) {
    showToast(error.message, true);
  }
}

bootstrap();
