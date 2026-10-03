import test from "node:test"
import assert from "node:assert/strict"

import {
  buildApprovedCredits,
  cappedPercent,
  failed,
  getCurrentPeriod,
  parseInitialAverage,
  passed,
} from "./missionVerificationService"

test("passed/failed tienen forma de VerificationResult", () => {
  assert.deepEqual(passed("ok"), { passed: true, progress: 100, message: "ok" })
  assert.deepEqual(failed("no"), { passed: false, progress: 0, message: "no" })
  assert.deepEqual(failed("casi", 67), { passed: false, progress: 67, message: "casi" })
})

test("cappedPercent nunca llega a 100 en parciales", () => {
  assert.equal(cappedPercent(0, 7), 0)
  assert.equal(cappedPercent(3, 7), 43)
  assert.equal(cappedPercent(7, 7), 99)
  assert.equal(cappedPercent(99, 7), 99)
  assert.equal(cappedPercent(5, 0), 0)
  assert.equal(cappedPercent(5, -2), 0)
})

test("buildApprovedCredits deduplica por curso y solo cuenta APROBADO con curso", () => {
  const map = buildApprovedCredits([
    { status: "APROBADO", semesterCode: "2026-1", courseId: "c1", course: { credits: 4 } },
    { status: "APROBADO", semesterCode: "2026-1", courseId: "c1", course: { credits: 4 } },
    { status: "APROBADO", semesterCode: "2026-1", courseId: "c2", course: { credits: 3 } },
    { status: "REPROBADO", semesterCode: "2026-1", courseId: "c3", course: { credits: 3 } },
    { status: "APROBADO", semesterCode: "2026-1", courseId: "c4", course: null },
  ] as never)
  assert.equal(map.size, 2)
  assert.equal(map.get("c1"), 4)
  assert.equal(map.get("c2"), 3)
})

test("parseInitialAverage lee línea base de MEJORAR_PROMEDIO", () => {
  assert.equal(parseInitialAverage('{"initialAverage":3.1}', 4.0), 3.1)
  assert.equal(parseInitialAverage(null, 4.0), 4.0)
  assert.equal(parseInitialAverage("no-json", 4.0), 4.0)
  assert.equal(parseInitialAverage('{"initialAverage":"x"}', 4.0), 4.0)
  assert.equal(parseInitialAverage('{"otro":1}', 4.0), 4.0)
})

test("getCurrentPeriod del dominio coincide con regla ene-jun / jul-dic", () => {
  assert.equal(getCurrentPeriod(new Date(2026, 0, 5)), "2026-1")
  assert.equal(getCurrentPeriod(new Date(2026, 6, 5)), "2026-2")
})
