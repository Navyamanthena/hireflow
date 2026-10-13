import { MigrationInterface, QueryRunner } from "typeorm";

export class ReliableScoring1791920662003 implements MigrationInterface {
    name = 'ReliableScoring1791920662003'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "outbox_events" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "type" character varying(64) NOT NULL, "payload" jsonb NOT NULL, "attempts" integer NOT NULL DEFAULT '0', "last_error" text, "published_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6689a16c00d09b8089f6237f1d2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_outbox_unpublished" ON "outbox_events" ("created_at") WHERE "published_at" IS NULL`);
        await queryRunner.query(`ALTER TABLE "candidates" ADD "scoring_version" integer NOT NULL DEFAULT '1'`);
        await queryRunner.query(`ALTER TABLE "candidates" ADD "scored_by" character varying(120)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "candidates" DROP COLUMN "scored_by"`);
        await queryRunner.query(`ALTER TABLE "candidates" DROP COLUMN "scoring_version"`);
        await queryRunner.query(`DROP INDEX "public"."idx_outbox_unpublished"`);
        await queryRunner.query(`DROP TABLE "outbox_events"`);
    }

}
