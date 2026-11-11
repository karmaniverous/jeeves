import { describe, expect, it } from 'vitest';

import { errorBodySchema } from '../catalog/errorBody.js';
import {
  errorBody,
  JEEVES_RESPONSE_VALIDATION,
  SERVER_ERROR_MESSAGE,
} from './errorBody.js';

describe('errorBody', () => {
  it('builds Fastify’s body with the standard status text', () => {
    expect(errorBody(409, 'Job j1 exists', 'RUNNER_JOB_EXISTS')).toEqual({
      statusCode: 409,
      code: 'RUNNER_JOB_EXISTS',
      error: 'Conflict',
      message: 'Job j1 exists',
    });
  });

  it('omits an undefined code (no undefined key)', () => {
    const body = errorBody(404, 'gone');
    expect(body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'gone',
    });
    expect(Object.keys(body)).toEqual(['statusCode', 'error', 'message']);
  });

  it('keeps an empty code', () => {
    expect(errorBody(400, 'm', '')).toEqual({
      statusCode: 400,
      code: '',
      error: 'Bad Request',
      message: 'm',
    });
  });

  it("uses 'Error' for a status without standard text", () => {
    expect(errorBody(599, 'm')).toEqual({
      statusCode: 599,
      error: 'Error',
      message: 'm',
    });
  });

  it('matches errorBodySchema', () => {
    const body = errorBody(
      500,
      SERVER_ERROR_MESSAGE,
      JEEVES_RESPONSE_VALIDATION,
    );
    expect(errorBodySchema.parse(body)).toEqual(body);
  });

  it('exports stable constants', () => {
    expect(JEEVES_RESPONSE_VALIDATION).toBe('JEEVES_RESPONSE_VALIDATION');
    expect(SERVER_ERROR_MESSAGE).toBe(
      'The server could not complete the request.',
    );
  });
});
