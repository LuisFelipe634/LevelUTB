import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const connectionString = process.env.DATABASE_URL!

// No se imprime nada derivado de DATABASE_URL: enmascarar la URL con regex
// deja escapar claves con "@" y query params como ?sslpassword=. El host
// aparece solo en el error de conexion de Prisma si algo falla.
console.log('🔗 Conectando a la base de datos...')
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

// Periodo academico vigente: el semestre 1 va de enero a junio, el 2 de julio a diciembre.
const CURRENT_PERIOD = `${new Date().getFullYear()}-${new Date().getMonth() < 6 ? 1 : 2}`

// Semestres que cada estudiante demo tiene en curso; el resto de su historia
// academica queda en estado APROBADO.
const DEMO_CURRENT_SEMESTER = 6
const SARA_CURRENT_SEMESTER = 8
const ANGELA_CURRENT_SEMESTER = 3

// Las cuatro materias demo que comparte el docente con los estudiantes demo.
const ASSIGNED_COURSE_CODES = ['H01A', 'M01A', 'C02A', 'C04A']

// Unica materia del segundo docente, para comprobar el filtro por materia:
// cualquier canje de otra materia no le debe aparecer.
const SECOND_TEACHER_COURSE_CODE = 'C04A'

// Materias que Juan Perez aprueba en el periodo actual para que la mision
// "Aprobar 6 creditos este semestre" (verificacion automatica) se pueda completar.
const CURRENT_APPROVED_CODES = ['C05A', 'C06A']
// Notas fijas por curso (no aleatorias): el seed queda reproducible y el mismo
// en cada `db:reset`.
const CURRENT_APPROVED_GRADES: Record<string, number> = { C05A: 4.3, C06A: 3.8 }
const DEMO_HISTORY_GRADES = [4.2, 4.5, 3.9, 4.1, 4.4, 4.0]

type CourseType = 'OBLIGATORIO' | 'ELECTIVA' | 'LIBRE_ELECCION' | 'GENERAL'
type RewardCategory = 'EXAMEN' | 'ASISTENCIA' | 'ENTREGA' | 'OTRO'
type MissionType = 'ACADEMICO' | 'PLANIFICACION' | 'MEJORA_CONTINUA' | 'IMPACTO_SOCIAL' | 'HABITO_ESTUDIO'
type BadgeCategory = 'PROGRESO' | 'COMPETENCIA' | 'HABITO' | 'IMPACTO_SOCIAL' | 'RENDIMIENTO'

type CourseSeed = { code: string; name: string; credits: number; type: CourseType; prereq: string[] }
type SemesterSeed = { number: number; courses: CourseSeed[] }
type LevelSeed = { number: number; name: string; minPoints: number }
type RewardSeed = {
  name: string
  description: string
  icon: string
  category: RewardCategory
  cost: number
  maxUses: number | null
}
type MissionSeed = {
  title: string
  description: string
  type: MissionType
  pointsReward: number
  autoVerify: boolean
  verificationKey?: string
  verificationValue?: string
}
type StudentProfileRef = { id: string }

// El codigo no existe en el schema (Badge no lo tiene): se usa solo como llave
// interna del seed para resolver el awarding de las ya obtenidas.
type BadgeSeed = {
  code: string
  name: string
  description: string
  iconUrl: string
  category: BadgeCategory
  requiredLevel: number | null
  pointsRequired: number | null
}

