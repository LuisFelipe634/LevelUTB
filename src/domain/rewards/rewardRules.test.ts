import test from "node:test"
import assert from "node:assert/strict"

import {
  buildRewardWithEligibility,
  buildStats,
  calculateExpiresAt,
  calculateTotalPoints,
  canAfford,
  canUse,
  getUsesCount,
  hasPendingRequest,
  isEligibleCourse,
  validateTeacherAssignment,
} from "./rewardRules"

function rewardBase(overrides = {}) {
  return {
    id: "r1",
    name: "Exonerar examen",
    description: "desc",
    icon: "🎁",
    category: "EXAMEN",
    cost: 100,
    isActive: true,
    maxUses: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as never
}

function studentRewardBase(overrides = {}) {
  return {
    id: "sr1",
    studentId: "s1",
    rewardId: "r1",
    courseId: "c1",
    status: "SOLICITADO",
    pointsSpent: 100,
    requestedAt: new Date(),
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: null,
    evidence: null,
    expiresAt: null,
    ...overrides,
  } as never
}

test("calculateTotalPoints suma _sum.amount y tolera null", () => {
  assert.equal(
    calculateTotalPoints([{ _sum: { amount: 100 } }, { _sum: { amount: null } }, { _sum: { amount: 50 } }]),
    150
  )
})

test("canAfford y canUse respetan costo y maxUses", () => {
  assert.equal(canAfford(100, 100), true)
  assert.equal(canAfford(99, 100), false)
  assert.equal(canUse(rewardBase({ maxUses: null }), 99), true)
  assert.equal(canUse(rewardBase({ maxUses: 2 }), 1), true)
  assert.equal(canUse(rewardBase({ maxUses: 2 }), 2), false)
})

test("getUsesCount ignora RECHAZADO y hasPendingRequest detecta SOLICITADO", () => {
  const list = [
    studentRewardBase({ status: "SOLICITADO", rewardId: "r1", courseId: "c1" }),
    studentRewardBase({ id: "sr2", status: "APROBADO", rewardId: "r1", courseId: "c2" }),
    studentRewardBase({ id: "sr3", status: "RECHAZADO", rewardId: "r1", courseId: "c3" }),
  ]
  assert.equal(getUsesCount(list as never, "r1"), 2)
  assert.equal(hasPendingRequest(list as never, "r1", "c1"), true)
  assert.equal(hasPendingRequest(list as never, "r1", "c2"), false)
})

test("buildRewardWithEligibility combina puntos y usos", () => {
  const built = buildRewardWithEligibility(
    rewardBase({ cost: 100, maxUses: 1 }) as never,
    [studentRewardBase({ status: "APROBADO" })] as never,
    150
  )
  assert.equal(built.canAfford, true)
  assert.equal(built.canUse, false)
  assert.equal(built.usesCount, 1)
  assert.ok(built.earned !== null)
})

test("isEligibleCourse verifica matrícula en el curso", () => {
  assert.equal(isEligibleCourse([{ id: "c1", code: "A", name: "A", semester: 1, period: "2026-1" }], "c1"), true)
  assert.equal(isEligibleCourse([{ id: "c1", code: "A", name: "A", semester: 1, period: "2026-1" }], "c9"), false)
})

test("buildStats agrega por categoría y disponibilidad", () => {
  const eligible = buildRewardWithEligibility(rewardBase() as never, [] as never, 200)
  const stats = buildStats([eligible] as never, [] as never)
  assert.equal(stats.totalRewards, 1)
  assert.equal(stats.availableRewards, 1)
  assert.equal(stats.byCategory["EXAMEN"].total, 1)
})

test("validateTeacherAssignment exige curso vigente del docente", () => {
  const enrollments = [{ courseId: "c1", status: "CURSANDO", semesterCode: "2026-1" }]
  assert.deepEqual(
    validateTeacherAssignment(enrollments, ["c1"], ["2026-1"], "c1"),
    { isAssigned: true }
  )
  const wrongCourse = validateTeacherAssignment(enrollments, ["c1"], ["2026-1"], "c9")
  assert.equal(wrongCourse.isAssigned, false)
  const wrongPeriod = validateTeacherAssignment(enrollments, ["c1"], ["2025-1"], "c1")
  assert.equal(wrongPeriod.isAssigned, false)
})

test("calculateExpiresAt devuelve fecha futura de ~30 días", () => {
  const before = Date.now()
  const expires = calculateExpiresAt(30)
  const diffDays = (expires.getTime() - before) / (24 * 60 * 60 * 1000)
  assert.ok(diffDays > 29 && diffDays <= 31)
})
