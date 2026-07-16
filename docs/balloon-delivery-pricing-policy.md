# Balloon Delivery Pricing Policy

Estado: `DRAFT_DISTANCE_CALIBRATION_V2_ORDERPRO_STAGING`.

Fuente comercial recibida del propietario el 16 de julio de 2026: fotografía
`IMG_4770 (1).jpg` de la lista interna de precios para balloon delivery en la
ubicación de Third Avenue. La fotografía se conserva fuera del repositorio y
ninguna regla de este documento está activa en Supabase o en el storefront.

## Alcance confirmado por la fuente

- La tabla se titula `Balloon Delivery Price List`; no se asume que aplique a
  pedidos locales que no contengan balloons.
- El punto de referencia de Third Avenue es 72nd Street y 3rd Avenue.
- En 3rd Avenue, el precio longitudinal se construye desde una tarifa base por
  rango de calles.
- Alejarse lateralmente de 3rd Avenue añade un cargo a la tarifa base.
- En 72nd Street, entre Lexington Avenue y 2nd Avenue, la entrega es gratuita.
- Cualquier entrega más allá de la distancia publicada requiere intervención
  del manager.
- El propietario indicó que la ubicación de 86th Street usa una lógica similar
  y que hacia el norte llega hasta 96th Street.

## Enrutamiento walking confirmado

El propietario definió el siguiente comportamiento para el área naranja de
walking delivery:

1. La dirección se normaliza y geocodifica en el backend.
2. Si el punto no pertenece a ningún polígono walking activo, no se ofrece local
   delivery.
3. El ZIP `10028` pertenece exclusivamente a la ubicación de 86th Street; el
   polígono activo de Third Avenue debe excluirlo.
4. El ZIP `10075` pertenece a ambas tiendas. La ubicación con la ruta walking
   más corta desde la dirección toma la orden; la distancia no proviene del
   navegador.
5. Si pertenece a cualquier otra superposición aprobada, se aplica la misma
   regla de la ruta walking más corta.
6. El precio se calcula usando la versión de tarifa de la tienda elegida.
7. Solo se muestran slots disponibles de esa tienda, después de validar lead
   time, cutoff y capacity points.
8. Si la tienda más cercana no tiene slots, no se cambia silenciosamente a la
   otra tienda. La UI debe informar que no hay disponibilidad y permitir una
   decisión explícita posterior.

El prototipo puro de este flujo está en
`src/features/fulfillment/services/local-delivery-routing-service.ts`. Se validó
con 6 pruebas focalizadas y con la suite completa de 165 pruebas. No crea orders,
payments ni capacity holds.

## Transcripción de Third Avenue

| Texto de la fuente | Valor |
| --- | ---: |
| On 3rd Ave between 72nd and 75th | Gratis |
| On 3rd Ave between 72nd and 68th | Gratis |
| On 3rd Ave between 72nd and 79th | $10.00 |
| On 3rd Ave between 72nd and 64th | $10.00 |
| On 3rd Ave between 72nd and 60th | $15.00 |
| 2nd Avenue o Lexington Avenue | $10.00 más la tarifa base |
| 1st Avenue o Park Avenue | $15.00 más la tarifa base |
| 72nd Street entre 2nd Avenue y Lexington Avenue | Gratis |

La fuente también enumera las avenidas en este orden oeste-este:

`5th, Madison, Park, Lexington, 3rd, 2nd, 1st, York, East End`.

## Normalización propuesta para Third Avenue

La señal expresa rangos acumulados y superpuestos. Para que el backend no cobre
dos tarifas posibles a la misma dirección, se propone convertirlos en bandas
no superpuestas:

| Banda sobre 3rd Avenue | Tarifa base propuesta |
| --- | ---: |
| 68th–75th | $0.00 |
| 76th–79th | $10.00 |
| 64th–67th | $10.00 |
| 60th–63rd | $15.00 |
| Fuera de 60th–79th | Revisión del manager; sin cotización automática |

