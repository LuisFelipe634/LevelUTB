/**
 * Import PROA/Banner -> AllowedStudent (fuente de verdad académica).
 * Uso: npx tsx scripts/import-proa.ts proa.csv
 * El CSV debe estar en ./imports/ (ignorado por git): el argumento llega de
 * la linea de comandos, que un LLM puede inventar, asi que no se acepta
 * ninguna ruta fuera de ahi.
 * CSV: email,studentCode,programCode,admissionYear,fullName?
 * Ej: 2019123456@utb.edu.co,2019123456,ISCO,2019,Juan Pérez
 */
import "dotenv/config";
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const IMPORTS_DIR = resolve(process.cwd(), "imports");

function dentroDe(base: string, ruta: string): boolean {
  const relativa = relative(base, ruta);
  return relativa !== "" && relativa !== ".." && !relativa.startsWith(`..${sep}`) && !isAbsolute(relativa);
}

function resolverCsv(argumento: string): string {
  if (isAbsolute(argumento)) {
    throw new Error(`Ruta absoluta no permitida: ${argumento}`);
  }
  if (!argumento.toLowerCase().endsWith(".csv")) {
    throw new Error(`Solo se admiten archivos .csv dentro de ${IMPORTS_DIR}: ${argumento}`);
  }
  const base = realpathSync(IMPORTS_DIR);
  const ruta = resolve(base, argumento);
  if (!dentroDe(base, ruta)) {
    throw new Error(`El archivo debe estar en ${IMPORTS_DIR}: ${argumento}`);
  }
  const real = realpathSync(ruta);
  if (!dentroDe(base, real)) {
    throw new Error(`El symlink apunta fuera de ${IMPORTS_DIR}: ${argumento}`);
  }
  return real;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Uso: npx tsx scripts/import-proa.ts proa.csv  (el CSV va en ./imports/)");
    process.exit(1);
  }
  const raw = readFileSync(resolverCsv(file), "utf-8");
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const header = lines[0].toLowerCase();
  const start = header.includes("email") ? 1 : 0;

  // Parse all valid lines first
  const parsed = lines.slice(start)
    .map((line) => {
      const [emailRaw, studentCodeRaw, programCodeRaw, yearRaw, ...nameParts] =
        line.split(",").map((s) => s.trim());
      const email = emailRaw?.toLowerCase();
      if (!email?.endsWith("@utb.edu.co") || !studentCodeRaw) return null;
      return { email, studentCodeRaw, programCodeRaw, yearRaw, nameParts };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  // Fetch all programs in parallel
  const programCodes = [...new Set(parsed.map((p) => (p.programCodeRaw || "ISCO").toUpperCase()))];
  const programs = await Promise.all(
    programCodes.map((code) => prisma.program.findFirst({ where: { code } }))
  );
  const programMap = new Map(programCodes.map((code, i) => [code, programs[i]]));

  // Upsert all students in parallel
  const upsertPromises = parsed.map(({ email, studentCodeRaw, programCodeRaw, yearRaw, nameParts }) => {
    const program = programMap.get((programCodeRaw || "ISCO").toUpperCase());
    if (!program) {
      console.warn(`Programa no encontrado: ${programCodeRaw} (${email})`);
      return Promise.resolve();
    }
    const admissionYear = Number(yearRaw) || Number(studentCodeRaw.slice(0, 4));
    const fullName = nameParts.join(",") || null;
    return prisma.allowedStudent.upsert({
      where: { email },
      update: { studentCode: studentCodeRaw, programId: program.id, admissionYear, fullName },
      create: { email, studentCode: studentCodeRaw, programId: program.id, admissionYear, fullName },
    });
  });

  await Promise.all(upsertPromises);
  console.log(`✅ AllowedStudent actualizados: ${parsed.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