const BADGES_DATA: BadgeSeed[] = [
  {
    code: 'UTB-PROG-01',
    name: 'Primer Semestre',
    description: 'Aprobaste tu primer semestre completo en la UTB.',
    iconUrl: '🎓',
    category: 'PROGRESO',
    requiredLevel: 1,
    pointsRequired: null,
  },
  {
    code: 'UTB-PROG-02',
    name: 'Medio Camino',
    description: 'Alcanzaste la mitad de los creditos de tu programa.',
    iconUrl: '🛤️',
    category: 'PROGRESO',
    requiredLevel: 3,
    pointsRequired: 1500,
  },
  {
    code: 'UTB-PROG-03',
    name: 'Cerca de Graduarse',
    description: 'Te faltan 20 creditos o menos para graduarte.',
    iconUrl: '🏁',
    category: 'PROGRESO',
    requiredLevel: 5,
    pointsRequired: 5000,
  },
  {
    code: 'UTB-REND-01',
    name: 'Promedio Impresionante',
    description: 'Mantuviste un promedio ponderado igual o superior a 4.5.',
    iconUrl: '⭐',
    category: 'RENDIMIENTO',
    requiredLevel: 2,
    pointsRequired: null,
  },
  {
    code: 'UTB-REND-02',
    name: 'Pulso Ascendente',
    description: 'Mejoraste tu promedio en 0.5 puntos o mas respecto al inicio del periodo.',
    iconUrl: '📈',
    category: 'RENDIMIENTO',
    requiredLevel: 3,
    pointsRequired: 1200,
  },
  {
    code: 'UTB-REND-03',
    name: 'Sin Reprobados',
    description: 'Cerraste un semestre completo sin registrar ninguna materia reprobada.',
    iconUrl: '🎯',
    category: 'RENDIMIENTO',
    requiredLevel: 1,
    pointsRequired: null,
  },
  {
    code: 'UTB-HAB-01',
    name: 'Racha de 7 Dias',
    description: 'Registraste actividad academica durante 7 dias consecutivos.',
    iconUrl: '🔥',
    category: 'HABITO',
    requiredLevel: 2,
    pointsRequired: 800,
  },
  {
    code: 'UTB-HAB-02',
    name: 'Estudiante Constante',
    description: 'Completaste 3 o mas misiones en una misma semana.',
    iconUrl: '🗓️',
    category: 'HABITO',
    requiredLevel: 2,
    pointsRequired: 700,
  },
  {
    code: 'UTB-COMP-01',
    name: 'Explorador de la Malla',
    description: 'Revisaste el catalogo de cursos de al menos tres semestres.',
    iconUrl: '🧭',
    category: 'COMPETENCIA',
    requiredLevel: 1,
    pointsRequired: null,
  },
  {
    code: 'UTB-COMP-02',
    name: 'Planificador',
    description: 'Planeaste tu proximo semestre sin superar el tope de creditos.',
    iconUrl: '📋',
    category: 'COMPETENCIA',
    requiredLevel: 2,
    pointsRequired: 600,
  },
  {
    code: 'UTB-SOC-01',
    name: 'Impacto Social',
    description: 'Completaste una mision de impacto social en tu comunidad.',
    iconUrl: '🤝',
    category: 'IMPACTO_SOCIAL',
    requiredLevel: 3,
    pointsRequired: 1000,
  },
  {
    code: 'UTB-SOC-02',
    name: 'Liderazgo',
    description: 'Ayudaste a al menos dos companeros a desbloquear una insignia.',
    iconUrl: '🌟',
    category: 'IMPACTO_SOCIAL',
    requiredLevel: 4,
    pointsRequired: 2000,
  },
]

// Insignias ya obtenidas por cada estudiante demo, por studentCode. Se dejan
// bloqueadas algunas a proposito para que /logros muestre ambos estados.
const AWARDED_BADGES_BY_STUDENT: Record<string, Array<{ code: string; daysAgo: number; evidence: string | null }>> = {
  '2019123456': [
    { code: 'UTB-PROG-01', daysAgo: 420, evidence: null },
    { code: 'UTB-REND-01', daysAgo: 180, evidence: 'Promedio ponderado 4.2 sobre 40 creditos oficializados.' },
    { code: 'UTB-REND-03', daysAgo: 60, evidence: null },
    { code: 'UTB-COMP-01', daysAgo: 30, evidence: null },
    { code: 'UTB-COMP-02', daysAgo: 12, evidence: 'Seleccion de 16 creditos para el proximo periodo.' },
  ],
  '2020123456': [
    { code: 'UTB-PROG-01', daysAgo: 380, evidence: null },
    { code: 'UTB-PROG-02', daysAgo: 90, evidence: null },
    { code: 'UTB-HAB-01', daysAgo: 45, evidence: null },
    { code: 'UTB-COMP-01', daysAgo: 20, evidence: null },
  ],
  '2021123456': [
    { code: 'UTB-PROG-01', daysAgo: 200, evidence: null },
  ],
}

// El perfil se crea anidado en el mismo INSERT, asi que no puede faltar; el
// guard solo existe para que TypeScript lo vea sin castear a mano.
function requireProfile<T>(profile: T | null, email: string): T {
  if (!profile) throw new Error(`El seed no creo el perfil de ${email}`)
  return profile
}

const PROGRAM_DATA = {
  code: 'ISCO',
  name: 'Ingeniería de Sistemas',
  totalCredits: 162,
  totalSemesters: 10,
  version: '2019',
}

