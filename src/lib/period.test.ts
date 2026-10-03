import test from "node:test"
import assert from "node:assert/strict"

import {
  getCurrentPeriod,
  getSemesterFromPeriod,
  getYearFromPeriod,
  parsePeriod,
  isCurrentPeriod,
  getNextPeriod,
  getPreviousPeriod,
} from "./period"

test("getCurrentPeriod: enero-junio es -1 y julio-diciembre es -2", () => {
  assert.equal(getCurrentPeriod(new Date(2026, 0, 15)), "2026-1")
  assert.equal(getCurrentPeriod(new Date(2026, 5, 30, 23, 59)), "2026-1")
  assert.equal(getCurrentPeriod(new Date(2026, 6, 1)), "2026-2")
  assert.equal(getCurrentPeriod(new Date(2026, 11, 31)), "2026-2")
})

test("parsePeriod valida formato y semestre", () => {
  assert.deepEqual(parsePeriod("2026-1"), { year: 2026, semester: 1 })
  assert.deepEqual(parsePeriod("2026-2"), { year: 2026, semester: 2 })
  assert.equal(parsePeriod("2026"), null)
  assert.equal(parsePeriod("2026-3"), null)
  assert.equal(parsePeriod("abc-1"), null)
  assert.equal(parsePeriod(""), null)
})

test("getSemesterFromPeriod y getYearFromPeriod extraen partes", () => {
  assert.equal(getSemesterFromPeriod("2026-2"), 2)
  assert.equal(getYearFromPeriod("2026-2"), 2026)
  assert.equal(getSemesterFromPeriod("invalido"), 1)
})

test("isCurrentPeriod compara contra la fecha dada", () => {
  const date = new Date(2026, 2, 10)
  assert.equal(isCurrentPeriod("2026-1", date), true)
  assert.equal(isCurrentPeriod("2026-2", date), false)
})

test("getNextPeriod y getPreviousPeriod rotan año y semestre", () => {
  assert.equal(getNextPeriod("2026-1"), "2026-2")
  assert.equal(getNextPeriod("2026-2"), "2027-1")
  assert.equal(getPreviousPeriod("2026-2"), "2026-1")
  assert.equal(getPreviousPeriod("2026-1"), "2025-2")
})

test("periodos inválidos caen al periodo actual sin lanzar", () => {
  assert.equal(typeof getNextPeriod("no-valido"), "string")
  assert.equal(typeof getPreviousPeriod("no-valido"), "string")
})
