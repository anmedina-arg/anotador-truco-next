import { pgTable, primaryKey, integer, text, timestamp } from "drizzle-orm/pg-core";

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
// Grupo, con sus estadísticas de Ranking (puntos = partidas ganadas). Las
// columnas de estadística arrancan en 0 y las actualiza el ticket #6 al
// cerrar una Partida.
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
    partidasPerdidas: integer("partidasPerdidas").notNull().default(0),
  },
  (gp) => [primaryKey({ columns: [gp.grupoId, gp.participanteId] })],
);
