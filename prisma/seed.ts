import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const connectionString = process.env.DATABASE_URL!

// No se imprime nada derivado de DATABASE_URL: enmascarar la URL con regex
// deja escapar claves con "@" y query params como ?sslpassword=. El host
// aparece solo en el error de conexion de Prisma si algo falla.
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

// Periodo academico vigente: el semestre 1 va de enero a junio, el 2 de julio a diciembre.
const currentMonth = new Date().getMonth()
const currentSemester = currentMonth < 6 ? 1 : 2
const CURRENT_PERIOD = `${new Date().getFullYear()}-${currentSemester}`

// Semestre que el estudiante demo tiene en curso; el resto de su historia
// academica queda en estado APROBADO.
const DEMO_CURRENT_SEMESTER = 6

// Unica materia del semestre en curso que se asigna al docente. Es el vinculo
// unico estudiante <-> docente: el estudiante esta matriculado (CURSANDO) y el
// docente la tiene asignada en el periodo actual, asi que todo canje de
// recompensa le aparece al docente para revisar.
const ASSIGNED_COURSE_CODE = 'C09A'

// Notas fijas para la historia demo (no aleatorias): el seed queda reproducible
// y el mismo en cada `db:reset`.
const DEMO_HISTORY_GRADES = [4.2, 4.5, 3.9, 4.1, 4.4, 4.0]

// Saldo inicial del estudiante demo. Los puntos solo se otorgan al cerrar un
// periodo o al verificar misiones, asi que sin esto el canje de recompensas
// (la recompensa mas barata cuesta 500) no se puede probar de inmediato.
const DEMO_INITIAL_POINTS = 2000

type CourseType = 'OBLIGATORIO' | 'ELECTIVA' | 'LIBRE_ELECCION' | 'GENERAL'
type RewardCategory = 'EXAMEN' | 'ASISTENCIA' | 'ENTREGA' | 'OTRO'
type MissionType = 'ACADEMICO' | 'PLANIFICACION' | 'MEJORA_CONTINUA' | 'IMPACTO_SOCIAL' | 'HABITO_ESTUDIO'
type BadgeCategory = 'PROGRESO' | 'COMPETENCIA' | 'HABITO' | 'IMPACTO_SOCIAL' | 'RENDIMIENTO'

type CourseSeed = { code: string; name: string; credits: number; type: CourseType; prereq: string[] }
type SemesterSeed = { number: number; courses: CourseSeed[] }
type LevelSeed = { number: number; name: string; minPoints: number }
type StudentSeed = {
  email: string
  name: string
  studentCode: string
  currentSemester: number
  admissionYear: number
  totalCredits: number
  averageGrade: number
  level: number
}
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
    code: 'UTB-CS-01',
    name: 'Core Skills',
    description: 'Reconocimiento por el desarrollo de competencias fundamentales.',
    iconUrl: 'CS',
    category: 'PROGRESO',
    requiredLevel: 1,
    pointsRequired: null,
  },
  {
    code: 'UTB-CS-PLUS-01',
    name: 'Core Skills Plus',
    description: 'Reconocimiento avanzado por competencias fundamentales.',
    iconUrl: 'CSP',
    category: 'PROGRESO',
    requiredLevel: 3,
    pointsRequired: null,
  },
  {
    code: 'UTB-PS-01',
    name: 'Power Skills',
    description: 'Reconocimiento por el desarrollo de habilidades de crecimiento personal.',
    iconUrl: 'PS',
    category: 'HABITO',
    requiredLevel: 1,
    pointsRequired: null,
  },
  {
    code: 'UTB-PS-PLUS-01',
    name: 'Power Skills Plus',
    description: 'Reconocimiento avanzado por habilidades de crecimiento personal.',
    iconUrl: 'PSP',
    category: 'HABITO',
    requiredLevel: 3,
    pointsRequired: null,
  },
  {
    code: 'UTB-LU-01',
    name: 'Lideres UTB',
    description: 'Reconocimiento por liderazgo y participacion en la comunidad UTB.',
    iconUrl: 'LU',
    category: 'IMPACTO_SOCIAL',
    requiredLevel: 1,
    pointsRequired: null,
  },
  {
    code: 'UTB-LU-PLUS-01',
    name: 'Lideres UTB Plus',
    description: 'Reconocimiento avanzado por liderazgo e impacto institucional.',
    iconUrl: 'LUP',
    category: 'IMPACTO_SOCIAL',
    requiredLevel: 4,
    pointsRequired: null,
  },
  {
    code: 'UTB-CP-01',
    name: 'Conexiones Profesionales',
    description: 'Reconocimiento por la construccion de conexiones profesionales.',
    iconUrl: 'CP',
    category: 'COMPETENCIA',
    requiredLevel: 1,
    pointsRequired: null,
  },
  {
    code: 'UTB-CP-PLUS-01',
    name: 'Conexiones Profesionales Plus',
    description: 'Reconocimiento avanzado por conexiones profesionales.',
    iconUrl: 'CPP',
    category: 'COMPETENCIA',
    requiredLevel: 4,
    pointsRequired: null,
  },
]

