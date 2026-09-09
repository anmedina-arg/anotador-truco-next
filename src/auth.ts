import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "./db/client";
import { authSchema } from "./db/schema";
import { verificarCredenciales } from "./domain/participantes";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(getDb(), authSchema),
  // El provider Credentials no es compatible con sesiones de base de datos
  // (no hay "cuenta" OAuth que las respalde) — todas las sesiones quedan en JWT.
  session: { strategy: "jwt" },
  providers: [
    Google,
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (credenciales) => {
        const email = credenciales?.email;
        const password = credenciales?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }
        return await verificarCredenciales({ email, password });
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
});
