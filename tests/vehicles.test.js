const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeVehicleInput,
  normalizeVehiclePatchInput,
  getVehicleAlerts,
} = require("../src/domain/vehicles");

test("normalizeVehicleInput accepts full intake payload", () => {
  const { errors, normalizedVehicle } = normalizeVehicleInput({
    plateNumber: "dxb-9090",
    vin: "1HGCM82633A004352",
    make: "Toyota",
    model: "Camry",
    year: 2025,
    category: "sedan",
    dailyRate: 85,
    weekendDailyRate: 95,
    weeklyRate: 500,
    monthlyRate: 1700,
    securityDeposit: 600,
    status: "available",
    location: "Dubai Airport",
    branchCode: "dxb-01",
    transmission: "Automatic",
    fuelType: "Petrol",
    color: "Black",
    seats: 5,
    doors: 4,
    odometerKm: 22000,
    mileageLimitPerDay: 250,
    extraKmRate: 0.4,
    registrationExpiryDate: "2026-06-30",
    insuranceExpiryDate: "2026-05-20",
    inspectionDueDate: "2026-04-01",
    nextServiceAtKm: 25000,
    nextServiceDate: "2026-03-10",
    ownershipType: "owned",
    acquisitionDate: "2025-01-05",
    acquisitionCost: 26000,
    imageUrl: "https://example.com/camry.jpg",
    features: ["bluetooth", "backupCamera", "tollTag"],
    notes: "New intake vehicle",
  });

  assert.equal(errors.length, 0);
  assert.equal(normalizedVehicle.plateNumber, "DXB-9090");
  assert.equal(normalizedVehicle.branchCode, "DXB-01");
  assert.deepEqual(normalizedVehicle.features, ["bluetooth", "backupCamera", "tollTag"]);
});

test("normalizeVehicleInput rejects invalid vin and status", () => {
  const { errors } = normalizeVehicleInput({
    plateNumber: "x1",
    make: "Kia",
    model: "Seltos",
    year: 2025,
    category: "suv",
    dailyRate: 70,
    location: "Dubai",
    vin: "SHORTVIN",
    status: "unknown",
  });

  assert.ok(errors.some((error) => error.includes("vin must be exactly 17 characters")));
  assert.ok(errors.some((error) => error.includes("Invalid vehicle status")));
});

test("getVehicleAlerts returns critical alerts for expired docs and overdue service", () => {
  const alerts = getVehicleAlerts(
    {
      registrationExpiryDate: "2026-01-10",
      insuranceExpiryDate: "2026-01-12",
      inspectionDueDate: "2026-01-15",
      odometerKm: 55000,
      nextServiceAtKm: 50000,
      nextServiceDate: "2026-01-20",
    },
    new Date("2026-02-21T00:00:00.000Z")
  );

  assert.ok(alerts.some((alert) => alert.code === "registrationExpiryDate:expired"));
  assert.ok(alerts.some((alert) => alert.code === "insuranceExpiryDate:expired"));
  assert.ok(alerts.some((alert) => alert.code === "service:overdue_km"));
  assert.ok(alerts.some((alert) => alert.code === "service:overdue_date"));
});

test("normalizeVehiclePatchInput accepts partial updates", () => {
  const { errors, normalizedPatch } = normalizeVehiclePatchInput({
    status: "maintenance",
    odometerKm: 32000,
    nextServiceAtKm: 36000,
    features: "bluetooth",
  });

  assert.equal(errors.length, 0);
  assert.equal(normalizedPatch.status, "maintenance");
  assert.equal(normalizedPatch.odometerKm, 32000);
  assert.deepEqual(normalizedPatch.features, ["bluetooth"]);
});
