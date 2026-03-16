const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeNextPath, buildLoginRedirectUrl } = require("../src/server");

test("normalizeNextPath keeps safe app paths", () => {
  assert.equal(normalizeNextPath("/fleet.html"), "/fleet.html");
  assert.equal(normalizeNextPath("/reservations.html?status=active"), "/reservations.html?status=active");
});

test("normalizeNextPath blocks unsafe or invalid targets", () => {
  assert.equal(normalizeNextPath("https://evil.example"), "/");
  assert.equal(normalizeNextPath("//evil.example/path"), "/");
  assert.equal(normalizeNextPath("/login.html?next=/fleet.html"), "/");
  assert.equal(normalizeNextPath("/api/vehicles"), "/");
});

test("buildLoginRedirectUrl includes next only when needed", () => {
  assert.equal(buildLoginRedirectUrl("/"), "/login.html");
  assert.equal(buildLoginRedirectUrl("/index.html"), "/login.html");
  assert.equal(
    buildLoginRedirectUrl("/fleet.html?status=maintenance"),
    "/login.html?next=%2Ffleet.html%3Fstatus%3Dmaintenance"
  );
});
