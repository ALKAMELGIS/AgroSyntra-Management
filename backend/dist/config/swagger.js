"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.swaggerSpec = void 0;
const swagger_jsdoc_1 = __importDefault(require("swagger-jsdoc"));
const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Al Maha Farm API',
            version: '1.0.0',
            description: `
## Farm Management System API

This API provides endpoints for managing:
- **Authentication** - User registration, login, and JWT tokens
- **Users** - User management and role assignments
- **Harvests** - Harvest data entry and reporting
- **Fertigation** - Fertigation schedules and recipes
- **EC/pH** - EC and pH readings management
- **Fields** - Field configuration and crop management
- **Master Data** - Countries, sites, farm areas, crops

### Authentication
Most endpoints require a valid JWT token. Include it in the Authorization header:
\`\`\`
Authorization: Bearer <your-token>
\`\`\`

### Rate Limiting
API requests are rate-limited to prevent abuse. If you receive a 429 error, wait before retrying.
      `,
            contact: {
                name: 'Al Maha Farm Support',
            },
        },
        servers: [
            {
                url: '/api/v1',
                description: 'API v1',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
            schemas: {
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        email: { type: 'string', format: 'email' },
                        name: { type: 'string' },
                        role: {
                            type: 'string',
                            enum: ['ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker']
                        },
                        isActive: { type: 'boolean' },
                        createdAt: { type: 'string', format: 'date-time' },
                    },
                },
                AuthTokens: {
                    type: 'object',
                    properties: {
                        accessToken: { type: 'string' },
                        refreshToken: { type: 'string' },
                    },
                },
                Error: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        error: {
                            type: 'object',
                            properties: {
                                code: { type: 'string' },
                                message: { type: 'string' },
                            },
                        },
                    },
                },
                Harvest: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        fieldId: { type: 'string', format: 'uuid' },
                        date: { type: 'string', format: 'date' },
                        totalQuantity: { type: 'number' },
                        notes: { type: 'string' },
                        varieties: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    variety: { type: 'string' },
                                    quantity: { type: 'number' },
                                    grade: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                Field: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        name: { type: 'string' },
                        farmAreaId: { type: 'string', format: 'uuid' },
                        fieldTypeId: { type: 'string', format: 'uuid' },
                        currentCropId: { type: 'string', format: 'uuid' },
                        valveCount: { type: 'integer' },
                        area: { type: 'number' },
                    },
                },
                Recipe: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        name: { type: 'string' },
                        description: { type: 'string' },
                        tankVolume: { type: 'number' },
                        cycles: { type: 'integer' },
                        fertilizers: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string' },
                                    dose: { type: 'number' },
                                    kgPerLiter: { type: 'number' },
                                },
                            },
                        },
                    },
                },
            },
        },
        security: [{ bearerAuth: [] }],
    },
    apis: ['./src/api/v1/*.ts', './src/api/v1/**/*.ts'],
};
exports.swaggerSpec = (0, swagger_jsdoc_1.default)(options);
