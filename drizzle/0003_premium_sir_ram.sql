CREATE TYPE "public"."estado_partida" AS ENUM('en_curso', 'finalizada', 'cancelada');--> statement-breakpoint
CREATE TABLE "partida_participante" (
	"partidaId" text NOT NULL,
	"participanteId" text NOT NULL,
	"equipoNumero" integer NOT NULL,
	CONSTRAINT "partida_participante_partidaId_participanteId_pk" PRIMARY KEY("partidaId","participanteId"),
	CONSTRAINT "equipo_numero_valido" CHECK ("partida_participante"."equipoNumero" IN (1, 2))
);
--> statement-breakpoint
CREATE TABLE "partida" (
	"id" text PRIMARY KEY NOT NULL,
	"grupoId" text NOT NULL,
	"anotadorParticipanteId" text NOT NULL,
	"estado" "estado_partida" DEFAULT 'en_curso' NOT NULL,
	"equipo1Puntos" integer DEFAULT 0 NOT NULL,
	"equipo2Puntos" integer DEFAULT 0 NOT NULL,
	"equipoGanador" integer,
	"fechaInicio" timestamp DEFAULT now() NOT NULL,
	"fechaFin" timestamp,
	CONSTRAINT "equipo1_puntos_rango" CHECK ("partida"."equipo1Puntos" BETWEEN 0 AND 30),
	CONSTRAINT "equipo2_puntos_rango" CHECK ("partida"."equipo2Puntos" BETWEEN 0 AND 30),
	CONSTRAINT "equipo_ganador_valido" CHECK ("partida"."equipoGanador" IN (1, 2))
);
--> statement-breakpoint
ALTER TABLE "partida_participante" ADD CONSTRAINT "partida_participante_partidaId_partida_id_fk" FOREIGN KEY ("partidaId") REFERENCES "public"."partida"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partida_participante" ADD CONSTRAINT "partida_participante_participanteId_user_id_fk" FOREIGN KEY ("participanteId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partida" ADD CONSTRAINT "partida_grupoId_grupo_id_fk" FOREIGN KEY ("grupoId") REFERENCES "public"."grupo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partida" ADD CONSTRAINT "partida_anotadorParticipanteId_user_id_fk" FOREIGN KEY ("anotadorParticipanteId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;