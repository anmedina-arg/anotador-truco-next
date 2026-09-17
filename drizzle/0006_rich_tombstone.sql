CREATE TABLE "pica_pica_pareja" (
	"partidaId" text NOT NULL,
	"posicion" integer NOT NULL,
	"jugadorEquipo1Id" text NOT NULL,
	"jugadorEquipo2Id" text NOT NULL,
	CONSTRAINT "pica_pica_pareja_partidaId_posicion_pk" PRIMARY KEY("partidaId","posicion"),
	CONSTRAINT "posicion_valida" CHECK ("pica_pica_pareja"."posicion" IN (1, 2, 3))
);
--> statement-breakpoint
ALTER TABLE "pica_pica_pareja" ADD CONSTRAINT "pica_pica_pareja_partidaId_partida_id_fk" FOREIGN KEY ("partidaId") REFERENCES "public"."partida"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pica_pica_pareja" ADD CONSTRAINT "pica_pica_pareja_jugadorEquipo1Id_user_id_fk" FOREIGN KEY ("jugadorEquipo1Id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pica_pica_pareja" ADD CONSTRAINT "pica_pica_pareja_jugadorEquipo2Id_user_id_fk" FOREIGN KEY ("jugadorEquipo2Id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;