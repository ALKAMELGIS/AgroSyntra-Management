"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = validate;
const zod_1 = require("zod");
const errors_1 = require("../../utils/errors");
function validate(schemas) {
    return (req, _res, next) => {
        try {
            if (schemas.params) {
                req.params = schemas.params.parse(req.params);
            }
            if (schemas.query) {
                req.query = schemas.query.parse(req.query);
            }
            if (schemas.body) {
                req.body = schemas.body.parse(req.body);
            }
            next();
        }
        catch (error) {
            if (error instanceof zod_1.ZodError) {
                return next(new errors_1.AppError('Validation failed', 'VALIDATION_ERROR', 400, {
                    issues: error.issues,
                }));
            }
            next(error);
        }
    };
}
