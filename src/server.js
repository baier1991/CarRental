const path = require("node:path");
const { randomUUID } = require("node:crypto");
const express = require("express");

const { readStore, writeStore } = require("./data/store");
const { calculateQuote, ADD_ON_DAILY_RATE, INSURANCE_DAILY_RATE } = require("./domain/pricing");
const {
  hasVehicleConflict,
  isDateRangeValid,
  ACTIVE_RESERVATION_STATUSES,
} = require("./domain/reservations");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const VEHICLE_STATUSES = new Set(["available", "maintenance", "inactive"]);
const RESERVATION_STATUSES = new Set([
  "pending",
  "confirmed",
  "active",
  "completed",
  "cancelled",
]);

app.use(express.json());
app.use(express.static(path.resolve(__dirname, "../public")));

function nowIso() {
  return new Date().toISOString();
}

function sendValidationError(res, message) {
  return res.status(400).json({ error: message });
}

function normalizeReservationStatus(status) {
  const normalized = String(status || "pending").trim().toLowerCase();
  if (!RESERVATION_STATUSES.has(normalized)) {
    return null;
  }
  return normalized;
}

function normalizeVehicleStatus(status) {
  const normalized = String(status || "available").trim().toLowerCase();
  if (!VEHICLE_STATUSES.has(normalized)) {
    return null;
  }
  return normalized;
}

function normalizeAddOns(addOns) {
  if (!Array.isArray(addOns)) {
    return [];
  }

  const validAddOnKeys = new Set(Object.keys(ADD_ON_DAILY_RATE));
  const normalized = [];
  for (const item of addOns) {
    const key = String(item).trim();
    if (validAddOnKeys.has(key) && !normalized.includes(key)) {
      normalized.push(key);
    }
  }
  return normalized;
}

function normalizeInsuranceTier(insuranceTier) {
  const normalized = String(insuranceTier || "basic").trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(INSURANCE_DAILY_RATE, normalized)) {
    return "basic";
  }
  return normalized;
}

function calculateDashboard(store) {
  const activeReservations = store.reservations.filter((reservation) =>
    ACTIVE_RESERVATION_STATUSES.has(reservation.status)
  );

  const activeVehicleIds = new Set(activeReservations.map((reservation) => reservation.vehicleId));
  const expectedRevenue = activeReservations.reduce((acc, reservation) => {
    const total = Number(reservation?.pricing?.total || 0);
    return acc + (Number.isFinite(total) ? total : 0);
  }, 0);

  const upcomingPickups = activeReservations
    .filter((reservation) => new Date(reservation.startDate) > new Date())
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
    .slice(0, 5);

  return {
    fleetSize: store.vehicles.length,
    availableVehicles: store.vehicles.filter((vehicle) => vehicle.status === "available").length,
    activeReservations: activeReservations.length,
    activeCustomers: new Set(activeReservations.map((reservation) => reservation.customerId)).size,
    utilizationRate:
      store.vehicles.length === 0
        ? 0
        : Number(((activeVehicleIds.size / store.vehicles.length) * 100).toFixed(1)),
    expectedRevenue: Number(expectedRevenue.toFixed(2)),
    upcomingPickups,
  };
}

app.get("/api/health", (_req, res) => {
  return res.json({ status: "ok", timestamp: nowIso() });
});

app.get("/api/config", (_req, res) => {
  return res.json({
    vehicleStatuses: Array.from(VEHICLE_STATUSES),
    reservationStatuses: Array.from(RESERVATION_STATUSES),
    insuranceTiers: Object.keys(INSURANCE_DAILY_RATE),
    addOns: Object.entries(ADD_ON_DAILY_RATE).map(([key, dailyRate]) => ({ key, dailyRate })),
  });
});

app.get("/api/dashboard", (_req, res) => {
  const store = readStore();
  return res.json(calculateDashboard(store));
});

