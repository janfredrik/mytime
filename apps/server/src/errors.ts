export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const notFound = (message = 'Ikke funnet') => new HttpError(404, message);
