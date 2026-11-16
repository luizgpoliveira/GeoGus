import { getUsgsStatus } from '../server/reports.mjs';
import { methodNotAllowed, sendSourceResult, sendSourceError } from '../server/vercel-response.mjs';

export const config = { maxDuration: 20 };

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res);
  try {
    const result = await getUsgsStatus();
    if (!result?.body?.ok && !result?.body?.levels) {
      return sendSourceError(res, 'USGS HANS', result?.body?.errors?.join('; ') || 'Resposta sem níveis reconhecidos');
    }
    return sendSourceResult(res, result, 'USGS HANS');
  } catch (error) {
    return sendSourceError(res, 'USGS HANS', error);
  }
}
