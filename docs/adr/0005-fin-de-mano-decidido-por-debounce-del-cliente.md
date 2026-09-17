---
status: supersedes ADR-0003
---

# Fin de Mano decidido por un debounce del cliente, no por una ventana retroactiva del servidor

Para la modalidad Pica-pica (ver `CONTEXT.md`: Mano, Bloque) la app necesita
saber cuándo termina cada Mano. ADR 0003 eligió detectarlo
**retroactivamente en el servidor**: cada punto nuevo comparaba su
timestamp contra el último punto guardado, y si había pasado la ventana de
inactividad del Grupo, recién ahí se consideraba que había arrancado una
Mano nueva.

En uso real esto mostró un problema: mientras el Anotador sigue cargando
los puntos de una Mano que ya se jugó con las cartas (por ejemplo, tocando
"+1" varias veces seguidas para Envido y para Truco), el Bloque mostrado en
pantalla queda atrasado — no refleja el cruce de un umbral hasta que llega
el primer punto de la Mano *siguiente*, lo cual puede tardar minutos reales
de juego. La detección retroactiva necesita dos puntos para "cerrar" una
Mano (el que la empieza y el primero de la que sigue); hasta que llega ese
segundo punto, la Mano anterior queda indefinidamente abierta.

Se evaluó bloquear la recarga de página (`beforeunload`) para poder confiar
en una ventana server-side más larga sin riesgo de perder datos, pero se
descartó: no es confiable en navegadores mobile, especialmente iOS Safari,
que puede ignorar el evento o no bloquear la navegación aunque lo dispare
(la app es mobile-first).

Se eligió en cambio mover la decisión de "cuándo termina la Mano" al
cliente: un debounce compartido por Partida — no por Equipo, porque una
Mano real puede repartir puntos entre los dos Equipos (Envido a uno, Truco
al otro) — que se reinicia con cada toque de "+". Recién cuando el Anotador
deja de tocar por esa ventana, el cliente manda al servidor el resultado
neto de la Mano completa, y el servidor **siempre** recalcula el Bloque en
ese momento — ya no compara timestamps, confía en que cada envío que recibe
ya es una Mano cerrada. Como el estado del debounce vive solo en el
cliente, cada toque se guarda de inmediato en el dispositivo del Anotador
para poder recuperarlo si la página se recarga a mitad de camino: dado que
no se puede evitar la recarga, se opta por mitigar la pérdida de datos en
vez de intentar prevenirla.

## Consecuencias

- "Cargar el resultado de una Mano nueva" y "corregir un punto de una Mano
  ya confirmada" pasan a ser dos operaciones de dominio distintas. La
  primera siempre dispara el recálculo del Bloque; la segunda (el "-" de
  siempre) sigue sin tener ningún efecto sobre el Bloque, tal como decidió
  ADR 0003 originalmente para las correcciones.
- Cancelar un toque de "+" que todavía no se confirmó (el Anotador se
  equivocó de Equipo y corrige antes de que pase la ventana) nunca llega a
  ser un punto cargado — no hay nada que corregir después, es distinto de
  corregir un punto ya confirmado.
- El campo que persiste el último punto anotado por Partida deja de
  decidir nada — queda como dato informativo, sin la columna eliminada.
- La ventana de inactividad del Grupo (ver `CONTEXT.md`: Grupo) sigue
  siendo la misma configuración de siempre, editable por el admin en
  cualquier momento — pero **dónde** se aplica cambió, y eso le pone un
  límite nuevo a "en cualquier momento" que la historia de usuario 14 del
  ticket #19 no contemplaba: `page.tsx` le pasa el valor a
  `MarcadorEnVivo` como prop, leído fresco de la base en cada carga de
  esa pantalla (ver ticket #23) — así que una Partida `en_curso` nunca
  queda con un valor viejo *congelado en la base*. Pero el debounce corre
  enteramente en el cliente con el valor que le llegó al montar: una
  pestaña que ya tenía el tanteador abierto no se entera sola de un
  cambio del admin hasta que se recarga, porque esta app evita a
  propósito cualquier polling/timer en el cliente para este tipo de
  actualización (mismo principio que el badge de Bloque, que tampoco se
  actualiza solo — ver ticket #20). Riesgo aceptado explícitamente al
  implementar el ticket #23, documentado ahí en vez de agregar un
  mecanismo de push.
- La recuperación por dispositivo es *al menos una vez*, no exactamente
  una: si el servidor ya confirmó un envío pero la respuesta se pierde
  (la pestaña se cierra justo después, antes de que llegue), una recarga
  puede reenviar y contar esa Mano dos veces. Riesgo aceptado, del mismo
  tipo que el que ya documentaba ADR 0003 para Manos mal contadas —
  recuperable a mano con "-".
- La corrección manual del Bloque (ticket #21) tiene que forzar el flush
  de cualquier toque todavía pendiente *antes* de aplicarse — si no, esa
  Mano en curso se terminaría cargando contra el Bloque ya corregido en
  vez del que tenía cuando el Anotador la empezó a anotar. Por esto
  `CorregirBloque` no sigue el patrón `<form>` + `useActionState` que usa
  el resto de las correcciones admin de la app (ver `EditarEstadisticas`):
  necesita coordinarse explícitamente con la misma `flush` que usa el
  debounce, algo que un `<form>` declarativo no puede expresar.
- No alcanza con flushear lo que ya estaba pendiente al pedir la
  corrección: mientras la corrección en sí todavía está en vuelo (esperando
  la respuesta del servidor), un toque de "+"/"-" nuevo arrancaría otra
  Mano que la corrección no está esperando, y esa Mano terminaría
  flusheando contra el Bloque ya corregido. Por esto los botones de
  puntaje de los dos Equipos (no solo los de `CorregirBloque`) se
  deshabilitan por toda la duración de la operación — desde que se pide
  la corrección hasta que el servidor responde, no solo mientras se
  resuelve el flush previo (ver `corrigiendoBloque` en `MarcadorEnVivo`).
