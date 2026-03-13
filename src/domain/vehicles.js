const VEHICLE_STATUSES = new Set(["available", "maintenance", "inactive", "cleaning"]);
const VEHICLE_CATEGORIES = new Set([
  "economy",
  "compact",
  "sedan",
  "suv",
  "luxury",
  "van",
  "pickup",
  "electric",
]);
const OWNERSHIP_TYPES = new Set(["owned", "leased", "franchise"]);
const VEHICLE_FEATURE_KEYS = new Set([
  "bluetooth",
  "appleCarPlay",
  "androidAuto",
  "backupCamera",
  "cruiseControl",
  "leatherSeats",
  "sunroof",
  "parkingSensors",
  "tollTag",
]);

const REGISTRATION = {
  dateFormat: /^\d{4}-\d{2}-\d{2}$/,
  docExpiryWarningDays: 30,
};

function sanitizeText(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
}

function parsePositiveNumber(value, fieldName, errors) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) {
    errors.push(`${fieldName} must be a valid positive number.`);
    return null;
  }
  return parsed;
}

function parseInteger(value, fieldName, errors, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    errors.push(`${fieldName} must be an integer between ${min} and ${max}.`);
    return null;
  }
  return parsed;
}

function parseDateOnly(value, fieldName, errors) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const normalized = String(value).trim();
  if (!REGISTRATION.dateFormat.test(normalized)) {
    errors.push(`${fieldName} must use YYYY-MM-DD format.`);
    return null;
  }
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    errors.push(`${fieldName} must be a valid date.`);
    return null;
  }
  if (date.toISOString().slice(0, 10) !== normalized) {
    errors.push(`${fieldName} must be a valid calendar date.`);
    return null;
  }
  return normalized;
}

function parseFeatures(features) {
  const values = Array.isArray(features) ? features : [features];
  if (!values[0]) {
    return [];
  }
  const normalized = [];
  for (const value of values) {
    const key = String(value).trim();
    if (VEHICLE_FEATURE_KEYS.has(key) && !normalized.includes(key)) {
      normalized.push(key);
    }
  }
  return normalized;
}

