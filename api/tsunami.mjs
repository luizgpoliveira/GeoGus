import { getTsunamiAlerts } from '../server/tsunami.mjs';

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  try {
    const data = await getTsunamiAlerts(req.query?.force === '1');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(data.ok ? 200 : 503).json(data);
  } catch (error) {
    return res.status(502).json({ ok: false, error: String(error?.message || error), alerts: [], sources: [] });
  }
}
