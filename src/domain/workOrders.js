const WORK_ORDER_STATUSES = new Set(["open", "in_progress", "on_hold", "completed", "cancelled"]);
const WORK_ORDER_PRIORITIES = new Set(["low", "medium", "high", "critical"]);

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function parseDateOnly(value, fieldName, errors) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const normalized = String(value).trim();
  if (!DATE_ONLY_REGEX.test(normalized)) {
    errors.push(`${fieldName} must use YYYY-MM-DD format.`);
    return null;
  }
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    errors.push(`${fieldName} must be a valid calendar date.`);
    return null;
  }
  return normalized;
}

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

function normalizeStatus(status, errors) {
  const normalized = String(status || "open")
    .trim()
    .toLowerCase();
  if (!WORK_ORDER_STATUSES.has(normalized)) {
    errors.push("Invalid work order status.");
    return null;
  }
  return normalized;
}

function normalizePriority(priority, errors) {
  const normalized = String(priority || "medium")
    .trim()
    .toLowerCase();
  if (!WORK_ORDER_PRIORITIES.has(normalized)) {
    errors.push("Invalid work order priority.");
    return null;
  }
  return normalized;
}

function normalizeWorkOrderInput(payload = {}, options = {}) {
  const partial = options.partial === true;
  const errors = [];
  const normalized = {};

  function hasKey(key) {
    return Object.prototype.hasOwnProperty.call(payload, key);
  }

  function setText(key, requiredWhenPresent = false) {
    if (!hasKey(key)) {
      return;
    }
    const value = sanitizeText(payload[key]);
    if (requiredWhenPresent && value === null) {
      errors.push(`${key} cannot be empty.`);
      return;
    }
    normalized[key] = value;
  }

  function setMoney(key) {
    if (!hasKey(key)) {
      return;
    }
    normalized[key] = parsePositiveNumber(payload[key], key, errors);
  }

  setText("title", true);
  setText("description");
  setText("vendorName");
  setText("notes");
  setMoney("costEstimate");
  setMoney("actualCost");

  if (hasKey("scheduledDate")) {
    normalized.scheduledDate = parseDateOnly(payload.scheduledDate, "scheduledDate", errors);
  }
  if (hasKey("completedDate")) {
    normalized.completedDate = parseDateOnly(payload.completedDate, "completedDate", errors);
  }

  if (hasKey("odometerKm")) {
    const parsed = Number(payload.odometerKm);
    if (!Number.isInteger(parsed) || parsed < 0) {
      errors.push("odometerKm must be a positive integer.");
    } else {
      normalized.odometerKm = parsed;
    }
  }

  if (hasKey("status")) {
    normalized.status = normalizeStatus(payload.status, errors);
  } else if (!partial) {
    normalized.status = "open";
  }

  if (hasKey("priority")) {
    normalized.priority = normalizePriority(payload.priority, errors);
  } else if (!partial) {
    normalized.priority = "medium";
  }

  if (!partial && !normalized.title) {
    errors.push("title is required.");
  }

  if (normalized.completedDate && normalized.status && normalized.status !== "completed") {
    errors.push("completedDate can only be set when status is completed.");
  }

  return {
    errors,
    normalizedWorkOrder: normalized,
  };
}

module.exports = {
  WORK_ORDER_STATUSES,
  WORK_ORDER_PRIORITIES,
  normalizeWorkOrderInput,
};
