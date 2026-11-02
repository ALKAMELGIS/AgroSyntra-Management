import { config } from './index';

export const databaseConfig = {
  url: config.database.url,
  poolMin: config.database.poolMin,
  poolMax: config.database.poolMax,
};