// Malla del plan 2019: 10 niveles, 55 cursos y 162 créditos.
const SEMESTERS_DATA: SemesterSeed[] = [
  {
    number: 1,
    courses: [
      { code: 'H01A', name: 'Taller de Comprensión Lectora', credits: 3, type: 'GENERAL', prereq: [] },
      { code: 'M01A', name: 'Cálculo Diferencial', credits: 4, type: 'OBLIGATORIO', prereq: [] },
      { code: 'M02A', name: 'Matemáticas Básicas', credits: 2, type: 'OBLIGATORIO', prereq: [] },
      { code: 'Q01A', name: 'Química General', credits: 3, type: 'GENERAL', prereq: [] },
      { code: 'U01A', name: 'Desarrollo Universitario', credits: 0, type: 'GENERAL', prereq: [] },
      { code: 'C01A', name: 'Seminario de Ingeniería de Sistemas y Computación', credits: 1, type: 'OBLIGATORIO', prereq: [] },
      { code: 'C02A', name: 'Fundamentos de Programación', credits: 3, type: 'OBLIGATORIO', prereq: [] },
    ],
  },
  {
    number: 2,
    courses: [
      { code: 'LE1A', name: 'Lengua Extranjera I', credits: 2, type: 'GENERAL', prereq: [] },
      { code: 'F01A', name: 'Física Mecánica', credits: 4, type: 'OBLIGATORIO', prereq: [] },
      { code: 'M03A', name: 'Cálculo Integral', credits: 4, type: 'OBLIGATORIO', prereq: ['M01A', 'M02A'] },
      { code: 'M04A', name: 'Álgebra Lineal', credits: 3, type: 'OBLIGATORIO', prereq: ['M02A'] },
      { code: 'C03A', name: 'Programación', credits: 3, type: 'OBLIGATORIO', prereq: ['C02A'] },
    ],
  },
  {
    number: 3,
    courses: [
      { code: 'LE2A', name: 'Lengua Extranjera II', credits: 2, type: 'GENERAL', prereq: ['LE1A'] },
      { code: 'H02A', name: 'Taller de Escritura Académica', credits: 3, type: 'GENERAL', prereq: ['H01A'] },
      { code: 'F02A', name: 'Física Electricidad y Magnetismo', credits: 4, type: 'OBLIGATORIO', prereq: ['F01A'] },
      { code: 'M05A', name: 'Cálculo Vectorial', credits: 4, type: 'OBLIGATORIO', prereq: ['M03A', 'M04A'] },
      { code: 'C04A', name: 'Programación Orientada a Objetos', credits: 3, type: 'OBLIGATORIO', prereq: ['C03A'] },
    ],
  },
  {
    number: 4,
    courses: [
      { code: 'LE3A', name: 'Lengua Extranjera III', credits: 2, type: 'GENERAL', prereq: ['LE2A'] },
      { code: 'H03A', name: 'Constitución Política', credits: 2, type: 'GENERAL', prereq: [] },
      { code: 'M06A', name: 'Ecuaciones Diferenciales y en Diferencia', credits: 4, type: 'OBLIGATORIO', prereq: ['M05A'] },
      { code: 'C05A', name: 'Estructura de Datos', credits: 3, type: 'OBLIGATORIO', prereq: ['C04A'] },
      { code: 'C06A', name: 'Matemática Discreta', credits: 3, type: 'OBLIGATORIO', prereq: ['M02A'] },
    ],
  },
  {
    number: 5,
    courses: [
      { code: 'LE4A', name: 'Lengua Extranjera IV', credits: 2, type: 'GENERAL', prereq: ['LE3A'] },
      { code: 'E01A', name: 'Estadística y Probabilidad', credits: 3, type: 'OBLIGATORIO', prereq: ['M04A'] },
      { code: 'A01A', name: 'Arquitectura de Software', credits: 3, type: 'OBLIGATORIO', prereq: ['C05A'] },
      { code: 'A02A', name: 'Desarrollo de Software', credits: 3, type: 'OBLIGATORIO', prereq: ['C05A'] },
      { code: 'A03A', name: 'Algoritmos y Complejidad', credits: 3, type: 'OBLIGATORIO', prereq: ['C05A'] },
      { code: 'C07A', name: 'Base de Datos', credits: 3, type: 'OBLIGATORIO', prereq: ['C05A'] },
    ],
  },
  {
    number: 6,
    courses: [
      { code: 'LE5A', name: 'Lengua Extranjera V', credits: 2, type: 'GENERAL', prereq: ['LE4A'] },
      { code: 'E02A', name: 'Estadística Inferencial', credits: 3, type: 'OBLIGATORIO', prereq: ['E01A'] },
      { code: 'G04A', name: 'Creatividad y Emprendimiento', credits: 3, type: 'GENERAL', prereq: [] },
      { code: 'A04A', name: 'Formulación y Evaluación de Proyectos', credits: 3, type: 'OBLIGATORIO', prereq: ['A02A'] },
      { code: 'C08A', name: 'Procesamiento Numérico', credits: 3, type: 'OBLIGATORIO', prereq: ['M05A'] },
      { code: 'C09A', name: 'Comunicaciones y Redes', credits: 3, type: 'OBLIGATORIO', prereq: ['C07A'] },
    ],
  },
  {
    number: 7,
    courses: [
      { code: 'H05A', name: 'Ciudadanía Global', credits: 2, type: 'GENERAL', prereq: [] },
      { code: 'M12A', name: 'Inteligencia Artificial', credits: 3, type: 'OBLIGATORIO', prereq: ['A03A'] },
      { code: 'A05A', name: 'Ingeniería de Software', credits: 3, type: 'OBLIGATORIO', prereq: ['A01A', 'A02A'] },
      { code: 'C10A', name: 'Arquitectura del Computador', credits: 3, type: 'OBLIGATORIO', prereq: ['C09A'] },
      { code: 'EC1A', name: 'Electiva Complementaria I', credits: 3, type: 'ELECTIVA', prereq: [] },
      { code: 'C11A', name: 'Sistemas Operativos', credits: 3, type: 'OBLIGATORIO', prereq: ['C10A'] },
    ],
  },
  {
    number: 8,
    courses: [
      { code: 'HU1A', name: 'Electiva de Humanidades I', credits: 2, type: 'ELECTIVA', prereq: [] },
      { code: 'A06A', name: 'Infraestructura para TI', credits: 3, type: 'OBLIGATORIO', prereq: ['C10A'] },
      { code: 'A07A', name: 'Computación en Paralelo', credits: 3, type: 'OBLIGATORIO', prereq: ['C11A'] },
      { code: 'EC2A', name: 'Electiva Complementaria II', credits: 3, type: 'ELECTIVA', prereq: [] },
      { code: 'C12A', name: 'Tópicos Especiales de Ciencias Computacionales', credits: 3, type: 'OBLIGATORIO', prereq: ['C11A'] },
      { code: 'P01A', name: 'Proyecto de Ingeniería I', credits: 3, type: 'OBLIGATORIO', prereq: ['A05A'] },
    ],
  },
  {
    number: 9,
    courses: [
      { code: 'HU2A', name: 'Electiva de Humanidades II', credits: 2, type: 'ELECTIVA', prereq: [] },
      { code: 'EE1A', name: 'Electiva Empresarial', credits: 3, type: 'ELECTIVA', prereq: [] },
      { code: 'A08A', name: 'Sistemas y Modelos', credits: 3, type: 'OBLIGATORIO', prereq: ['A05A'] },
      { code: 'EC3A', name: 'Electiva Complementaria III', credits: 3, type: 'ELECTIVA', prereq: [] },
      { code: 'P02A', name: 'Proyecto de Ingeniería II', credits: 3, type: 'OBLIGATORIO', prereq: ['P01A'] },
      { code: 'EL1A', name: 'Electiva de Libre Elección', credits: 4, type: 'ELECTIVA', prereq: [] },
    ],
  },
  {
    number: 10,
    courses: [
      { code: 'H04A', name: 'Ética', credits: 2, type: 'GENERAL', prereq: [] },
      { code: 'EC4A', name: 'Electiva Complementaria IV', credits: 3, type: 'ELECTIVA', prereq: [] },
      { code: 'P03A', name: 'Práctica Profesional', credits: 9, type: 'OBLIGATORIO', prereq: ['P02A'] },
    ],
  },
]

