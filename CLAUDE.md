# anotador-truco

Anotador de partidas de truco por grupos, con historial y ranking por
jugador. Ver [`CONTEXT.md`](./CONTEXT.md) para el glosario del dominio
(Grupo, Participante, Equipo, Partida, Mano, Ranking, Anotador) y
[`docs/adr/`](./docs/adr/) para decisiones de arquitectura ya tomadas.

## Estado actual

Solo existe el scaffold original de `create-next-app` más un componente de
prueba (`src/components/anotador.tsx`, el contador 0-30 malas/buenas). Sin
backend, sin auth, sin las tablas de `docs/adr/0001-neon-authjs-backend.md`
implementadas todavía.

## Stack decidido (a implementar)

Next.js + TypeScript + Tailwind, PWA instalable (sin soporte offline) +
Neon (Postgres) + Auth.js (Google y email/contraseña) — ver el ADR para el
porqué.

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
