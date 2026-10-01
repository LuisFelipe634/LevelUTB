import test from "node:test"
import assert from "node:assert/strict"

import {
  buildApprovedCredits,
  cappedPercent,
  failed,
  passed,
  parseInitialAverage,
} from "./missionVerification"
import { getCurrentPeriod } from "./period"

test("el periodo es 1 de enero a junio y 2 de julio a diciembre", () => {
  assert.equal(getCurrentPeriod(new Date(2026, 0, 15)), "2026-1")
  assert.equal(getCurrentPeriod(new Date(2026, 5, 30)), "2026-1")
  assert.equal(getCurrentPeriod(new Date(2026, 6, 1)), "2026-2")
  assert.equal(getCurrentPeriod(new Date(2026, 11, 31)), "2026-2")
})

test("cappedPercent acota a 99 mientras no se cumpla la meta", () => {
  assert.equal(cappedPercent(0, 10), 0)
  assert.equal(cappedPercent(5, 10), 50)
  assert.equal(cappedPercent(10, 10), 99)
  assert.equal(cappedPercent(20, 10), 99)
})

test("cappedPercent devuelve 0 en vez de dividir en cero", () => {
  assert.equal(cappedPercent(5, 0), 0)
  assert.equal(cappedPercent(0, 0), 0)
  assert.equal(cappedPercent(5, -1), 0)
})

test("el progreso nunca supera 99 en un cumplimiento parcial", () => {
  assert.equal(cappedPercent(6, 6), 99)
  assert.equal(cappedPercent(2, 3), 67)
})

test("passed y failed traen los defaults de progreso", () => {
  assert.deepEqual(passed("ok"), { passed: true, progress: 100, message: "ok" })
  assert.deepEqual(failed("no"), { passed: false, progress: 0, message: "no" })
  assert.deepEqual(passed("ok", 50), { passed: true, progress: 50, message: "ok" })
})

// Los créditos aprovados se cuentan una vez por curso: reprobar y volver a
// cursar la misma materia no puede inflar el total.
test("los créditos aprobados son únicos por curso", () => {
  const map = buildApprovedCredits([
    { status: "APROBADO", courseId: "c1", course: { credits: 4 } },
    { status: "APROBADO", courseId: "c1", course: { credits: 4 } },
    { status: "APROBADO", courseId: "c2", course: { credits: 3 } },
  ])

  assert.equal(map.size, 2)
  assert.equal(map.get("c1"), 4)
  assert.equal(map.get("c2"), 3)
})

test("los créditos aprobados ignoran otros estados y cursos sin datos", () => {
  const map = buildApprovedCredits([
    { status: "REPROBADO", courseId: "c1", course: { credits: 4 } },
    { status: "CURSANDO", courseId: "c2", course: { credits: 3 } },
    { status: "APROBADO", courseId: "c3", course: null },
  ])

  assert.equal(map.size, 0)
})

test("la línea base del promedio sale del metadata de la misión", () => {
  assert.equal(parseInitialAverage('{"initialAverage":3.2}', 4.5), 3.2)
  assert.equal(parseInitialAverage('{"initialAverage":0}', 4.5), 0)
})

test("si el metadata no sirve, la línea base es el promedio del perfil", () => {
  assert.equal(parseInitialAverage(null, 4.5), 4.5)
  assert.equal(parseInitialAverage(undefined, 4.5), 4.5)
  assert.equal(parseInitialAverage("", 4.5), 4.5)
  assert.equal(parseInitialAverage("no es json", 4.5), 4.5)
  assert.equal(parseInitialAverage("null", 4.5), 4.5)
  assert.equal(parseInitialAverage("5", 4.5), 4.5)
  assert.equal(parseInitialAverage("[]", 4.5), 4.5)
  assert.equal(parseInitialAverage('{"initialAverage":"3.2"}', 4.5), 4.5)
  assert.equal(parseInitialAverage('{"otraCosa":3.2}', 4.5), 4.5)
})
