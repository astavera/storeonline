# Modern State Ecommerce — Master Roadmap

Estado de referencia: 16 de julio de 2026 (America/New_York).

Este documento es la fuente maestra para el orden de trabajo, el estado de cada
fase y las barreras de aprobación del proyecto. Los documentos especializados
siguen siendo los runbooks técnicos, pero sus secciones históricas no deben
usarse para inferir el estado actual cuando contradigan este roadmap o el
`phase-1-handoff.md` fechado.

## Resultado final del programa

Entregar un ecommerce público de Modern State que use Square como fuente de
verdad comercial, PostgreSQL/Supabase como fuente de verdad operativa y CMS, y
que permita comprar con inventario, precio, ubicación y fulfillment validados
en el servidor. El sistema debe poder operar pickup, local delivery y, cuando el
warehouse esté aprobado, shipping; además debe ofrecer administración segura,
trazabilidad, rollback y monitoreo.

## Leyenda de estado

- `COMPLETA`: todos los criterios de cierre están demostrados.
- `EN CIERRE`: la implementación principal existe, pero falta al menos una
  evidencia, decisión o barrera obligatoria.
- `EN CURSO`: hay trabajo implementado y trabajo obligatorio pendiente.
- `PENDIENTE`: todavía no debe considerarse iniciado.
- `BLOQUEADA`: necesita una decisión del propietario o una dependencia externa.
- `DIFERIDA`: queda explícitamente fuera del lanzamiento inicial.

Una fase no cambia a `COMPLETA` por tener código escrito. Deben cumplirse todos
sus criterios de cierre y registrarse las verificaciones correspondientes.

## Límites no negociables

1. Square Production permanece en solo lectura hasta una aprobación separada
   para Orders o Payments. No se usan tarjetas reales durante desarrollo.
2. Precio, inventario, catálogo, órdenes, pagos, impuestos comerciales y
   reporting pertenecen a Square.
3. CMS, merchandising web, versiones, idempotencia, webhooks, delivery, slots,
   capacity, fulfillment y auditoría pertenecen a PostgreSQL.
4. El navegador nunca decide el precio final, inventario, tarifa, impuestos,
   elegibilidad de fulfillment ni capacidad.
5. Ningún error de PostgreSQL puede convertirse en un guardado local exitoso en
   preview o producción.
6. Admin permanece fail-closed hasta contar con identidad, MFA, sesión y RBAC
   aprobados.
7. Publicar merchandising no escribe en Square. Publicación y rollback requieren
   auditoría y confirmación ligada al digest.
8. Shipping permanece desactivado hasta aprobar y mapear el warehouse y validar
   Shippo de extremo a extremo.
9. No se despliega, publica contenido ni habilitan mutaciones externas por el
   simple hecho de completar una tarea de código.

## Resumen ejecutivo

| Fase | Resultado | Estado actual | Barrera principal |
| --- | --- | --- | --- |
| 0 | Scaffold, seguridad base y modelo de dominios | `COMPLETA` | Ninguna |
| 1 | PostgreSQL operativo, Square real read-only y checkout de validación | `EN CIERRE` | Compartir rama, CI remoto y aceptación explícita de cierre |
| 2 | Pickup y local delivery cotizables con zonas, slots y capacity | `EN CURSO` | Datos y reglas operativas del propietario |
| 3 | Sync y webhooks automatizados, durables y observables | `EN CURSO` | Scheduler, secretos y alertas de plataforma |
| 4 | Balloon Order guiado y conectado a fulfillment | `PENDIENTE` | Depende de Fase 2 |
| 5 | Admin/CMS operable con identidad de producción | `EN CURSO` | Selección de proveedor de identidad y MFA |
| 6 | Orders y Payments completos en Square Sandbox | `PENDIENTE` | Depende de Fases 2, 3 y 5 |
| 7 | Warehouse y shipping mediante Shippo | `BLOQUEADA` | Aprobación y mapeo del warehouse |
| 8 | Hardening integral y release candidate | `PENDIENTE` | Depende del alcance del lanzamiento |
| 9 | Deploy y lanzamiento controlado | `PENDIENTE` | GO explícito del propietario |
| 10 | Operación y optimización posterior al lanzamiento | `PENDIENTE` | Requiere tráfico real |

