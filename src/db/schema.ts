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
    anotadorParticipanteId: text("anotadorParticipanteId")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    estado: estadoPartidaEnum("estado").notNull().default("en_curso"),
    equipo1Puntos: integer("equipo1Puntos").notNull().default(0),
    equipo2Puntos: integer("equipo2Puntos").notNull().default(0),
    equipoGanador: integer("equipoGanador"),
    fechaInicio: timestamp("fechaInicio", { mode: "date" }).notNull().defaultNow(),
    fechaFin: timestamp("fechaFin", { mode: "date" }),
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
