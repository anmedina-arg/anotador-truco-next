import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { usersTable } from "../db/schema";
import { registrarParticipante, verificarCredenciales } from "./participantes";

const emailDeTest = "test-registro@example.com";

afterEach(async () => {
  const db = getDb();
  await db.delete(usersTable).where(eq(usersTable.email, emailDeTest));
});

describe("registrarParticipante", () => {
  it("crea un Participante con la contraseña hasheada, no en texto plano", async () => {
    const participante = await registrarParticipante({
      nombre: "Ana",
      email: emailDeTest,
      password: "unaClaveSegura123",
    });

    expect(participante.email).toBe(emailDeTest);
    expect(participante.passwordHash).toBeTruthy();
    expect(participante.passwordHash).not.toBe("unaClaveSegura123");
  });

  it("rechaza un nombre vacío", async () => {
    await expect(
      registrarParticipante({
        nombre: "   ",
        email: emailDeTest,
        password: "unaClaveSegura123",
      }),
    ).rejects.toThrow("El Participante necesita un nombre");
  });

  it("rechaza el registro si el email ya está en uso", async () => {
    await registrarParticipante({
      nombre: "Ana",
      email: emailDeTest,
      password: "unaClaveSegura123",
    });

    await expect(
      registrarParticipante({
        nombre: "Otro",
        email: emailDeTest,
        password: "otraClaveSegura123",
      }),
    ).rejects.toThrow("Ya existe un Participante con ese email");
  });

  it("rechaza el registro si el email ya está en uso, aunque las dos solicitudes lleguen en simultáneo", async () => {
    const resultados = await Promise.allSettled([
      registrarParticipante({
        nombre: "Ana",
        email: emailDeTest,
        password: "unaClaveSegura123",
      }),
      registrarParticipante({
        nombre: "Otro",
        email: emailDeTest,
        password: "otraClaveSegura123",
      }),
    ]);

    const cumplidas = resultados.filter((r) => r.status === "fulfilled");
    const rechazadas = resultados.filter((r) => r.status === "rejected");

    expect(cumplidas).toHaveLength(1);
    expect(rechazadas).toHaveLength(1);
    expect((rechazadas[0] as PromiseRejectedResult).reason.message).toBe(
      "Ya existe un Participante con ese email",
    );
  });

  it("normaliza el email a minúsculas antes de guardarlo", async () => {
    const participante = await registrarParticipante({
      nombre: "Ana",
      email: "Test-Registro@Example.com",
      password: "unaClaveSegura123",
    });

    expect(participante.email).toBe(emailDeTest);
  });

  it("rechaza contraseñas de menos de 8 caracteres", async () => {
    await expect(
      registrarParticipante({
        nombre: "Ana",
        email: emailDeTest,
        password: "corta1",
      }),
    ).rejects.toThrow("La contraseña debe tener al menos 8 caracteres");
  });
});

describe("verificarCredenciales", () => {
  it("devuelve el Participante si el email y la contraseña coinciden", async () => {
    await registrarParticipante({
      nombre: "Ana",
      email: emailDeTest,
      password: "unaClaveSegura123",
    });

    const participante = await verificarCredenciales({
      email: emailDeTest,
      password: "unaClaveSegura123",
    });

    expect(participante?.email).toBe(emailDeTest);
  });

  it("devuelve null si la contraseña no coincide", async () => {
    await registrarParticipante({
      nombre: "Ana",
      email: emailDeTest,
      password: "unaClaveSegura123",
    });

    const participante = await verificarCredenciales({
      email: emailDeTest,
      password: "otraCosaCualquiera",
    });

    expect(participante).toBeNull();
  });

  it("encuentra al Participante sin importar mayúsculas/espacios en el email", async () => {
    await registrarParticipante({
      nombre: "Ana",
      email: emailDeTest,
      password: "unaClaveSegura123",
    });

    const participante = await verificarCredenciales({
      email: " Test-Registro@Example.com ",
      password: "unaClaveSegura123",
    });

    expect(participante?.email).toBe(emailDeTest);
  });

  it("devuelve null si el email no existe", async () => {
    const participante = await verificarCredenciales({
      email: "no-existe@example.com",
      password: "loQueSea123",
    });

    expect(participante).toBeNull();
  });
});
