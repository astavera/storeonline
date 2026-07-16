# Phase 2 Implementation Plan

Estado de referencia: 16 de julio de 2026 (America/New_York).

## Objetivo

Entregar pickup y local delivery cotizables para las tiendas de 3rd Avenue y
86th Street. El backend debe decidir elegibilidad, tarifa, horario y capacidad
con datos versionados. Esta fase no crea órdenes ni pagos en Square.

## Baseline verificado

- Fase 1 está cerrada y su CI remoto está verde.
- Las dos tiendas operativas están creadas y mapeadas a Square Production.
- Square permanece estrictamente read-only.
- PostgreSQL contiene las tablas para zonas versionadas, reglas de tarifa,
  evaluaciones de dirección, templates y occurrences de slots, y capacity holds.
- Estado compartido al inicio: 0 zonas, 0 versiones, 0 reglas de tarifa,
  0 evaluaciones de dirección, 0 slot templates, 0 occurrences y 0 holds.
- Solo existen helpers puros básicos para point-in-polygon y capacity points.
- Shipping continúa desactivado y el warehouse no forma parte de esta fase.

## Reglas de seguridad

1. Sin una zona versionada y activa, local delivery se rechaza.
2. Sin un slot válido y capacidad disponible, pickup/delivery se rechaza.
3. El navegador nunca calcula ni decide tarifas, elegibilidad o capacidad.
4. Los resultados de Mapbox son insumos; el backend aplica todas las reglas.
5. Ningún fixture de desarrollo se aplica automáticamente a Supabase compartido.
6. No se publican cambios de storefront ni se habilitan Orders/Payments.
7. Toda configuración compartida requiere auditoría previa, confirmación exacta y
   una operación de apply separada.

## Estado de paquetes

| Paquete | Estado | Evidencia |
| --- | --- | --- |
| 2A — Contratos y evaluadores puros | `COMPLETO` | 17 pruebas focalizadas, 148/148 suite completa, lint/typecheck y build aprobados el 2026-07-16 |
| 2B — Persistencia y versionado | `EN CURSO` | Ciclo de capacity holds validado con 11 unit tests y concurrencia real en PostgreSQL 17 efímero; faltan zonas, AddressEvaluation y occurrences |
| 2C — Adaptadores externos | `PENDIENTE` | Mapbox no está conectado al flujo |
| 2D — API y checkout | `PENDIENTE` | El API actual no cotiza fulfillment |
| 2E — Admin | `PENDIENTE` | Las rutas son shells informativos |
| 2F — Integración y cierre | `PENDIENTE` | Depende de 2B–2E y decisiones del propietario |

## Orden de implementación

### 2A — Contratos y evaluadores puros

- Validar coordenadas y geometría GeoJSON Polygon/MultiPolygon.
- Definir comportamiento determinista para borde, huecos y zonas solapadas.
- Evaluar tienda, día activo, subtotal mínimo, distancia y minutos de ruta.
- Resolver tarifa por prioridad sin confiar en valores del cliente.
- Emitir reason codes estables para UI, logs y pruebas.
- Fortalecer capacity points y disponibilidad de slots con entradas inválidas.

Gate: unit tests cubren geometría, prioridades, mínimos, límites, cutoffs,
lead-time y capacidad; no existe acceso a red o base de datos.

### 2B — Persistencia y versionado

- Repositorios PostgreSQL para zonas, versiones y reglas activas.
- AddressEvaluation con hash, expiración y redacción de PII.
- Generación idempotente de SlotOccurrence desde SlotTemplate.
- Holds transaccionales con expiración, confirmación y liberación.
- Pruebas de concurrencia contra PostgreSQL desechable.

Avance actual: el ciclo reserve/confirm/release usa aislamiento serializable,
expira holds vencidos antes de sumar capacidad, hace replay por owner, rechaza
cambios de capacity points y reintenta conflictos `P2034`. Sus 11 pruebas
unitarias pasan. CI #7 aplicó las seis migraciones desde cero a PostgreSQL 17
efímero y demostró que dos reservas concurrentes de 3 puntos sobre un slot de 5
producen exactamente un ganador; confirmación y liberación idempotentes también
pasaron contra las constraints reales. El contenedor fue destruido al terminar.

2B todavía no se considera completo: faltan repositorios de zonas/versiones,
AddressEvaluation, generación idempotente de occurrences y sus pruebas.

Gate: dos intentos concurrentes nunca superan capacity y una versión histórica
no cambia después de ser utilizada.

### 2C — Adaptadores externos

- Adaptador Mapbox para geocoding, normalización y route metrics.
- Timeouts, errores acotados, cache y reason codes fail-closed.
- Fixtures deterministas para CI; ninguna prueba CI depende de Mapbox real.

Gate: respuestas incompletas, ambiguas o stale se rechazan sin crear una
cotización aparentemente válida.

### 2D — API de cotización y checkout

- Endpoint server-side para pickup y local delivery.
- Revalidación de tienda, catálogo, inventario, dirección, slot y capacity.
- Idempotencia y hash de request ligados a CheckoutAttempt.
- Mixed carts bloqueados o agrupados de forma explícita.

Gate: la misma entrada produce la misma cotización dentro de su ventana y nunca
crea una orden o un pago.

### 2E — Herramientas administrativas

- Editor auditable de zonas y tarifas.
- Calendario de templates, occurrences, cierres y capacidad.
- Preview de cambios sin aplicar y confirmación ligada a digest.
- RBAC y audit log en cada mutación.

Gate: configuración inválida no puede activarse y un usuario sin capacidad no
puede descubrir ni ejecutar mutaciones.

### 2F — Integración y cierre

- E2E desktop/mobile para pickup, delivery elegible/no elegible y capacidad.
- Observabilidad de reason codes, latencia, stale data y holds expirados.
- Runbook operativo y rollback probado.

Gate: se cumple el criterio de cierre de Fase 2 del roadmap maestro.

## Decisiones requeridas del propietario

Estas decisiones no se sustituyen con valores inventados:

| Área | Decisión necesaria |
| --- | --- |
| Zonas | Polígonos, nombres, prioridad y tienda responsable |
| Servicio | Walking, courier o vehicle por zona |
| Tarifas | Fee base, escalas, subtotal mínimo y política de propina |
| Límites | Distancia máxima y minutos máximos de ruta |
| Horarios | Días, feriados, aperturas, cierres y cutoffs por tienda |
| Preparación | Lead time normal, same-day, rush y pedidos grandes |
| Capacidad | Puntos por slot y pesos por tipo de producto/pedido |
| Mixed carts | Bloquear, dividir o seleccionar una tienda alternativa |
| Excepciones | Balloon orders, cierres de emergencia y overrides auditados |

Hasta recibir estas decisiones, los tests usarán fixtures claramente marcados y
el entorno compartido seguirá con cero configuración activa de Fase 2.

## Primer bloque autorizado

El primer bloque implementó 2A únicamente: contratos puros, reason codes y
pruebas deterministas. No escribió en Supabase, Square, Mapbox ni el CMS.

El siguiente paso de 2B es persistir zonas/versiones y generar occurrences en
PostgreSQL efímero. Cualquier configuración compartida seguirá bloqueada hasta
contar con valores operativos aprobados.
