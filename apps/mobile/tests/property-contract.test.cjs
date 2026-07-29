const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const mobileRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(mobileRoot, relativePath), "utf8");
}

test("property catalog exposes the complete on-site decision contract", () => {
  const types = read(path.join("types", "property.ts"));
  const catalog = read(path.join("data", "propertyCatalog.ts"));
  const requiredFields = [
    "id",
    "title",
    "roomMesh",
    "monthlyRent",
    "deposit",
    "oneTimeFees",
    "totalMoveInCost",
    "commuteMinutes",
    "area",
    "latitude",
    "longitude",
    "recommendationTag",
    "decisionSummary",
    "riskSummary",
    "inspection"
  ];

  for (const field of requiredFields) {
    assert.match(types, new RegExp(`${field}:`), `PropertyRecord must define ${field}`);
  }

  assert.match(catalog, /export const propertyCatalog: PropertyRecord\[\]/);
  assert.match(catalog, /export function findPropertyById/);
  assert.match(catalog, /validatePropertyCatalog\(propertyCatalog\)/);
});

test("catalog validation protects identity, dimensions, coordinates, and risk counts", () => {
  const catalog = read(path.join("data", "propertyCatalog.ts"));

  assert.match(catalog, /new Set<string>\(\)/);
  assert.match(catalog, /duplicate property id/);
  assert.match(catalog, /roomMesh\.width <= 0/);
  assert.match(catalog, /Number\.isFinite\(property\.latitude\)/);
  assert.match(catalog, /highRiskCount !== highRiskCount/);
  assert.match(catalog, /pendingCount !== pendingCount/);
});
