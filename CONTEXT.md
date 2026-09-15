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
Participante del Equipo ganador suma 1 punto a su Ranking. Solo se persiste
el resultado final (Equipos, ganador, puntaje final) — no cada Mano
individual. Una Partida también puede terminar **cancelada** (se corta antes
de que un Equipo llegue a 30): en ese caso libera a sus Participantes para
formar nuevos Equipos, pero no cuenta como Partida jugada, ganada ni perdida
para el Ranking ni el dashboard.

**Mano**:
Una jugada dentro de una Partida. En cada Mano, uno de los dos Equipos puede
sumar puntos (o ninguno); esos puntos alimentan el contador de la Partida.

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
