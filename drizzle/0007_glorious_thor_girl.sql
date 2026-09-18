CREATE TABLE "pica_pica_mano" (
	"id" text PRIMARY KEY NOT NULL,
	"partidaId" text NOT NULL,
	"jugadorAId" text NOT NULL,
	"jugadorBId" text NOT NULL,
	"deltaJugadorA" integer NOT NULL,
	"deltaJugadorB" integer NOT NULL,
	"creadaEn" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pica_pica_mano" ADD CONSTRAINT "pica_pica_mano_partidaId_partida_id_fk" FOREIGN KEY ("partidaId") REFERENCES "public"."partida"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pica_pica_mano" ADD CONSTRAINT "pica_pica_mano_jugadorAId_user_id_fk" FOREIGN KEY ("jugadorAId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pica_pica_mano" ADD CONSTRAINT "pica_pica_mano_jugadorBId_user_id_fk" FOREIGN KEY ("jugadorBId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;