const LEVELS_DATA: LevelSeed[] = [
  { number: 1, name: 'Novato', minPoints: 0 },
  { number: 2, name: 'Aprendiz', minPoints: 500 },
  { number: 3, name: 'Explorador', minPoints: 1500 },
  { number: 4, name: 'Avanzado', minPoints: 3000 },
  { number: 5, name: 'Maestro', minPoints: 5000 },
  { number: 6, name: 'Leyenda', minPoints: 8000 },
]

const REWARDS_DATA: RewardSeed[] = [
  {
    name: 'Exoneración de Parcial',
    description: 'Exonerarse de presentar un examen parcial (sujeto a aprobación docente). No aplica a exámenes finales.',
    icon: '📝',
    category: 'EXAMEN',
    cost: 2000,
    maxUses: 1,
  },
  {
    name: 'Mejora de Nota Parcial',
    description: 'Aumentar la nota de un examen parcial en 0.5 puntos (máximo hasta 5.0). Requiere aprobación del docente.',
    icon: '📈',
    category: 'EXAMEN',
    cost: 1500,
    maxUses: 2,
  },
  {
    name: 'Limpieza de Inasistencia',
    description: 'Eliminar una inasistencia registrada en el curso actual. Máximo 1 por semestre.',
    icon: '✅',
    category: 'ASISTENCIA',
    cost: 800,
    maxUses: 1,
  },
  {
    name: 'Extensión de Entrega',
    description: 'Obtener 48 horas extra para entregar un trabajo o proyecto. Una vez por curso.',
    icon: '⏰',
    category: 'ENTREGA',
    cost: 500,
    maxUses: 1,
  },
  {
    name: 'Reintento de Quiz',
    description: 'Volver a presentar un cuestionario/quiz para mejorar la nota. Sujeto a disponibilidad del docente.',
    icon: '🔄',
    category: 'ENTREGA',
    cost: 600,
    maxUses: 2,
  },
  {
    name: 'Asesoría Personalizada',
    description: 'Sesión de 30 minutos con el docente acompañante para revisar dudas o planificar el semestre.',
    icon: '👨‍🏫',
    category: 'OTRO',
    cost: 1000,
    maxUses: 1,
  },
]

