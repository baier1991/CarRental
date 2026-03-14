const test = require("node:test");
const assert = require("node:assert/strict");

const { hashPassword, verifyPassword } = require("../src/domain/auth");

test("hashPassword and verifyPassword work together", () => {
  const hash = hashPassword("Secret123!");
  assert.equal(verifyPassword("Secret123!", hash), true);
  assert.equal(verifyPassword("WrongPass!", hash), false);
});

test("hashPassword generates different hashes for same password", () => {
  const first = hashPassword("Secret123!");
  const second = hashPassword("Secret123!");
  assert.notEqual(first, second);
});
