import test from "node:test"
import assert from "node:assert/strict"

import { toMissionNotice } from "./missionUi"

test("verificación incompleta se vuelve aviso pendiente, no error", () => {
  const notice = toMissionNotice(
    {
      error: "Tu misión aún no cumple la condición de verificación automática.",
      message: "Te faltan 3 días consecutivos de acceso. Tu racha actual es de 4 días.",
      progress: 57,
    },
    "m1"
  )
  assert.equal(notice.kind, "pending")
  assert.equal(notice.title, "Aún no puedes completar esta misión")
  assert.equal(notice.detail, "Te faltan 3 días consecutivos de acceso. Tu racha actual es de 4 días.")
  assert.equal(notice.progress, 57)
  assert.equal(notice.missionId, "m1")
})

test("error sin message/progress se vuelve error normal", () => {
  const notice = toMissionNotice({ error: "No puedes completar esta misión" }, "m2")
  assert.equal(notice.kind, "error")
  assert.equal(notice.title, "No se pudo procesar la misión")
  assert.equal(notice.detail, "No puedes completar esta misión")
})

test("payload vacío usa mensaje genérico y acota el progreso", () => {
  assert.equal(toMissionNotice({}).detail, "Inténtalo de nuevo en un momento.")
  assert.equal(toMissionNotice({ error: "x", message: "y", progress: 999 }).progress, 100)
  assert.equal(toMissionNotice({ error: "x", message: "y", progress: -5 }).progress, 0)
})
