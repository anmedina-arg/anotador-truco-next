import { config } from "dotenv";
config({ path: ".env.local" });

import { registrarParticipante } from "../src/domain/participantes";

const PASSWORD = "pruebaPrueba123";

const usuarios = Array.from({ length: 6 }, (_, i) => ({
  nombre: `Jugador ${i + 1}`,
  email: `jugador${i + 1}@prueba.local`,
  password: PASSWORD,
}));

async function main() {
  for (const usuario of usuarios) {
    try {
      await registrarParticipante(usuario);
      console.log(`Creado: ${usuario.email}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Ya existe")) {
        console.log(`Ya existía: ${usuario.email}`);
        continue;
      }
      throw error;
    }
  }

  console.log(`\nListo. Los 6 usan la misma contraseña: ${PASSWORD}`);
  process.exit(0);
}

main();
