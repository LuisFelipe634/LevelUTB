import test from "node:test"
import assert from "node:assert/strict"

import {
  isReconcilableMirror,
  normalizeMeritcoinStudentId,
  shouldDemarkTemplateMirror,
  templateIdFromMirror,
} from "./meritcoin"

// La reconciliación de syncMeritcoinBadges consulta /summary, que une los awards
// por student_wallet. Un award válido cuya wallet no sea la del perfil no aparece
// ahí, así que los espejos MERIT-tpl-* (propiedad del sync por student_id) no
// pueden borrarse desde ese path: se perdían insignias legítimas.
test("los espejos de plantilla quedan fuera de la reconciliación por wallet", () => {
  assert.equal(isReconcilableMirror("MERIT-tpl-38bd5bf2-87b0-4f55-aca1-bd05d6663363"), false)
})

test("los espejos del propio path por wallet sí se reconcilian", () => {
  assert.equal(isReconcilableMirror("MERIT-auto-42"), true)
  assert.equal(isReconcilableMirror("MERIT-summary-estudiante-destacado"), true)
})

test("nada fuera de Meritcoin se toca", () => {
  assert.equal(isReconcilableMirror(null), false)
  assert.equal(isReconcilableMirror(undefined), false)
  assert.equal(isReconcilableMirror(""), false)
  assert.equal(isReconcilableMirror("LOCAL-1"), false)
  // "MERITCOIN" no es un prefijo de espejo: no empieza por "MERIT-".
  assert.equal(isReconcilableMirror("MERITCOIN"), false)
})

test("normaliza el ID de Moodle a la llave canónica STU-x", () => {
  assert.equal(normalizeMeritcoinStudentId("STU-3"), "STU-3")
  assert.equal(normalizeMeritcoinStudentId("stu-3"), "STU-3")
  assert.equal(normalizeMeritcoinStudentId("3"), "STU-3")
  assert.equal(normalizeMeritcoinStudentId("  STU-12  "), "STU-12")
  assert.equal(normalizeMeritcoinStudentId(null), null)
  assert.equal(normalizeMeritcoinStudentId("   "), null)
})

test("extrae el templateId de un espejo MERIT-tpl-*", () => {
  assert.equal(templateIdFromMirror("MERIT-tpl-5792c909-1169-40c0-961f-eb8b7207c46d"), "5792c909-1169-40c0-961f-eb8b7207c46d")
  assert.equal(templateIdFromMirror("MERIT-auto-42"), null)
  assert.equal(templateIdFromMirror("MERIT-summary-honor"), null)
  assert.equal(templateIdFromMirror("MERIT-tpl-"), null)
  assert.equal(templateIdFromMirror(null), null)
})

// El sync por student_id es el único dueño de las marcas sobre MERIT-tpl-*: si un
// award se revoca o se elimina en Meritcoin, la marca local debe desaparecer.
test("desmarca el espejo cuyo template ya no tiene award vigente", () => {
  const active = new Set(["tpl-honor"])
  assert.equal(shouldDemarkTemplateMirror("MERIT-tpl-tpl-excelencia", active), true)
  assert.equal(shouldDemarkTemplateMirror("MERIT-tpl-tpl-honor", active), false)
})

test("no desmarca espejos que no son de plantilla (los del sync por wallet)", () => {
  const active = new Set<string>()
  assert.equal(shouldDemarkTemplateMirror("MERIT-auto-42", active), false)
  assert.equal(shouldDemarkTemplateMirror("MERIT-summary-honor", active), false)
  assert.equal(shouldDemarkTemplateMirror("LOCAL-1", active), false)
  assert.equal(shouldDemarkTemplateMirror(null, active), false)
})
