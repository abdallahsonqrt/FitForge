import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: unknown = 'Internal server error';

    if (exception instanceof ZodValidationException) {
      // Checked *before* HttpException, not after. `ZodValidationException`
      // extends `BadRequestException` extends `HttpException`, so while this
      // branch sat second it was unreachable — every field error collapsed into
      // the single string "Validation failed" and the client had nothing to
      // point at a specific input.
      status = HttpStatus.BAD_REQUEST;
      message = exception.getZodError().issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as { message?: unknown }).message ?? exceptionResponse;
    } else {
      /**
       * Anything reaching here is a bug or an infrastructure failure, and its
       * message is written for whoever maintains the server — not for whoever is
       * looking at a login screen.
       *
       * This branch used to return `exception.message`, which put raw driver text
       * ("value too long for type character varying(255)") into the API response,
       * and from there straight into the app's red error banner. The detail now
       * goes to the log; the caller gets a constant.
       */
      this.logger.error(
        `Unhandled ${exception instanceof Error ? exception.name : typeof exception} ` +
          `on ${request?.method} ${request?.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      meta: {
        success: false,
        timestamp: new Date().toISOString(),
        error: message,
      },
      data: null,
    });
  }
}
