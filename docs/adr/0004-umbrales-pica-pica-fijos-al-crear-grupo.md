# Umbrales de Pica-pica fijos al crear el Grupo, sin pantalla de edición posterior

Los umbrales de inicio y fin de la Fase alternada (ver `CONTEXT.md`: Fase,
default 5 y 20) son reglas del juego, no un ajuste técnico — a diferencia de
la ventana de inactividad (ver ADR 0003), que sí es editable por el admin en
cualquier momento porque solo afecta cómo se detecta el fin de una Mano, no
las reglas del juego en sí.

En la práctica, un Grupo define estos dos valores una sola vez y se juega
siempre así — cambiarlos a mitad de camino no es un caso real (a diferencia
de la ventana de inactividad, que sí tiene sentido afinar con el uso). Por
eso se fijan al crear el Grupo, con los defaults 5 y 20 precargados, y no
tienen pantalla de administración para editarlos después. Si un grupo de
personas quiere jugar con otros valores, la solución es crear un Grupo
nuevo — no agregar una pantalla de edición para un caso que no se espera que
ocurra.

Los Grupos que ya existían antes de esta feature reciben los valores default
por migración, sin pantalla ni aviso, con el mismo criterio: es una app de
anotador entre amigos (ver ADR 0002), no una liga competitiva, y estos
umbrales rara vez le importan a nadie.
