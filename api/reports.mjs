import { getReports } from '../server/reports.mjs';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }
  try {
    const force = req.query?.force === '1' || new URL(req.url, 'https://geogus.invalid').searchParams.get('force') === '1';
    const data = await getReports(force);
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=180');
    return res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: String(error?.message || error).slice(0, 500),
      items: [],
      updates: [],
      sources: [],
    });
  }
}