## Ruta crítica

```text
Fase 1 cierre
  -> Fase 2 fulfillment core
  -> Fase 3 automatización durable
  -> Fase 6 Orders/Payments en Sandbox
  -> Fase 8 release candidate
  -> Fase 9 lanzamiento controlado
```

La Fase 5 puede avanzar en paralelo desde ahora, pero identidad y RBAC deben
estar terminados antes de exponer Admin. La Fase 4 depende de los contratos de
slots y capacity de la Fase 2. La Fase 7 puede diferirse del soft launch si el
alcance aprobado es solamente pickup y local delivery.

## Fase 0 — Fundación y contención

Estado: `COMPLETA`.

### Alcance logrado

- Next.js App Router, TypeScript, Prisma, PostgreSQL, Vitest y Playwright.
- Separación explícita de propiedad entre Square, PostgreSQL y CMS.
- Admin y uploads fail-closed, RBAC por capacidades, validación Origin/Host,
  rate-limit central y validación de archivos.
- Persistencia PostgreSQL obligatoria fuera de desarrollo.
- Checkout identificado correctamente como `validation_only`.
- Webhook inbox durable, idempotencia y tablas operativas preparadas.
- CMS versionado, renderer compartido y base del builder genérico.
- Pruebas estables sin depender del catálogo real en CI.

### Evidencia de cierre

- Remediación de seguridad y persistencia cubierta por pruebas unitarias.
- Baseline de migraciones revisado y aplicado posteriormente en Fase 1.
- Sin pagos, órdenes ni escrituras a Square Production.

## Fase 1 — Base operativa y catálogo real

Estado: `EN CIERRE`. GO técnico para continuar desarrollando; NO-GO para tráfico
transaccional de producción.

### Completado

- Seis migraciones aplicadas en Supabase y schema al día.
- 24 constraints operativos presentes, validados y sin violaciones.
- Dos tiendas creadas y mapeadas a Square Production:
  - `store-3rd-avenue` -> `LP9N7FFH78H2W`
  - `store-86th-street` -> `LPTVETSP8A546`
- Backfill read-only: 66,141 items, 74,640 variaciones y 223,920 filas de
  inventario por ubicación.
- Sincronización incremental de catálogo e inventario con leases durables.
- Checkout valida precio e inventario fresco por tienda sin crear orden ni pago.
- Auditoría de readiness: 585 productos elegibles en 3rd Avenue y 618 en 86th.
- Publicación temporal y rollback probados. La versión PUBLISHED 3 permanece
  vacía y la versión DRAFT 4 conserva 751 placements sin shipping.
- Commit de traspaso local: `2688f61` en `codex/phase-1-real-catalog`.
- Calidad revalidada el 2026-07-16 desde instalación limpia: Prisma generado,
  lint sin errores con 46 warnings dentro del presupuesto, typecheck aprobado,
  135 unit tests y 8 pruebas Playwright aprobadas; build de producción aprobado.
- Estado compartido revalidado el 2026-07-16: seis migraciones al día, 24
  constraints validados sin violaciones, sync incremental read-only completado y
  readiness de 585/618 productos. DRAFT 4 permanece intencionalmente sin publicar.

### Pendiente para cerrar

- [ ] Publicar la rama en el remoto y ejecutar los checks de CI desde el commit
      compartido.
- [ ] Confirmar que otro desarrollador puede reconstruir el proyecto desde
      `npm ci` siguiendo `phase-1-handoff.md`.
- [x] Decisión del propietario registrada el 2026-07-16: mantener DRAFT 4 sin
      publicar durante el cierre de Fase 1 y el inicio ordenado de Fase 2. Toda
      publicación futura requiere una aprobación separada.
- [ ] Aceptación explícita del cierre de Fase 1 después de revisar las evidencias.

### Criterio de cierre

La rama está compartida, CI está verde, el handoff es reproducible y el
propietario acepta formalmente la base read-only. Cerrar esta fase no habilita
Orders, Payments, shipping, Admin público ni deployment.

