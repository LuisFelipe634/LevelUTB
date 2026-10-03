import test from "node:test"
import assert from "node:assert/strict"

import {
  computeConsecutiveAccessStreak,
  countUniqueCompletedMissions,
} from "./missionRules"

const DIA = 24 * 60 * 60 * 1000
const NOW = new Date("2026-09-26T12:00:00.000Z")

function dias(offset: number[]) {
  return offset.map((o) => ({ createdAt: new Date(NOW.getTime() - o * DIA) }))
}

test("racha: 7 días consecutivos cumplen la misión de acceso", () => {
  assert.equal(computeConsecutiveAccessStreak(dias([0, 1, 2, 3, 4, 5, 6]), NOW), 7)
})

test("racha: hueco ayer corta la racha aunque haya historial viejo", () => {
  assert.equal(computeConsecutiveAccessStreak(dias([0, 2, 3, 4]), NOW), 1)
})

test("racha: si falta hoy la racha se corta a cero (exige entrar hoy)", () => {
  assert.equal(computeConsecutiveAccessStreak(dias([1, 2]), NOW), 0)
})

test("racha: vacío es cero y duplicados del mismo día cuentan una vez", () => {
  assert.equal(computeConsecutiveAccessStreak([], NOW), 0)
  const mismoDia = [
    { createdAt: new Date("2026-09-26T01:00:00.000Z") },
    { createdAt: new Date("2026-09-26T23:00:00.000Z") },
  ]
  assert.equal(computeConsecutiveAccessStreak(mismoDia, NOW), 1)
})

test("misiones semanales: deduplica por misión en ventana de 7 días", () => {
  const items = [
    { missionId: "m1", completedAt: new Date("2026-09-26T10:00:00.000Z") },
    { missionId: "m1", completedAt: new Date("2026-09-25T10:00:00.000Z") },
    { missionId: "m2", completedAt: new Date("2026-09-24T10:00:00.000Z") },
    { missionId: "m3", completedAt: new Date("2026-09-23T10:00:00.000Z") },
  ]
  assert.equal(countUniqueCompletedMissions(items, NOW, 7), 3)
})

test("misiones semanales: fuera de ventana no cuentan", () => {
  const items = [
    { missionId: "m1", completedAt: new Date("2026-09-10T10:00:00.000Z") },
    { missionId: "m2", completedAt: new Date("2026-09-26T10:00:00.000Z") },
  ]
  assert.equal(countUniqueCompletedMissions(items, NOW, 7), 1)
  assert.equal(countUniqueCompletedMissions([], NOW, 7), 0)
})
