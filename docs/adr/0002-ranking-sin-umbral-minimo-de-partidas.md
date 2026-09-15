# Ranking por promedio, sin umbral mínimo de Partidas jugadas

Al rediseñar el Ranking para que ordene por promedio (puntos / Partidas
jugadas, ver `CONTEXT.md`) en vez de por suma total, un Participante con
pocas Partidas jugadas y buen resultado (ej. 1 Partida ganada en Victoria
triple, promedio 3.0) puede rankear por encima de otro con muchas Partidas
jugadas y un promedio apenas menor (ej. 50 Partidas, promedio 1.2) — el
problema de tamaño de muestra chico, inverso al problema original que
motivó el cambio (sumar total castigaba a quien jugó pocas Partidas).

Se decidió **no** agregar un umbral mínimo de Partidas jugadas para entrar
al orden por promedio. Es una app de anotador entre amigos, no una liga
competitiva — se prefiere simplicidad ahora y revisar si en la práctica
esto genera un Ranking que se sienta injusto, en vez de resolver
preventivamente un problema que puede no llegar a manifestarse.

Los Participantes con 0 Partidas jugadas (promedio indefinido) van al final
del Ranking, mostrados aparte, sin quedar excluidos de la lista.
