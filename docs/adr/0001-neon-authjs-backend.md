# Backend: Neon (Postgres) + Auth.js, sin servicios externos de auth/storage

Supabase quedó descartado porque el límite de 2 proyectos activos free es por
cuenta (aplica en todas las organizaciones donde se es Owner/Admin, no se
esquiva creando una organización nueva). Se evaluaron Firebase, Turso y
Neon. Firebase se descartó porque su modelo NoSQL (Firestore) hubiera
requerido rediseñar las 5 tablas relacionales ya definidas (`grupo`,
`participante`, `grupo_participante`, `partida`, `partida_participante`) como
documentos, perdiendo los joins y claves compuestas del diseño actual. Se
eligió Neon (Postgres serverless, free tier sin el límite de proyectos que
afectó a Supabase) por mantener el mismo motor relacional sin rediseño, y
Auth.js (en vez de un proveedor externo como Clerk) porque corre dentro de la
propia app Next.js sin depender de un límite de usuarios activos de un
tercero, para login con email+contraseña y Google.

No se necesita Storage (la app no maneja archivos) ni tiempo real
(el ranking se actualiza al refrescar, no en vivo), así que ninguno de esos
dos factores entró en la decisión.

Al crear el proyecto en Neon (2026-09-09) apareció **Neon Auth** (Managed
Better Auth) como servicio propio de Neon, gratis en beta hasta 60k MAU. Se
descartó a favor de Auth.js por el mismo motivo de fondo: es un servicio en
beta, no feature-complete, cuyas reglas/límites pueden cambiar cuando salga
de beta — el riesgo que el ADR ya buscaba evitar con un proveedor externo.