## Fase 2 — Fulfillment core: pickup y local delivery

Estado: `EN CURSO` por existencia de schema y helpers; falta operación completa.

### Entregables

- Configurar las dos tiendas, horarios, días activos, feriados y cutoffs.
- Versionar polígonos de delivery y validar point-in-polygon en backend.
- Geocodificar y normalizar direcciones con Mapbox sin confiar en el frontend.
- Definir reglas deterministas de fee, mínimo, distancia y tiempo de ruta.
- Crear templates y occurrences de slots para pickup y delivery.
- Implementar capacity points, holds con expiración y confirmación transaccional.
- Validar lead time, same-day, rush y producto/ubicación/modo compatibles.
- Resolver o bloquear mixed carts con grupos de fulfillment explícitos.
- Cotizar pickup y local delivery desde checkout sin cobrar todavía.
- Crear herramientas administrativas para zonas, tarifas, calendarios y capacity.

### Decisiones requeridas del propietario

- Polígonos y prioridad de zonas por tienda.
- Tarifas base, mínimos, distancia/tiempo máximo y política de propinas.
- Horarios, feriados, lead times, cutoffs y capacidad por slot.
- Reglas para same-day, rush, balloons y pedidos grandes.
- Política de mixed carts y fallback cuando una tienda no tiene inventario.

### Criterio de cierre

Para ambas tiendas, una dirección válida recibe una cotización reproducible y
una inválida se rechaza con motivo claro; slots y capacity resisten concurrencia;
pickup y delivery pasan unit, integration y E2E en desktop/mobile; no existe
pago ni orden real.

## Fase 3 — Automatización, webhooks y reconciliación

Estado: `EN CURSO`; código durable disponible, operación de plataforma pendiente.

### Entregables

- Configurar `WEBHOOK_WORKER_SECRET` en la plataforma, nunca en Git.
- Programar `/api/internal/square/catalog-sync` y
  `/api/internal/webhooks/process` con autenticación y exclusión mutua.
- Verificar firma Square, deduplicación, retries acotados, processing leases y
  dead-letter handling.
- Añadir métricas de frescura, duración, páginas, filas, errores y backlog.
- Alertar inventario stale, lease abandonado, webhook muerto y drift de catálogo.
- Añadir reconciliación periódica contra Square y procedimiento de replay seguro.
- Reemplazar rate limiting en memoria por un store compartido antes de escalar.
- Documentar rotación de secretos y respuesta a incidentes.

### Criterio de cierre

Una ventana operativa acordada completa múltiples syncs incrementales y procesa
eventos duplicados/fallidos sin pérdida; leases se liberan; alertas y replay se
prueban; ninguna ruta interna acepta llamadas sin el secreto correcto.

## Fase 4 — Balloon Order

Estado: `PENDIENTE`; solo existen modelo, drafts y fundamentos de capacidad.

### Entregables

- Flujo guiado por ocasión, tipo, color, addons, mensaje y presentación.
- Resolver componentes inventariables como variaciones Square y personalización
  no inventariable como modifiers/configuración validada.
- Draft durable, quote server-side y expiración explícita.
- Compatibilidad limitada a pickup/local delivery salvo producto marcado como
  shippable.
- Capacity points por complejidad y validación de slot en checkout.
- Admin para configuración, precios comerciales provenientes de Square y cola de
  preparación para staff.
- E2E de combinaciones válidas, agotadas, incompatibles y concurrentes.

### Criterio de cierre

Un balloon order reproducible conserva el draft, recalcula quote e inventario,
reserva capacity sin sobreventa y genera un payload listo para la Fase 6 sin
crear todavía una orden Production.

## Fase 5 — Admin, CMS e identidad

Estado: `EN CURSO`.

### Ya disponible

- Homepage Studio compatible y builder genérico por scope.
- CMS versionado con DRAFT/PREVIEW/PUBLISHED.
- Merchandising, categorías web, holidays, marcas, GTIN y media.
- Contención fail-closed, capacidades, auditoría y rollback de publicación.

