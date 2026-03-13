const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const express = require("express");
const multer = require("multer");

const { readStore, writeStore, resetStoreWithSeed } = require("./data/store");
const { calculateQuote, ADD_ON_DAILY_RATE, INSURANCE_DAILY_RATE } = require("./domain/pricing");
const {
  hasVehicleConflict,
  isDateRangeValid,
  ACTIVE_RESERVATION_STATUSES,
} = require("./domain/reservations");
const {
  VEHICLE_STATUSES,
  VEHICLE_CATEGORIES,
  OWNERSHIP_TYPES,
  VEHICLE_FEATURE_KEYS,
  normalizeVehicleInput,
  normalizeVehiclePatchInput,
  getVehicleAlerts,
} = require("./domain/vehicles");
const { parseCsvContent, csvRowToVehiclePayload } = require("./domain/vehicleImport");
const {
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
  normalizeWorkOrderInput,
} = require("./domain/workOrders");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const RESERVATION_STATUSES = new Set([
  "pending",
  "confirmed",
  "active",
  "completed",
  "cancelled",
]);
const DOCUMENT_TYPES = new Set(["registration", "insurance", "inspection", "contract", "other"]);
const ACTIVE_WORK_ORDER_STATUSES = new Set(["open", "in_progress", "on_hold"]);
const UPLOAD_DIRECTORY = path.resolve(__dirname, "../uploads/vehicle-documents");
const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

app.use(express.json());
app.use(express.static(path.resolve(__dirname, "../public")));
app.use("/uploads", express.static(path.resolve(__dirname, "../uploads")));

function ensureUploadDirectory() {
  if (!fs.existsSync(UPLOAD_DIRECTORY)) {
    fs.mkdirSync(UPLOAD_DIRECTORY, { recursive: true });
  }
}

function sanitizeFileName(name) {
  return String(name || "document")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
}

const documentStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    ensureUploadDirectory();
    callback(null, UPLOAD_DIRECTORY);
  },
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname || "").toLowerCase();
    const safeName = sanitizeFileName(path.basename(file.originalname || "document", extension));
    callback(null, `${Date.now()}-${randomUUID()}-${safeName}${extension}`);
  },
});

const uploadVehicleDocument = multer({
  storage: documentStorage,
  limits: {
    fileSize: MAX_DOCUMENT_SIZE_BYTES,
  },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname || "").toLowerCase();
    const allowedExtensions = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp"]);
    const allowedMimeTypes = new Set([
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
    ]);

    if (!allowedExtensions.has(extension) || !allowedMimeTypes.has(file.mimetype)) {
      callback(new Error("Only PDF, PNG, JPG, JPEG, and WEBP files are allowed."));
      return;
    }

    callback(null, true);
  },
});

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

function normalizeDocumentType(documentType) {
  const normalized = String(documentType || "other")
    .trim()
    .toLowerCase();
  if (!DOCUMENT_TYPES.has(normalized)) {
    return null;
  }
  return normalized;
}

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

  const vehicleAlertSummary = store.vehicles.reduce(
    (acc, vehicle) => {
      const alerts = getVehicleAlerts(vehicle);
      if (alerts.length) {
        acc.vehiclesNeedingAttention += 1;
      }

      for (const alert of alerts) {
        if (alert.type === "critical") {
          acc.criticalVehicleAlerts += 1;
        } else {
          acc.warningVehicleAlerts += 1;
        }
      }
      return acc;
    },
    {
      vehiclesNeedingAttention: 0,
      criticalVehicleAlerts: 0,
      warningVehicleAlerts: 0,
    }
  );
  const openWorkOrders = store.workOrders.filter((workOrder) =>
    ACTIVE_WORK_ORDER_STATUSES.has(workOrder.status)
  );
  const today = new Date().toISOString().slice(0, 10);
  const overdueWorkOrders = openWorkOrders.filter(
    (workOrder) => workOrder.scheduledDate && workOrder.scheduledDate < today
  ).length;
  const maintenanceSpend = store.workOrders
    .filter((workOrder) => workOrder.status === "completed")
    .reduce((acc, workOrder) => acc + safeNumber(workOrder.actualCost), 0);

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
    openWorkOrders: openWorkOrders.length,
    overdueWorkOrders,
    maintenanceSpend: Number(maintenanceSpend.toFixed(2)),
    ...vehicleAlertSummary,
    upcomingPickups,
  };
}

