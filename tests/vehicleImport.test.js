const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseCsvLine,
  parseCsvContent,
  csvRowToVehiclePayload,
} = require("../src/domain/vehicleImport");

test("parseCsvLine supports quoted commas", () => {
  const cells = parseCsvLine('DXB-1001,"Toyota, Inc",Camry,2025');
  assert.deepEqual(cells, ["DXB-1001", "Toyota, Inc", "Camry", "2025"]);
});

test("parseCsvContent parses headers and rows", () => {
  const csv = `plateNumber,make,model,year,dailyRate,location
DXB-1001,Toyota,Corolla,2025,60,Dubai
DXB-1002,Kia,Seltos,2024,58,Sharjah`;

  const parsed = parseCsvContent(csv);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].row.plateNumber, "DXB-1001");
});

test("csvRowToVehiclePayload maps and parses features", () => {
  const payload = csvRowToVehiclePayload(
    {
      plateNumber: "DXB-1001",
      make: "Toyota",
      model: "Corolla",
      year: "2025",
      dailyRate: "60",
      location: "Dubai",
      features: "bluetooth|backupCamera",
    },
    {}
  );

  assert.deepEqual(payload.features, ["bluetooth", "backupCamera"]);
  assert.equal(payload.plateNumber, "DXB-1001");
});