app.get("/api/vehicles", (req, res) => {
  const store = readStore();
  const statusFilter = req.query.status ? String(req.query.status).trim().toLowerCase() : null;
  const vehicles = statusFilter
    ? store.vehicles.filter((vehicle) => vehicle.status === statusFilter)
    : store.vehicles;
  return res.json(vehicles);
});

app.post("/api/vehicles", (req, res) => {
  const { plateNumber, make, model, year, dailyRate, location, transmission, fuelType } = req.body;
  const status = normalizeVehicleStatus(req.body.status);

  if (!plateNumber || !make || !model || !year || !dailyRate || !location) {
    return sendValidationError(
      res,
      "plateNumber, make, model, year, dailyRate, and location are required."
    );
  }

  if (!status) {
    return sendValidationError(res, "Invalid vehicle status.");
  }

  const parsedDailyRate = Number(dailyRate);
  const parsedYear = Number(year);
  if (Number.isNaN(parsedDailyRate) || parsedDailyRate <= 0) {
    return sendValidationError(res, "dailyRate must be a positive number.");
  }

  if (Number.isNaN(parsedYear) || parsedYear < 1990 || parsedYear > 2100) {
    return sendValidationError(res, "year must be a valid 4-digit number.");
  }

  const store = readStore();
  const duplicatePlate = store.vehicles.some(
    (vehicle) => vehicle.plateNumber.toLowerCase() === String(plateNumber).toLowerCase()
  );
  if (duplicatePlate) {
    return res.status(409).json({ error: "A vehicle with this plate number already exists." });
  }

  const vehicle = {
    id: randomUUID(),
    plateNumber: String(plateNumber).trim().toUpperCase(),
    make: String(make).trim(),
    model: String(model).trim(),
    year: parsedYear,
    dailyRate: parsedDailyRate,
    status,
    location: String(location).trim(),
    transmission: transmission ? String(transmission).trim() : null,
    fuelType: fuelType ? String(fuelType).trim() : null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  store.vehicles.push(vehicle);
  writeStore(store);
  return res.status(201).json(vehicle);
});

app.patch("/api/vehicles/:vehicleId/status", (req, res) => {
  const status = normalizeVehicleStatus(req.body.status);
  if (!status) {
    return sendValidationError(res, "Invalid vehicle status.");
  }

  const store = readStore();
  const vehicle = store.vehicles.find((item) => item.id === req.params.vehicleId);
  if (!vehicle) {
    return res.status(404).json({ error: "Vehicle not found." });
  }

  vehicle.status = status;
  vehicle.updatedAt = nowIso();
  writeStore(store);
  return res.json(vehicle);
});

app.get("/api/customers", (_req, res) => {
  const store = readStore();
  return res.json(store.customers);
});

app.post("/api/customers", (req, res) => {
  const { firstName, lastName, email, phone, licenseNumber } = req.body;
  if (!firstName || !lastName || !email || !phone || !licenseNumber) {
    return sendValidationError(
      res,
      "firstName, lastName, email, phone, and licenseNumber are required."
    );
  }

  const store = readStore();
  const duplicateCustomer = store.customers.some(
    (customer) => customer.email.toLowerCase() === String(email).toLowerCase()
  );
  if (duplicateCustomer) {
    return res.status(409).json({ error: "Customer with this email already exists." });
  }

  const customer = {
    id: randomUUID(),
    firstName: String(firstName).trim(),
    lastName: String(lastName).trim(),
    email: String(email).trim().toLowerCase(),
    phone: String(phone).trim(),
    licenseNumber: String(licenseNumber).trim().toUpperCase(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  store.customers.push(customer);
  writeStore(store);
  return res.status(201).json(customer);
});

app.get("/api/reservations", (_req, res) => {
  const store = readStore();
  const sortedReservations = [...store.reservations].sort(
    (a, b) => new Date(a.startDate) - new Date(b.startDate)
  );
  return res.json(sortedReservations);
});

app.post("/api/reservations", (req, res) => {
  const {
    customerId,
    vehicleId,
    startDate,
    endDate,
    insuranceTier,
    addOns,
    discountCode,
    notes,
  } = req.body;
  const status = normalizeReservationStatus(req.body.status);

  if (!customerId || !vehicleId || !startDate || !endDate) {
    return sendValidationError(res, "customerId, vehicleId, startDate, and endDate are required.");
  }

  if (!status) {
    return sendValidationError(res, "Invalid reservation status.");
  }

  if (!isDateRangeValid(startDate, endDate)) {
    return sendValidationError(res, "Invalid reservation date range.");
  }

  const store = readStore();
  const customer = store.customers.find((item) => item.id === customerId);
  if (!customer) {
    return res.status(404).json({ error: "Customer not found." });
  }

  const vehicle = store.vehicles.find((item) => item.id === vehicleId);
  if (!vehicle) {
    return res.status(404).json({ error: "Vehicle not found." });
  }

  if (vehicle.status !== "available") {
    return res.status(409).json({ error: "Vehicle is not currently available for booking." });
  }

  const normalizedInsuranceTier = normalizeInsuranceTier(insuranceTier);
  const normalizedAddOns = normalizeAddOns(addOns);
  const quote = calculateQuote({
    dailyRate: vehicle.dailyRate,
    startDate,
    endDate,
    insuranceTier: normalizedInsuranceTier,
    addOns: normalizedAddOns,
    discountCode: discountCode || null,
  });

  if (!quote) {
    return sendValidationError(res, "Unable to calculate quote for reservation.");
  }

  const reservation = {
    id: randomUUID(),
    customerId,
    vehicleId,
    startDate,
    endDate,
    status,
    insuranceTier: normalizedInsuranceTier,
    addOns: normalizedAddOns,
    discountCode: discountCode ? String(discountCode).trim().toUpperCase() : null,
    notes: notes ? String(notes).trim() : null,
    rentalDays: quote.rentalDays,
    pricing: quote.pricing,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  if (hasVehicleConflict(store.reservations, reservation)) {
    return res.status(409).json({ error: "Vehicle has an overlapping reservation in this period." });
  }

  store.reservations.push(reservation);
  writeStore(store);
  return res.status(201).json(reservation);
});

app.patch("/api/reservations/:reservationId/status", (req, res) => {
  const status = normalizeReservationStatus(req.body.status);
  if (!status) {
    return sendValidationError(res, "Invalid reservation status.");
  }

  const store = readStore();
  const reservation = store.reservations.find((item) => item.id === req.params.reservationId);
  if (!reservation) {
    return res.status(404).json({ error: "Reservation not found." });
  }

  const candidateReservation = { ...reservation, status };
  if (hasVehicleConflict(store.reservations, candidateReservation, reservation.id)) {
    return res
      .status(409)
      .json({ error: "Cannot activate this reservation because it overlaps another booking." });
  }

  reservation.status = status;
  reservation.updatedAt = nowIso();
  writeStore(store);
  return res.json(reservation);
});

app.post("/api/quotes", (req, res) => {
  const { vehicleId, dailyRate, startDate, endDate, insuranceTier, addOns, discountCode } = req.body;

  if (!startDate || !endDate) {
    return sendValidationError(res, "startDate and endDate are required.");
  }

  let effectiveDailyRate = dailyRate;
  if (vehicleId) {
    const store = readStore();
    const vehicle = store.vehicles.find((item) => item.id === vehicleId);
    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found." });
    }
    effectiveDailyRate = vehicle.dailyRate;
  }

  const quote = calculateQuote({
    dailyRate: effectiveDailyRate,
    startDate,
    endDate,
    insuranceTier: normalizeInsuranceTier(insuranceTier),
    addOns: normalizeAddOns(addOns),
    discountCode: discountCode || null,
  });

  if (!quote) {
    return sendValidationError(res, "Unable to calculate quote. Check dates and rates.");
  }

  return res.json(quote);
});

app.use((err, _req, res, _next) => {
  // Catch-all to avoid leaking stack traces in responses.
  // Logging here keeps debugging practical during development.
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Car rental product running on http://localhost:${PORT}`);
  });
}

module.exports = {
  app,
  calculateDashboard,
};