const MISSIONS_DATA: MissionSeed[] = [
  { title: 'Planificar Próximo Semestre', description: 'Selecciona materias disponibles sin superar 18 créditos.', type: 'PLANIFICACION', pointsReward: 150, autoVerify: true },
  { title: 'Explorar tu Malla', description: 'Consulta materias de al menos tres semestres.', type: 'ACADEMICO', pointsReward: 50, autoVerify: true },
  { title: 'Revisar tu Progreso', description: 'Consulta tus estadísticas académicas de la semana.', type: 'ACADEMICO', pointsReward: 50, autoVerify: true },
  { title: 'Constancia Académica', description: 'Ingresa a la plataforma cuatro días diferentes durante la semana.', type: 'HABITO_ESTUDIO', pointsReward: 100, autoVerify: true },
  { title: 'Completar un Quiz', description: 'Obtén al menos 70% en un cuestionario académico.', type: 'ACADEMICO', pointsReward: 100, autoVerify: true },
  { title: 'Mantener una racha de 7 días accediendo', description: 'Registra diariamente una actividad con action = LOGIN o PAGE_VIEW:/dashboard y comprueba 7 días consecutivos.', type: 'HABITO_ESTUDIO', pointsReward: 200, autoVerify: true, verificationKey: 'RACHA_7_DIAS_ACCESO' },
  { title: 'Completar 3 misiones en una semana', description: 'Cuenta los registros de StudentMission con status = COMPLETADA dentro de una ventana de 7 días.', type: 'MEJORA_CONTINUA', pointsReward: 250, autoVerify: true, verificationKey: 'COMPLETAR_3_MISIONES_SEMANA' },
  { title: 'Revisar las notificaciones pendientes', description: 'Verifica que el número de notificaciones con isRead = false sea igual a 0.', type: 'HABITO_ESTUDIO', pointsReward: 150, autoVerify: true, verificationKey: 'SIN_NOTIFICACIONES_PENDIENTES' },
  // Misiones académicas con verificación automática real
  { title: 'Aprobar 6 créditos este semestre', description: 'Aprueba al menos 6 créditos durante el período académico actual.', type: 'ACADEMICO', pointsReward: 200, autoVerify: true, verificationKey: 'APROBAR_CREDITOS_SEMESTRE', verificationValue: '6' },
  { title: 'Mejorar tu promedio en 0.5 puntos', description: 'Sube tu promedio ponderado al menos 0.5 puntos respecto al inicio del período.', type: 'ACADEMICO', pointsReward: 250, autoVerify: true, verificationKey: 'MEJORAR_PROMEDIO', verificationValue: '0.5' },
  { title: 'Cero reprobados en el semestre', description: 'No registrar ninguna materia reprobada en el semestre actual.', type: 'ACADEMICO', pointsReward: 200, autoVerify: true, verificationKey: 'CERO_REPROBADOS' },
  { title: 'Completar prerrequisitos de Programación Orientada a Objetos', description: 'Aprueba todos los prerrequisitos del curso C04A para poder cursarlo.', type: 'PLANIFICACION', pointsReward: 150, autoVerify: true, verificationKey: 'COMPLETAR_PREREQUISITOS', verificationValue: 'C04A' },
  { title: 'Avanzar al siguiente semestre', description: 'Acumula los créditos necesarios (12 por semestre cursado) para avanzar de semestre.', type: 'ACADEMICO', pointsReward: 180, autoVerify: true, verificationKey: 'AVANZAR_SEMESTRE' },
]

// El orden de escritura importa: el upsert de la historia de Angela al final
// actualiza la matricula de C04A en el periodo actual que crea el bloque docente.
async function main() {
  console.log('🌱 Iniciando seed de la base de datos...')

  console.log('🧹 Limpiando datos existentes...')
  await cleanDatabase()
  console.log('✅ Datos limpiados')

  const program = await createCurriculum()
  await createCatalog()

  const passwordHash = await bcrypt.hash('demo123', 10)
  const secondPasswordHash = await bcrypt.hash('demo1234', 10)

  const juan = await createDemoStudent(program.id, passwordHash)
  await seedDemoHistory(juan.profileId, program.id)

  const sara = await createSecondStudent(program.id, secondPasswordHash)
  await seedSecondStudentHistory(sara.profileId, program.id)

  const angela = await createThirdStudent(program.id, secondPasswordHash)
  await seedThirdStudentHistory(angela.profileId, program.id)
  await approveCurrentCredits(juan.profileId)

  // Las insignias se siembran al final: el awarding se resuelve por studentCode,
  // asi que los tres perfiles de arriba ya tienen que existir.
  await seedBadges()

  // Primero se enlazan las cuatro matrículas demo para que las asignaciones del
  // profesor coincidan exactamente con los cursos de sus estudiantes.
  await linkCurrentEnrollments({
    juan: { id: juan.profileId },
    sara: { id: sara.profileId },
    angela: { id: angela.profileId },
  })

  const currentCourses = await findCurrentCourses()

  const teacher = await createTeacherUser(passwordHash)
  await assignTeacherCourses(teacher.profileId, currentCourses)

  // Segundo docente con una sola materia, para probar que un docente que NO tiene
  // asignada la materia del canje no lo ve en su lista de pendientes.
  const secondTeacher = await createSecondTeacherUser(passwordHash)
  await assignTeacherCourses(
    secondTeacher.profileId,
    currentCourses.filter((course) => course.code === SECOND_TEACHER_COURSE_CODE)
  )

  console.log('✅ Cuatro cursos y estudiantes demo asignados al docente')

  console.log('🎉 Seed completado exitosamente!')
}

