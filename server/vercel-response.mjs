export function methodNotAllowed(res, allowed = 'GET') {
  res.setHeader('Allow', allowed);
  return res.status(405).json({ ok: false, error: 'Método não permitido.' });
}

export function sendSourceResult(res, result, source) {
  const body = result?.body ?? result ?? {};
  const updatedAt = result?.updatedAt ?? body?.updatedAt ?? Date.now();
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  if (result?.stale || body?.stale) res.setHeader('X-GeoGus-Cache', 'STALE');
  return res.status(200).json({
    ...body,
    stamp: new Date(updatedAt).toISOString(),
    stale: !!(result?.stale || body?.stale),
    cacheAgeMs: result?.cacheAgeMs ?? body?.cacheAgeMs ?? 0,
    source,
  });
}

export function sendSourceError(res, source, error) {
  const message = String(error?.message || error || 'Falha desconhecida').slice(0, 500);
  return res.status(502).json({ ok: false, source, error: message, items: [], levels: {} });
}
