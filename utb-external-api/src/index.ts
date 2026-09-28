import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { FastifyRequest, FastifyReply } from "fastify";

const __dirname = dirname(fileURLToPath(import.meta.url));
import { existsSync } from "fs";
const candidates = [join(__dirname, "fixtures", "seed.json"), join(__dirname, "..", "src", "fixtures", "seed.json"), join(process.cwd(), "src", "fixtures", "seed.json")];
const fixturesPath = candidates.find((p) => existsSync(p)) ?? join(__dirname, "fixtures", "seed.json");
const fixturesRaw = readFileSync(fixturesPath, "utf-8");
const fixtures = JSON.parse(fixturesRaw) as {
  program: { code: string; name: string; totalCredits: number; totalSemesters: number; version: string; semesters: unknown };
  students: Array<{
    studentCode: string;
    name: string;
    email: string;
    programCode: string;
    admissionYear: number;
    currentSemester: number;
    averageGrade: number;
    level: number;
    enrollments: Array<{
      courseCode: string;
      courseName: string;
      credits: number;
      semester: number;
      status: string;
      grade: number | null;
      source: string;
      semesterCode: string;
    }>;
  }>;
  teacherCourses: unknown;
  currentPeriod: string;
};

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
  methods: ["GET"],
  allowedHeaders: ["Content-Type", "x-api-key", "authorization"],
});

// API key middleware - only enforces if env var is set
const requiredKey = process.env.API_KEY || process.env.UNIVERSITY_API_KEY || "";
app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
  if (request.url === "/health") return;
  if (!requiredKey) return;
  const key = (request.headers["x-api-key"] as string) || (request.headers["authorization"] as string)?.replace("Bearer ", "");
  if (key !== requiredKey) {
    reply.code(401).send({ error: "No autorizado - x-api-key inválida" });
  }
});

app.get("/health", async () => {
  return { ok: true, uptime: process.uptime(), currentPeriod: fixtures.currentPeriod, program: fixtures.program.code };
});

app.get("/academic/students/:studentCode", async (request: FastifyRequest<{ Params: { studentCode: string } }>, reply: FastifyReply) => {
  const { studentCode } = request.params;
  const student = fixtures.students.find((s) => s.studentCode === studentCode);
  if (!student) return reply.code(404).send({ error: "Estudiante no encontrado" });
  const { enrollments: _ignored, ...rest } = student;
  void _ignored;
  return rest;
});

app.get("/academic/students/:studentCode/enrollments", async (request: FastifyRequest<{ Params: { studentCode: string }; Querystring: { period?: string } }>, reply: FastifyReply) => {
  const { studentCode } = request.params;
  const { period } = request.query;
  const student = fixtures.students.find((s) => s.studentCode === studentCode);
  if (!student) return reply.code(404).send({ error: "Estudiante no encontrado" });
  let enrollments = student.enrollments;
  if (period) enrollments = enrollments.filter((e) => e.semesterCode === period);
  return enrollments;
});

app.get("/academic/students/:studentCode/history", async (request: FastifyRequest<{ Params: { studentCode: string } }>, reply: FastifyReply) => {
  const { studentCode } = request.params;
  const student = fixtures.students.find((s) => s.studentCode === studentCode);
  if (!student) return reply.code(404).send({ error: "Estudiante no encontrado" });
  return student.enrollments
    .filter((e) => e.status === "APROBADO" && e.grade != null)
    .map((e) => ({
      courseCode: e.courseCode,
      grade: e.grade,
      credits: e.credits,
      semester: e.semester,
      year: Number.parseInt(e.semesterCode.split("-")[0], 10),
      status: e.status,
    }));
});

app.get("/academic/programs/:code", async (request: FastifyRequest<{ Params: { code: string } }>, reply: FastifyReply) => {
  const { code } = request.params;
  if (code.toUpperCase() !== fixtures.program.code) {
    return reply.code(404).send({ error: "Programa no encontrado" });
  }
  return fixtures.program;
});

app.get("/academic/programs/:code/courses", async (request: FastifyRequest<{ Params: { code: string } }>, reply: FastifyReply) => {
  const { code } = request.params;
  if (code.toUpperCase() !== fixtures.program.code) {
    return reply.code(404).send({ error: "Programa no encontrado" });
  }
  const semesters = fixtures.program.semesters as Array<{
    number: number;
    courses: Array<{ code: string; name: string; credits: number; type: string; prereq: string[] }>;
  }>;
  const courses = semesters.flatMap((s) =>
    s.courses.map((c) => ({
      code: c.code,
      name: c.name,
      credits: c.credits,
      semester: s.number,
      type: c.type,
      prerequisites: c.prereq,
    }))
  );
  return courses;
});

app.get("/academic/teacher/:teacherId/courses", async (request: FastifyRequest<{ Querystring: { period?: string } }>) => {
  const { period } = request.query as { period?: string };
  let courses = fixtures.teacherCourses as Array<{ courseCode: string; period: string }>;
  if (period) courses = courses.filter((c) => c.period === period);
  // enrich with course name
  const semesters = fixtures.program.semesters as Array<{
    courses: Array<{ code: string; name: string; credits: number }>;
  }>;
  const courseMap = new Map<string, { name: string; credits: number }>();
  for (const sem of semesters) for (const c of sem.courses) courseMap.set(c.code, { name: c.name, credits: c.credits });
  return courses.map((tc) => ({
    ...tc,
    name: courseMap.get(tc.courseCode)?.name ?? tc.courseCode,
    credits: courseMap.get(tc.courseCode)?.credits ?? 0,
  }));
});

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || "0.0.0.0";

try {
  await app.listen({ port, host });
  console.log(`✅ utb-external-api listening on http://${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