async function cleanDatabase() {
  await prisma.studentReward.deleteMany()
  await prisma.reward.deleteMany()
  await prisma.activity.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.studentBadge.deleteMany()
  await prisma.studentMission.deleteMany()
  await prisma.point.deleteMany()
  await prisma.recommendation.deleteMany()
  await prisma.riskAlert.deleteMany()
  await prisma.enrollment.deleteMany()
  await prisma.academicRecord.deleteMany()
  await prisma.studentProfile.deleteMany()
  await prisma.teacherProfile.deleteMany()
  await prisma.user.deleteMany()
  await prisma.prerequisite.deleteMany()
  await prisma.mission.deleteMany()
  await prisma.badge.deleteMany()
  await prisma.level.deleteMany()
  await prisma.course.deleteMany()
  await prisma.semester.deleteMany()
  await prisma.program.deleteMany()
}

async function createCurriculum() {
  const program = await prisma.program.create({ data: PROGRAM_DATA })
  console.log('✅ Programa creado:', program.name)

  for (const semesterData of SEMESTERS_DATA) {
    await createSemester(program.id, semesterData)
  }
  console.log('✅ Semestres y cursos creados')

  return program
}

async function createSemester(programId: string, semesterData: SemesterSeed) {
  const semester = await prisma.semester.create({
    data: {
      programId,
      number: semesterData.number,
      name: `Semestre ${semesterData.number}`,
    },
  })

  for (const courseData of semesterData.courses) {
    await createCourse(programId, semester.id, courseData)
  }
}

async function createCourse(programId: string, semesterId: string, courseData: CourseSeed) {
  const { prereq, ...courseInfo } = courseData
  const course = await prisma.course.create({
    data: { ...courseInfo, programId, semesterId },
  })

  for (const prereqCode of prereq) {
    await linkPrerequisite(course.id, prereqCode)
  }
}

async function linkPrerequisite(courseId: string, prereqCode: string) {
  const prereqCourse = await prisma.course.findUnique({ where: { code: prereqCode } })
  if (!prereqCourse) return

  await prisma.prerequisite.create({
    data: { courseId, prerequisiteId: prereqCourse.id, type: 'REQUIRED' },
  })
}

async function createCatalog() {
  for (const levelData of LEVELS_DATA) {
    await prisma.level.create({ data: levelData })
  }
  console.log('✅ Niveles creados')

  console.log('🎁 Creando recompensas...')
  for (const rewardData of REWARDS_DATA) {
    await prisma.reward.create({ data: rewardData })
  }
  console.log('✅ Recompensas creadas')

  for (const missionData of MISSIONS_DATA) {
    await prisma.mission.create({ data: missionData })
  }
  console.log('✅ Misiones creadas')
}

// El codigo no existe en el schema (Badge no lo tiene): se usa solo como llave
// interna del seed para resolver el awarding de las ya obtenidas.
async function seedBadges() {
  const byCode = new Map<string, string>()

  for (const badgeData of BADGES_DATA) {
    const { code, ...data } = badgeData
    const badge = await prisma.badge.create({ data })
    byCode.set(code, badge.id)
  }
  console.log('✅ Insignias creadas')

  for (const [studentCode, awards] of Object.entries(AWARDED_BADGES_BY_STUDENT)) {
    const profile = await prisma.studentProfile.findUnique({
      where: { studentCode },
      // StudentBadge.studentId referencia User.id, no StudentProfile.id.
      select: { userId: true },
    })
    if (!profile) continue

    for (const award of awards) {
      const badgeId = byCode.get(award.code)
      if (!badgeId) {
        throw new Error(`AWARDED_BADGES_BY_STUDENT referencia un code inexistente: ${award.code}`)
      }

      const earnedAt = new Date()
      earnedAt.setUTCDate(earnedAt.getUTCDate() - award.daysAgo)

      await prisma.studentBadge.create({
        data: { studentId: profile.userId, badgeId, earnedAt, evidence: award.evidence },
      })
    }
  }
  console.log('✅ Insignias obtenidas por los estudiantes demo')
}

