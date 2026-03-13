function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsvContent(csvContent) {
  const lines = String(csvContent || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return {
      headers: [],
      rows: [],
      errors: ["CSV is empty."],
    };
  }

  const headers = parseCsvLine(lines[0]).map((header) => String(header).trim());
  if (headers.length === 0) {
    return {
      headers: [],
      rows: [],
      errors: ["CSV header row is missing."],
    };
  }

  const rows = [];
  const errors = [];
  for (let index = 1; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const cells = parseCsvLine(rawLine);
    if (cells.length > headers.length) {
      errors.push(`Row ${index + 1} has too many columns.`);
      continue;
    }

    const row = {};
    for (let cellIndex = 0; cellIndex < headers.length; cellIndex += 1) {
      const key = headers[cellIndex];
      row[key] = cells[cellIndex] ?? "";
    }

    rows.push({
      rowNumber: index + 1,
      row,
    });
  }

  return { headers, rows, errors };
}

function parseFeatureCell(rawValue) {
  if (!rawValue) {
    return [];
  }
  return String(rawValue)
    .split(/[|;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function csvRowToVehiclePayload(row, defaults = {}) {
  return {
    plateNumber: row.plateNumber,
    vin: row.vin,
    make: row.make,
    model: row.model,
    year: row.year,
    category: row.category || defaults.category,
    dailyRate: row.dailyRate,
    weekendDailyRate: row.weekendDailyRate,
    weeklyRate: row.weeklyRate,
    monthlyRate: row.monthlyRate,
    securityDeposit: row.securityDeposit,
    status: row.status || defaults.status,
    location: row.location || defaults.location,
    branchCode: row.branchCode || defaults.branchCode,
    transmission: row.transmission,
    fuelType: row.fuelType,
    color: row.color,
    seats: row.seats,
    doors: row.doors,
    odometerKm: row.odometerKm,
    mileageLimitPerDay: row.mileageLimitPerDay,
    extraKmRate: row.extraKmRate,
    registrationExpiryDate: row.registrationExpiryDate,
    insuranceExpiryDate: row.insuranceExpiryDate,
    inspectionDueDate: row.inspectionDueDate,
    nextServiceAtKm: row.nextServiceAtKm,
    nextServiceDate: row.nextServiceDate,
    ownershipType: row.ownershipType || defaults.ownershipType,
    acquisitionDate: row.acquisitionDate,
    acquisitionCost: row.acquisitionCost,
    imageUrl: row.imageUrl,
    notes: row.notes,
    features: parseFeatureCell(row.features),
  };
}

module.exports = {
  parseCsvLine,
  parseCsvContent,
  csvRowToVehiclePayload,
};
