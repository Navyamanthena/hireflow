import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1760000000000 implements MigrationInterface {
    name = 'InitialSchema1760000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."candidates_stage_enum" AS ENUM('APPLIED', 'NEEDS_REVIEW', 'SCREENED', 'PHONE_SCREEN', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED')`);
        await queryRunner.query(`CREATE TYPE "public"."candidates_scoring_status_enum" AS ENUM('PENDING', 'PROCESSING', 'SCORED', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "candidates" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "job_id" uuid NOT NULL, "name" character varying(200) NOT NULL, "email" character varying(320), "resume_text" text NOT NULL, "stage" "public"."candidates_stage_enum" NOT NULL DEFAULT 'APPLIED', "scoring_status" "public"."candidates_scoring_status_enum" NOT NULL DEFAULT 'PENDING', "score" integer, "analysis" jsonb, "outreach_draft" text, "scoring_error" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_140681296bf033ab1eb95288abb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_candidates_job_score" ON "candidates" ("job_id", "score") `);
        await queryRunner.query(`CREATE INDEX "idx_candidates_job_stage" ON "candidates" ("job_id", "stage") `);
        await queryRunner.query(`CREATE TABLE "jobs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "title" character varying(200) NOT NULL, "description" text NOT NULL, "advance_threshold" integer NOT NULL DEFAULT '80', "review_threshold" integer NOT NULL DEFAULT '50', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_cf0a6c42b72fcc7f7c237def345" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."stage_events_from_stage_enum" AS ENUM('APPLIED', 'NEEDS_REVIEW', 'SCREENED', 'PHONE_SCREEN', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED')`);
        await queryRunner.query(`CREATE TYPE "public"."stage_events_to_stage_enum" AS ENUM('APPLIED', 'NEEDS_REVIEW', 'SCREENED', 'PHONE_SCREEN', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED')`);
        await queryRunner.query(`CREATE TABLE "stage_events" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "candidate_id" uuid NOT NULL, "from_stage" "public"."stage_events_from_stage_enum", "to_stage" "public"."stage_events_to_stage_enum" NOT NULL, "actor" character varying(16) NOT NULL, "reason" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_5be521e4d264702d8cd4301f28e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_stage_events_candidate_created" ON "stage_events" ("candidate_id", "created_at") `);
        await queryRunner.query(`ALTER TABLE "candidates" ADD CONSTRAINT "FK_228fd4c33ad8656273641fcafcc" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "stage_events" ADD CONSTRAINT "FK_01e436774970d58cabb36dff83b" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "stage_events" DROP CONSTRAINT "FK_01e436774970d58cabb36dff83b"`);
        await queryRunner.query(`ALTER TABLE "candidates" DROP CONSTRAINT "FK_228fd4c33ad8656273641fcafcc"`);
        await queryRunner.query(`DROP INDEX "public"."idx_stage_events_candidate_created"`);
        await queryRunner.query(`DROP TABLE "stage_events"`);
        await queryRunner.query(`DROP TYPE "public"."stage_events_to_stage_enum"`);
        await queryRunner.query(`DROP TYPE "public"."stage_events_from_stage_enum"`);
        await queryRunner.query(`DROP TABLE "jobs"`);
        await queryRunner.query(`DROP INDEX "public"."idx_candidates_job_stage"`);
        await queryRunner.query(`DROP INDEX "public"."idx_candidates_job_score"`);
        await queryRunner.query(`DROP TABLE "candidates"`);
        await queryRunner.query(`DROP TYPE "public"."candidates_scoring_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."candidates_stage_enum"`);
    }

}
