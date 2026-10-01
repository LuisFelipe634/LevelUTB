/**
 * Seed condicional: siembra la base solo si la tabla `users` esta vacia.
 * Lo usa el contenedor en el arranque (docker-compose.yml) para que un
 * equipo nuevo levante el proyecto con datos en lugar de una base vacia.
 *
 * IMPORTANTE: prisma/seed.ts hace 22 deleteMany(), es destructivo.
 * Este wrapper evita re-sembrar sobre una base con datos reales.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function isDatabaseEmpty(): Promise<boolean> {
  const [table] = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
    ) AS exists
  `;
  if (!table?.exists) return true;

  const [row] = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) AS count FROM users
  `;
  return Number(row?.count ?? 0) === 0;
}

async function main() {
  if (process.env.SEED_IF_EMPTY === "false") {
    return;
  }

  if (await isDatabaseEmpty()) {
    // Se llama al CLI de tsx por ruta absoluta con el node del propio proceso:
    // sin "npx" (descarga paquetes en runtime) y sin "shell: true" (que
    // resolveria el binario via PATH, con riesgo de directorios con escritura).
    const tsxCli = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
    const result = spawnSync(process.execPath, [tsxCli, "prisma/seed.ts"], {
      stdio: "inherit",
      env: process.env,
    });
    if (result.status !== 0) {
      console.error("[seed-if-empty] El seed fallo. Revisa prisma/seed.ts.");
      process.exit(result.status ?? 1);
    }
  }
}

main()
  .catch((e) => {
    console.error("[seed-if-empty] Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
