export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export type ApiErrorEnvelope = { code?: string; message?: string };

export function toHttpError(
  envelope: ApiErrorEnvelope | undefined,
  response: { status: number },
  fallbackMessage = 'Request failed',
): HttpError {
  return new HttpError(
    response.status,
    envelope?.code ?? 'http_error',
    envelope?.message && envelope.message.length > 0 ? envelope.message : fallbackMessage,
  );
}
