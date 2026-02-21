const DAY_MS = 24 * 60 * 60 * 1000;
const TAX_RATE = 0.12;

const INSURANCE_DAILY_RATE = {
  basic: 0,
  plus: 18,
  premium: 30,
};

const ADD_ON_DAILY_RATE = {
  gps: 9,
  childSeat: 7,
  extraDriver: 12,
};

function parseDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function calculateRentalDays(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end || end <= start) {
    return 0;
  }

  const rawDays = Math.ceil((end - start) / DAY_MS);
  return Math.max(rawDays, 1);
}

function applyDiscountCode(subtotal, discountCode, rentalDays) {
  if (!discountCode) {
    return { discountCode: null, discountAmount: 0 };
  }

  const normalizedCode = String(discountCode).trim().toUpperCase();
  if (normalizedCode === "WEEKLY10" && rentalDays >= 7) {
    return { discountCode: normalizedCode, discountAmount: subtotal * 0.1 };
  }

  if (normalizedCode === "CORPORATE15") {
    return { discountCode: normalizedCode, discountAmount: subtotal * 0.15 };
  }

  return { discountCode: null, discountAmount: 0 };
}

function calculateQuote({
  dailyRate,
  startDate,
  endDate,
  insuranceTier = "basic",
  addOns = [],
  discountCode = null,
}) {
  const rentalDays = calculateRentalDays(startDate, endDate);
  if (dailyRate === undefined || dailyRate === null || dailyRate === "" || rentalDays <= 0) {
    return null;
  }

  const normalizedDailyRate = Number(dailyRate);
  if (Number.isNaN(normalizedDailyRate) || normalizedDailyRate <= 0) {
    return null;
  }

  const insuranceKey = String(insuranceTier || "basic").trim().toLowerCase();
  const normalizedInsuranceTier = Object.prototype.hasOwnProperty.call(
    INSURANCE_DAILY_RATE,
    insuranceKey
  )
    ? insuranceKey
    : "basic";

  const insurancePerDay = INSURANCE_DAILY_RATE[normalizedInsuranceTier];
  const addOnDailyTotal = addOns.reduce((acc, addOnKey) => {
    const addOnRate = ADD_ON_DAILY_RATE[addOnKey] || 0;
    return acc + addOnRate;
  }, 0);

  const basePrice = normalizedDailyRate * rentalDays;
  const insurancePrice = insurancePerDay * rentalDays;
  const addOnPrice = addOnDailyTotal * rentalDays;
  const subtotal = basePrice + insurancePrice + addOnPrice;
  const { discountAmount, discountCode: appliedDiscountCode } = applyDiscountCode(
    subtotal,
    discountCode,
    rentalDays
  );

  const discountedSubtotal = Math.max(subtotal - discountAmount, 0);
  const tax = discountedSubtotal * TAX_RATE;
  const total = discountedSubtotal + tax;

  return {
    rentalDays,
    pricing: {
      dailyRate: normalizedDailyRate,
      basePrice: Number(basePrice.toFixed(2)),
      insuranceTier: normalizedInsuranceTier,
      insurancePrice: Number(insurancePrice.toFixed(2)),
      addOns,
      addOnPrice: Number(addOnPrice.toFixed(2)),
      subtotal: Number(subtotal.toFixed(2)),
      discountCode: appliedDiscountCode,
      discountAmount: Number(discountAmount.toFixed(2)),
      discountedSubtotal: Number(discountedSubtotal.toFixed(2)),
      taxRate: TAX_RATE,
      tax: Number(tax.toFixed(2)),
      total: Number(total.toFixed(2)),
    },
  };
}

module.exports = {
  calculateQuote,
  calculateRentalDays,
  INSURANCE_DAILY_RATE,
  ADD_ON_DAILY_RATE,
};
