# Contexto persistente del proyecto

Este archivo define el contexto y los acuerdos estables para trabajar en este
repositorio. Codex debe leerlo antes de actuar y conservar estas reglas durante
toda la tarea.

## Idioma y colaboración

- Responder al usuario en español, salvo que pida otro idioma.
- Escribir siempre en inglés todo texto visible o entregado por Storefront,
  checkout, Admin y OrderPRO. Esto incluye navegación, botones, etiquetas,
  ayudas, estados, validaciones, errores, notificaciones, correos, SMS,
  metadatos SEO y contenido operativo.
- No introducir copy en español en esos productos salvo que exista una decisión
  explícita de localización. Los nombres propios y el contenido ingresado por
  clientes conservan su forma original.
- Escribir en inglés el nuevo código, comentarios, pruebas, fixtures visibles y
  documentación específica de Storefront u OrderPRO. No renombrar código
  existente solo para traducirlo si eso aumenta el riesgo o cambia el alcance.
- Mantener nombres de código, comandos, rutas y términos técnicos en su forma
  original cuando traducirlos pueda causar ambigüedad.
- No volver a preguntar decisiones que ya estén documentadas. Si falta un dato
  que no puede deducirse con seguridad, explicar el bloqueo de forma concreta.
- Antes de una tarea amplia, confirmar brevemente el objetivo, los límites y la
  fuente de verdad que se utilizará.

## Propósito del producto

Modern State es el ecommerce de State News NYC para sus tiendas del Upper East
Side. El objetivo es ofrecer catálogo, merchandising, pickup, local delivery y,
cuando esté aprobado, shipping, con validaciones críticas ejecutadas en el
servidor y una administración segura y auditable.

El sistema todavía no debe asumirse como una tienda transaccional de producción
completamente habilitada. La presencia de código, variables de entorno o feature
flags no equivale a una autorización de lanzamiento.

## Fuentes de verdad

Consultar solo los documentos relevantes para la tarea y aplicar este orden:

1. `README.md`: estado general, instalación y comandos principales.
2. `docs/PRODUCT_VISION.md`: experiencia objetivo, responsabilidades entre
   sistemas y flujos estables del producto.
3. `docs/MASTER_ROADMAP.md`: fases, gates, decisiones y orden de trabajo.
4. El handoff más reciente aplicable, por ejemplo
   `docs/phase-2-handoff.md`.
5. El documento especializado del dominio dentro de `docs/`.
6. El código, el schema, las migraciones y las pruebas actuales como evidencia
   de lo que realmente está implementado.

Si dos fuentes se contradicen, no elegir silenciosamente. Comparar fechas,
verificar el comportamiento en código y pruebas, indicar la discrepancia y usar
la fuente fechada más reciente que tenga evidencia verificable. Los documentos
históricos no deben usarse para declarar habilitada una capacidad actual.

## Arquitectura y propiedad de datos

- Stack: Next.js 16 App Router, React 19, TypeScript estricto, Tailwind CSS,
  Prisma, PostgreSQL, Vitest y Playwright.
- Herramientas fijadas: Node.js 24.18.x, npm 11 y `package-lock.json`. Usar npm;
  no reemplazar el gestor de paquetes ni regenerar el lockfile sin necesidad.
- Square es la fuente comercial de catálogo, variaciones, precios, inventario,
  órdenes, pagos, impuestos y reporting.
- PostgreSQL contiene el estado operativo propio del sitio, CMS,
  merchandising, auditoría, idempotencia y los modelos que correspondan según
  los contratos vigentes.
- OrderPRO decide las operaciones de walking/local delivery que sus contratos
  le asignan: elegibilidad, tienda, ruta, tarifa, slots, capacidad, reservas y
  ejecución. El sitio consume esas decisiones mediante APIs versionadas y no
  debe recrearlas con scaffolding legado.
- Shippo se limita al dominio de carrier/shipping y devoluciones descrito en los
  documentos especializados.
- El navegador nunca decide el precio final, inventario, tarifa, impuestos,
  elegibilidad de fulfillment, tienda operativa ni capacidad.

## Límites no negociables

- Square Production permanece en solo lectura hasta una aprobación explícita y
  separada para cada tipo de escritura. No crear órdenes, capturar pagos,
  mutar inventario ni usar tarjetas reales por inferencia.
- No habilitar shipping hasta que el warehouse, sus reglas y el flujo Shippo
  estén aprobados y validados de extremo a extremo.
- Mantener Admin fail-closed. No convertir la ausencia de identidad, sesión,
  MFA, RBAC, persistencia o secretos válidos en un acceso exitoso.
- Un fallo de PostgreSQL no puede presentarse como guardado, publicación o
  checkout exitoso en preview o producción.
- No desplegar, publicar contenido, aplicar migraciones a bases compartidas,
  activar feature flags externos ni rotar secretos sin autorización expresa.
- No exponer, copiar a logs, incluir en commits ni repetir en respuestas valores
  de `.env*`, tokens, contraseñas, hashes, cookies, claves o URLs con
  credenciales. Las variables `NEXT_PUBLIC_*` nunca pueden contener secretos.
- Preservar los cambios existentes del usuario. No limpiar, revertir, mover ni
  reformatear trabajo ajeno a la tarea.

## Forma de trabajar