Interpretación lateral propuesta, todavía pendiente de confirmación:

| Destino | Modificador propuesto |
| --- | ---: |
| 3rd Avenue | $0.00 |
| 2nd Avenue o Lexington Avenue | +$10.00 |
| 1st Avenue o Park Avenue | +$15.00 |
| Más allá de 1st Avenue o Park Avenue | Revisión del manager |

La excepción de 72nd Street entre Lexington Avenue y 2nd Avenue tiene prioridad
sobre la tarifa base y cualquier modificador: el total sería $0.00.

Ejemplos de la normalización propuesta, no precios activos:

| Dirección normalizada | Cálculo | Total |
| --- | --- | ---: |
| 72nd y 3rd | Excepción gratis | $0.00 |
| 70th y 3rd | Base gratis | $0.00 |
| 77th y 3rd | Base $10 | $10.00 |
| 65th y Lexington | Base $10 + lateral $10 | $20.00 |
| 61st y Park | Base $15 + lateral $15 | $30.00 |

## Auditoría de distancia walking

El 16 de julio de 2026 se midieron rutas walking desde `1243 3rd Ave` para
comprobar si la fotografía puede transformarse en una sola tabla de distancia.
Los puntos de intersección provienen del NYC Street Centerline oficial. Las
rutas se calcularon con el perfil foot del servidor público de routing de
OpenStreetMap/FOSSGIS. Las distancias se redondearon al pie más cercano y son
una fotografía de calibración, no llamadas de red ejecutadas por los tests.

La parte longitudinal sobre 3rd Avenue sí forma bandas de distancia
consistentes:

| Punto medido | Tarifa del letrero | Ruta walking |
| --- | ---: | ---: |
| E 72nd St y 3rd Ave | $0 | 152 ft |
| E 75th St y 3rd Ave | $0 | 963 ft |
| E 68th St y 3rd Ave | $0 | 1,141 ft |
| E 76th St y 3rd Ave | $10 | 1,230 ft |
| E 67th St y 3rd Ave | $10 | 1,399 ft |
| E 79th St y 3rd Ave | $10 | 2,042 ft |
| E 64th St y 3rd Ave | $10 | 2,179 ft |
| E 63rd St y 3rd Ave | $15 | 2,446 ft |
| E 60th St y 3rd Ave | $15 | 3,227 ft |

La hoja completa no es una función de distancia. Los recargos por avenida
producen precios distintos para rutas prácticamente iguales:

| Comparación | Ruta walking | Precio histórico interpretado |
| --- | ---: | ---: |
| E 68th St y 3rd Ave | 1,141 ft | $0 |
| E 70th St y Lexington Ave | 1,122 ft | $10 |
| E 76th St y 3rd Ave | 1,230 ft | $10 |
| E 72nd St y Park Ave | 1,205 ft | $15 |
| E 70th St y 1st Ave | 1,853 ft | $15 |

Por tanto, la fotografía es coherente como una matriz histórica de
`banda de calle + recargo de avenida + excepción`, pero no puede conservarse
exactamente y al mismo tiempo convertirse en una tarifa única basada solo en
feet.

## Tabla estandarizada propuesta por distancia

Si el objetivo es que dos rutas de igual distancia siempre cuesten lo mismo,
la propuesta es reemplazar los recargos laterales por esta política única:

| Distancia walking exacta desde la tienda seleccionada | Fee propuesto |
| --- | ---: |
| 0–1,200 ft | $0.00 |
| Más de 1,200–2,300 ft | $10.00 |
| Más de 2,300–3,250 ft | $15.00 |
| Más de 3,250 ft, todavía dentro del ZIP/polígono elegible | $25.00 |