app.get("/api/health", (_req, res) => {
  return res.json({ status: "ok", timestamp: nowIso() });
});

app.post("/api/admin/seed-demo", (_req, res) => {
  const seededStore = resetStoreWithSeed();
  return res.json({
    success: true,
    counts: {
      vehicles: seededStore.vehicles.length,
      customers: seededStore.customers.length,
      reservations: seededStore.reservations.length,
      workOrders: seededStore.workOrders.length,
      vehicleDocuments: seededStore.vehicleDocuments.length,
    },
  });
});

app.get("/api/config", (_req, res) => {
  return res.json({
    vehicleStatuses: Array.from(VEHICLE_STATUSES),
    vehicleCategories: Array.from(VEHICLE_CATEGORIES),
    ownershipTypes: Array.from(OWNERSHIP_TYPES),
    vehicleFeatures: Array.from(VEHICLE_FEATURE_KEYS),
    documentTypes: Array.from(DOCUMENT_TYPES),
    workOrderStatuses: Array.from(WORK_ORDER_STATUSES),
    workOrderPriorities: Array.from(WORK_ORDER_PRIORITIES),
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
  const categoryFilter = req.query.category ? String(req.query.category).trim().toLowerCase() : null;
  const branchFilter = req.query.branch ? String(req.query.branch).trim().toUpperCase() : null;
  const vehicles = store.vehicles.filter((vehicle) => {
    if (statusFilter && vehicle.status !== statusFilter) {
      return false;
    }
    if (categoryFilter && String(vehicle.category || "").toLowerCase() !== categoryFilter) {
      return false;
    }
    if (branchFilter && String(vehicle.branchCode || "").toUpperCase() !== branchFilter) {
      return false;
    }
    return true;
  });
  return res.json(vehicles);
});

app.post("/api/vehicles/import-csv", (req, res) => {
  const csvContent = req.body?.csvContent;
  const defaults = {
    location: req.body?.defaultLocation,
    branchCode: req.body?.defaultBranchCode,
    ownershipType: req.body?.defaultOwnershipType,
    status: req.body?.defaultStatus,
    category: req.body?.defaultCategory,
  };
  const skipDuplicates = req.body?.skipDuplicates !== false;

  if (!csvContent || !String(csvContent).trim()) {
    return sendValidationError(res, "csvContent is required.");
  }

  const parsed = parseCsvContent(csvContent);
  if (parsed.errors.length > 0 && parsed.rows.length === 0) {
    return res.status(400).json({ error: parsed.errors[0], details: parsed.errors });
  }

  const store = readStore();
  const existingPlateSet = new Set(
    store.vehicles.map((vehicle) => String(vehicle.plateNumber || "").toUpperCase())
  );
  const existingVinSet = new Set(
    store.vehicles
      .map((vehicle) => String(vehicle.vin || "").toUpperCase())
      .filter((value) => value.length > 0)
  );

  const importedVehicles = [];
  const errors = parsed.errors.map((error) => ({ row: null, error }));

  for (const item of parsed.rows) {
    const payload = csvRowToVehiclePayload(item.row, defaults);
    const { errors: validationErrors, normalizedVehicle } = normalizeVehicleInput(payload);
    if (validationErrors.length > 0) {
      errors.push({ row: item.rowNumber, error: validationErrors[0] });
      continue;
    }

    if (existingPlateSet.has(normalizedVehicle.plateNumber)) {
      if (!skipDuplicates) {
        return res
          .status(409)
          .json({ error: `Duplicate plate number detected on row ${item.rowNumber}.` });
      }
      errors.push({ row: item.rowNumber, error: "Duplicate plate number. Row skipped." });
      continue;
    }

    if (normalizedVehicle.vin && existingVinSet.has(normalizedVehicle.vin)) {
      if (!skipDuplicates) {
        return res.status(409).json({ error: `Duplicate VIN detected on row ${item.rowNumber}.` });
      }
      errors.push({ row: item.rowNumber, error: "Duplicate VIN. Row skipped." });
      continue;
    }

    const vehicle = {
      id: randomUUID(),
      ...normalizedVehicle,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    importedVehicles.push(vehicle);
    existingPlateSet.add(normalizedVehicle.plateNumber);
    if (normalizedVehicle.vin) {
      existingVinSet.add(normalizedVehicle.vin);
    }
  }

  if (importedVehicles.length > 0) {
    store.vehicles.push(...importedVehicles);
    writeStore(store);
  }

  return res.status(201).json({
    importedCount: importedVehicles.length,
    skippedCount: errors.length,
    errors,
    vehicles: importedVehicles,
  });
});

app.post("/api/vehicles", (req, res) => {
  const { errors, normalizedVehicle } = normalizeVehicleInput(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: errors[0], details: errors });
  }

  const store = readStore();
  const duplicatePlate = store.vehicles.some(
    (vehicle) =>
      String(vehicle.plateNumber || "").toUpperCase() === String(normalizedVehicle.plateNumber).toUpperCase()
  );
  if (duplicatePlate) {
    return res.status(409).json({ error: "A vehicle with this plate number already exists." });
  }

  const duplicateVin =
    normalizedVehicle.vin &&
    store.vehicles.some((vehicle) => String(vehicle.vin || "").toUpperCase() === normalizedVehicle.vin);
  if (duplicateVin) {
    return res.status(409).json({ error: "A vehicle with this VIN already exists." });
  }

  const vehicle = {
    id: randomUUID(),
    ...normalizedVehicle,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  store.vehicles.push(vehicle);
  writeStore(store);
  return res.status(201).json(vehicle);
});

app.get("/api/vehicles/:vehicleId", (req, res) => {
  const store = readStore();
  const vehicle = store.vehicles.find((item) => item.id === req.params.vehicleId);
  if (!vehicle) {
    return res.status(404).json({ error: "Vehicle not found." });
  }

  const documents = store.vehicleDocuments.filter((document) => document.vehicleId === vehicle.id);
  const workOrders = store.workOrders.filter((workOrder) => workOrder.vehicleId === vehicle.id);

  return res.json({
    ...vehicle,
    alerts: getVehicleAlerts(vehicle),
    documents,
    workOrders,
  });
});

app.patch("/api/vehicles/:vehicleId", (req, res) => {
  const store = readStore();
  const vehicle = store.vehicles.find((item) => item.id === req.params.vehicleId);
  if (!vehicle) {
    return res.status(404).json({ error: "Vehicle not found." });
  }

  const { errors, normalizedPatch } = normalizeVehiclePatchInput(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: errors[0], details: errors });
  }

  if (
    normalizedPatch.plateNumber &&
    store.vehicles.some(
      (item) =>
        item.id !== vehicle.id &&
        String(item.plateNumber || "").toUpperCase() === normalizedPatch.plateNumber
    )
  ) {
    return res.status(409).json({ error: "A vehicle with this plate number already exists." });
  }

  if (
    normalizedPatch.vin &&
    store.vehicles.some(
      (item) => item.id !== vehicle.id && String(item.vin || "").toUpperCase() === normalizedPatch.vin
    )
  ) {
    return res.status(409).json({ error: "A vehicle with this VIN already exists." });
  }

  if (
    (normalizedPatch.odometerKm !== undefined || normalizedPatch.nextServiceAtKm !== undefined) &&
    safeNumber(
      normalizedPatch.nextServiceAtKm !== undefined ? normalizedPatch.nextServiceAtKm : vehicle.nextServiceAtKm
    ) <
      safeNumber(
        normalizedPatch.odometerKm !== undefined ? normalizedPatch.odometerKm : vehicle.odometerKm
      )
  ) {
    return sendValidationError(res, "nextServiceAtKm must be greater than or equal to odometerKm.");
  }

  Object.assign(vehicle, normalizedPatch, { updatedAt: nowIso() });
  writeStore(store);
  return res.json(vehicle);
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

app.get("/api/vehicles/:vehicleId/documents", (req, res) => {
  const store = readStore();
  const vehicle = store.vehicles.find((item) => item.id === req.params.vehicleId);
  if (!vehicle) {
    return res.status(404).json({ error: "Vehicle not found." });
  }

  const documents = store.vehicleDocuments
    .filter((document) => document.vehicleId === vehicle.id)
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  return res.json(documents);
});

app.post("/api/vehicles/:vehicleId/documents", (req, res) => {
  uploadVehicleDocument.single("document")(req, res, (uploadError) => {
    if (uploadError) {
      const message =
        uploadError instanceof multer.MulterError
          ? uploadError.code === "LIMIT_FILE_SIZE"
            ? "Document exceeds 10MB limit."
            : uploadError.message
          : uploadError.message;
      return sendValidationError(res, message);
    }

    if (!req.file) {
      return sendValidationError(res, "document file is required.");
    }

    const documentType = normalizeDocumentType(req.body.documentType);
    if (!documentType) {
      return sendValidationError(res, "Invalid documentType.");
    }

    const store = readStore();
    const vehicle = store.vehicles.find((item) => item.id === req.params.vehicleId);
    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found." });
    }

    const expiryDate = req.body.expiryDate ? String(req.body.expiryDate).trim() : null;
    if (expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
      return sendValidationError(res, "expiryDate must use YYYY-MM-DD format.");
    }

    const documentRecord = {
      id: randomUUID(),
      vehicleId: vehicle.id,
      documentType,
      originalName: req.file.originalname,
      fileName: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      relativePath: `/uploads/vehicle-documents/${req.file.filename}`,
      expiryDate,
      notes: req.body.notes ? String(req.body.notes).trim() : null,
      uploadedAt: nowIso(),
      uploadedBy: req.body.uploadedBy ? String(req.body.uploadedBy).trim() : "system",
    };

    store.vehicleDocuments.push(documentRecord);
    writeStore(store);
    return res.status(201).json(documentRecord);
  });
});

app.delete("/api/vehicles/:vehicleId/documents/:documentId", (req, res) => {
  const store = readStore();
  const documentIndex = store.vehicleDocuments.findIndex(
    (item) => item.id === req.params.documentId && item.vehicleId === req.params.vehicleId
  );
  if (documentIndex < 0) {
    return res.status(404).json({ error: "Document not found." });
  }

  const [document] = store.vehicleDocuments.splice(documentIndex, 1);
  writeStore(store);

  const filePath = path.resolve(__dirname, "../uploads/vehicle-documents", document.fileName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  return res.json({ success: true });
});

app.get("/api/work-orders", (req, res) => {
  const store = readStore();
  const vehicleIdFilter = req.query.vehicleId ? String(req.query.vehicleId).trim() : null;
  const statusFilter = req.query.status ? String(req.query.status).trim().toLowerCase() : null;

  const workOrders = store.workOrders
    .filter((workOrder) => {
      if (vehicleIdFilter && workOrder.vehicleId !== vehicleIdFilter) {
        return false;
      }
      if (statusFilter && workOrder.status !== statusFilter) {
        return false;
      }
      return true;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return res.json(workOrders);
});

app.get("/api/vehicles/:vehicleId/work-orders", (req, res) => {
  const store = readStore();
  const vehicle = store.vehicles.find((item) => item.id === req.params.vehicleId);
  if (!vehicle) {
    return res.status(404).json({ error: "Vehicle not found." });
  }

  const workOrders = store.workOrders
    .filter((workOrder) => workOrder.vehicleId === vehicle.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return res.json(workOrders);
});

app.post("/api/vehicles/:vehicleId/work-orders", (req, res) => {
  const store = readStore();
  const vehicle = store.vehicles.find((item) => item.id === req.params.vehicleId);
  if (!vehicle) {
    return res.status(404).json({ error: "Vehicle not found." });
  }

  const { errors, normalizedWorkOrder } = normalizeWorkOrderInput(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: errors[0], details: errors });
  }

  const workOrder = {
    id: randomUUID(),
    vehicleId: vehicle.id,
    ...normalizedWorkOrder,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    completedAt: normalizedWorkOrder.status === "completed" ? nowIso() : null,
  };

  store.workOrders.push(workOrder);
  writeStore(store);
  return res.status(201).json(workOrder);
});

app.patch("/api/work-orders/:workOrderId", (req, res) => {
  const store = readStore();
  const workOrder = store.workOrders.find((item) => item.id === req.params.workOrderId);
  if (!workOrder) {
    return res.status(404).json({ error: "Work order not found." });
  }

  const { errors, normalizedWorkOrder } = normalizeWorkOrderInput(req.body, { partial: true });
  if (errors.length > 0) {
    return res.status(400).json({ error: errors[0], details: errors });
  }

  Object.assign(workOrder, normalizedWorkOrder, { updatedAt: nowIso() });
  if (normalizedWorkOrder.status === "completed" && !workOrder.completedAt) {
    workOrder.completedAt = nowIso();
  }
  if (normalizedWorkOrder.status && normalizedWorkOrder.status !== "completed") {
    workOrder.completedAt = null;
  }

  writeStore(store);
  return res.json(workOrder);
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
