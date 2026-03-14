const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const { hashPassword } = require("../domain/auth");

const STORE_FILE_PATH = path.resolve(__dirname, "../../data/store.json");
const SEED_STORE_FILE_PATH = path.resolve(__dirname, "../../data/seed-store.json");

const DEFAULT_STORE = {
  tenants: [],
  users: [],
  sessions: [],
  vehicles: [],
  customers: [],
  reservations: [],
  vehicleDocuments: [],
  workOrders: [],
};

function nowIso() {
  return new Date().toISOString();
}

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
  const tenants = Array.isArray(parsed.tenants) ? parsed.tenants : [];
  const fallbackTenantId = tenants[0]?.id || "tenant-default";
  const withTenant = (items) =>
    Array.isArray(items)
      ? items.map((item) => ({
          ...item,
          tenantId: item.tenantId || fallbackTenantId,
        }))
      : [];

  const users = Array.isArray(parsed.users)
    ? parsed.users
        .map((user) => ({
          ...user,
          tenantId: user.tenantId || fallbackTenantId,
          email: user.email ? String(user.email).toLowerCase() : null,
          isActive: user.isActive !== false,
        }))
        .filter((user) => user.email && user.passwordHash)
    : [];

  const sessions = Array.isArray(parsed.sessions)
    ? parsed.sessions.filter((session) => session.token && session.userId && session.tenantId)
    : [];

  return {
    tenants,
    users,
    sessions,
    vehicles: withTenant(parsed.vehicles),
    customers: withTenant(parsed.customers),
    reservations: withTenant(parsed.reservations),
    vehicleDocuments: withTenant(parsed.vehicleDocuments),
    workOrders: withTenant(parsed.workOrders),
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
  let normalized = normalizeStoreShape(parsed);
  normalized = ensureAuthBootstrap(normalized);
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

function ensureAuthBootstrap(store) {
  let nextStore = { ...store };
  let mutated = false;

  if (!Array.isArray(nextStore.tenants) || nextStore.tenants.length === 0) {
    const bootstrapTenant = {
      id: "tenant-default",
      slug: "default",
      name: "Default Tenant",
      isActive: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    nextStore = {
      ...nextStore,
      tenants: [bootstrapTenant],
      vehicles: nextStore.vehicles.map((item) => ({ ...item, tenantId: item.tenantId || bootstrapTenant.id })),
      customers: nextStore.customers.map((item) => ({ ...item, tenantId: item.tenantId || bootstrapTenant.id })),
      reservations: nextStore.reservations.map((item) => ({ ...item, tenantId: item.tenantId || bootstrapTenant.id })),
      vehicleDocuments: nextStore.vehicleDocuments.map((item) => ({
        ...item,
        tenantId: item.tenantId || bootstrapTenant.id,
      })),
      workOrders: nextStore.workOrders.map((item) => ({ ...item, tenantId: item.tenantId || bootstrapTenant.id })),
    };
    mutated = true;
  }

  if (!Array.isArray(nextStore.users) || nextStore.users.length === 0) {
    const tenantId = nextStore.tenants[0].id;
    const tenantSlug = nextStore.tenants[0].slug || "default";
    const bootstrapPassword = process.env.BOOTSTRAP_DEMO_PASSWORD || "Password123!";
    const bootstrapUser = {
      id: randomUUID(),
      tenantId,
      firstName: "Owner",
      lastName: "User",
      email: `owner@${tenantSlug}.demo`,
      role: "owner",
      isActive: true,
      passwordHash: hashPassword(bootstrapPassword),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastLoginAt: null,
    };
    nextStore = {
      ...nextStore,
      users: [bootstrapUser],
    };
    mutated = true;
  }

  if (mutated) {
    writeStore(nextStore);
  }

  return nextStore;
}

module.exports = {
  readStore,
  writeStore,
  resetStoreWithSeed,
  STORE_FILE_PATH,
  SEED_STORE_FILE_PATH,
};
