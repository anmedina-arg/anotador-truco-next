ALTER TABLE "grupo" DROP CONSTRAINT "grupo_adminParticipanteId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "grupo" ADD CONSTRAINT "grupo_adminParticipanteId_user_id_fk" FOREIGN KEY ("adminParticipanteId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;