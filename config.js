// Runtime configuration for the browser client. Hosting injects CAREERIQ_API_URL before modules load.
const environment = globalThis.process?.env || {};

export const API_BASE_URL = (environment.CAREERIQ_API_URL || '/api/v1').replace(/\/$/, '');
