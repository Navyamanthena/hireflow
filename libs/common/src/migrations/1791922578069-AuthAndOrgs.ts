import { MigrationInterface, QueryRunner } from "typeorm";

export class AuthAndOrgs1791922578069 implements MigrationInterface {
    name = 'AuthAndOrgs1791922578069'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "organizations" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying(200) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6b031fcd0863e3f6b44230163f9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'recruiter')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "org_id" uuid NOT NULL, "email" character varying(320) NOT NULL, "name" character varying(200) NOT NULL, "password_hash" character varying(300) NOT NULL, "role" "public"."users_role_enum" NOT NULL DEFAULT 'recruiter', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_users_email" ON "users" ("email") `);
        // Existing jobs predate organizations: park them in one "Legacy data"
        // org (only created if needed) so the column can become NOT NULL.
        await queryRunner.query(`ALTER TABLE "jobs" ADD "org_id" uuid`);
        await queryRunner.query(`
            WITH legacy AS (
                INSERT INTO "organizations" ("name")
                SELECT 'Legacy data' WHERE EXISTS (SELECT 1 FROM "jobs")
                RETURNING "id"
            )
            UPDATE "jobs" SET "org_id" = (SELECT "id" FROM legacy) WHERE "org_id" IS NULL`);
        await queryRunner.query(`ALTER TABLE "jobs" ALTER COLUMN "org_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "stage_events" ADD "user_id" uuid`);
        await queryRunner.query(`CREATE INDEX "idx_jobs_org_created" ON "jobs" ("org_id", "created_at") `);
        await queryRunner.query(`ALTER TABLE "jobs" ADD CONSTRAINT "FK_658a4a5c43bbc0ed322be2bea73" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_0a13270cd3101fd16b8000e00d4" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_0a13270cd3101fd16b8000e00d4"`);
        await queryRunner.query(`ALTER TABLE "jobs" DROP CONSTRAINT "FK_658a4a5c43bbc0ed322be2bea73"`);
        await queryRunner.query(`DROP INDEX "public"."idx_jobs_org_created"`);
        await queryRunner.query(`ALTER TABLE "stage_events" DROP COLUMN "user_id"`);
        await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "org_id"`);
        await queryRunner.query(`DROP INDEX "public"."uq_users_email"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`DROP TABLE "organizations"`);
    }

}
