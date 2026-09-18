# Reclamo en vivo del Anotador, y marcador visible para todo el Grupo

Hasta el ticket #32, el Anotador de una Partida (ver `CONTEXT.md`:
Anotador) era siempre quien la crea — `crearPartida` lo exigía como dato
obligatorio, y quien arma los Equipos en el formulario de Nueva Partida no
necesariamente queda jugando en ninguno de los dos. Cuando eso pasaba, la
Partida no se podía ni crear: `crearPartida` rechazaba el pedido con "El
Anotador tiene que ser uno de los 6 Participantes de la Partida", así que
la persona ni siquiera lograba armar los Equipos.

## Alternativas evaluadas

**Elegir el Anotador al crear la Partida** (un `<select>` junto al armado
de Equipos), calcado del mecanismo que ya usa `crearSiguienteEquipo`
(`nuevoAnotadorParticipanteId`, ticket #13) para el caso análogo de "el
Anotador anterior no sigue jugando". Se descartó para el flujo principal:
obliga a decidir de antemano incluso en el caso normal (el creador sí
juega), y no resuelve el caso real que motivó esto — quien arma la Partida
puede simplemente no saber todavía quién de los otros 5 se va a hacer
cargo, o directamente cerrar la aplicación después de armarla.

**Abrir la carga de puntos a cualquiera de los 6**, sin un rol exclusivo.
Se descartó: el riesgo real no es una condición de carrera de base de
datos (ambas cargas son idempotentes en los hechos si describen la misma
Mano), sino que dos Participantes carguen **independientemente** el mismo
evento real de la mesa sin coordinarse, duplicando o contradiciendo el
punto. Mantener un único Anotador por Partida sigue siendo la forma más
simple de evitar eso (ver `CONTEXT.md`: Anotador, razón ya documentada
desde el ticket #1).

## Decisión

La Partida se crea igual aunque quien la arma no quede jugando — queda sin
Anotador asignado (`anotadorParticipanteId` nullable, ver ticket #32).
Cualquiera de los 6 Participantes que sí juegan puede reclamar el rol en
vivo, simplemente al abrir la Partida: si todavía no hay Anotador, la
pantalla le pregunta "¿Anotás vos? Sí/No". "Sí" reclama el rol con una
escritura condicionada a que siga sin asignar (`FOR UPDATE`, mismo
mecanismo que ya usa `anotarPunto` para serializar cargas simultáneas) —
gana quien lo hace primero; el que llega segundo no ve ningún error, cae
directo al marcador de solo lectura. No hay transferencia posterior: una
vez reclamado, el rol quedó fijo hasta que la Partida termine o se cancele
(igual que ya era antes de este ticket).

`crearSiguienteEquipo` (ticket #13) **no cambia** — sigue resolviendo el
Anotador con su propio `<select>` en el momento de crear la Partida nueva,
la excepción documentada en ADR previo (ver `CONTEXT.md`, issue #1).
Conviven a propósito dos mecanismos distintos para el mismo problema
general porque parten de contextos distintos: Siguiente equipo ya tiene al
Anotador anterior ahí mismo decidiendo con quién sigue, mientras que Nueva
Partida puede no tener a nadie presente después de armar los Equipos.

## Consecuencia: el marcador deja de ser exclusivo del Anotador

Separado de lo anterior pero resuelto en el mismo ticket (#33): cualquier
miembro del Grupo puede abrir una Partida en curso y ver su marcador,
tenga o no Anotador asignado todavía — antes la pantalla entera daba 404
a cualquiera que no fuera el Anotador. Solo cargar puntos, corregir el
Bloque y cancelar la Partida siguen siendo exclusivos suyos. Esto resuelve
además el motivo original que llevó a preguntarse por esto: no tener que
preguntarle al Anotador cuánto van, y que quien no juega esa Partida en
particular pueda seguir el resultado igual.

El marcador de solo lectura, en su primera versión (#33), muestra el
último estado que trajo el servidor al abrir la pantalla — se actualiza
recargando la página. Un sondeo periódico que lo actualice solo, sin
recargar, es una mejora separada (ticket #34): se descartó de plano
WebSockets/Server-Sent Events para esto, porque la app está pensada para
un despliegue sin procesos de larga duración (Neon serverless) y la
demora de unos segundos que da un sondeo simple es aceptable para este
caso de uso.
