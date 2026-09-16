CREATE TYPE "public"."tipo_de_bloque" AS ENUM('ronda', 'pica_pica');--> statement-breakpoint
ALTER TABLE "grupo" ADD COLUMN "umbralInicioPicaPica" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "grupo" ADD COLUMN "umbralFinPicaPica" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "grupo" ADD COLUMN "ventanaInactividadSegundos" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "partida" ADD COLUMN "tipoDeBloqueActual" "tipo_de_bloque" DEFAULT 'ronda' NOT NULL;--> statement-breakpoint
ALTER TABLE "partida" ADD COLUMN "manosJugadasEnBloqueActual" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "partida" ADD COLUMN "ultimoPuntoAnotadoEn" timestamp;