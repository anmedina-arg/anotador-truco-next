import { pgTable, primaryKey, integer, text, timestamp, pgEnum, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Participante (ver CONTEXT.md) = la tabla "user" que espera el adapter de
// Auth.js, con una columna extra para la contraseña del login por
// email+contraseña (nula para quienes solo usan Google).
export const usersTable = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("passwordHash"),
});

export const accountsTable = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessionsTable = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokensTable = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => [
    primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  ],
);

// Bolsa con la forma exacta que espera DrizzleAdapter (@auth/drizzle-adapter).
export const authSchema = {
  usersTable,
  accountsTable,
  sessionsTable,
  verificationTokensTable,
};

// Grupo (ver CONTEXT.md): conjunto de Participantes sobre el que se juegan
// Partidas. codigoInvitacion se genera ya en la creación (ticket #3) aunque
// recién se muestra/gestiona en el ticket #4, para no migrar la tabla de nuevo.
// umbralInicioPicaPica/umbralFinPicaPica/ventanaInactividadSegundos (ver
// CONTEXT.md, Fase) arrancan en sus defaults 5/20/10 para todo Grupo,
// existente o nuevo, por default de columna — sin backfill aparte (ver ADR
// 0004). Los dos umbrales se fijan solo al crear el Grupo, sin operación de
// actualización expuesta; ventanaInactividadSegundos sí es editable después
// (ticket #23) y se lee en vivo desde acá, nunca se copia a la Partida.
export const gruposTable = pgTable("grupo", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  nombre: text("nombre").notNull(),
  // "restrict", no "cascade": si el admin se borrara en cascada, se llevaría
  // puesto el Grupo entero y las estadísticas de todos los demás miembros.
  // Sin una forma de transferir la administración todavía, mejor que la
  // base rechace ese borrado a que desaparezca el Grupo de otros.
  adminParticipanteId: text("adminParticipanteId")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  codigoInvitacion: text("codigoInvitacion").notNull().unique(),
  creadoEn: timestamp("creadoEn", { mode: "date" }).notNull().defaultNow(),
  umbralInicioPicaPica: integer("umbralInicioPicaPica").notNull().default(5),
  umbralFinPicaPica: integer("umbralFinPicaPica").notNull().default(20),
  ventanaInactividadSegundos: integer("ventanaInactividadSegundos").notNull().default(10),
});

// grupo_participante (ver CONTEXT.md): membresía de un Participante en un
// Grupo, con sus estadísticas de Ranking. puntos ya no es 1 punto fijo por
// Partida ganada — sale de calcularEstadisticasRanking (domain/grupos.ts) a
// partir de partidasGanadas/partidasGanadasDobles/partidasGanadasTriples
// (Victoria simple/doble/triple, ver CONTEXT.md). Las columnas de
// estadística arrancan en 0 y las actualiza el ticket #16 (anotarPunto) o el
// #17 (corrección manual del admin).
export const gruposParticipantesTable = pgTable(
  "grupo_participante",
  {
    grupoId: text("grupoId")
      .notNull()
      .references(() => gruposTable.id, { onDelete: "cascade" }),
    participanteId: text("participanteId")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    fechaAlta: timestamp("fechaAlta", { mode: "date" }).notNull().defaultNow(),
    puntos: integer("puntos").notNull().default(0),
    partidasJugadas: integer("partidasJugadas").notNull().default(0),
    partidasGanadas: integer("partidasGanadas").notNull().default(0),
    partidasGanadasDobles: integer("partidasGanadasDobles").notNull().default(0),
    partidasGanadasTriples: integer("partidasGanadasTriples").notNull().default(0),
    partidasPerdidas: integer("partidasPerdidas").notNull().default(0),
  },
  (gp) => [primaryKey({ columns: [gp.grupoId, gp.participanteId] })],
);

// Partida (ver CONTEXT.md): enfrentamiento entre 2 Equipos de 3 Participantes
// dentro de un Grupo. equipo1Puntos/equipo2Puntos/equipoGanador/fechaFin no
// los usa este ticket (#5, solo crea la Partida) — los actualiza el #6 al
// anotar y cerrarla; se crean ya para no migrar la tabla de nuevo.
export const estadoPartidaEnum = pgEnum("estado_partida", [
  "en_curso",
  "finalizada",
  "cancelada",
]);

// Bloque (ver CONTEXT.md): tramo de la Partida vigente, Ronda o Pica-pica.
// tipoDeBloqueActual arranca en "ronda" por default de columna — así toda
// Partida nueva (incluidas Revancha y Siguiente equipo, que solo llaman a
// crearPartida) arranca en Ronda sin ningún caso especial en el código.
// manosJugadasEnBloqueActual solo es relevante durante un Bloque de
// Pica-pica (0/1/2 antes de completar sus 3 Manos); en Ronda vale 0 y se
// ignora. ultimoPuntoAnotadoEn (nullable, ningún punto anotado todavía)
// sostiene la ventana de inactividad que detecta el fin de una Mano (ver
// ADR 0003) — no se puede derivar del puntaje acumulado solo.
export const tipoDeBloqueEnum = pgEnum("tipo_de_bloque", ["ronda", "pica_pica"]);

