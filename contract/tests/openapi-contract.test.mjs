import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import YAML from "yaml";

const openapi = YAML.parse(
  readFileSync(
    new URL("../tsp-output/@typespec/openapi3/openapi.yaml", import.meta.url),
    "utf8",
  ),
);

const schemas = openapi.components.schemas;

function refName(schema) {
  return schema?.$ref?.replace("#/components/schemas/", "");
}

function resolve(schema) {
  const name = refName(schema);
  return name ? schemas[name] : schema;
}

function alternativesFor(schema) {
  const resolved = resolve(schema);
  return resolved.oneOf ?? resolved.anyOf ?? [];
}

function minimumFor(schema) {
  const resolved = resolve(schema);

  if (resolved.minimum !== undefined) {
    return resolved.minimum;
  }

  for (const part of resolved.allOf ?? []) {
    const minimum = minimumFor(part);
    if (minimum !== undefined) {
      return minimum;
    }
  }

  return undefined;
}

test("working-hours weekdays are constrained to open or closed day shapes", () => {
  const weekdays = schemas.WorkingHoursByDay.properties;

  for (const [weekday, schema] of Object.entries(weekdays)) {
    const alternatives = alternativesFor(schema);
    const refs = new Set(alternatives.map(refName));

    assert.deepEqual(
      refs,
      new Set(["ClosedDay", "OpenDay"]),
      `${weekday} should be a union of ClosedDay and OpenDay`,
    );
  }
});

test("event durations are positive minute counts", () => {
  const durationFields = [
    ["EventType", "durationMinutes"],
    ["PublicEventType", "durationMinutes"],
    ["EventTypeCreate", "durationMinutes"],
    ["EventTypeUpdate", "durationMinutes"],
    ["Booking", "durationMinutesSnapshot"],
  ];

  for (const [modelName, propertyName] of durationFields) {
    const schema = schemas[modelName].properties[propertyName];
    assert.equal(
      minimumFor(schema),
      1,
      `${modelName}.${propertyName} should require a value of at least 1`,
    );
  }
});
