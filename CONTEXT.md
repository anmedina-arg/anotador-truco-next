# Anotador de Truco

Aplicación para registrar partidas de truco jugadas dentro de un grupo de
participantes: arma equipos ad-hoc, anota el puntaje en vivo mano a mano, y
persiste el historial de partidas y el ranking por jugador.

## Language

**Grupo**:
Conjunto de Participantes (más de 6, típicamente) sobre el que se juegan
Partidas y se calcula un Ranking. Un Participante puede pertenecer a varios
Grupos; el Ranking es independiente por Grupo. Un Grupo es abierto — se le
pueden sumar Participantes en cualquier momento, mediante un código/link de
invitación reusable y sin vencimiento (el admin lo puede regenerar/invalidar
manualmente). Cualquier Participante registrado puede crear un Grupo nuevo;
al crearlo queda como su **admin**, con permisos que el resto de los
miembros no tiene (generar/invalidar la invitación, sacar miembros del
Grupo) — separado del rol de Anotador, que es por Partida, no por Grupo.
Un Grupo también fija las reglas de la modalidad Pica-pica (ver Fase) para
todas sus Partidas: los umbrales de inicio y fin de la Fase alternada
(default 5 y 20) se definen una sola vez al crear el Grupo y no se pueden
editar después; la ventana de inactividad que detecta el fin de una Mano
(ver Mano, default 10 segundos) sí es editable por el admin en cualquier
momento y se aplica de inmediato a todas las Partidas del Grupo, incluidas
las que están en curso.

**Participante**:
Miembro de un Grupo, con cuenta propia (login por email+contraseña o Google).
Se une a un Grupo mediante un código/link de invitación. Acumula puntos de
Ranking según el nivel de Victoria (simple/doble/triple) de cada Partida
ganada — ver Ranking.
_Avoid_: Jugador (usar Participante como término canónico salvo al hablar del
rol dentro de una Mano/Partida ya en curso).

**Anotador**:
Rol que ocupa exactamente 1 de los 6 Participantes de una Partida específica
(no es un rol fijo de la aplicación ni del Grupo). El Anotador es el único
que puede armar/confirmar los Equipos y cargar los puntos de esa Partida, en
vivo, mano a mano — esto evita ediciones simultáneas del mismo marcador.

**Equipo**:
Agrupación de exactamente 3 Participantes armada para una Partida específica.
No tiene identidad propia entre Partidas — se arma de cero cada vez y su
composición puede cambiar completamente de una Partida a la siguiente. El
registro de un Participante en un Equipo vive solo mientras dura esa
Partida: un Participante no puede estar registrado en un Equipo de una
Partida en curso si ya está en el Equipo de otra Partida en curso.

**Partida**:
Enfrentamiento entre exactamente 2 Equipos. Se compone de varias Manos. Tiene
un contador de puntos por Equipo que arranca en 0 y sube de a los puntos que
se ganan en cada Mano, sin resetear nunca, hasta que un Equipo llega a 30 —
ese Equipo gana la Partida y no se puede superar los 30. Al finalizar, cada
Participante del Equipo ganador suma a su Ranking los puntos de la Victoria
simple/doble/triple correspondiente (ver Ranking). Solo se persiste
el resultado final (Equipos, ganador, puntaje final) — no cada Mano
individual. Una Partida también puede terminar **cancelada** (se corta antes
de que un Equipo llegue a 30): en ese caso libera a sus Participantes para
formar nuevos Equipos, pero no cuenta como Partida jugada, ganada ni perdida
para el Ranking ni el dashboard.

**Mano**:
Una jugada dentro de una Partida. Siempre otorga al menos 1 punto a
exactamente uno de los dos Equipos — no existe la Mano que termine 0 a 0
(parda), pero puede otorgar más de 1 si hace falta. El fin de una Mano se
detecta por tiempo, no por una acción explícita: el primer punto anotado
después de que pasó la ventana de inactividad del Grupo (ver Grupo) sin
ningún punto nuevo marca el inicio de la Mano siguiente; cualquier punto
anotado dentro de esa ventana pertenece a la misma Mano que se venía
cargando. Corregir un puntaje ya cargado (deshacer un punto de más, o uno
anotado al Equipo equivocado) no tiene ningún otro efecto de dominio — en
particular, nunca cambia el tipo de Bloque (ver Bloque) por sí solo.

