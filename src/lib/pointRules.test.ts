import test from "node:test"
import assert from "node:assert/strict"

import {
  buildPointReference,
  calculateAcademicPoints,
  calculateInitialPeriodPoints,
  calculatePointBalance,
  canAwardMissionPoints,
} from "./pointRules"

test("calculateAcademicPoints applies the credit value and cap", () => {
  assert.equal(calculateAcademicPoints(10), 200)
  assert.equal(calculateAcademicPoints(20), 300)
})

test("calculateInitialPeriodPoints includes the base period points", () => {
  assert.equal(calculateInitialPeriodPoints(10), 300)
  assert.equal(calculateInitialPeriodPoints(0), 100)
})

test("calculatePointBalance preserves negative redemption movements", () => {
  assert.equal(calculatePointBalance([100, 200, -80]), 220)
})

test("buildPointReference creates a deterministic idempotency key", () => {
  assert.equal(buildPointReference(["BASE_SEMESTRAL", "student-1", "2026-2"]), "BASE_SEMESTRAL:student-1:2026-2")
})

test("canAwardMissionPoints enforces weekly and period caps", () => {
  assert.equal(canAwardMissionPoints(50, 250, 900), true)
  assert.equal(canAwardMissionPoints(60, 250, 900), false)
  assert.equal(canAwardMissionPoints(50, 0, 4960), false)
})

test("calculateAcademicPoints tolera entradas inválidas y aplica floor", () => {
  assert.equal(calculateAcademicPoints(-5), 0)
  assert.equal(calculateAcademicPoints(NaN), 0)
  assert.equal(calculateAcademicPoints(10, -1), 0)
  assert.equal(calculateAcademicPoints(10, 20, -1), 0)
  assert.equal(calculateAcademicPoints(2.9), 40)
  assert.equal(calculateAcademicPoints(0), 0)
})

test("calculateInitialPeriodPoints con base inválida solo usa académicos", () => {
  assert.equal(calculateInitialPeriodPoints(10, NaN), calculateAcademicPoints(10))
  assert.equal(calculateInitialPeriodPoints(10, -50), calculateAcademicPoints(10))
})

test("calculatePointBalance ignora NaN y suma canjes negativos", () => {
  assert.equal(calculatePointBalance([100, NaN, 50]), 150)
  assert.equal(calculatePointBalance([]), 0)
  assert.equal(calculatePointBalance([200, -200]), 0)
})

test("buildPointReference une partes con dos puntos", () => {
  assert.equal(buildPointReference([" MISSION ", " s1 ", "2026-1 "]), "MISSION:s1:2026-1")
})

test("canAwardMissionPoints rechaza montos inválidos y acumulados negativos", () => {
  assert.equal(canAwardMissionPoints(0, 0, 0), false)
  assert.equal(canAwardMissionPoints(-10, 0, 0), false)
  assert.equal(canAwardMissionPoints(NaN, 0, 0), false)
  assert.equal(canAwardMissionPoints(10, -1, 0), false)
  assert.equal(canAwardMissionPoints(10, 0, -1), false)
  // borde exacto del cap sí permite
  assert.equal(canAwardMissionPoints(50, 250, 4950), true)
})