Los cortes de 1,200 y 2,300 ft son redondeos operativos de los espacios entre
las muestras longitudinales: 1,141/1,230 ft y 2,179/2,446 ft. El límite de
3,250 ft redondea la muestra publicada de E 60th St a 3,227 ft. Los tests
deterministas conservan estas muestras y demuestran tanto la coincidencia de
las nueve muestras longitudinales como las tres contradicciones laterales.

El propietario confirmó que los deliveries cubren todo el ZIP/polígono activo.
Por tanto, `DRAFT_CALIBRATION_V2` añade un último tier abierto de $25: una
distancia grande no causa `MANAGER_REVIEW` mientras la dirección continúe dentro
de una zona elegible. No se debe sumar un cargo de avenida encima de esta tabla.

## Ubicación de 86th Street

La misma tabla de feet puede reutilizarse desde `112 E 86th St` sin trasladar
nombres de calles. La distancia siempre se calcula desde la tienda que tomó la
orden hasta la dirección exacta del cliente. `10028` y `10128` permanecen
asignados a 86th Street; en `10075` primero gana la tienda con la ruta walking
más corta y luego se calcula su fee.

El límite norte en 96th Street es una regla de elegibilidad separada de la
tarifa. Las muestras en 96th muestran por qué no se debe asumir que toda la
calle tiene la misma distancia:

| Punto desde 112 E 86th St | Ruta walking | Resultado con el draft |
| --- | ---: | --- |
| E 96th St y Park Ave | 2,929 ft | $15 |
| E 96th St y Lexington Ave | 2,951 ft | $15 |
| E 96th St y 3rd Ave | 3,447 ft | $25 |
| E 96th St y 2nd Ave | 4,110 ft | $25 |

Para `316 E 82nd St`, la muestra desde 86th Street fue 2,816 ft; por esta tabla
sería $15. La asignación a 86th ocurre antes del fee porque la dirección está en
`10028`.

Las dos pruebas de rutas largas quedan cotizadas automáticamente:

| Dirección | ZIP | Tienda según routing vigente | Ruta | Fee V2 |
| --- | --- | --- | ---: | ---: |
| 599 E 85th St | 10028 | 86th Street | 3,924 ft | $25 |
| 500 E 80th St | 10075 | 3rd Avenue, por ruta 229 ft más corta | 4,261 ft | $25 |

`500 E 80th St` no se asigna a 86th Street bajo la regla vigente de `10075`; un
cambio de esa tienda sería una decisión de routing separada del fee.

## Traducción técnica

Después de la confirmación comercial, OrderPro publicará por versión los
polígonos de elegibilidad y una `FeePolicy` con estrategia
`WALKING_ROUTE_DISTANCE`. El checkout mantendrá un snapshot publicado para
evaluación rápida, pero la distancia, el fee final, los slots y el hold se
validarán server-side. La cotización guardará `zoneVersionId`,
`feePolicyVersionId`, proveedor/perfil de ruta, distancia en feet y tienda
seleccionada.

No se creará un parser de precios basado solamente en nombres de calles. La
dirección se normaliza, se verifica con point-in-polygon, se selecciona la
tienda y después se calcula la ruta walking exacta. Las direcciones fuera de la
zona fallan cerradas; dentro de la zona, el tier final abierto garantiza una
cotización por distancia. Cambiar de proveedor de rutas requiere recalibrar y
publicar una nueva versión porque diferentes motores pueden devolver distancias
distintas.

La imagen coloreada del Upper East Side no se usa como geometría productiva: su
resolución y proyección no permiten extraer límites auditables. Para activación
se necesita dibujar o importar el polígono GeoJSON exacto y aprobar su preview.

## Confirmaciones pendientes

1. Confirmar si la tabla aplica solo a balloon delivery o a todo local delivery.
2. Elegir el proveedor/perfil walking productivo y repetir la calibración antes
   de publicar `FeePolicyVersion` en OrderPro.
3. Confirmar si `10075` conserva siempre la tienda con ruta más corta o si debe
   tener una división fija por tienda.