### Entregables pendientes

- Seleccionar proveedor de identidad, exigir MFA y emitir sesiones seguras.
- Mapear roles a capacidades, revocar sesiones y auditar acciones sensibles.
- Completar UX del builder: inline editing, undo/redo, keyboard shortcuts y drag
  reorder; corresponde a las fases 8-9 del roadmap histórico de Admin Builder.
- Hacer operables departments, holidays, products, locations, policies,
  placements, media, delivery, slots y settings.
- Reemplazar renderers de compatibilidad por componentes registrados con paridad.
- Cubrir concurrencia, preview, publish, rollback y permisos con E2E.

### Criterio de cierre

Un usuario sin sesión no puede descubrir ni mutar Admin; cada rol solo ejecuta
sus capacidades; todas las mutaciones dejan audit log; el editor puede crear,
previsualizar, publicar y revertir contenido sin afectar Square.

## Fase 6 — Checkout transaccional en Square Sandbox

Estado: `PENDIENTE`.

### Barrera de entrada

Fases 2 y 3 cerradas, identidad administrativa suficiente para operar pedidos y
aprobación explícita para implementar Square Orders/Payments. Todo el desarrollo
y las pruebas de pago se realizan en Square Sandbox.

### Entregables

- Web Payments SDK con tokenización; nunca almacenar datos de tarjeta.
- Order idempotente con location, line items, modifiers, taxes y fulfillment.
- Revalidación final de precio, inventario, address/rate y slot/capacity.
- Flujo authorize/capture acordado y estados internos reconciliables.
- Confirmar/release holds de capacity según éxito o fallo.
- Webhooks de order/payment como verdad de estado, con retries y replay.
- Cancelación, refund, timeout, doble click, duplicate webhook y caída parcial.
- Recibos y notificaciones sin datos sensibles.

### Criterio de cierre

Sandbox cubre happy path y fallos para pickup y delivery; reintentos no duplican
order ni payment; webhooks reconcilian el estado; ningún test usa credenciales o
tarjetas Production. Habilitar Production requiere una aprobación nueva.

## Fase 7 — Warehouse y shipping

Estado: `BLOQUEADA` hasta decisión del propietario.

### Entregables

- Aprobar y mapear `Warehouse` a la ubicación Square correcta.
- Definir qué productos y variaciones son shippable.
- Validar inventario de warehouse separado del inventario de tiendas.
- Validar dirección y obtener rates server-side mediante Shippo.
- Persistir quote con expiración; nunca confiar en el rate del navegador.
- Crear fulfillment de shipment, task de pick/pack, label y tracking.
- Manejar cancelación, label void, partial shipment, backorder y devolución.
- Dashboard de warehouse y mínimo acceso a datos personales.

### Criterio de cierre

Sandbox de extremo a extremo obtiene rate, crea shipment, imprime/consulta label
y reconcilia tracking; inventario y fulfillment apuntan al warehouse correcto;
rollback puede desactivar shipping sin afectar pickup/delivery.

## Fase 8 — Hardening y release candidate

Estado: `PENDIENTE`.

### Entregables

- CI requerido: lint, typecheck, unit, integration, Prisma, build y Playwright.
- Reducir ESLint a cero advertencias para el launch gate.
- Pruebas de integración contra PostgreSQL desechable y migración desde cero.
- E2E desktop/mobile para catálogo, búsqueda, cart, cada fulfillment y checkout.
- Accesibilidad WCAG, navegación por teclado y reduced motion.
- CSP, CSRF, rate limits públicos, secret scanning y dependency scanning.
- Sentry con redacción, métricas, alertas y correlation IDs.
- Rendimiento, caching, límites de payload, catálogo grande y pruebas de carga.
- SEO: canonical, sitemap, robots, breadcrumbs, Product/LocalBusiness schema y OG.
- Backup/restore de Supabase y procedimientos de rollback ensayados.
- Revisión legal/operativa: privacidad, términos, refunds, delivery y contacto.

### Criterio de cierre

