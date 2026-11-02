"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.databaseConfig = void 0;
const index_1 = require("./index");
exports.databaseConfig = {
    url: index_1.config.database.url,
    poolMin: index_1.config.database.poolMin,
    poolMax: index_1.config.database.poolMax,
};
