const { randomBytes, scryptSync, timingSafeEqual } = require("node:crypto");

function hashPassword(password, salt = null) {
  const normalizedPassword = String(password || "");
  const effectiveSalt = salt || randomBytes(16).toString("hex");
  const derivedKey = scryptSync(normalizedPassword, effectiveSalt, 64).toString("hex");
  return `${effectiveSalt}:${derivedKey}`;
}

function verifyPassword(password, storedPasswordHash) {
  if (!storedPasswordHash || !storedPasswordHash.includes(":")) {
    return false;
  }

  const [salt, expectedHash] = String(storedPasswordHash).split(":");
  if (!salt || !expectedHash) {
    return false;
  }

  const candidateHash = hashPassword(password, salt).split(":")[1];
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const candidateBuffer = Buffer.from(candidateHash, "hex");

  if (expectedBuffer.length !== candidateBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, candidateBuffer);
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    tenantId: user.tenantId,
    firstName: user.firstName || null,
    lastName: user.lastName || null,
    email: user.email,
    role: user.role,
    isActive: Boolean(user.isActive),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt || null,
  };
}

function createSessionToken() {
  return randomBytes(48).toString("hex");
}

module.exports = {
  hashPassword,
  verifyPassword,
  sanitizeUser,
  createSessionToken,
};
