const test = require("node:test");
const assert = require("node:assert/strict");

const { calculateQuote, calculateRentalDays } = require("../src/domain/pricing");

test("calculateRentalDays returns expected full-day count", () => {
  const days = calculateRentalDays("2026-03-01", "2026-03-08");
  assert.equal(days, 7);
});

test("calculateQuote applies add-ons, insurance, discounts, and tax", () => {
  const quote = calculateQuote({
    dailyRate: 100,
    startDate: "2026-03-01",
    endDate: "2026-03-08",
    insuranceTier: "plus",
    addOns: ["gps"],
    discountCode: "WEEKLY10",
  });

  assert.ok(quote);
  assert.equal(quote.rentalDays, 7);
  assert.equal(quote.pricing.basePrice, 700);
  assert.equal(quote.pricing.insurancePrice, 126);
  assert.equal(quote.pricing.addOnPrice, 63);
  assert.equal(quote.pricing.subtotal, 889);
  assert.equal(quote.pricing.discountAmount, 88.9);
  assert.equal(quote.pricing.tax, 96.01);
  assert.equal(quote.pricing.total, 896.11);
});

test("calculateQuote returns null when dates are invalid", () => {
  const quote = calculateQuote({
    dailyRate: 90,
    startDate: "invalid",
    endDate: "2026-03-08",
  });

  assert.equal(quote, null);
});
