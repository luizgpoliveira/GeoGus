export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    service: 'GeoGus Vercel API',
    runtime: 'vercel-function-nodejs',
    time: new Date().toISOString(),
  });
}
