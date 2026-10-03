import { prisma } from "@/lib/prisma"
import { getNextPeriod } from "@/lib/period"
import {
  DEFAULT_ACADEMIC_POINTS_CAP,
  DEFAULT_BASE_POINTS,
  DEFAULT_POINTS_PER_CREDIT,
  calculateAcademicPoints,
} from "@/lib/pointRules"

export class SemesterClosingError extends Error {
  constructor(public readonly code: "PERIOD_NOT_FOUND" | "NEXT_PERIOD_NOT_FOUND" | "PERIOD_ALREADY_CLOSED") {
    super(code)
  }
}

export async function closeAcademicPeriod(periodCode: string, requestedNextPeriodCode?: string) {
  const nextPeriodCode = requestedNextPeriodCode || getNextPeriod(periodCode)

  return prisma.$transaction(async (tx) => {
    const period = await tx.academicPeriod.findUnique({ where: { code: periodCode } })
    if (!period) throw new SemesterClosingError("PERIOD_NOT_FOUND")
    if (period.status === "CLOSED" || period.processedAt) {
      throw new SemesterClosingError("PERIOD_ALREADY_CLOSED")
    }

    const nextPeriod = await tx.academicPeriod.findUnique({ where: { code: nextPeriodCode } })
    if (!nextPeriod) throw new SemesterClosingError("NEXT_PERIOD_NOT_FOUND")

    const students = await tx.studentProfile.findMany({
      where: {
        user: { role: "STUDENT" },
      },
      select: {
        userId: true,
        enrollments: {
          where: { semesterCode: periodCode, status: "APROBADO" },
          select: { course: { select: { credits: true } } },
        },
      },
    })

    const movements = students.flatMap((student) => {
      const approvedCredits = student.enrollments.reduce((total, enrollment) => total + enrollment.course.credits, 0)
      const academicPoints = calculateAcademicPoints(
        approvedCredits,
        DEFAULT_POINTS_PER_CREDIT,
        DEFAULT_ACADEMIC_POINTS_CAP,
      )
      const baseMovement = {
        userId: student.userId,
        amount: DEFAULT_BASE_POINTS,
        source: "PUNTOS_BASE_SEMESTRAL" as const,
        periodCode: nextPeriodCode,
        referenceKey: `BASE_SEMESTRAL:${student.userId}:${nextPeriodCode}`,
        description: `Puntos base del periodo ${nextPeriodCode}`,
      }

      return academicPoints > 0
        ? [
            baseMovement,
            {
              userId: student.userId,
              amount: academicPoints,
              source: "RENDIMIENTO_ACADEMICO" as const,
              periodCode: nextPeriodCode,
              referenceKey: `ACADEMIC_RESULT:${student.userId}:${periodCode}`,
              description: `${academicPoints} puntos por ${approvedCredits} créditos aprobados en ${periodCode}`,
            },
          ]
        : [baseMovement]
    })

    if (movements.length > 0) {
      await tx.point.createMany({ data: movements, skipDuplicates: true })
    }

    const now = new Date()
    await tx.academicPeriod.update({
      where: { code: periodCode },
      data: { status: "CLOSED", closedAt: now, processedAt: now },
    })
    await tx.academicPeriod.update({
      where: { code: nextPeriodCode },
      data: { status: "ACTIVE" },
    })

    return {
      periodCode,
      nextPeriodCode,
      studentsProcessed: students.length,
      movementsCreated: movements.length,
    }
  })
}