**Bloque**:
Tramo de una Partida formado por una o varias Manos consecutivas del mismo
tipo: Ronda o Pica-pica (ver esos términos). El tipo de Bloque decide cómo
se juegan sus Manos en la mesa, pero no cambia cómo se anotan los
puntos — en cualquier tipo de Bloque, los puntos siempre se anotan para el
Equipo, nunca para un Participante individual. Si una corrección de
puntaje deja mal el tipo de Bloque vigente (por ejemplo, dos puntos de una
misma Mano real quedaron separados por más de la ventana de inactividad y
se contaron de más), el Anotador puede corregirlo a mano; si lo corrige a
Pica-pica, ese Bloque arranca de cero sus 3 Manos.

**Ronda**:
Tipo de Bloque de exactamente 1 Mano, jugada entre los 6 Participantes de
la Partida. Es el único tipo de Bloque que existe en la Fase inicial y en
la Fase final de una Partida (ver Fase) — ver también Pica-pica.

**Pica-pica**:
Tipo de Bloque de exactamente 3 Manos consecutivas, cada una jugada 1
contra 1 entre un Participante de cada Equipo (los 3 integrantes de un
Equipo se enfrentan, por turno, a los 3 del otro) — a diferencia de la
Ronda, no juegan los 6 Participantes juntos. Solo aparece durante la Fase
alternada de una Partida (ver Fase).
_Avoid_: mini-partida (se confunde con Partida, que es otro concepto).

**Fase**:
Etapa de una Partida que determina qué tipo de Bloque corresponde jugar.
Toda Partida atraviesa hasta 3, en este orden: **Fase inicial** (todo en
Ronda, desde 0-0 hasta que algún Equipo alcanza o supera el umbral de
inicio de Pica-pica del Grupo, default 5 — una Mano que deja a un Equipo en
6 ya lo superó, no hace falta caer justo en 5); **Fase alternada** (alterna
un Bloque de Ronda y uno de Pica-pica, hasta que algún Equipo alcanza o
supera el umbral de fin de Pica-pica del Grupo, default 20 — si ese umbral
se cruza a mitad de un Bloque de Pica-pica, se terminan de jugar sus 3
Manos antes de pasar de Fase); y **Fase final** (todo en Ronda otra vez,
hasta que la Partida termina en 30).

**Malas / Buenas**:
Las dos mitades del contador de una Partida: los primeros 15 puntos (0-15)
son "malas", los siguientes 15 (16-30) son "buenas". Es solo una forma de
nombrar el rango en el que está el contador — no hay reseteo ni cambio de
lógica al pasar de una mitad a la otra, los puntos siguen sumando en orden
consecutivo.

**Victoria simple / doble / triple**:
Los tres niveles de puntaje que aporta una Partida ganada al Ranking de cada
Participante del Equipo ganador, según el puntaje final del Equipo perdedor
al momento en que termina la Partida: **Victoria simple** (1 punto) si el
perdedor terminó entre 16 y 29; **Victoria doble** (2 puntos) si terminó
entre 1 y 15; **Victoria triple** (3 puntos) si terminó en 0. Estos rangos
son propios de esta regla y no reutilizan Malas/Buenas (que describen el
contador en vivo de una Partida, 0-15/16-30) — un perdedor "en malas" puede
haber dado una Victoria doble o triple según haya hecho algún punto o
ninguno.
_Nota de dominio_: "duerme afuera" es un término coloquial del truco que
cubre Victoria doble y triple juntas (el perdedor no pasó de las malas,
0-15) — no es alias de un nivel puntual, sino una forma informal de
referirse a cualquiera de esas dos.

**Ranking**:
Orden de los Participantes de un Grupo por **promedio**: puntos acumulados
dividido Partidas jugadas, de mayor a menor. Los puntos ya no son 1 fijo por
Partida ganada — cada Partida ganada aporta, a cada Participante del Equipo
ganador, los puntos de una Victoria simple, doble o triple (ver ese
término). Es un concepto distinto del puntaje de una Partida (0-30) — el
Ranking cuenta rendimiento ponderado por victoria, no puntos de juego. Un
Participante con 0 Partidas jugadas no tiene promedio calculable — se
muestra al final del Ranking, aparte, sin excluirlo de la lista. No hay
umbral mínimo de Partidas jugadas para entrar al orden por promedio (acepta
a propósito que pocas Partidas con promedio alto puedan rankear más arriba
que muchas Partidas con promedio algo menor — se revisa si molesta en la
práctica, no se resuelve preventivamente). El dashboard de un Participante
dentro de un Grupo muestra: puntos acumulados, Partidas jugadas, Partidas
ganadas (total, desglosadas en simples/dobles/triples), Partidas perdidas
(siempre Partidas jugadas menos Partidas ganadas — no existen Partidas
empatadas) y el promedio que define el orden del Ranking.