- Inspeccionar primero los archivos, pruebas y documentación del dominio que se
  va a modificar.
- Preferir cambios pequeños y focalizados que respeten los límites entre
  storefront, admin, checkout e integraciones server-only.
- Reutilizar patrones y servicios existentes antes de introducir otra
  abstracción o dependencia.
- No añadir dependencias de producción ni hacer upgrades amplios como parte de
  una feature sin justificarlo y obtener aprobación cuando cambie el alcance.
- Usar el cliente Prisma compartido de `src/server/db/prisma.ts`; no crear y
  desconectar un cliente por request.
- Todo dato proveniente del navegador o de una integración externa debe
  validarse en el servidor. Mantener idempotencia y auditoría en operaciones con
  efectos.
- Actualizar la documentación del dominio cuando cambien contratos,
  configuración, gates, runbooks o comportamiento observable.

## Mapa rápido del repositorio

- `src/app`: páginas, route groups y endpoints API.
- `src/components`: UI reutilizable de storefront, checkout y admin.
- `src/features`: lógica agrupada por dominio.
- `src/server`: integraciones y lógica exclusivamente server-side.
- `src/config`: configuración declarativa del producto y administración.
- `src/design`: tokens, temas y presets visuales.
- `prisma`: schema y migraciones.
- `src/tests/unit`, `src/tests/integration`, `src/tests/e2e`: niveles de prueba.
- `docs`: roadmap, handoffs, arquitectura, seguridad y runbooks especializados.

## Verificación proporcional

- Ejecutar primero las pruebas focalizadas del área modificada.
- Para cambios normales de código, comprobar como mínimo tests relevantes,
  lint y typecheck. Usar `npm run check` cuando el alcance lo justifique.
- Ejecutar `npm run build` para cambios amplios, rutas, configuración de Next.js
  o antes de declarar un candidato de entrega.
- Ejecutar Playwright cuando cambie un flujo visible o una interacción crítica.
- Para cambios de Prisma, validar y generar el cliente, crear una migración nueva
  y probarla primero en una base local desechable. Nunca reescribir una
  migración ya aplicada ni probar escrituras contra una base compartida por
  comodidad.
- Un cambio exclusivamente documental no requiere compilar la aplicación.
- Si una verificación no puede ejecutarse, decir exactamente cuál faltó y por
  qué; no presentarla como aprobada.

## Criterio de entrega

Una tarea está terminada cuando el comportamiento solicitado está implementado,
las verificaciones proporcionales pasan, los límites de seguridad siguen
cerrados y la documentación afectada está sincronizada. Al entregar, resumir:

- qué cambió;
- qué se verificó;
- qué riesgo, gate o trabajo pendiente permanece.

## Mantenimiento de este contexto

Mantener este archivo breve, estable y por debajo del límite de carga de Codex.
Guardar aquí acuerdos duraderos; registrar fechas, avances de fase, métricas,
commits y pendientes cambiantes en el roadmap o handoff correspondiente. Cambiar
este archivo solo cuando cambien el propósito, las fuentes de verdad, la
arquitectura, los límites o el proceso de trabajo del proyecto.

## Workspace and repository boundaries

- The canonical Modern State workspace is
  `C:\Users\MANAGER\Projects\ModernState`.
- This repository is the customer-facing Website and must live in the
  `Website` directory. The sibling `OrderPRO` directory is a separate Git
  repository and application.
- Run Git, npm, Prisma, tests, and builds from the repository that owns the
  change. Never run repository commands from the shared `ModernState` parent.
- Never add the sibling repository as an embedded Git repository, copy its
  source into this repository, or commit generated archives, deployment state,
  database backups, secrets, or temporary Codex artifacts.
- Website owns the customer experience: catalog presentation, cart, checkout,
  customer fulfillment selection, payment handoff, and customer-facing order
  status. OrderPRO owns operational fulfillment decisions and execution.
- Consume OrderPRO behavior through explicit versioned contracts. Do not
  duplicate OrderPRO routing, capacity, reservation, inventory-allocation, or
  employee-workflow rules in Website UI code.

## Cross-repository delivery workflow

1. Identify the owning repository before editing. If one change affects both
   products, define the API contract and compatibility requirements first.
2. Make separate feature branches and separate commits in Website and
   OrderPRO. Each repository must remain independently buildable and
   deployable, and each handoff must name the matching branch or commit in the
   sibling repository.
3. For contract changes, implement the backward-compatible OrderPRO provider
   first, verify its contract tests, and then update the Website consumer.
   Breaking changes require an explicit versioned migration plan.
4. Validate focused tests first, then lint, typecheck, the full relevant test
   suite, and a production build. Validate the combined customer-to-operations
   flow in Sandbox with Square Sandbox and non-production provider modes.
5. Commit and push to GitHub before deployment. Never edit tracked source,
   create Git commits, or use the VPS as the source of truth. Deploy immutable
   artifacts identified by a Git commit SHA.
6. Deploy database migrations and backward-compatible OrderPRO changes before
   the Website consumer. Verify health, authorization boundaries, webhook
   processing, idempotency, audit evidence, and rollback artifacts after each
   stage.
7. Promote to production only after Sandbox acceptance and explicit production
   authorization. Keep Website and OrderPRO rollback paths independent.