async function createDemoStudent(programId: string, passwordHash: string) {
  const user = await prisma.user.create({
    data: {
      email: 'demo@utb.edu.co',
      name: 'Juan Pérez',
      passwordHash,
      role: 'STUDENT',
      studentProfile: {
        create: {
          studentCode: '2019123456',
          programId,
          currentSemester: DEMO_CURRENT_SEMESTER,
          admissionYear: 2019,
          totalCredits: 95,
          averageGrade: 4.2,
          level: 3,
        },
      },
    },
    include: { studentProfile: true },
  })

  console.log('✅ Usuario demo creado:', user.email)
  return { email: user.email, profileId: requireProfile(user.studentProfile, user.email).id }
}

async function seedDemoHistory(studentId: string, programId: string) {
  const courses = await prisma.course.findMany({
    where: { programId },
    include: { semester: true },
    orderBy: [{ semester: { number: 'asc' } }, { code: 'asc' }],
  })

  for (const course of courses) {
    const semesterNumber = course.semester.number
    if (semesterNumber > DEMO_CURRENT_SEMESTER) continue

    const isCurrent = semesterNumber === DEMO_CURRENT_SEMESTER
    await prisma.enrollment.create({
      data: {
        studentId,
        courseId: course.id,
        semesterCode: isCurrent
          ? CURRENT_PERIOD
          : `${2019 + semesterNumber - 1}-${semesterNumber % 2 === 0 ? 2 : 1}`,
        status: isCurrent ? 'CURSANDO' : 'APROBADO',
        grade: isCurrent ? null : DEMO_HISTORY_GRADES[(semesterNumber - 1) % 6],
      },
    })
  }

  console.log('✅ Inscripciones del usuario demo creadas')
}

async function createSecondStudent(programId: string, passwordHash: string) {
  const user = await prisma.user.create({
    data: {
      email: 'demo2@utb.edu.co',
      name: 'Sara Peña',
      passwordHash,
      role: 'STUDENT',
      studentProfile: {
        create: {
          studentCode: '2020123456',
          programId,
          currentSemester: SARA_CURRENT_SEMESTER,
          admissionYear: 2019,
          totalCredits: 113,
          averageGrade: 4.0,
          level: 5,
        },
      },
    },
    include: { studentProfile: true },
  })

  console.log('✅ Segundo estudiante creado:', user.email)
  return { email: user.email, profileId: requireProfile(user.studentProfile, user.email).id }
}

async function seedSecondStudentHistory(studentId: string, programId: string) {
  const courses = await prisma.course.findMany({
    where: { programId },
    include: { semester: true },
    orderBy: { semester: { number: 'asc' } },
  })

  for (const course of courses) {
    const semesterNumber = course.semester.number
    if (semesterNumber > SARA_CURRENT_SEMESTER) continue

    const isApproved = semesterNumber < SARA_CURRENT_SEMESTER
    await prisma.enrollment.create({
      data: {
        studentId,
        courseId: course.id,
        semesterCode: isApproved ? `${2018 + semesterNumber}-1` : CURRENT_PERIOD,
        status: isApproved ? 'APROBADO' : 'CURSANDO',
        grade: isApproved ? 4.0 : null,
      },
    })
  }

  console.log('✅ Sara Peña configurada: semestres 1-7 aprobados y semestre 8 en curso')
}

async function createThirdStudent(programId: string, passwordHash: string) {
  const user = await prisma.user.create({
    data: {
      email: 'juanito@utb.edu.co',
      name: 'Angela Lemus',
      passwordHash,
      role: 'STUDENT',
      studentProfile: {
        create: {
          studentCode: '2021123456',
          programId,
          currentSemester: ANGELA_CURRENT_SEMESTER,
          admissionYear: 2021,
          totalCredits: 60,
          averageGrade: 4.7,
          level: 4,
        },
      },
    },
    include: { studentProfile: true },
  })

  console.log('✅ Estudiante Angela Lemus creada:', user.email)
  return { email: user.email, profileId: requireProfile(user.studentProfile, user.email).id }
}

async function createTeacherUser(passwordHash: string) {
  const user = await prisma.user.create({
    data: {
      email: 'docente@utb.edu.co',
      name: 'María González',
      passwordHash,
      role: 'TEACHER',
      teacherProfile: {
        create: {
          department: 'Ingeniería de Sistemas',
          faculty: 'Facultad de Ingeniería',
          profession: 'Ingeniera de Sistemas',
          title: 'Docente acompañante',
          isActive: true,
        },
      },
    },
    include: { teacherProfile: true },
  })

  console.log('✅ Usuario docente creado:', user.email)
  return { email: user.email, profileId: requireProfile(user.teacherProfile, user.email).id }
}