function isValidUrl(value) {
  if (!value) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

function normalizeVehicleInput(payload = {}) {
  const errors = [];

  const plateNumber = sanitizeText(payload.plateNumber)?.toUpperCase();
  const vin = sanitizeText(payload.vin)?.toUpperCase() || null;
  const make = sanitizeText(payload.make);
  const model = sanitizeText(payload.model);
  const location = sanitizeText(payload.location);
  const branchCode = sanitizeText(payload.branchCode)?.toUpperCase() || null;
  const color = sanitizeText(payload.color);
  const transmission = sanitizeText(payload.transmission);
  const fuelType = sanitizeText(payload.fuelType);
  const imageUrl = sanitizeText(payload.imageUrl);
  const notes = sanitizeText(payload.notes);

  const year = parseInteger(payload.year, "year", errors, { min: 1990, max: 2100 });
  const dailyRate = parsePositiveNumber(payload.dailyRate, "dailyRate", errors);
  const weekendDailyRate = parsePositiveNumber(payload.weekendDailyRate, "weekendDailyRate", errors);
  const weeklyRate = parsePositiveNumber(payload.weeklyRate, "weeklyRate", errors);
  const monthlyRate = parsePositiveNumber(payload.monthlyRate, "monthlyRate", errors);
  const securityDeposit = parsePositiveNumber(payload.securityDeposit, "securityDeposit", errors);
  const mileageLimitPerDay = parsePositiveNumber(
    payload.mileageLimitPerDay,
    "mileageLimitPerDay",
    errors
  );
  const extraKmRate = parsePositiveNumber(payload.extraKmRate, "extraKmRate", errors);
  const acquisitionCost = parsePositiveNumber(payload.acquisitionCost, "acquisitionCost", errors);
  const odometerKm = parseInteger(payload.odometerKm, "odometerKm", errors, { min: 0 });
  const seats = parseInteger(payload.seats, "seats", errors, { min: 1, max: 20 });
  const doors = parseInteger(payload.doors, "doors", errors, { min: 2, max: 8 });
  const nextServiceAtKm = parseInteger(payload.nextServiceAtKm, "nextServiceAtKm", errors, { min: 0 });

  const registrationExpiryDate = parseDateOnly(
    payload.registrationExpiryDate,
    "registrationExpiryDate",
    errors
  );
  const insuranceExpiryDate = parseDateOnly(payload.insuranceExpiryDate, "insuranceExpiryDate", errors);
  const inspectionDueDate = parseDateOnly(payload.inspectionDueDate, "inspectionDueDate", errors);
  const nextServiceDate = parseDateOnly(payload.nextServiceDate, "nextServiceDate", errors);
  const acquisitionDate = parseDateOnly(payload.acquisitionDate, "acquisitionDate", errors);

  if (!plateNumber || !make || !model || !year || dailyRate === null || !location) {
    errors.push("plateNumber, make, model, year, dailyRate, and location are required.");
  }
  if (dailyRate !== null && dailyRate <= 0) {
    errors.push("dailyRate must be greater than zero.");
  }

  if (plateNumber && plateNumber.length < 4) {
    errors.push("plateNumber must be at least 4 characters.");
  }

  if (vin && vin.length !== 17) {
    errors.push("vin must be exactly 17 characters.");
  }

  const status = String(payload.status || "available")
    .trim()
    .toLowerCase();
  if (!VEHICLE_STATUSES.has(status)) {
    errors.push("Invalid vehicle status.");
  }

  const category = String(payload.category || "sedan")
    .trim()
    .toLowerCase();
  if (!VEHICLE_CATEGORIES.has(category)) {
    errors.push("Invalid vehicle category.");
  }

  const ownershipType = String(payload.ownershipType || "owned")
    .trim()
    .toLowerCase();
  if (!OWNERSHIP_TYPES.has(ownershipType)) {
    errors.push("Invalid ownershipType.");
  }

  if (imageUrl && !isValidUrl(imageUrl)) {
    errors.push("imageUrl must be a valid URL.");
  }

  if (nextServiceAtKm !== null && odometerKm !== null && nextServiceAtKm < odometerKm) {
    errors.push("nextServiceAtKm must be greater than or equal to odometerKm.");
  }

  const normalizedVehicle = {
    plateNumber,
    vin,
    make,
    model,
    year,
    category,
    dailyRate,
    weekendDailyRate,
    weeklyRate,
    monthlyRate,
    securityDeposit,
    status,
    location,
    branchCode,
    transmission,
    fuelType,
    color,
    seats,
    doors,
    odometerKm,
    mileageLimitPerDay,
    extraKmRate,
    registrationExpiryDate,
    insuranceExpiryDate,
    inspectionDueDate,
    nextServiceAtKm,
    nextServiceDate,
    ownershipType,
    acquisitionDate,
    acquisitionCost,
    imageUrl,
    features: parseFeatures(payload.features),
    notes,
  };

  return {
    errors,
    normalizedVehicle,
  };
}

function daysBetween(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  return Math.ceil((end - start) / (24 * 60 * 60 * 1000));
}

function getVehicleAlerts(vehicle, referenceDate = new Date()) {
  const alerts = [];
  const today = new Date(referenceDate.toISOString().slice(0, 10));
  const dateChecks = [
    { key: "registrationExpiryDate", label: "Registration" },
    { key: "insuranceExpiryDate", label: "Insurance" },
    { key: "inspectionDueDate", label: "Inspection" },
  ];

  for (const check of dateChecks) {
    const value = vehicle?.[check.key];
    if (!value) {
      continue;
    }
    const days = daysBetween(today, value);
    if (days === null) {
      continue;
    }
    if (days < 0) {
      alerts.push({
        type: "critical",
        code: `${check.key}:expired`,
        message: `${check.label} expired`,
      });
    } else if (days <= REGISTRATION.docExpiryWarningDays) {
      alerts.push({
        type: "warning",
        code: `${check.key}:expiring`,
        message: `${check.label} expires in ${days} day(s)`,
      });
    }
  }

  const odometer = Number(vehicle?.odometerKm);
  const serviceThreshold = Number(vehicle?.nextServiceAtKm);
  if (Number.isFinite(serviceThreshold) && Number.isFinite(odometer) && odometer >= serviceThreshold) {
    alerts.push({
      type: "critical",
      code: "service:overdue_km",
      message: "Service is due by odometer threshold",
    });
  }

  if (vehicle?.nextServiceDate) {
    const daysToService = daysBetween(today, vehicle.nextServiceDate);
    if (daysToService !== null) {
      if (daysToService < 0) {
        alerts.push({
          type: "critical",
          code: "service:overdue_date",
          message: "Service date is overdue",
        });
      } else if (daysToService <= 14) {
        alerts.push({
          type: "warning",
          code: "service:upcoming_date",
          message: `Service due in ${daysToService} day(s)`,
        });
      }
    }
  }

  return alerts;
}

module.exports = {
  VEHICLE_STATUSES,
  VEHICLE_CATEGORIES,
  OWNERSHIP_TYPES,
  VEHICLE_FEATURE_KEYS,
  normalizeVehicleInput,
  getVehicleAlerts,
};
