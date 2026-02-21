const test = require("node:test");
const assert = require("node:assert/strict");

const { rangesOverlap, hasVehicleConflict } = require("../src/domain/reservations");

test("rangesOverlap returns true for overlapping intervals", () => {
  assert.equal(rangesOverlap("2026-03-01", "2026-03-05", "2026-03-04", "2026-03-09"), true);
});

test("rangesOverlap treats end date as exclusive boundary", () => {
  assert.equal(rangesOverlap("2026-03-01", "2026-03-05", "2026-03-05", "2026-03-09"), false);
});

test("hasVehicleConflict detects conflicts for active reservation statuses", () => {
  const reservations = [
    {
      id: "res-1",
      vehicleId: "veh-1",
      startDate: "2026-03-01",
      endDate: "2026-03-06",
      status: "confirmed",
    },
  ];

  const candidate = {
    vehicleId: "veh-1",
    startDate: "2026-03-05",
    endDate: "2026-03-08",
    status: "pending",
  };

  assert.equal(hasVehicleConflict(reservations, candidate), true);
});

test("hasVehicleConflict ignores cancelled/completed reservations", () => {
  const reservations = [
    {
      id: "res-1",
      vehicleId: "veh-1",
      startDate: "2026-03-01",
      endDate: "2026-03-06",
      status: "cancelled",
    },
  ];

  const candidate = {
    vehicleId: "veh-1",
    startDate: "2026-03-05",
    endDate: "2026-03-08",
    status: "pending",
  };

  assert.equal(hasVehicleConflict(reservations, candidate), false);
});
