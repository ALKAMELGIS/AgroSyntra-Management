import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodSchema } from 'zod';
import { AppError } from '../../utils/errors';

type SchemaGroup = {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
};

export function validate(schemas: SchemaGroup) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as typeof req.query;
      }
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(
          new AppError('Validation failed', 'VALIDATION_ERROR', 400, {
            issues: error.issues,
          })
        );
      }
      next(error);
    }
  };
}