Existe un release candidate inmutable que pasa todos los gates, no contiene
secretos, tiene rollback demostrado y recibe sign-off técnico, operativo y del
propietario. El gate debe indicar si el alcance incluye shipping o lo difiere.

## Fase 9 — Deployment y lanzamiento controlado

Estado: `PENDIENTE`.

### Secuencia

1. Aprobar plataforma, dominios, entornos, secretos y responsables.
2. Desplegar preview aislado con Square Sandbox y acceso restringido.
3. Validar migraciones, constraints, workers, webhooks, observabilidad y rollback.
4. Revisar y publicar explícitamente la versión de merchandising aprobada.
5. Desplegar Production inicialmente con checkout pausado o allowlist.
6. Ejecutar smoke tests read-only y una transacción Production controlada solo
   después de autorización específica.
7. Abrir tráfico gradualmente y monitorear errores, sync, inventory y fulfillment.
8. Mantener rollback de aplicación, contenido y checkout durante toda la ventana.

### Criterio de cierre

Tráfico real estable durante la ventana acordada, órdenes reconciliadas, equipos
operativos capaces de cumplir pedidos, alertas activas y ninguna regresión P0/P1.

## Fase 10 — Operación y optimización

Estado: `PENDIENTE`.

### Entregables continuos

- Runbook diario de sync, webhook backlog, fulfillment y auditoría.
- SLOs de checkout, catálogo, inventario y workers.
- Métricas de conversión, abandono, búsquedas sin resultado y disponibilidad.
- Mejoras de merchandising y SEO mediante experimentos reversibles.
- Reconciliación financiera y de órdenes con Square.
- Rotación de secretos, dependencias, backups y simulacros de incidente.
- Priorización de shipping, loyalty, gift cards u otras expansiones posteriores.

## Alcance del primer lanzamiento

La ruta recomendada es un soft launch con:

- catálogo público aprobado;
- pickup en 3rd Avenue y 86th Street;
- local delivery solo dentro de zonas verificadas;
- inventario y precio validados por ubicación;
- Square Orders/Payments habilitados después de Sandbox y aprobación;
- Admin protegido por identidad y MFA;
- shipping desactivado si el warehouse todavía no está aprobado.

Shipping puede agregarse en una segunda ola sin bloquear este soft launch,
siempre que la UI no lo prometa y el backend lo rechace de forma explícita.

## Gates que requieren autorización del propietario

- Aplicar nuevas migraciones a una base compartida.
- Publicar o revertir contenido del storefront.
- Mapear el warehouse y habilitar shipping.
- Elegir identidad, MFA, roles y acceso de administradores.
- Configurar secretos y schedulers en la plataforma de deployment.
- Implementar o habilitar Square Orders/Payments.
- Ejecutar una transacción Square Production.
- Desplegar públicamente, abrir tráfico o cambiar DNS.

## Trabajo seguro para colaboradores desde el estado actual

Puede desarrollarse en ramas separadas, sin tocar Production:

- UI y servicios de delivery zones con fixtures.
- Slots, capacity y cutoffs con PostgreSQL desechable.
- Admin identity adapter usando mocks y contratos.
- Métricas/alertas y tests de workers.
- Balloon builder sobre drafts/quotes sin pago.
- Accesibilidad, SEO, lint y cobertura automatizada.
- Square Orders/Payments únicamente después de aprobación y solo en Sandbox.

Cada colaborador debe empezar por `phase-1-handoff.md`, mantener los límites de
este documento y abrir cambios pequeños con pruebas y rollback proporcional al
riesgo.

## Documentos de soporte

- Estado técnico: `docs/phase-1-handoff.md`
- Square y publicación: `docs/square-integration.md`
- Fulfillment: `docs/fulfillment.md`
- Delivery: `docs/delivery-zones.md`
- Slots/capacity: `docs/slot-capacity.md`
- Shipping: `docs/shipping.md`
- Admin builder: `docs/ADMIN_BUILDER_ROADMAP.md`
- Seguridad: `docs/security.md`
- Deployment: `docs/deployment.md`
- Operación: `docs/maintenance-runbook.md`
- Ingeniería y Git: `docs/engineering-workflow.md`
