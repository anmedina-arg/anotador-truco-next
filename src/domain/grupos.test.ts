import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { usersTable, gruposTable, gruposParticipantesTable } from "../db/schema";
import { registrarParticipante } from "./participantes";
import { crearGrupo, listarGruposDeParticipante } from "./grupos";

const emailAdmin = "test-grupos-admin@example.com";
const emailAjeno = "test-grupos-ajeno@example.com";

let adminId: string;
let ajenoId: string;

beforeEach(async () => {
  const admin = await registrarParticipante({
    nombre: "Admin de prueba",
    email: emailAdmin,
    password: "unaClaveSegura123",
  });
  adminId = admin.id;

  const ajeno = await registrarParticipante({
    nombre: "Ajeno de prueba",
    email: emailAjeno,
    password: "unaClaveSegura123",
  });
  ajenoId = ajeno.id;
});

afterEach(async () => {
  const db = getDb();
  await db.delete(gruposParticipantesTable).where(eq(gruposParticipantesTable.participanteId, adminId));
  await db.delete(gruposTable).where(eq(gruposTable.adminParticipanteId, adminId));
  await db.delete(usersTable).where(eq(usersTable.email, emailAdmin));
  await db.delete(usersTable).where(eq(usersTable.email, emailAjeno));
});

describe("crearGrupo", () => {
  it("crea el Grupo con el creador como admin", async () => {
    const grupo = await crearGrupo({ nombre: "Los viernes", adminParticipanteId: adminId });

    expect(grupo.nombre).toBe("Los viernes");
    expect(grupo.adminParticipanteId).toBe(adminId);
  });

  it("suma al creador como miembro del Grupo, con estadísticas en cero", async () => {
    const grupo = await crearGrupo({ nombre: "Los viernes", adminParticipanteId: adminId });

    const db = getDb();
    const [membresia] = await db
      .select()
      .from(gruposParticipantesTable)
      .where(eq(gruposParticipantesTable.grupoId, grupo.id));

    expect(membresia.participanteId).toBe(adminId);
    expect(membresia.puntos).toBe(0);
    expect(membresia.partidasJugadas).toBe(0);
  });

  it("genera un código de invitación", async () => {
    const grupo = await crearGrupo({ nombre: "Los viernes", adminParticipanteId: adminId });

    expect(grupo.codigoInvitacion).toBeTruthy();
  });

  it("genera códigos de invitación distintos para dos Grupos distintos", async () => {
    const grupo1 = await crearGrupo({ nombre: "Los viernes", adminParticipanteId: adminId });
    const grupo2 = await crearGrupo({ nombre: "La oficina", adminParticipanteId: adminId });

    expect(grupo1.codigoInvitacion).not.toBe(grupo2.codigoInvitacion);
  });

  it("rechaza un nombre vacío", async () => {
    await expect(
      crearGrupo({ nombre: "   ", adminParticipanteId: adminId }),
    ).rejects.toThrow("El Grupo necesita un nombre");
  });
});

describe("listarGruposDeParticipante", () => {
  it("devuelve los Grupos donde el Participante es miembro", async () => {
    const grupo = await crearGrupo({ nombre: "Los viernes", adminParticipanteId: adminId });

    const grupos = await listarGruposDeParticipante(adminId);

    expect(grupos.map((g) => g.id)).toContain(grupo.id);
  });

  it("no devuelve Grupos donde el Participante no es miembro", async () => {
    await crearGrupo({ nombre: "Los viernes", adminParticipanteId: adminId });

    const grupos = await listarGruposDeParticipante(ajenoId);

    expect(grupos).toHaveLength(0);
  });
});
