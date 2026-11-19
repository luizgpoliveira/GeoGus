import type { Volcano } from './types';

const DAY_MS = 24 * 60 * 60_000;
const MAX_FUTURE_SKEW_MS = 60_000;

type BulletinLike = {
  source?: unknown;
  kind?: unknown;
  verified?: unknown;
  volcanoName?: unknown;
  ts?: unknown;
  date?: unknown;
  text?: unknown;
};

function normalizeVolcanoName(value: unknown): string {
  return String(value ?? '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function volcanoNameAliases(value: unknown): Set<string> {
  const normalized = normalizeVolcanoName(value);
  return new Set([
    normalized,
    normalized.replace(/^anak/, ''),
    normalized.replace(/lakilaki$/, ''),
    normalized.replace(/^anak/, '').replace(/lakilaki$/, ''),
  ].filter(Boolean));
}

/**
 * Obtém o boletim oficial PVMBG mais recente associado ao nome do vulcão.
 * O horário é o do boletim, nunca o `stamp` de coleta da API.
 */
export function latestOfficialPvmbgBulletin(items: unknown, volcanoName: string): { noticeTime: string; details?: string } | null {
  if (!Array.isArray(items)) return null;
  const aliases = volcanoNameAliases(volcanoName);
  const candidates = (items as BulletinLike[]).flatMap((item) => {
    if (item?.source !== 'PVMBG' || item?.kind !== 'OFICIAL' || item?.verified !== 'CONFIRMADO') return [];
    const itemAliases = volcanoNameAliases(item?.volcanoName);
    if (![...itemAliases].some((alias) => aliases.has(alias))) return [];
    const numericTs = Number(item?.ts);
    const parsedDate = typeof item?.date === 'string' ? Date.parse(item.date) : NaN;
    const ts = Number.isFinite(numericTs) && numericTs > 0 ? numericTs : parsedDate;
    if (!Number.isFinite(ts) || ts <= 0) return [];
    return [{ item, ts }];
  }).sort((a, b) => b.ts - a.ts);

  const latest = candidates[0];
  if (!latest) return null;
  return {
    noticeTime: new Date(latest.ts).toISOString(),
    details: latest.item.text ? String(latest.item.text).slice(0, 500) : undefined,
  };
}

/**
 * O ícone pulsa para qualquer nível de risco com evidência datada nas
 * últimas 24 horas, independentemente da região ou da fonte (USGS,
 * PHIVOLCS, PVMBG, GVP ou boletim oficial), ou enquanto o GVP mantiver
 * uma erupção aberta/contínua ou um alerta oficial elevado atual sem data
 * explícita. `risk.pulse` é apenas um sinal derivado e não pode bloquear uma
 * evidência recente válida de outra fonte.
 * Status geológico ATIVO, por si só, não ativa animação.
 */
export function shouldPulseVolcano(volcano: Pick<Volcano, 'risk'>, reference = Date.now()): boolean {
  const risk = volcano.risk;
  if (!risk || risk.rank <= 0) return false;
  if (risk.continuing === true) return true;

  const at = Number(risk.activityAt);
  const recent = Number.isFinite(at)
    && at >= reference - DAY_MS
    && at <= reference + MAX_FUTURE_SKEW_MS;

  // Revalida a janela temporal diretamente no marcador. Não exigir também
  // `risk.pulse`: alguns adaptadores regionais entregam uma data oficial
  // válida, mas o booleano derivado pode chegar atrasado/desatualizado.
  // A data da ocorrência continua obrigatória; não usar updatedAt/collection.
  return recent;
}
