import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientValidationError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(
    exception:
      | Prisma.PrismaClientKnownRequestError
      | Prisma.PrismaClientValidationError,
    host: ArgumentsHost,
  ) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return res
            .status(HttpStatus.CONFLICT)
            .json({ statusCode: 409, message: 'Resource already exists' });
        case 'P2025':
          return res
            .status(HttpStatus.NOT_FOUND)
            .json({ statusCode: 404, message: 'Resource not found' });
        case 'P2003':
          return res
            .status(HttpStatus.BAD_REQUEST)
            .json({ statusCode: 400, message: 'Related resource not found' });
        default:
          this.logger.error(
            `Unhandled Prisma error ${exception.code}`,
            exception.message,
          );
          return res
            .status(HttpStatus.INTERNAL_SERVER_ERROR)
            .json({ statusCode: 500, message: 'Database error' });
      }
    }

    this.logger.error('Prisma validation error', exception.message);
    return res
      .status(HttpStatus.BAD_REQUEST)
      .json({ statusCode: 400, message: 'Invalid data' });
  }
}
