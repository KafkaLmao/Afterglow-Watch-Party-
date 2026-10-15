import { anikoto, anikotoFailure } from '../../../../../lib/anikoto.mjs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    return await anikoto.relay(
      params.get('url'),
      params.get('path') || '',
      params.get('track') ?? undefined,
      request.headers.get('range') || undefined,
      request.signal,
    );
  } catch (error) {
    return anikotoFailure(error);
  }
}
