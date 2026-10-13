import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { databaseOptions } from './database';

/** Used by the TypeORM CLI (npm run migration:run / migration:generate). */
export default new DataSource({
  ...databaseOptions(),
  migrations: ['libs/common/src/migrations/*.ts'],
});