// Insignias ya obtenidas por el estudiante demo, por studentCode. Se dejan
// bloqueadas algunas a proposito para que /logros muestre ambos estados.
// Catalogo canonico: scripts/badges.json v2026.3 (8 insignias).
const AWARDED_BADGES_BY_STUDENT: Record<string, Array<{ code: string; daysAgo: number; evidence: string | null }>> = {
  '2019123456': [
    { code: 'UTB-CS-01', daysAgo: 258, evidence: 'Competencias fundamentales desarrolladas.' },
    { code: 'UTB-CS-PLUS-01', daysAgo: 199, evidence: 'Nivel avanzado de competencias fundamentales.' },
    { code: 'UTB-PS-01', daysAgo: 176, evidence: 'Habilidades de crecimiento personal demostradas.' },
    { code: 'UTB-LU-01', daysAgo: 134, evidence: 'Participacion en la comunidad UTB.' },
    { code: 'UTB-CP-01', daysAgo: 113, evidence: 'Conexion profesional registrada.' },
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
  { title: 'Primer recorrido', description: 'Visita el Dashboard, Perfil, Malla, Misiones y Recompensas.', type: 'PLANIFICACION', pointsReward: 10, autoVerify: true },
  { title: 'Conoce tu perfil', description: 'Completa los datos principales de tu perfil académico.', type: 'PLANIFICACION', pointsReward: 15, autoVerify: true },
  { title: 'Descubre tus misiones', description: 'Consulta la lista de misiones y abre el detalle de una misión.', type: 'PLANIFICACION', pointsReward: 5, autoVerify: true },
  { title: 'Revisa tus logros', description: 'Consulta la sección de logros o insignias.', type: 'PLANIFICACION', pointsReward: 5, autoVerify: true },
  { title: 'Conoce las recompensas', description: 'Explora el catálogo y consulta una recompensa.', type: 'PLANIFICACION', pointsReward: 5, autoVerify: true },
  { title: 'Encuentra un docente', description: 'Busca y consulta el perfil de un docente.', type: 'PLANIFICACION', pointsReward: 10, autoVerify: true },
  { title: 'Consulta tus estadísticas', description: 'Abre estadísticas y revisa tu avance académico.', type: 'ACADEMICO', pointsReward: 5, autoVerify: true },
  { title: 'Descubre una recomendación', description: 'Abre una recomendación académica personalizada.', type: 'PLANIFICACION', pointsReward: 5, autoVerify: true },
  { title: 'Explorador universitario', description: 'Visita los ocho módulos principales de LevelUTB.', type: 'PLANIFICACION', pointsReward: 30, autoVerify: true },
  { title: 'Ruta del estudiante', description: 'Consulta perfil, malla, misiones, logros y recompensas.', type: 'PLANIFICACION', pointsReward: 25, autoVerify: true },
  { title: 'Conoce tu carrera', description: 'Explora diez áreas diferentes de la malla curricular.', type: 'ACADEMICO', pointsReward: 40, autoVerify: true },
  { title: 'Cazador de oportunidades', description: 'Revisa recomendaciones, misiones y recompensas.', type: 'PLANIFICACION', pointsReward: 20, autoVerify: true },
  { title: 'Planifica tu semestre', description: 'Consulta asignaturas, prerrequisitos y recomendaciones.', type: 'PLANIFICACION', pointsReward: 40, autoVerify: true },
]

// Unico estudiante y unico docente: el estudiante esta matriculado (CURSANDO) en
// ASSIGNED_COURSE_CODE durante el periodo actual y esa misma materia queda
// asignada al docente, de modo que /docentes lo lista y le muestra sus solicitudes.
// El orden de escritura importa: las insignias se resuelven por studentCode y la
// materia del docente se filtra por la matricula que crea el historial del estudiante.
async function main() {
  await cleanDatabase()
  await seedAcademicPeriods()

  const program = await createCurriculum()
  await createCatalog()

  const passwordHash = await bcrypt.hash('demo123', 10)

  const student = await createStudent(program.id, passwordHash, {
    email: 'demo@utb.edu.co',
    name: 'Juan Pérez',
    studentCode: '2019123456',
    currentSemester: DEMO_CURRENT_SEMESTER,
    admissionYear: 2019,
    totalCredits: 79,
    averageGrade: 4.2,
    level: 3,
  })
  await seedStudentHistory(student.profileId, program.id)
  await seedInitialPoints(student.userId)

  // Las insignias se siembran despues de crear el perfil: el awarding se
  // resuelve por studentCode.
  await seedBadges()

  const currentCourses = await findCurrentCourses()

  await createTeacherUser(passwordHash, {
    email: 'docente@utb.edu.co',
    name: 'María González',
    profession: 'Ingeniera de Sistemas',
  })
  await assignTeacherCourses(currentCourses)
}

// Saldo inicial del periodo vigente, para poder probar el canje de recompensas
// sin esperar al cierre de un periodo. `referenceKey` fija la idempotencia.
async function seedInitialPoints(userId: string) {
  await prisma.point.create({
    data: {
      userId,
      amount: DEMO_INITIAL_POINTS,
      source: 'PUNTOS_BASE_SEMESTRAL',
      periodCode: CURRENT_PERIOD,
      referenceKey: `SEED_SALDO_INICIAL:${userId}:${CURRENT_PERIOD}`,
      description: 'Saldo inicial del periodo para pruebas',
    },
  })

  console.log(`✅ Saldo inicial del estudiante: ${DEMO_INITIAL_POINTS} puntos (${CURRENT_PERIOD})`)
}

async function cleanDatabase() {
  await prisma.academicPeriod.deleteMany()
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
  await prisma.teacherCourse.deleteMany()
  await prisma.studentProfile.deleteMany()
  await prisma.teacherProfile.deleteMany()
  await prisma.user.deleteMany()
  await prisma.emailVerificationToken.deleteMany()
  await prisma.allowedStudent.deleteMany()
  await prisma.prerequisite.deleteMany()
  await prisma.mission.deleteMany()
  await prisma.badge.deleteMany()
  await prisma.level.deleteMany()
  await prisma.course.deleteMany()
  await prisma.semester.deleteMany()
  await prisma.program.deleteMany()
}

async function seedAcademicPeriods() {
  const year = new Date().getFullYear()
  const currentStart = new Date(year, currentSemester === 1 ? 0 : 6, 1)
  const currentEnd = new Date(year, currentSemester === 1 ? 6 : 12, 0, 23, 59, 59, 999)

  await prisma.academicPeriod.upsert({
    where: { code: CURRENT_PERIOD },
    update: { startsAt: currentStart, endsAt: currentEnd, status: 'ACTIVE' },
    create: { code: CURRENT_PERIOD, startsAt: currentStart, endsAt: currentEnd, status: 'ACTIVE' },
  })
}

async function createCurriculum() {
  const program = await prisma.program.create({ data: PROGRAM_DATA })
  console.log('✅ Programa creado:', program.name)

  await Promise.all(SEMESTERS_DATA.map((semesterData) => createSemester(program.id, semesterData)))
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

  await Promise.all(semesterData.courses.map((courseData) => createCourse(programId, semester.id, courseData)))
}

async function createCourse(programId: string, semesterId: string, courseData: CourseSeed) {
  const { prereq, ...courseInfo } = courseData
  const course = await prisma.course.create({
    data: { ...courseInfo, programId, semesterId },
  })

  await Promise.all(prereq.map((prereqCode) => linkPrerequisite(course.id, prereqCode)))
}

async function linkPrerequisite(courseId: string, prereqCode: string) {
  const prereqCourse = await prisma.course.findUnique({ where: { code: prereqCode } })
  if (!prereqCourse) return

  await prisma.prerequisite.create({
    data: { courseId, prerequisiteId: prereqCourse.id, type: 'REQUIRED' },
  })
}

async function createCatalog() {
  await Promise.all(LEVELS_DATA.map((levelData) => prisma.level.create({ data: levelData })))
  console.log('✅ Niveles creados')

  console.log('🎁 Creando recompensas...')
  await Promise.all(REWARDS_DATA.map((rewardData) => prisma.reward.create({ data: rewardData })))
  console.log('✅ Recompensas creadas')

  await Promise.all(MISSIONS_DATA.map((missionData) => prisma.mission.create({ data: missionData })))
  console.log('✅ Misiones creadas')
}

// El codigo no existe en el schema (Badge no lo tiene): se usa solo como llave
// interna del seed para resolver el awarding de las ya obtenidas.
async function seedBadges() {
  // Create all badges in parallel
  const badgeResults = await Promise.all(
    BADGES_DATA.map(async (badgeData) => {
      const { code, ...data } = badgeData
      const badge = await prisma.badge.create({ data })
      return { code, id: badge.id }
    })
  )
  const byCode = new Map(badgeResults.map(({ code, id }) => [code, id]))
  console.log('✅ Insignias creadas')

  // Fetch all profiles in parallel
  const studentCodes = Object.keys(AWARDED_BADGES_BY_STUDENT)
  const profiles = await Promise.all(
    studentCodes.map((studentCode) =>
      prisma.studentProfile.findUnique({ where: { studentCode }, select: { userId: true } })
    )
  )
  const profileMap = new Map(studentCodes.map((code, i) => [code, profiles[i]]))

  // Create all student badges in parallel
  const awardPromises: Promise<unknown>[] = []
  for (const [studentCode, awards] of Object.entries(AWARDED_BADGES_BY_STUDENT)) {
    const profile = profileMap.get(studentCode)
    if (!profile) continue

    for (const award of awards) {
      const badgeId = byCode.get(award.code)
      if (!badgeId) {
        throw new Error(`AWARDED_BADGES_BY_STUDENT referencia un code inexistente: ${award.code}`)
      }

      const earnedAt = new Date()
      earnedAt.setUTCDate(earnedAt.getUTCDate() - award.daysAgo)

      awardPromises.push(
        prisma.studentBadge.create({
          data: { studentId: profile.userId, badgeId, earnedAt, evidence: award.evidence },
        })
      )
    }
  }
  await Promise.all(awardPromises)
  console.log('✅ Insignias obtenidas por el estudiante demo')
}

async function createStudent(programId: string, passwordHash: string, student: StudentSeed) {
  const user = await prisma.user.create({
    data: {
      email: student.email,
      name: student.name,
      passwordHash,
      role: 'STUDENT',
      studentProfile: {
        create: {
          studentCode: student.studentCode,
          programId,
          currentSemester: student.currentSemester,
          admissionYear: student.admissionYear,
          totalCredits: student.totalCredits,
          averageGrade: student.averageGrade,
          level: student.level,
        },
      },
    },
    include: { studentProfile: true },
  })

  console.log('✅ Estudiante demo creado:', user.email)
  return { email: user.email, userId: user.id, profileId: requireProfile(user.studentProfile, user.email).id }
}

async function seedStudentHistory(studentId: string, programId: string) {
  const courses = await prisma.course.findMany({
    where: { programId },
    include: { semester: true },
    orderBy: [{ semester: { number: 'asc' } }, { code: 'asc' }],
  })

  const enrollmentPromises = courses
    .filter((course) => course.semester.number <= DEMO_CURRENT_SEMESTER)
    .map((course) => {
      const semesterNumber = course.semester.number
      const isCurrent = semesterNumber === DEMO_CURRENT_SEMESTER
      const pastYear = 2019 + semesterNumber - 1
      const pastSemester = semesterNumber % 2 === 0 ? 2 : 1
      const pastPeriod = `${pastYear}-${pastSemester}`

      return prisma.enrollment.create({
        data: {
          studentId,
          courseId: course.id,
          semesterCode: isCurrent ? CURRENT_PERIOD : pastPeriod,
          status: isCurrent ? 'CURSANDO' : 'APROBADO',
          grade: isCurrent ? null : DEMO_HISTORY_GRADES[(semesterNumber - 1) % 6],
        },
      })
    })

  await Promise.all(enrollmentPromises)
  console.log(`✅ Inscripciones del estudiante demo creadas (semestres 1-${DEMO_CURRENT_SEMESTER - 1} aprobados, ${DEMO_CURRENT_SEMESTER} en curso)`)
}

async function createTeacherUser(
  passwordHash: string,
  teacher: { email: string; name: string; profession: string },
) {
  const user = await prisma.user.create({
    data: {
      email: teacher.email,
      name: teacher.name,
      passwordHash,
      role: 'TEACHER',
      teacherProfile: {
        create: {
          department: 'Ingeniería de Sistemas',
          faculty: 'Facultad de Ingeniería',
          profession: teacher.profession,
          title: 'Docente acompañante',
          isActive: true,
        },
      },
    },
    include: { teacherProfile: true },
  })

  console.log('✅ Docente demo creado:', user.email)
  return { email: user.email, profileId: requireProfile(user.teacherProfile, user.email).id }
}

/**
 * Materias con matrícula oficial y vigente (CURSANDO + UNIVERSITY en el periodo
 * actual). Es el conjunto que /api/rewards ofrece para canjear, así que el que el
 * docente necesita tener asignado para ver las solicitudes.
 */
async function findCurrentCourses() {
  const courses = await prisma.course.findMany({
    where: {
      code: ASSIGNED_COURSE_CODE,
      enrollments: {
        some: { status: 'CURSANDO', source: 'UNIVERSITY', semesterCode: CURRENT_PERIOD },
      },
    },
    select: { id: true, code: true, name: true },
  })

  // Falla ruidosamente en vez de dejar al docente sin materia: sin el vinculo
  // estudiante <-> docente el flujo de canje no se puede probar.
  if (courses.length === 0) {
    throw new Error(
      `${ASSIGNED_COURSE_CODE} no tiene matricula CURSANDO en ${CURRENT_PERIOD}: el docente quedaria sin materia asignada`,
    )
  }

  return courses
}

async function assignTeacherCourses(courses: Array<{ id: string; code: string; name: string }>) {
  const teacher = await prisma.teacherProfile.findFirstOrThrow()

  await Promise.all(
    courses.map((course) =>
      prisma.teacherCourse.create({
        data: { teacherId: teacher.id, courseId: course.id, period: CURRENT_PERIOD },
      })
    )
  )

  console.log(
    `✅ Materia vigente asignada al docente: ${courses.map((course) => `${course.code} ${course.name}`).join(', ')}`,
  )
  return courses
}

main()
  .catch((e) => {
    console.error('❌ Error durante el seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
