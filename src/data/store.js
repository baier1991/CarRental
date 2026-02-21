const fs = require("node:fs");
const path = require("node:path");

const STORE_FILE_PATH = path.resolve(__dirname, "../../data/store.json");

const DEFAULT_STORE = {
  vehicles: [],
  customers: [],
  reservations: [],
};

function ensureStoreFile() {
  const storeDirectory = path.dirname(STORE_FILE_PATH);
  if (!fs.existsSync(storeDirectory)) {
    fs.mkdirSync(storeDirectory, { recursive: true });
  }

  if (!fs.existsSync(STORE_FILE_PATH)) {
    fs.writeFileSync(STORE_FILE_PATH, JSON.stringify(DEFAULT_STORE, null, 2), "utf8");
  }
}

function readStore() {
  ensureStoreFile();
  const content = fs.readFileSync(STORE_FILE_PATH, "utf8");
  if (!content.trim()) {
    return { ...DEFAULT_STORE };
  }

  const parsed = JSON.parse(content);
  return {
    vehicles: Array.isArray(parsed.vehicles) ? parsed.vehicles : [],
    customers: Array.isArray(parsed.customers) ? parsed.customers : [],
    reservations: Array.isArray(parsed.reservations) ? parsed.reservations : [],
  };
}

function writeStore(store) {
  const normalizedStore = {
    vehicles: Array.isArray(store.vehicles) ? store.vehicles : [],
    customers: Array.isArray(store.customers) ? store.customers : [],
    reservations: Array.isArray(store.reservations) ? store.reservations : [],
  };
  fs.writeFileSync(STORE_FILE_PATH, JSON.stringify(normalizedStore, null, 2), "utf8");
  return normalizedStore;
}

module.exports = {
  readStore,
  writeStore,
  STORE_FILE_PATH,
};
