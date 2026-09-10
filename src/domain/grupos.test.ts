import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { usersTable, gruposTable, gruposParticipantesTable } from "../db/schema";
import { registrarParticipante } from "./participantes";
import {
  crearGrupo,
  listarGruposDeParticipante,
  listarMiembrosDeGrupo,
  unirseAGrupo,
  regenerarCodigoInvitacion,
  sacarMiembro,
} from "./grupos";

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
  await db.delete(gruposParticipantesTable).where(eq(gruposParticipantesTable.participanteId, ajenoId));
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

describe("listarMiembrosDeGrupo", () => {
  it("devuelve al admin como miembro con sus datos y estadísticas", async () => {
    const grupo = await crearGrupo({ nombre: "Los viernes", adminParticipanteId: adminId });

    const miembros = await listarMiembrosDeGrupo(grupo.id);

    expect(miembros).toHaveLength(1);
    expect(miembros[0].participanteId).toBe(adminId);
    expect(miembros[0].nombre).toBe("Admin de prueba");
    expect(miembros[0].puntos).toBe(0);
  });
});

describe("unirseAGrupo", () => {
  it("suma al Participante como miembro usando el código de invitación", async () => {
    const grupo = await crearGrupo({ nombre: "Los viernes", adminParticipanteId: adminId });

    await unirseAGrupo({ codigoInvitacion: grupo.codigoInvitacion, participanteId: ajenoId });

    const miembros = await listarMiembrosDeGrupo(grupo.id);
    expect(miembros.map((m) => m.participanteId)).toContain(ajenoId);
  });

  it("rechaza un código de invitación inexistente", async () => {
    await expect(
      unirseAGrupo({ codigoInvitacion: "codigo-que-no-existe", participanteId: ajenoId }),
    ).rejects.toThrow("Código de invitación inválido");
  });

  it("no rompe si el Participante ya era miembro (idempotente)", async () => {
    const grupo = await crearGrupo({ nombre: "Los viernes", adminParticipanteId: adminId });

    await unirseAGrupo({ codigoInvitacion: grupo.codigoInvitacion, participanteId: ajenoId });
    await unirseAGrupo({ codigoInvitacion: grupo.codigoInvitacion, participanteId: ajenoId });

    const miembros = await listarMiembrosDeGrupo(grupo.id);
    expect(miembros.filter((m) => m.participanteId === ajenoId)).toHaveLength(1);
  });
});

describe("regenerarCodigoInvitacion", () => {
  it("el admin puede regenerar el código de invitación", async () => {
    const grupo = await crearGrupo({ nombre: "Los viernes", adminParticipanteId: adminId });

    const actualizado = await regenerarCodigoInvitacion({
      grupoId: grupo.id,
      solicitanteId: adminId,
    });

    expect(actualizado.codigoInvitacion).not.toBe(grupo.codigoInvitacion);
  });

  it("rechaza si quien lo pide no es el admin", async () => {
    const grupo = await crearGrupo({ nombre: "Los viernes", adminParticipanteId: adminId });

    await expect(
      regenerarCodigoInvitacion({ grupoId: grupo.id, solicitanteId: ajenoId }),
    ).rejects.toThrow("Solo el admin del Grupo puede hacer esto");
  });
});

describe("sacarMiembro", () => {
  it("el admin puede sacar a un miembro del Grupo", async () => {
    const grupo = await crearGrupo({ nombre: "Los viernes", adminParticipanteId: adminId });
    await unirseAGrupo({ codigoInvitacion: grupo.codigoInvitacion, participanteId: ajenoId });

    await sacarMiembro({ grupoId: grupo.id, solicitanteId: adminId, participanteId: ajenoId });

    const miembros = await listarMiembrosDeGrupo(grupo.id);
    expect(miembros.map((m) => m.participanteId)).not.toContain(ajenoId);
  });

  it("rechaza si quien lo pide no es el admin", async () => {
    const grupo = await crearGrupo({ nombre: "Los viernes", adminParticipanteId: adminId });
    await unirseAGrupo({ codigoInvitacion: grupo.codigoInvitacion, participanteId: ajenoId });

    await expect(
      sacarMiembro({ grupoId: grupo.id, solicitanteId: ajenoId, participanteId: adminId }),
    ).rejects.toThrow("Solo el admin del Grupo puede hacer esto");
  });

  it("no permite sacar al admin del Grupo", async () => {
    const grupo = await crearGrupo({ nombre: "Los viernes", adminParticipanteId: adminId });

    await expect(
      sacarMiembro({ grupoId: grupo.id, solicitanteId: adminId, participanteId: adminId }),
    ).rejects.toThrow("El admin no puede sacarse a sí mismo del Grupo");
  });
});
