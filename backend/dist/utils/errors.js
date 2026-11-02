"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotFoundError = exports.AppError = void 0;
class AppError extends Error {
    constructor(message, code = 'INTERNAL_ERROR', status = 500, details) {
        super(message);
        // Extending Error leaves name as 'Error', so every application error would
        // otherwise be logged as a generic one. new.target gives subclasses their
        // own name rather than all of them reporting 'AppError'.
        this.name = new.target.name;
        this.code = code;
        this.status = status;
        this.details = details;
    }
}
exports.AppError = AppError;
class NotFoundError extends AppError {
    constructor(message = 'Not found', details) {
        super(message, 'NOT_FOUND', 404, details);
    }
}
exports.NotFoundError = NotFoundError;
