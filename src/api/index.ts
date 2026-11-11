/**
 * API handler utilities for Jeeves components.
 *
 * @packageDocumentation
 */

export {
  type ConfigApplyHandler,
  type ConfigApplyRequest,
  type ConfigApplyResult,
  createConfigApplyHandler,
  JEEVES_CONFIG_INVALID,
} from './configApplyHandler.js';
export {
  type ConfigQueryHandler,
  type ConfigQueryResponse,
  createConfigQueryHandler,
  JEEVES_CONFIG_QUERY_INVALID,
} from './configQuery.js';
export {
  errorBody,
  JEEVES_RESPONSE_VALIDATION,
  SERVER_ERROR_MESSAGE,
} from './errorBody.js';
export {
  createStatusHandler,
  type CreateStatusHandlerOptions,
  type StatusHandler,
  type StatusHandlerResult,
  type StatusResponse,
} from './statusHandler.js';