export const partidasTable = pgTable(
  "partida",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    grupoId: text("grupoId")
      .notNull()
      .references(() => gruposTable.id, { onDelete: "cascade" }),
    // "restrict": igual criterio que grupo.adminParticipanteId — no perder el
    // registro de la Partida solo porque el Anotador se borró de la app.
    // Nullable (ticket #32): si quien crea la Partida no queda en ninguno de
    // los dos Equipos, queda sin Anotador hasta que alguno de los 6 que
    // juegan lo reclama en vivo (ver ticket #33) — mientras tanto, nadie
    // puede cargar puntos, corregir el Bloque ni cancelar (esAnotadorDePartida
    // nunca matchea contra null).
    anotadorParticipanteId: text("anotadorParticipanteId").references(() => usersTable.id, {
      onDelete: "restrict",
    }),
    estado: estadoPartidaEnum("estado").notNull().default("en_curso"),
    equipo1Puntos: integer("equipo1Puntos").notNull().default(0),
    equipo2Puntos: integer("equipo2Puntos").notNull().default(0),
    equipoGanador: integer("equipoGanador"),
    fechaInicio: timestamp("fechaInicio", { mode: "date" }).notNull().defaultNow(),
    fechaFin: timestamp("fechaFin", { mode: "date" }),
    tipoDeBloqueActual: tipoDeBloqueEnum("tipoDeBloqueActual").notNull().default("ronda"),
    manosJugadasEnBloqueActual: integer("manosJugadasEnBloqueActual").notNull().default(0),
    ultimoPuntoAnotadoEn: timestamp("ultimoPuntoAnotadoEn", { mode: "date" }),
  },
  (partida) => [
    check("equipo1_puntos_rango", sql`${partida.equipo1Puntos} BETWEEN 0 AND 30`),
    check("equipo2_puntos_rango", sql`${partida.equipo2Puntos} BETWEEN 0 AND 30`),
    check("equipo_ganador_valido", sql`${partida.equipoGanador} IN (1, 2)`),
  ],
);

export const partidasParticipantesTable = pgTable(
  "partida_participante",
  {
    partidaId: text("partidaId")
      .notNull()
      .references(() => partidasTable.id, { onDelete: "cascade" }),
    // "restrict": una fila de partida_participante es historial de quién
    // jugó — no debería poder desaparecer en cascada solo porque el usuario
    // se borró, a diferencia de grupo_participante (que sí es "cascade",
    // porque ahí sacar a un Participante del Grupo es exactamente sacar esa
    // fila).
    participanteId: text("participanteId")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    equipoNumero: integer("equipoNumero").notNull(),
  },
  (pp) => [
    primaryKey({ columns: [pp.partidaId, pp.participanteId] }),
    check("equipo_numero_valido", sql`${pp.equipoNumero} IN (1, 2)`),
  ],
);

// pica_pica_pareja (ver CONTEXT.md/Pica-pica, ticket #25): emparejamiento
// fijo 1 a 1 entre los 3 Participantes de Equipo 1 y los 3 de Equipo 2 para
// los Bloques de Pica-pica de una Partida. Se decide una sola vez al crear
// la Partida (crearPartida) — o se copia automáticamente de la Partida de
// referencia en una Revancha — y no cambia durante toda la Partida, ni
// siquiera si la Fase alternada vuelve a Pica-pica más de una vez (ver ADR
// 0006). "posicion" (1/2/3) NO decide qué pareja le toca jugar cada Mano
// (ver corrección del ADR 0006, ticket #29: ese orden no es fijo entre
// Bloques) — solo ordena cómo se muestran las 3 parejas ("Pareja 1/2/3",
// ticket #26).
export const picaPicaParejaTable = pgTable(
  "pica_pica_pareja",
  {
    partidaId: text("partidaId")
      .notNull()
      .references(() => partidasTable.id, { onDelete: "cascade" }),
    posicion: integer("posicion").notNull(),
    // "restrict": mismo criterio que partida_participante — es historial de
    // quién jugó, no debería desaparecer en cascada solo porque el usuario
    // se borró.
    jugadorEquipo1Id: text("jugadorEquipo1Id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    jugadorEquipo2Id: text("jugadorEquipo2Id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
  },
  (ppp) => [
    primaryKey({ columns: [ppp.partidaId, ppp.posicion] }),
    check("posicion_valida", sql`${ppp.posicion} IN (1, 2, 3)`),
  ],
);

// pica_pica_mano (ver CONTEXT.md/Pica-pica, ticket #29): historial mano a
// mano de Pica-pica entre dos Participantes — una fila por cada Mano de
// Pica-pica confirmada, con la pareja activa que el Anotador indicó en vivo
// (ver ADR 0006: el orden entre Bloques de Pica-pica no es fijo, así que no
// se puede derivar solo). jugadorAId/jugadorBId no tienen un orden fijo por
// Equipo — la consulta que arma el historial entre dos Participantes
// (obtenerHistorialEntreJugadores, domain/partidas.ts) los busca en
// cualquiera de las dos columnas. Append-only: anotarPunto (corrección
// manual de un punto) nunca la toca.
export const picaPicaManoTable = pgTable("pica_pica_mano", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  partidaId: text("partidaId")
    .notNull()
    .references(() => partidasTable.id, { onDelete: "cascade" }),
  jugadorAId: text("jugadorAId")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  jugadorBId: text("jugadorBId")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  deltaJugadorA: integer("deltaJugadorA").notNull(),
  deltaJugadorB: integer("deltaJugadorB").notNull(),
  creadaEn: timestamp("creadaEn", { mode: "date" }).notNull().defaultNow(),
});
