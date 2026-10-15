import { anikoto, anikotoFailure } from '../../../../lib/anikoto.mjs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const result = await anikoto.describe(
      params.get('url'),
      params.get('refresh') === '1',
    );
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return anikotoFailure(error);
  }
}
