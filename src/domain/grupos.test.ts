import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { usersTable, gruposTable, gruposParticipantesTable } from "../db/schema";
import { registrarParticipante } from "./participantes";
import {
  crearGrupo,
  listarGruposDeParticipante,
  listarMiembrosDeGrupo,
  obtenerGrupoMasActivoDeParticipante,
  obtenerGrupoPorId,
  unirseAGrupo,
  regenerarCodigoInvitacion,
  sacarMiembro,
  actualizarEstadisticas,
  actualizarVentanaInactividad,
  EstadisticasInvalidasError,
  VentanaInactividadInvalidaError,
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

  it("usa los umbrales default (5 y 20) si no se pasan", async () => {
    const grupo = await crearGrupo({ nombre: "Los viernes", adminParticipanteId: adminId });

    expect(grupo.umbralInicioPicaPica).toBe(5);
    expect(grupo.umbralFinPicaPica).toBe(20);
  });

  it("acepta umbrales explícitos válidos", async () => {
    const grupo = await crearGrupo({
      nombre: "Los viernes",
      adminParticipanteId: adminId,
      umbralInicioPicaPica: 3,
      umbralFinPicaPica: 25,
    });

    expect(grupo.umbralInicioPicaPica).toBe(3);
    expect(grupo.umbralFinPicaPica).toBe(25);
  });

  it("rechaza si el umbral de inicio es igual al de fin", async () => {
    await expect(
      crearGrupo({
        nombre: "Los viernes",
        adminParticipanteId: adminId,
        umbralInicioPicaPica: 10,
        umbralFinPicaPica: 10,
      }),
    ).rejects.toThrow();
  });

  it("rechaza si el umbral de inicio es mayor al de fin", async () => {
    await expect(
      crearGrupo({
        nombre: "Los viernes",
        adminParticipanteId: adminId,
        umbralInicioPicaPica: 15,
        umbralFinPicaPica: 10,
      }),
    ).rejects.toThrow();
  });

  it("rechaza un umbral de inicio menor a 1", async () => {
    await expect(
      crearGrupo({
        nombre: "Los viernes",
        adminParticipanteId: adminId,
        umbralInicioPicaPica: 0,
        umbralFinPicaPica: 20,
      }),
    ).rejects.toThrow();
  });

  it("rechaza un umbral de fin de 30 o más", async () => {
    await expect(
      crearGrupo({
        nombre: "Los viernes",
        adminParticipanteId: adminId,
        umbralInicioPicaPica: 5,
        umbralFinPicaPica: 30,
      }),
    ).rejects.toThrow();
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

describe("obtenerGrupoMasActivoDeParticipante", () => {
  it("devuelve el Grupo con más Partidas jugadas por el Participante, no el más nuevo", async () => {
    const grupo1 = await crearGrupo({ nombre: "El más jugado", adminParticipanteId: adminId });
    const grupo2 = await crearGrupo({ nombre: "El más nuevo", adminParticipanteId: adminId });

    // grupo2 se creó después (fechaAlta más reciente) pero tiene más
    // Partidas jugadas — si el test pasara igual sin esto, podría ser
    // porque la función sigue ordenando por fechaAlta y no por actividad.
    const db = getDb();
    await db
      .update(gruposParticipantesTable)
      .set({ partidasJugadas: 3 })
      .where(
        and(
          eq(gruposParticipantesTable.grupoId, grupo1.id),
          eq(gruposParticipantesTable.participanteId, adminId),
        ),
      );

    const masActivo = await obtenerGrupoMasActivoDeParticipante(adminId);

    expect(masActivo?.id).toBe(grupo1.id);
  });

  it("ante un empate en Partidas jugadas, devuelve el Grupo al que se sumó primero", async () => {
    const grupo1 = await crearGrupo({ nombre: "El más viejo", adminParticipanteId: adminId });
    const grupo2 = await crearGrupo({ nombre: "El más nuevo", adminParticipanteId: adminId });

    const db = getDb();
    await db
      .update(gruposParticipantesTable)
      .set({ fechaAlta: new Date("2020-01-01") })
      .where(
        and(
          eq(gruposParticipantesTable.grupoId, grupo2.id),
          eq(gruposParticipantesTable.participanteId, adminId),
        ),
      );
    await db
      .update(gruposParticipantesTable)
      .set({ fechaAlta: new Date("2021-01-01") })
      .where(
        and(
          eq(gruposParticipantesTable.grupoId, grupo1.id),
          eq(gruposParticipantesTable.participanteId, adminId),
        ),
      );

    const masActivo = await obtenerGrupoMasActivoDeParticipante(adminId);

    expect(masActivo?.id).toBe(grupo2.id);
  });

  it("devuelve null si el Participante no es miembro de ningún Grupo", async () => {
    const masActivo = await obtenerGrupoMasActivoDeParticipante(ajenoId);
    expect(masActivo).toBeNull();
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

describe("actualizarEstadisticas", () => {
  it("deriva puntos y partidasPerdidas a partir de jugadas/ganadas/dobles/triples", async () => {
    const grupo = await crearGrupo({ nombre: "Los viernes", adminParticipanteId: adminId });
    await unirseAGrupo({ codigoInvitacion: grupo.codigoInvitacion, participanteId: ajenoId });

    await actualizarEstadisticas({
      grupoId: grupo.id,
      solicitanteId: adminId,
      participanteId: ajenoId,
      partidasJugadas: 8,
      partidasGanadas: 5,
      partidasGanadasDobles: 1,
      partidasGanadasTriples: 1,
    });

    const [miembro] = await listarMiembrosDeGrupo(grupo.id).then((miembros) =>
      miembros.filter((m) => m.participanteId === ajenoId),
    );
    expect(miembro.partidasJugadas).toBe(8);
    expect(miembro.partidasGanadas).toBe(5);
    expect(miembro.partidasPerdidas).toBe(3);
    expect(miembro.puntos).toBe(8);
  });

  it("rechaza si ganadas dobles + triples supera a ganadas totales", async () => {
    const grupo = await crearGrupo({ nombre: "Los viernes", adminParticipanteId: adminId });
    await unirseAGrupo({ codigoInvitacion: grupo.codigoInvitacion, participanteId: ajenoId });

    await expect(
      actualizarEstadisticas({
        grupoId: grupo.id,
        solicitanteId: adminId,
        participanteId: ajenoId,
        partidasJugadas: 5,
        partidasGanadas: 2,
        partidasGanadasDobles: 1,
        partidasGanadasTriples: 2,
      }),
    ).rejects.toThrow(EstadisticasInvalidasError);
  });

  it("rechaza si ganadas supera a jugadas", async () => {
    const grupo = await crearGrupo({ nombre: "Los viernes", adminParticipanteId: adminId });
    await unirseAGrupo({ codigoInvitacion: grupo.codigoInvitacion, participanteId: ajenoId });

    await expect(
      actualizarEstadisticas({
        grupoId: grupo.id,
        solicitanteId: adminId,
        participanteId: ajenoId,
        partidasJugadas: 2,
        partidasGanadas: 5,
        partidasGanadasDobles: 0,
        partidasGanadasTriples: 0,
      }),
    ).rejects.toThrow(EstadisticasInvalidasError);
  });

  it("rechaza si quien lo pide no es el admin", async () => {
    const grupo = await crearGrupo({ nombre: "Los viernes", adminParticipanteId: adminId });
    await unirseAGrupo({ codigoInvitacion: grupo.codigoInvitacion, participanteId: ajenoId });

    await expect(
      actualizarEstadisticas({
        grupoId: grupo.id,
        solicitanteId: ajenoId,
        participanteId: adminId,
        partidasJugadas: 1,
        partidasGanadas: 1,
        partidasGanadasDobles: 0,
        partidasGanadasTriples: 0,
      }),
    ).rejects.toThrow("Solo el admin del Grupo puede hacer esto");
  });
});

describe("actualizarVentanaInactividad", () => {
  it("el admin puede actualizar la ventana de inactividad", async () => {
    const grupo = await crearGrupo({ nombre: "Los viernes", adminParticipanteId: adminId });

    await actualizarVentanaInactividad({
      grupoId: grupo.id,
      solicitanteId: adminId,
      ventanaInactividadSegundos: 30,
    });

    const actualizado = await obtenerGrupoPorId(grupo.id);
    expect(actualizado?.ventanaInactividadSegundos).toBe(30);
  });

  it("rechaza si quien lo pide no es el admin", async () => {
    const grupo = await crearGrupo({ nombre: "Los viernes", adminParticipanteId: adminId });

    await expect(
      actualizarVentanaInactividad({
        grupoId: grupo.id,
        solicitanteId: ajenoId,
        ventanaInactividadSegundos: 30,
      }),
    ).rejects.toThrow("Solo el admin del Grupo puede hacer esto");
  });

  it("rechaza un valor menor a 5", async () => {
    const grupo = await crearGrupo({ nombre: "Los viernes", adminParticipanteId: adminId });

    await expect(
      actualizarVentanaInactividad({
        grupoId: grupo.id,
        solicitanteId: adminId,
        ventanaInactividadSegundos: 4,
      }),
    ).rejects.toThrow(VentanaInactividadInvalidaError);
  });

  it("rechaza un valor mayor a 60", async () => {
    const grupo = await crearGrupo({ nombre: "Los viernes", adminParticipanteId: adminId });

    await expect(
      actualizarVentanaInactividad({
        grupoId: grupo.id,
        solicitanteId: adminId,
        ventanaInactividadSegundos: 61,
      }),
    ).rejects.toThrow(VentanaInactividadInvalidaError);
  });

  it("acepta los límites del rango, 5 y 60", async () => {
    const grupo = await crearGrupo({ nombre: "Los viernes", adminParticipanteId: adminId });

    await actualizarVentanaInactividad({
      grupoId: grupo.id,
      solicitanteId: adminId,
      ventanaInactividadSegundos: 5,
    });
    await actualizarVentanaInactividad({
      grupoId: grupo.id,
      solicitanteId: adminId,
      ventanaInactividadSegundos: 60,
    });

    const actualizado = await obtenerGrupoPorId(grupo.id);
    expect(actualizado?.ventanaInactividadSegundos).toBe(60);
  });
});
