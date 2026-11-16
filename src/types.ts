export type VolcanoStatus = 'ERUPCAO' | 'RECENTE' | 'ATIVO' | 'DORMENTE' | 'EXTINTO' | 'INDEFINIDO';

/** Alerta oficial de observatório nacional (fonte, nível e data do último boletim). */
export interface AlertInfo {
  source: 'PHIVOLCS' | 'PVMBG' | 'USGS';
  level: number | string; // PHIVOLCS/PVMBG 0–5/1–4; USGS NORMAL|ADVISORY|WATCH|WARNING
  colorCode?: string;     // código de cor de aviação (USGS)
  noticeTime?: string;    // data do boletim (PHIVOLCS/PVMBG) ou sent_utc (USGS)
  details?: string;       // resumo do boletim (sismicidade, SO₂, pluma)
}

export interface Volcano {
  vn: number; // VolcanoNumber GVP
  name: string;
  country: string;
  type: string;
  lastEruption: number | null;
  elevation: number | null;
  lat: number;
  lon: number;
  status: VolcanoStatus;
  holocene: boolean; // pertence ao catálogo Holoceno (senão = Pleistoceno)
  remarks?: string;
  alertInfo?: AlertInfo;
  /** Tipos de atividade identificados nos relatórios recentes (48 h). */
  activity?: string[];
  pop?: { p5?: number | null; p10?: number | null; p30?: number | null; p100?: number | null };
  image?: { file?: string; caption?: string; credit?: string };
}

/** Item de relatório da Central de Inteligência (boletim oficial ou notícia). */
export interface ReportItem {
  id: string;
  ts: number;
  date?: string;
  source: string;
  kind: 'OFICIAL' | 'NOTICIA';
  verified: 'CONFIRMADO' | 'REPORTADO' | 'NAO_CONFIRMADO';
  title: string;
  url?: string;
  volcanoVn?: number | null;
  volcanoName?: string | null;
  country?: string | null;
  text?: string;
  cats: string[];
  ashKm?: number | null;
  period?: string;
}

/** Resposta de /api/reports (central de inteligência). */
export interface ReportsPayload {
  ok: boolean;
  stamp: string;
  total: number;
  window48: number;
  added: number;
  erupting: string[];
  byCat: Record<string, string[]>;
  ash: string[];
  panorama: { ai: boolean; gerado: string; oficials: number; noticias: number; text: string };
  sources: Array<{ id: string; label: string; ok: boolean; stale?: boolean; stamp: number; errors: string[] }>;
  items: ReportItem[];
}

export interface Quake {
  id: string;
  mag: number;
  magType: string;
  place: string;
  time: number;
  updated: number;
  lat: number;
  lon: number;
  depthKm: number;
  url: string;
  source: 'USGS' | 'EMSC';
  status: string;
  alert: string | null;
  felt: number | null;
  tsunami: number;
}

export interface NotifEntry {
  key: string;
  kind: 'quake' | 'eruption' | 'sistema';
  title: string;
  body: string;
  time: number;
  url?: string;
}

export interface SourceInfo {
  id: string;
  label: string;
  ok: boolean;
  stale?: boolean;
  updated: number | null;
  error?: string;
}

export type Period = 'day' | 'week' | 'month';

export interface Settings {
  minMag: number;
  alertMag: number; // magnitude mínima para gerar alerta/notificação
  period: Period;
  country: string; // filtro de país (vulcões/terremotos)
  volcanoFilter: 'all' | 'active' | 'inactive' | 'erupting';
  showQuakes: boolean;
  showVolcanoes: boolean;
  quakeAlerts: boolean;
  eruptionAlerts: boolean;
  browserNotifs: boolean;
}
