import test from "node:test"
import assert from "node:assert/strict"

import {
  AcceptMissionUseCase,
  AwardPointsUseCase,
  CompleteMissionUseCase,
  CreateNotificationUseCase,
  GetMissionsUseCase,
  StartMissionUseCase,
  VerifyMissionUseCase,
} from "./use-cases/missionUseCases"

function fakeRepo(overrides = {}) {
  return {
    getMissionsWithStudentStatus: async () => ({ missions: [{ id: "m1" }], stats: { total: 1 } }),
    acceptMission: async () => ({ id: "sm1", studentId: "s1", missionId: "m1", status: "PENDIENTE", progress: 0 }),
    startMission: async () => ({ id: "sm1", studentId: "s1", missionId: "m1", status: "EN_PROGRESO", progress: 10, metadata: null }),
    completeMission: async () => ({ id: "sm1", studentId: "s1", missionId: "m1", status: "COMPLETADA", progress: 100, completedAt: new Date(), evidence: "auto" }),
    verifyMission: async () => ({ passed: true, progress: 100, message: "ok" }),
    awardPoints: async () => 50,
    createNotification: async () => undefined,
    ...overrides,
  } as never
}

test("GetMissionsUseCase delega al repositorio con estudiante y nivel", async () => {
  let seen: unknown[] = []
  const repo = fakeRepo({
    getMissionsWithStudentStatus: async (a: string, b: number) => {
      seen = [a, b]
      return { missions: [], stats: { total: 0 } }
    },
  })
  const result = await new GetMissionsUseCase(repo).execute("s1", 2)
  assert.deepEqual(seen, ["s1", 2])
  assert.ok(Array.isArray(result.missions))
})

test("Accept/Start/Complete fluyen studentId + missionId + payload", async () => {
  const calls: Record<string, unknown[]> = {}
  const repo = fakeRepo({
    acceptMission: async (s: string, m: string) => {
      calls.accept = [s, m]
      return { id: "sm1", studentId: s, missionId: m, status: "PENDIENTE", progress: 0 }
    },
    startMission: async (s: string, m: string, meta: string | null) => {
      calls.start = [s, m, meta]
      return { id: "sm1", studentId: s, missionId: m, status: "EN_PROGRESO", progress: 10, metadata: meta }
    },
    completeMission: async (s: string, m: string, ev: string | null, v: unknown) => {
      calls.complete = [s, m, ev, v]
      return { id: "sm1", studentId: s, missionId: m, status: "COMPLETADA", progress: 100, completedAt: new Date(), evidence: ev }
    },
  })

  const accepted = await new AcceptMissionUseCase(repo).execute("s1", "m1")
  assert.equal(accepted.studentMission.status, "PENDIENTE")

  const started = await new StartMissionUseCase(repo).execute("s1", "m1", '{"initialAverage":3.5}')
  assert.equal(started.studentMission.status, "EN_PROGRESO")

  const completed = await new CompleteMissionUseCase(repo).execute("s1", "m1", "evidencia", { passed: true, progress: 100, message: "ok" })
  assert.equal(completed.studentMission.status, "COMPLETADA")

  assert.deepEqual(calls.accept, ["s1", "m1"])
  assert.deepEqual(calls.start, ["s1", "m1", '{"initialAverage":3.5}'])
  assert.equal((calls.complete as unknown[])[0], "s1")
})

test("VerifyMission propaga passed/progress/message sin alterar", async () => {
  const repo = fakeRepo({
    verifyMission: async () => ({ passed: false, progress: 43, message: "Te faltan días" }),
  })
  const result = await new VerifyMissionUseCase(repo).execute(
    { verificationKey: "RACHA_7_DIAS_ACCESO", verificationValue: null },
    "s1",
    null
  )
  assert.deepEqual(result, { passed: false, progress: 43, message: "Te faltan días" })
})

test("AwardPoints devuelve puntos otorgados y CreateNotification no falla", async () => {
  const points = await new AwardPointsUseCase(fakeRepo()).execute("s1", 50, "MISION_COMPLETADA", "desc", "ref-1")
  assert.equal(points, 50)
  await new CreateNotificationUseCase(fakeRepo()).execute("s1", "t", "m", "INFO", "/misiones")
})

test("errores del repositorio se propagan (no se tragan)", async () => {
  const repo = fakeRepo({
    acceptMission: async () => {
      throw new Error("DB caida")
    },
  })
  await assert.rejects(() => new AcceptMissionUseCase(repo).execute("s1", "m1"), /DB caida/)
})
