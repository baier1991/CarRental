const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const { hashPassword } = require("../domain/auth");

const STORE_FILE_PATH = path.resolve(__dirname, "../../data/store.json");
const SEED_STORE_FILE_PATH = path.resolve(__dirname, "../../data/seed-store.json");

const DEFAULT_STORE = {
  meta: {
    demoDataVersion: null,
  },
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
  const meta =
    parsed && typeof parsed.meta === "object" && parsed.meta !== null
      ? {
          demoDataVersion: parsed.meta.demoDataVersion || null,
        }
      : {
          demoDataVersion: null,
        };
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
    meta,
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
  const seeded = readSeedStore();
  if (
    seeded.meta?.demoDataVersion &&
    normalized.meta?.demoDataVersion !== seeded.meta.demoDataVersion
  ) {
    writeStore(seeded);
    return seeded;
  }

  normalized = ensureAuthBootstrap(normalized);
  if (isStoreEmpty(normalized)) {
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
  let nextStore = {
    ...store,
    tenants: Array.isArray(store.tenants) ? [...store.tenants] : [],
    users: Array.isArray(store.users) ? [...store.users] : [],
    sessions: Array.isArray(store.sessions) ? [...store.sessions] : [],
    vehicles: Array.isArray(store.vehicles) ? [...store.vehicles] : [],
    customers: Array.isArray(store.customers) ? [...store.customers] : [],
    reservations: Array.isArray(store.reservations) ? [...store.reservations] : [],
    vehicleDocuments: Array.isArray(store.vehicleDocuments) ? [...store.vehicleDocuments] : [],
    workOrders: Array.isArray(store.workOrders) ? [...store.workOrders] : [],
  };
  let mutated = false;
  const acmeTenantId = "tenant-acme";
  const horizonTenantId = "tenant-horizon";
  const acmeOwnerEmail = "owner@acme.demo";
  const horizonOwnerEmail = "owner@horizon.demo";

  function remapTenantId(oldTenantId, newTenantId) {
    if (!oldTenantId || !newTenantId || oldTenantId === newTenantId) {
      return;
    }

    const remapCollection = (items) =>
      items.map((item) =>
        item.tenantId === oldTenantId
          ? {
              ...item,
              tenantId: newTenantId,
            }
          : item
      );

    nextStore.vehicles = remapCollection(nextStore.vehicles);
    nextStore.customers = remapCollection(nextStore.customers);
    nextStore.reservations = remapCollection(nextStore.reservations);
    nextStore.vehicleDocuments = remapCollection(nextStore.vehicleDocuments);
    nextStore.workOrders = remapCollection(nextStore.workOrders);
    nextStore.users = remapCollection(nextStore.users);
    nextStore.sessions = remapCollection(nextStore.sessions);
  }

  function ensureTenant(tenant) {
    const existing = nextStore.tenants.find((item) => item.id === tenant.id);
    if (existing) {
      return existing;
    }

    const created = {
      ...tenant,
      createdAt: tenant.createdAt || nowIso(),
      updatedAt: nowIso(),
      isActive: tenant.isActive !== false,
    };
    nextStore.tenants.push(created);
    mutated = true;
    return created;
  }

  function ensureTenantUser({ tenantId, email, firstName, lastName, role, password }) {
    const normalizedEmail = String(email).toLowerCase();
    const existing = nextStore.users.find(
      (user) => user.tenantId === tenantId && String(user.email).toLowerCase() === normalizedEmail
    );
    if (existing) {
      return existing;
    }

    const user = {
      id: randomUUID(),
      tenantId,
      firstName,
      lastName,
      email: normalizedEmail,
      role,
      isActive: true,
      passwordHash: hashPassword(password),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastLoginAt: null,
    };
    nextStore.users.push(user);
    mutated = true;
    return user;
  }

  const legacyDefaultTenant = nextStore.tenants.find((tenant) => tenant.id === "tenant-default");
  const existingAcmeTenant = nextStore.tenants.find((tenant) => tenant.id === acmeTenantId);
  if (legacyDefaultTenant && !existingAcmeTenant) {
    legacyDefaultTenant.id = acmeTenantId;
    legacyDefaultTenant.slug = "acme";
    legacyDefaultTenant.name = "Acme Rentals";
    legacyDefaultTenant.updatedAt = nowIso();
    remapTenantId("tenant-default", acmeTenantId);
    mutated = true;
  } else if (legacyDefaultTenant && existingAcmeTenant) {
    remapTenantId("tenant-default", acmeTenantId);
    nextStore.tenants = nextStore.tenants.filter((tenant) => tenant.id !== "tenant-default");
    mutated = true;
  }

  if (!Array.isArray(nextStore.tenants) || nextStore.tenants.length === 0) {
    const bootstrapTenant = {
      id: acmeTenantId,
      slug: "acme",
      name: "Acme Rentals",
      isActive: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    nextStore = {
      ...nextStore,
      tenants: [bootstrapTenant],
      vehicles: nextStore.vehicles.map((item) => ({ ...item, tenantId: item.tenantId || acmeTenantId })),
      customers: nextStore.customers.map((item) => ({ ...item, tenantId: item.tenantId || acmeTenantId })),
      reservations: nextStore.reservations.map((item) => ({ ...item, tenantId: item.tenantId || acmeTenantId })),
      vehicleDocuments: nextStore.vehicleDocuments.map((item) => ({
        ...item,
        tenantId: item.tenantId || acmeTenantId,
      })),
      workOrders: nextStore.workOrders.map((item) => ({ ...item, tenantId: item.tenantId || acmeTenantId })),
    };
    mutated = true;
  }

  const acmeTenant = ensureTenant({
    id: acmeTenantId,
    slug: "acme",
    name: "Acme Rentals",
    isActive: true,
  });
  ensureTenant({
    id: horizonTenantId,
    slug: "horizon",
    name: "Horizon Drive",
    isActive: true,
  });

  const knownTenantIds = new Set(nextStore.tenants.map((tenant) => tenant.id));
  const fillTenantId = (items) =>
    items.map((item) => {
      if (item.tenantId && knownTenantIds.has(item.tenantId)) {
        return item;
      }
      mutated = true;
      return {
        ...item,
        tenantId: acmeTenant.id,
      };
    });
  nextStore.vehicles = fillTenantId(nextStore.vehicles);
  nextStore.customers = fillTenantId(nextStore.customers);
  nextStore.reservations = fillTenantId(nextStore.reservations);
  nextStore.vehicleDocuments = fillTenantId(nextStore.vehicleDocuments);
  nextStore.workOrders = fillTenantId(nextStore.workOrders);

  const defaultOwnerUser = nextStore.users.find(
    (user) => String(user.email).toLowerCase() === "owner@default.demo"
  );
  const existingAcmeUser = nextStore.users.find(
    (user) => String(user.email).toLowerCase() === acmeOwnerEmail
  );
  if (defaultOwnerUser && !existingAcmeUser) {
    defaultOwnerUser.tenantId = acmeTenant.id;
    defaultOwnerUser.email = acmeOwnerEmail;
    defaultOwnerUser.role = "owner";
    defaultOwnerUser.isActive = true;
    defaultOwnerUser.passwordHash = hashPassword("Acme123!");
    defaultOwnerUser.updatedAt = nowIso();
    mutated = true;
  }

  ensureTenantUser({
    tenantId: acmeTenant.id,
    email: acmeOwnerEmail,
    firstName: "Acme",
    lastName: "Owner",
    role: "owner",
    password: "Acme123!",
  });

  ensureTenantUser({
    tenantId: horizonTenantId,
    email: horizonOwnerEmail,
    firstName: "Horizon",
    lastName: "Owner",
    role: "owner",
    password: "Horizon123!",
  });

  const seedStore = readSeedStore();
  const templateTenantIdBySlug = {
    acme: "tenant-acme",
    horizon: "tenant-horizon",
  };

  function createIdCollisionSafeClone(collectionName, items) {
    const existingIds = new Set(nextStore[collectionName].map((item) => item.id));
    const idMap = new Map();
    return items.map((item) => {
      const originalId = item.id;
      if (!existingIds.has(originalId) && !idMap.has(originalId)) {
        existingIds.add(originalId);
        idMap.set(originalId, originalId);
        return { ...item };
      }

      const nextId = randomUUID();
      idMap.set(originalId, nextId);
      existingIds.add(nextId);
      return {
        ...item,
        id: nextId,
      };
    });
  }

  function ensureTenantDemoRecords(tenant) {
    const tenantId = tenant.id;
    const tenantSlug = String(tenant.slug || "").toLowerCase();
    const templateTenantId = templateTenantIdBySlug[tenantSlug];
    if (!templateTenantId) {
      return;
    }

    const tenantVehicles = nextStore.vehicles.filter((item) => item.tenantId === tenantId);
    const tenantCustomers = nextStore.customers.filter((item) => item.tenantId === tenantId);
    const tenantReservations = nextStore.reservations.filter((item) => item.tenantId === tenantId);
    const tenantWorkOrders = nextStore.workOrders.filter((item) => item.tenantId === tenantId);
    const tenantDocuments = nextStore.vehicleDocuments.filter((item) => item.tenantId === tenantId);

    const needsVehicles = tenantVehicles.length === 0;
    const needsCustomers = tenantCustomers.length === 0;
    const needsReservations = tenantReservations.length === 0;
    const needsWorkOrders = tenantWorkOrders.length === 0;
    const needsDocuments = tenantDocuments.length === 0;
    if (
      !needsVehicles &&
      !needsCustomers &&
      !needsReservations &&
      !needsWorkOrders &&
      !needsDocuments
    ) {
      return;
    }

    const templateVehicles = seedStore.vehicles
      .filter((item) => item.tenantId === templateTenantId)
      .map((item) => ({ ...item, tenantId }));
    const templateCustomers = seedStore.customers
      .filter((item) => item.tenantId === templateTenantId)
      .map((item) => ({ ...item, tenantId }));
    const templateReservations = seedStore.reservations
      .filter((item) => item.tenantId === templateTenantId)
      .map((item) => ({ ...item, tenantId }));
    const templateDocuments = seedStore.vehicleDocuments
      .filter((item) => item.tenantId === templateTenantId)
      .map((item) => ({ ...item, tenantId }));
    const templateWorkOrders = seedStore.workOrders
      .filter((item) => item.tenantId === templateTenantId)
      .map((item) => ({ ...item, tenantId }));

    const vehicleIdMap = new Map();
    const customerIdMap = new Map();
    for (const item of tenantVehicles) {
      vehicleIdMap.set(item.id, item.id);
    }
    for (const item of tenantCustomers) {
      customerIdMap.set(item.id, item.id);
    }

    const vehicles = needsVehicles ? createIdCollisionSafeClone("vehicles", templateVehicles) : [];
    const customers = needsCustomers ? createIdCollisionSafeClone("customers", templateCustomers) : [];

    if (needsVehicles) {
      for (let index = 0; index < templateVehicles.length; index += 1) {
        vehicleIdMap.set(templateVehicles[index].id, vehicles[index].id);
      }
    }
    if (needsCustomers) {
      for (let index = 0; index < templateCustomers.length; index += 1) {
        customerIdMap.set(templateCustomers[index].id, customers[index].id);
      }
    }

    const reservations = needsReservations
      ? createIdCollisionSafeClone(
          "reservations",
          templateReservations
            .map((item) => ({
              ...item,
              vehicleId: vehicleIdMap.get(item.vehicleId),
              customerId: customerIdMap.get(item.customerId),
            }))
            .filter((item) => item.vehicleId && item.customerId)
        )
      : [];

    const documents = needsDocuments
      ? createIdCollisionSafeClone(
          "vehicleDocuments",
          templateDocuments
            .map((item) => ({
              ...item,
              vehicleId: vehicleIdMap.get(item.vehicleId),
            }))
            .filter((item) => item.vehicleId)
        )
      : [];

    const workOrders = needsWorkOrders
      ? createIdCollisionSafeClone(
          "workOrders",
          templateWorkOrders
            .map((item) => ({
              ...item,
              vehicleId: vehicleIdMap.get(item.vehicleId),
            }))
            .filter((item) => item.vehicleId)
        )
      : [];

    if (vehicles.length > 0) {
      nextStore.vehicles.push(...vehicles);
    }
    if (customers.length > 0) {
      nextStore.customers.push(...customers);
    }
    if (reservations.length > 0) {
      nextStore.reservations.push(...reservations);
    }
    if (documents.length > 0) {
      nextStore.vehicleDocuments.push(...documents);
    }
    if (workOrders.length > 0) {
      nextStore.workOrders.push(...workOrders);
    }
    if (
      vehicles.length > 0 ||
      customers.length > 0 ||
      reservations.length > 0 ||
      documents.length > 0 ||
      workOrders.length > 0
    ) {
      mutated = true;
    }
  }

  for (const tenant of nextStore.tenants) {
    ensureTenantDemoRecords(tenant);
  }

  if (mutated) {
    writeStore(nextStore);
  }

  return nextStore;
}

module.exports = {
  readStore,
  writeStore,
  readSeedStore,
  resetStoreWithSeed,
  STORE_FILE_PATH,
  SEED_STORE_FILE_PATH,
};