async function createSecondTeacherUser(passwordHash: string) {
  const user = await prisma.user.create({
    data: {
      email: 'docente2@utb.edu.co',
      name: 'Carlos Ramírez',
      passwordHash,
      role: 'TEACHER',
      teacherProfile: {
        create: {
          department: 'Ingeniería de Sistemas',
          faculty: 'Facultad de Ingeniería',
          profession: 'Ingeniero de Sistemas',
          title: 'Docente acompañante',
          isActive: true,
        },
      },
    },
    include: { teacherProfile: true },
  })

  console.log('✅ Segundo docente creado:', user.email)
  return { email: user.email, profileId: requireProfile(user.teacherProfile, user.email).id }
}

/**
 * Materias con matrícula oficial y vigente (CURSANDO + UNIVERSITY en el periodo
 * actual). Es el conjunto que /api/rewards ofrece para canjear, así que el que el
 * docente necesita tener asignado para ver las solicitudes.
 */
async function findCurrentCourses() {
  return prisma.course.findMany({
    where: {
      code: { in: ASSIGNED_COURSE_CODES },
      enrollments: {
        some: { status: 'CURSANDO', source: 'UNIVERSITY', semesterCode: CURRENT_PERIOD },
      },
    },
    select: { id: true, code: true },
    orderBy: { code: 'asc' },
  })
}

async function assignTeacherCourses(teacherId: string, courses: Array<{ id: string }>) {
  for (const course of courses) {
    await prisma.teacherCourse.create({
      data: { teacherId, courseId: course.id, period: CURRENT_PERIOD },
    })
  }

  console.log(`✅ Materias vigentes asignadas al docente: ${courses.length}`)
  return courses
}

// Matrícula vigente y distribuida por curso (solo CURSANDO en periodo actual).
// Cada estudiante queda ligado a una o dos materias, para que el filtro por
// materia sea visible.
async function linkCurrentEnrollments(
  students: { juan: StudentProfileRef; sara: StudentProfileRef; angela: StudentProfileRef },
) {
  const { juan, sara, angela } = students
  const assignedCourses = await prisma.course.findMany({
    where: { code: { in: ASSIGNED_COURSE_CODES } },
    select: { id: true, code: true },
    orderBy: { code: 'asc' },
  })
  const courseByCode = new Map(assignedCourses.map((course) => [course.code, course]))
  const enrollmentsByCourse: Array<{ code: string; student: StudentProfileRef | null }> = [
    { code: 'H01A', student: juan }, // H01A -> Juan Pérez
    { code: 'M01A', student: sara }, // M01A -> Sara Peña
    { code: 'C04A', student: angela }, // C04A -> Angela Lemus, tercer semestre
    // Juan Pérez también en C02A para probar que un estudiante puede estar en más de una materia pero no en todas
    { code: 'C02A', student: juan },
  ]

  for (const { code, student } of enrollmentsByCourse) {
    if (!student) continue

    const course = courseByCode.get(code)
    if (!course) continue

    await enrollIfMissing(student.id, course.id, 'CURSANDO')
  }
}

async function approveCurrentCredits(studentId: string) {
  const courses = await prisma.course.findMany({ where: { code: { in: CURRENT_APPROVED_CODES } } })

  for (const course of courses) {
    await enrollIfMissing(studentId, course.id, 'APROBADO', CURRENT_APPROVED_GRADES[course.code] ?? 4.0)
  }
}

async function enrollIfMissing(
  studentId: string,
  courseId: string,
  status: 'CURSANDO' | 'APROBADO',
  grade: number | null = null,
) {
  const existing = await prisma.enrollment.findFirst({
    where: { studentId, courseId, semesterCode: CURRENT_PERIOD },
  })
  if (existing) return

  await prisma.enrollment.create({
    data: { studentId, courseId, semesterCode: CURRENT_PERIOD, status, grade },
  })
}

// Historia completa de Angela: semestres 1 y 2 aprobados, semestre 3 en curso.
async function seedThirdStudentHistory(studentId: string, programId: string) {
  const courses = await prisma.course.findMany({
    where: { programId, semester: { number: { in: [1, 2, ANGELA_CURRENT_SEMESTER] } } },
    include: { semester: true },
    orderBy: [{ semester: { number: 'asc' } }, { code: 'asc' }],
  })

  for (const course of courses) {
    const isApproved = course.semester.number < ANGELA_CURRENT_SEMESTER
    const semesterCode = isApproved ? `${2024 + course.semester.number}-1` : CURRENT_PERIOD
    const status = isApproved ? 'APROBADO' : 'CURSANDO'
    const grade = isApproved ? 4.7 : null

    await prisma.enrollment.upsert({
      where: { studentId_courseId_semesterCode: { studentId, courseId: course.id, semesterCode } },
      update: { status, grade, source: 'UNIVERSITY' },
      create: { studentId, courseId: course.id, semesterCode, status, grade, source: 'UNIVERSITY' },
    })
  }
}

main()
  .catch((e) => {
    console.error('❌ Error durante el seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
