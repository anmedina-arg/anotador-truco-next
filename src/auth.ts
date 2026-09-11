import { cache } from "react";
import NextAuth from "next-auth";
import type { DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "./db/client";
import { authSchema } from "./db/schema";
import { verificarCredenciales } from "./domain/participantes";

const {
  handlers,
  signIn,
  signOut,
  auth: authSinCache,
} = NextAuth({
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
  callbacks: {
    // @auth/core ya pone `sub: user.id` en el token al momento del login,
    // antes de que corra este callback — no hace falta (ni conviene)
    // duplicarlo en un campo propio: un token viejo, firmado antes de este
    // cambio, ya tiene `sub` desde que se creó.
    session: ({ session, token }) => {
      if (typeof token.sub === "string") session.user.id = token.sub;
      return session;
    },
  },
});

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

// Memoizado por request: el layout con el círculo de perfil, cada page y
// cada Server Action que llaman a auth() en el mismo request comparten un
// solo chequeo de sesión en vez de repetirlo 2-3 veces.
export const auth = cache(authSinCache);
export { handlers, signIn, signOut };
