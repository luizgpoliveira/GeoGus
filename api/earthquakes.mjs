import { getEarthquakeFeed } from '../server/earthquakes.mjs';

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Método não permitido.', quakes: [] });
  }
  const url = new URL(req.url, 'https://geogus.invalid');
  const period = req.query?.period || url.searchParams.get('period') || 'day';
  const minMag = req.query?.minMag || url.searchParams.get('minMag') || '1';
  try {
    const data = await getEarthquakeFeed(period, minMag);
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=30');
    res.setHeader('X-GeoGus-Source', data.source || 'nenhuma fonte');
    res.setHeader('X-GeoGus-Stale', data.stale ? '1' : '0');
    return res.status(data.ok ? 200 : 503).json(data);
  } catch (error) {
    return res.status(502).json({ ok: false, error: String(error?.message || error), quakes: [], count: 0 });
  }
}
