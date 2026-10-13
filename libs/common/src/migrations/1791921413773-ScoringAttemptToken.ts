import { MigrationInterface, QueryRunner } from "typeorm";

export class ScoringAttemptToken1791921413773 implements MigrationInterface {
    name = 'ScoringAttemptToken1791921413773'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "candidates" ADD "scoring_attempt" uuid`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "candidates" DROP COLUMN "scoring_attempt"`);
    }

}
