const fs = require("node:fs");
const path = require("node:path");

const STORE_FILE_PATH = path.resolve(__dirname, "../../data/store.json");
const SEED_STORE_FILE_PATH = path.resolve(__dirname, "../../data/seed-store.json");

const DEFAULT_STORE = {
  vehicles: [],
  customers: [],
  reservations: [],
  vehicleDocuments: [],
  workOrders: [],
};

function ensureStoreFile() {
  const storeDirectory = path.dirname(STORE_FILE_PATH);
  if (!fs.existsSync(storeDirectory)) {
    fs.mkdirSync(storeDirectory, { recursive: true });
  }

  if (!fs.existsSync(STORE_FILE_PATH)) {
    const seedStore = readSeedStore();
    fs.writeFileSync(STORE_FILE_PATH, JSON.stringify(seedStore, null, 2), "utf8");
  }
}

function normalizeStoreShape(parsed) {
  return {
    vehicles: Array.isArray(parsed.vehicles) ? parsed.vehicles : [],
    customers: Array.isArray(parsed.customers) ? parsed.customers : [],
    reservations: Array.isArray(parsed.reservations) ? parsed.reservations : [],
    vehicleDocuments: Array.isArray(parsed.vehicleDocuments) ? parsed.vehicleDocuments : [],
    workOrders: Array.isArray(parsed.workOrders) ? parsed.workOrders : [],
  };
}

function isStoreEmpty(store) {
  return (
    Array.isArray(store.vehicles) &&
    Array.isArray(store.customers) &&
    Array.isArray(store.reservations) &&
    Array.isArray(store.vehicleDocuments) &&
    Array.isArray(store.workOrders) &&
    store.vehicles.length === 0 &&
    store.customers.length === 0 &&
    store.reservations.length === 0 &&
    store.vehicleDocuments.length === 0 &&
    store.workOrders.length === 0
  );
}

function readSeedStore() {
  if (!fs.existsSync(SEED_STORE_FILE_PATH)) {
    return { ...DEFAULT_STORE };
  }

  const content = fs.readFileSync(SEED_STORE_FILE_PATH, "utf8");
  if (!content.trim()) {
    return { ...DEFAULT_STORE };
  }

  const parsed = JSON.parse(content);
  return normalizeStoreShape(parsed);
}

function readStore() {
  ensureStoreFile();
  const content = fs.readFileSync(STORE_FILE_PATH, "utf8");
  if (!content.trim()) {
    const seeded = readSeedStore();
    writeStore(seeded);
    return seeded;
  }

  const parsed = JSON.parse(content);
  const normalized = normalizeStoreShape(parsed);
  if (isStoreEmpty(normalized)) {
    const seeded = readSeedStore();
    if (!isStoreEmpty(seeded)) {
      writeStore(seeded);
      return seeded;
    }
  }

  return normalized;
}

function writeStore(store) {
  const normalizedStore = normalizeStoreShape(store);
  fs.writeFileSync(STORE_FILE_PATH, JSON.stringify(normalizedStore, null, 2), "utf8");
  return normalizedStore;
}

function resetStoreWithSeed() {
  const seeded = readSeedStore();
  return writeStore(seeded);
}

module.exports = {
  readStore,
  writeStore,
  resetStoreWithSeed,
  STORE_FILE_PATH,
  SEED_STORE_FILE_PATH,
};
