---
status: superseded by ADR-0005
---

# Detectar el fin de una Mano por ventana de inactividad, no por una acción explícita

> **Superseded por [ADR-0005](./0005-fin-de-mano-decidido-por-debounce-del-cliente.md).**
> La detección retroactiva server-side descrita acá (comparar el timestamp
> del punto nuevo contra el último guardado) se reemplazó por un debounce
> del lado del cliente: en uso real, dejaba el Bloque mostrado en pantalla
> atrasado hasta que llegaba el primer punto de la Mano siguiente. La
> decisión de fondo de este ADR (detectar por tiempo, no por una acción
> explícita tipo "Cerrar mano") sigue en pie — lo que cambia es *dónde* se
> mide esa ventana.

Para la modalidad Pica-pica (ver `CONTEXT.md`: Bloque, Ronda, Pica-pica, Fase)
la app necesita saber cuándo termina cada Mano, porque la alternancia
Ronda/Pica-pica depende de contar Manos, no de sumar puntaje. El problema es
que una Mano real puede valer más de 1 punto (envido + truco en la misma
mano, un vale cuatro), y el anotador solo permite cargar de a 1 punto por
toque — así que una Mano de 3 puntos se carga con 3 toques de "+" seguidos.
No hay ninguna acción existente que marque "esta Mano terminó".

Se evaluó agregar un botón explícito ("Cerrar mano") para marcar ese límite,
pero se descartó: obliga al Anotador a acordarse de tocarlo cada vez además
de cargar los puntos, en medio de una partida real donde ya está prestando
atención a las cartas.

Se eligió en cambio una **ventana de inactividad** (default 10 segundos,
configurable por Grupo): el primer punto anotado después de que pasó esa
ventana sin ningún punto nuevo marca el inicio de la Mano siguiente;
cualquier punto anotado dentro de la ventana pertenece a la Mano que se
venía cargando. Es una heurística, no una detección exacta — si dos toques
de la misma Mano real quedan separados por más tiempo que la ventana, se
cuentan por error como dos Manos. Se acepta ese riesgo como poco frecuente
en vez de agregar lógica para prevenirlo; para cuando pasa, existe una
corrección manual del tipo de Bloque (ver ADR 0004) en vez de intentar
detectarlo y deshacerlo automáticamente.

Como consecuencia, el tipo de Bloque actual (y su progreso interno, para
Pica-pica) no se puede derivar solo del puntaje acumulado — depende de en
qué momento se cargó cada punto — así que se persiste como estado propio de
la Partida en vez de calcularse al vuelo en cada lectura.
