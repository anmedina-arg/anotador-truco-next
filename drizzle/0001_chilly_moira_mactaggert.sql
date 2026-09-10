CREATE TABLE "grupo_participante" (
	"grupoId" text NOT NULL,
	"participanteId" text NOT NULL,
	"fechaAlta" timestamp DEFAULT now() NOT NULL,
	"puntos" integer DEFAULT 0 NOT NULL,
	"partidasJugadas" integer DEFAULT 0 NOT NULL,
	"partidasGanadas" integer DEFAULT 0 NOT NULL,
	"partidasPerdidas" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "grupo_participante_grupoId_participanteId_pk" PRIMARY KEY("grupoId","participanteId")
);
--> statement-breakpoint
CREATE TABLE "grupo" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"adminParticipanteId" text NOT NULL,
	"codigoInvitacion" text NOT NULL,
	"creadoEn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "grupo_codigoInvitacion_unique" UNIQUE("codigoInvitacion")
);
--> statement-breakpoint
ALTER TABLE "grupo_participante" ADD CONSTRAINT "grupo_participante_grupoId_grupo_id_fk" FOREIGN KEY ("grupoId") REFERENCES "public"."grupo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupo_participante" ADD CONSTRAINT "grupo_participante_participanteId_user_id_fk" FOREIGN KEY ("participanteId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupo" ADD CONSTRAINT "grupo_adminParticipanteId_user_id_fk" FOREIGN KEY ("adminParticipanteId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;