# Declaración de uso de inteligencia artificial

Proyecto: **LevelUTB** — Plataforma gamificada de seguimiento del avance
académico.
Asignatura: **Proyecto de Ingeniería 2**, Universidad Tecnológica de Bolívar.

## Herramientas empleadas

LevelUTB se desarrolló con asistencia de dos herramientas de inteligencia
artificial: **opencode** y **GitHub Copilot**.

| Herramienta | Tipo | Rol en el proyecto |
|---|---|---|
| opencode | Agente de programación en línea de comandos | Implementación de funcionalidad: edición de archivos, refactors, redacción de pruebas unitarias y documentación técnica. |
| GitHub Copilot | Asistente en el editor | Autocompletado de funciones y componentes, borradores de código repetitivo y sugerencias de lógica. |

Ambas actuaron bajo supervisión humana. Ningún cambio generado por IA se
consolidó sin revisión previa, y el resultado se validó con las herramientas
del propio proyecto (`npm run lint`, `npm run test:unit`, `npm run build`,
`npx prisma validate`) en lugar de confiar en la salida del modelo.

## Qué se desarrolló con ayuda de IA

- **Arquitectura del backend**: las rutas de `src/app/api/**/route.ts` con
  validación de rol y errores JSON estandarizados, la separación en
  `src/domain`, `src/application` e `src/infrastructure`, y los adaptadores
  Prisma que implementan los puertos del dominio.
- **Motor de gamificación**: reglas de puntos con topes semanales y por periodo
  (`src/lib/pointRules.ts`), idempotencia mediante `referenceKey`, cálculo de
  nivel, y el motor de recomendaciones (`src/lib/recommendations.ts`).
- **Flujos de verificación**: máquina de estados de misiones
  (`src/domain/missions/missionVerificationService.ts`) y canje de recompensas
  con aprobación docente y reversión automática de puntos cuando se rechaza.
- **Capa de acceso a datos institucionales**: el patrón de fuente efectiva
  (`HttpAcademicSource`, `HttpBadgeSource`) que deja la malla curricular y el
  catálogo de insignias fuera de PostgreSQL.
- **Pruebas unitarias**: 62 pruebas con el runner nativo de Node sobre el
  dominio y `src/lib`.
- **Infraestructura**: `docker-compose.yml`, `Dockerfile`, `setup.sh` con
  generación de secretos y verificaciones previas, y los scripts de
  sincronización de catálogos.
- **Documentación técnica**: `README.md`, `docs/README.md`, este documento y
  `docs/arc42.md`.

## Decisiones que no se delegaron a la IA

| Decisión | Motivo |
|---|---|
| Modelo de negocio de la gamificación | Los puntos, topes y estados de misión reflejan criterios pedagógicos de la UTB, no una convención técnica derivable del código. |
| Fuente de verdad de los datos | Decidir que la malla y los historiales académicos viven en la API externa y no en PostgreSQL fue una decisión de arquitectura con impacto operativo. |
| Modelo de datos y relaciones | Las 25 entidades y sus restricciones de unicidad corresponden al proceso académico real de la institución. |
| Alcance y funcionalidad del producto | Qué problema resolver, para qué roles y con qué límites se definió desde el requerimiento, no desde el modelo. |
| Verificación y aceptación | Ejecutar las pruebas, revisar los cambios y aceptar o descartar cada propuesta es responsabilidad del equipo desarrollador. |

## Límites observados

- **Sin credenciales en el repositorio**: ningún secreto se incorporar a código
  versionado. `setup.sh` genera `NEXTAUTH_SECRET` y `POSTGRES_PASSWORD` en
  tiempo de instalación, y `.gitignore` excluye `.env`.
- **Sin datos reales de estudiantes**: los fixtures de `utb-external-api` y el
  seed de `prisma/seed.ts` usan un estudiante y un docente de demostración con
  dominio `@utb.edu.co`. No se ingresaron datos personales ni calificaciones
  reales de la institución.
- **Sin código conservado sin comprenderlo**: el código generado que llegó al
  repositorio se revisó; el que no se pudo verificar se descartó.
- **Autoría declarada**: el diseño del producto, la decisión de qué construir y
  la validación final corresponden al equipo desarrollador de la asignatura.

## Estado verificado

Comandos ejecutados sobre el repositorio al cierre de esta documentación:

| Comando | Resultado |
|---|---|
| `npm run lint` | 0 errores, 0 advertencias |
| `npm run test:unit` | 62 pruebas, 62 aprobadas, 0 fallidas |
| `npx prisma validate` | Esquema válido |

Las fallas corregidas, la deuda técnica pendiente y los supuestos abiertos con
la institución están en `docs/arc42.md`, sección 11.
