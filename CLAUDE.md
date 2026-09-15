# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# anotador-truco

Anotador de partidas de truco por grupos, con historial y ranking por
jugador. Ver [`CONTEXT.md`](./CONTEXT.md) para el glosario del dominio
(Grupo, Participante, Equipo, Partida, Mano, Ranking, Anotador) y
[`docs/adr/`](./docs/adr/) para decisiones de arquitectura ya tomadas.

## Comandos

- `npm run dev` — servidor de desarrollo (Next.js/Turbopack).
- `npm run build` / `npm run start` — build de producción / servirlo.
- `npm run lint` — `next lint`.
- `npm run typecheck` — `tsc --noEmit`.
- `npm test` — `vitest run` (un archivo: `npx vitest run src/domain/grupos.test.ts`;
  un test puntual: agregar `-t "nombre del test"`).
- `npm run test:watch` — vitest en watch mode.
- `npm run db:generate` / `db:migrate` / `db:push` / `db:studio` — Drizzle Kit,
  contra el `DATABASE_URL` que esté activo.
- `npm run seed:usuarios-prueba` — crea 6 usuarios de prueba
  (`jugador1..6@prueba.local`, contraseña `pruebaPrueba123`) vía
  `scripts/seed-usuarios-prueba.ts`.

Los tests de dominio pegan contra **Postgres real** (un branch de test de
Neon, `DATABASE_URL`/`NEON_BRANCH` en `.env.test.local`, separado del
`.env.local` de desarrollo) — no hay mocks de la base. Corren con
`fileParallelism: false` (ver `vitest.config.ts`) porque los fixtures
comparten esa base y se pisarían en paralelo; cada archivo de test crea sus
propios Participantes de prueba en `beforeEach` y los borra en `afterEach`
(ver `src/domain/grupos.test.ts`).

## Arquitectura

- `src/domain/*.ts` (`grupos.ts`, `participantes.ts`, `partidas.ts`) — toda
  la lógica de negocio y las queries de Drizzle. Es la única capa que toca la
  base: páginas y Server Actions llaman siempre a una función de acá, nunca a
  Drizzle directo.
- `src/db/schema.ts` — schema de Drizzle para Neon Postgres
  (`src/db/client.ts` abre un solo `Pool` por proceso, vía
  `@neondatabase/serverless`). `grupo_participante` guarda las estadísticas
  del Ranking (`puntos`, `partidasJugadas`, `partidasGanadas`,
  `partidasGanadasDobles`, `partidasGanadasTriples`, `partidasPerdidas`) —
  ver `CONTEXT.md` (Ranking, Victoria simple/doble/triple) y
  `docs/adr/0002-ranking-sin-umbral-minimo-de-partidas.md` para el modelo.
  `puntos` ya no es 1 fijo por Partida ganada — sale de
  `calcularEstadisticasRanking` (`domain/grupos.ts`), el único lugar que
  calcula `puntos`/`partidasPerdidas` a partir del desglose de victorias.
  `anotarPunto` (cierre de Partida en `partidas.ts`) y
  `actualizarEstadisticas` (corrección manual del admin en `grupos.ts`)
  tienen que pasar por esa función al escribir esos dos campos.
- `src/app/` — Next.js App Router. El route group `(con-navbar)` envuelve
  las pantallas ya rediseñadas con el círculo de perfil flotante
  (`PerfilFlotante`, montado en su `layout.tsx`); `/login` y `/` tienen su
  propio chrome. Cada carpeta de ruta que muta datos tiene su propio
  `actions.ts` de Server Actions (`"use server"`): valida sesión, llama a
  una función de `domain/`, y hace `revalidatePath`. Conviven dos formas: la
  simple de `FormData` sin feedback de error (`sacarMiembroAction`,
  `anotarPuntoAction`) y la de `useActionState`
  `(estadoPrevio, formData) => {message}` cuando hace falta mostrar un error
  inline en el propio formulario (`crearGrupoAction`, `invitarPorEmailAction`,
  `actualizarEstadisticasAction`).
- `src/auth.ts` — Auth.js (`next-auth` v5 beta), providers Google +
  Credentials, `DrizzleAdapter`, sesiones JWT (Credentials no es compatible
  con sesiones de base de datos). `auth()` está envuelto en `cache()` de
  React para que layout + page + action del mismo request compartan un solo
  chequeo de sesión.
- Alias de import `@/*` → `src/*`.

## Convenciones de UI

- Tailwind está clavado en **3.3.2** — utilidades de versiones más nuevas
  (ej. `h-dvh`) no existen ahí; usar el valor arbitrario (`h-[100dvh]`) en
  su lugar.
- Los tokens de tema propios viven en `tailwind.config.js` (`accent`/
  `accent2` con variantes `-soft`/`-dark`, `ink`/`muted`/`line`/`surface`,
  `shadow-pop*`, `font-display`/`font-sans`) — reusar esos en vez de colores/
  sombras de Tailwind sin más.
- `src/components/anotador.tsx` es un sandbox intencionalmente sin usar en
  ninguna ruta, para probar el widget de tally `src/components/fosforos-tally.tsx`
  aislado — no es código huérfano, no borrarlo.

## Agent skills

### Issue tracker

Issues viven como GitHub Issues en `anmedina-arg/anotador-truco-next`, vía
el CLI `gh`. Ver `docs/agents/issue-tracker.md`.

### Triage labels

Vocabulario default (`needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`), sin cambios. Ver `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` en la raíz del repo. Ver
`docs/agents/domain.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
