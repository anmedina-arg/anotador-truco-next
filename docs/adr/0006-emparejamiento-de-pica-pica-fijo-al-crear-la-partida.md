# Emparejamiento de Pica-pica fijo al crear la Partida, sin repantallarlo durante la Partida

En un Bloque de Pica-pica (ver `CONTEXT.md`: Pica-pica) cada una de las 3
Manos es un duelo 1 contra 1 entre un Participante de Equipo 1 y uno de
Equipo 2. La app no tenía, hasta el ticket #25, ninguna noción de qué
Participante enfrenta a cuál — solo sabía que había 3 Manos de Pica-pica, a
nivel Equipo.

Se evaluó derivar el emparejamiento del orden en que se cargan los Equipos
(1er Participante de Equipo 1 contra 1er Participante de Equipo 2, y así),
pero se descartó: no hay ninguna garantía de que ese orden coincida con
cómo se sientan en la mesa real, y forzar esa coincidencia le agrega una
regla invisible al armado de Equipos que hoy no tiene ninguna.

Se eligió en cambio que el Anotador arme el emparejamiento a mano,
explícitamente, al crear la Partida — igual momento en que ya arma los
Equipos. Una vez creada la Partida, el emparejamiento **no cambia**, ni
siquiera si la Fase alternada (ver `CONTEXT.md`: Fase) vuelve a Pica-pica
más de una vez: la pareja en la posición N juega siempre la Mano N-ésima de
cualquier Bloque de Pica-pica de esa Partida. No hay pantalla para
editarlo después — el mismo criterio que ya usa ADR 0004 para los umbrales
de Pica-pica del Grupo: es una decisión que se toma una vez y no hace falta
revisar a mitad de partido.

Este emparejamiento fijo participa distinto según el flujo de creación:

- **Nueva Partida** (`crearPartida`): el Anotador arma las 3 parejas de
  cero, junto con los Equipos.
- **Revancha** (`crearRevancha`, ticket #12): los mismos 6 Participantes y
  los mismos Equipos de la Partida de referencia se repiten con un solo tap
  — el emparejamiento se copia automáticamente con ellos, sin pedirle nada
  nuevo al Anotador. Pedirle que lo rearme cada vez rompería el flujo de "un
  tap" que Revancha ya tenía, para un caso (los mismos 6 jugadores, otra
  vez) donde no hay ninguna razón real para que el emparejamiento cambie.
- **Siguiente equipo** (`crearSiguienteEquipo`, ticket #13): el Equipo
  desafiante es gente nueva — no hay nada que copiar, así que el Anotador
  arma el emparejamiento de cero, igual que en Nueva Partida.

Como consecuencia, `crearPartida` pasa a exigir las 3 parejas como parte de
su input (una asignación 1 a 1 completa entre los 3 Participantes de cada
Equipo) — es el único punto donde se valida y persiste, así que ni
`crearRevancha` ni `crearSiguienteEquipo` duplican esa regla.
