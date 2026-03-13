const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeWorkOrderInput } = require("../src/domain/workOrders");

test("normalizeWorkOrderInput validates create payload", () => {
  const { errors, normalizedWorkOrder } = normalizeWorkOrderInput({
    title: "Oil change",
    priority: "high",
    status: "open",
    scheduledDate: "2026-03-10",
    costEstimate: 150,
    vendorName: "Quick Service Center",
  });

  assert.equal(errors.length, 0);
  assert.equal(normalizedWorkOrder.title, "Oil change");
  assert.equal(normalizedWorkOrder.priority, "high");
});

test("normalizeWorkOrderInput rejects invalid status", () => {
  const { errors } = normalizeWorkOrderInput({
    title: "Tire replacement",
    status: "invalid_status",
  });

  assert.ok(errors.some((error) => error.includes("Invalid work order status")));
});

test("normalizeWorkOrderInput supports partial update", () => {
  const { errors, normalizedWorkOrder } = normalizeWorkOrderInput(
    {
      status: "completed",
      actualCost: 320.5,
    },
    { partial: true }
  );

  assert.equal(errors.length, 0);
  assert.equal(normalizedWorkOrder.status, "completed");
  assert.equal(normalizedWorkOrder.actualCost, 320.5);
});
