# Bocetos de las pantallas

Bocetos en tamaño de teléfono de las tres pantallas del MVP (#18). Sirven para que el equipo acuerde
cómo se ven antes de programarlas: la pantalla de estado (#7) y el formulario (#16) en el Corte 1, y
el detalle por banco (#25) en el Corte 2.

Los bancos, los tipos de falla y los textos salen de [`docs/api.md`](../api.md). Las decisiones de
abajo se acordaron en la revisión del PR #95.

## Pantalla de estado (R1, R4, R7)

![Pantalla de estado](estado.png)

- Cada par con reportes va en su propia tarjeta con su nivel: rojo para muchos reportes y amarillo
  para posibles problemas.
- Los pares sin reportes se resumen en una sola tarjeta verde. Son la mayoría de los 100 pares, y
  una tarjeta por cada uno haría la pantalla demasiado larga para leerla en 5 segundos (R7).
- Un enlace "Ver todos los pares" muestra la lista completa para quien busca un par en particular.
- Cada tarjeta muestra el `message` de la API tal cual: "N personas reportan problemas con…". Nunca
  dice que un banco está caído (R4).
- Abajo, la hora de la última actualización.

## Formulario de reporte (R2, R7)

![Formulario de reporte](reporte.png)

- Todo en una sola pantalla, sin indicador de pasos: con mala señal, cada pantalla extra es una
  espera más.
- Las preguntas son neutrales ("¿De qué banco sale el pago?" y "¿A qué banco llega el pago?"), para
  que sirvan a quien paga y también al comercio que recibe el pago.
- Qué pasó se elige entre cuatro botones, uno por tipo de falla: el pago no sale, sale pero no
  llega, la app da error y el punto de venta falla.
- Un botón grande "Enviar reporte". No hay que escribir nada: se completa con una mano.
- Al enviar se muestra "Gracias, recibimos tu reporte".

## Detalle por banco (R3, Corte 2)

![Detalle por banco](detalle.png)

- Se abre al tocar un banco y muestra las últimas 24 horas (R3).
- Dos secciones: los pagos que salen de ese banco y los que llegan a él.
- Debajo, cuántos reportes hay de cada tipo de falla.

## En todas las pantallas

- El botón "Reportar un problema" queda fijo abajo, donde llega el pulgar.

## Pregunta abierta para #25

Los colores de nivel salen del cálculo de los últimos 15 minutos. Como el detalle muestra 24 horas,
falta decidir si esa pantalla muestra colores o solo conteos. Se decide al programarla en el
Corte 2.
