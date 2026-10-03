import test from "node:test"
import assert from "node:assert/strict"

import { getAverageGrade } from "./academic"

test("getAverageGrade prioriza el historial académico ponderado por créditos", () => {
  const history = [
    { grade: 4.0, credits: 3, status: "APROBADO" },
    { grade: 3.0, credits: 3, status: "APROBADO" },
  ]
  // (4*3 + 3*3) / 6 = 3.5 aunque enrollments tenga otro promedio
  assert.equal(
    getAverageGrade(history, [{ grade: 5.0, credits: 3, status: "APROBADO" }], 0),
    3.5
  )
})

test("getAverageGrade ignora PENDIENTE y notas no finitas del historial", () => {
  const history = [
    { grade: null, status: "APROBADO" },
    { grade: 4.0, credits: 2, status: "PENDIENTE" },
  ]
  const enrollments = [{ grade: 4.2, credits: 3, status: "CURSANDO" }]
  assert.equal(getAverageGrade(history, enrollments, 1.0), 4.2)
})

test("getAverageGrade ignora MANUAL sin aval (evita farmeo de promedio)", () => {
  const enrollments = [
    { grade: 5.0, credits: 3, status: "CURSANDO", source: "MANUAL" },
    { grade: 3.0, credits: 3, status: "CURSANDO", source: "UNIVERSITY" },
  ]
  assert.equal(getAverageGrade([], enrollments, 0), 3.0)
})

test("getAverageGrade acepta MANUAL cuando ya fue APROBADO", () => {
  const enrollments = [
    { grade: 4.5, credits: 2, status: "APROBADO", source: "MANUAL" },
  ]
  assert.equal(getAverageGrade([], enrollments, 0), 4.5)
})

test("getAverageGrade usa fallback sin datos", () => {
  assert.equal(getAverageGrade([], [], 3.3), 3.3)
  assert.equal(getAverageGrade([{ grade: null, status: "APROBADO" }], [], 2.5), 2.5)
})

test("getAverageGrade pondera por créditos y redondea a 2 decimales", () => {
  const history = [
    { grade: 4.0, credits: 4, status: "APROBADO" },
    { grade: 3.0, credits: 1, status: "APROBADO" },
  ]
  // (16 + 3) / 5 = 3.8
  assert.equal(getAverageGrade(history, [], 0), 3.8)
})
