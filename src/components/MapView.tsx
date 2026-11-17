import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import type { Quake, Volcano, Settings } from '../types';
import { useI18n } from '../i18n';
import { commonsImage, GVP_IMAGE_URL } from '../api';
import { HISTORICAL_GEOLOGY, type HistoricalGeologyFeature } from '../historicalGeology';
import { SUPER_VOLCANOES, SUPER_VOLCANO_IDS } from '../supervolcanoes';

export const STATUS_META: Record<string, { color: string }> = {
  ERUPCAO: { color: '#ff3b30' },
  RECENTE: { color: '#a78bfa' },
  ATIVO: { color: '#ff9f0a' },
  DORMENTE: { color: '#ffd60a' },
  EXTINTO: { color: '#8e8e93' },
  INDEFINIDO: { color: '#5e5ce6' },
};

const magColor = (m: number) => (m >= 6 ? '#ff3b30' : m >= 5 ? '#ff9f0a' : m >= 4 ? '#ffd60a' : m >= 3 ? '#32d74b' : '#64d2ff');

const fmtDT = (t: number, locale: string) =>
  new Date(t).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });

/** Janela móvel de 24 h, alinhada ao filtro padrão da atividade sísmica. */
function isWithinLast24Hours(timestamp: number, reference = Date.now()): boolean {
  return Number.isFinite(timestamp) && timestamp >= reference - 24 * 60 * 60_000 && timestamp <= reference + 60_000;
}

const VOLCANO_PATH = 'M2 21 L9 7 L11.2 11.5 L12.5 9 L14 12 L15 9.5 L22 21 Z';
const BOLT_PATH = 'M13.5 2 L4.5 13.5 L10 13.5 L8.5 22 L19.5 10 L13 10 Z';

function volcanoIcon(v: Volcano): L.DivIcon {
  const c = STATUS_META[v.status]?.color ?? '#8e8e93';
  const erupting = v.status === 'ERUPCAO';
  const recent = v.status === 'RECENTE';
  const active = v.status === 'ATIVO';
  const size = erupting ? 30 : recent ? 25 : 22;
  const pulseClass = erupting ? 'erupting' : recent ? 'recent' : active ? 'active' : '';
  return L.divIcon({
    className: 'volc-icon-wrap',
    // Pulsação em camadas: erupção confirmada (rápida), atividade recente
    // (média) e vulcão ativo (lenta e discreta).
    html: `<div class="volc-icon ${pulseClass}" style="--c:${c};--marker-size:${size}px" role="img" aria-label="${v.name}${erupting ? ' — em erupção' : recent ? ' — atividade recente' : active ? ' — vulcão ativo' : ''}">` +
      `<svg viewBox="0 0 24 24" width="${erupting ? 20 : 16}" height="${erupting ? 20 : 16}" aria-hidden="true">` +
      `<path d="${VOLCANO_PATH}" fill="${c}" stroke="rgba(0,0,0,.72)" stroke-width="1.2" stroke-linejoin="round"/>` +
      (erupting ? '<circle cx="12" cy="6" r="1.7" fill="#fff" opacity=".92"/><circle cx="14.6" cy="3.8" r="1.15" fill="#fff" opacity=".65"/>' : '') +
      '</svg></div>',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    tooltipAnchor: [0, -size / 2],
  });
}

function quakeClusterIcon(cluster: any): L.DivIcon {
  const children = cluster.getAllChildMarkers() as L.Marker[];
  const maxMag = children.reduce((max, marker) => Math.max(max, Number((marker.options as any).quakeMag ?? 0)), 0);
  const count = cluster.getChildCount();
  const tone = maxMag >= 6 ? '#ff3b30' : maxMag >= 4.5 ? '#ff9f0a' : '#64d2ff';
  const hasRecent = children.some((marker) => Boolean((marker.options as any).quakeRecent24));
  const size = count >= 100 ? 44 : count >= 10 ? 38 : 32;
  return L.divIcon({
    className: 'quake-cluster-wrap',
    // O agrupamento pulsa quando contém eventos da janela móvel de 24 h.
    html: `<span class="quake-cluster ${hasRecent ? 'quake-cluster-live' : ''} ${maxMag >= 4.5 ? 'quake-cluster-highmag' : ''}" style="--cluster-color:${tone};--cluster-size:${size}px">${count}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** Ícone separado: estrutura geológica antiga, não um vulcão em atividade. */
function pleistoceneVolcanoIcon(): L.DivIcon {
  return L.divIcon({
    className: 'pleistocene-volcano-wrap',
    html: `<span class="pleistocene-volcano-marker" aria-hidden="true"><svg viewBox="0 0 24 24" width="17" height="17"><path d="${VOLCANO_PATH}" fill="#a78bfa" stroke="#171326" stroke-width="1.2" stroke-linejoin="round"/></svg></span>`,
    iconSize: [25, 25], iconAnchor: [12.5, 12.5],
  });
}

function pleistoceneClusterIcon(cluster: any): L.DivIcon {
  const count = cluster.getChildCount();
  const size = count >= 100 ? 43 : count >= 10 ? 37 : 31;
  return L.divIcon({
    className: 'pleistocene-cluster-wrap',
    html: `<span class="pleistocene-cluster" style="--cluster-size:${size}px">${count}</span>`,
    iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  });
}

function superVolcanoIcon(): L.DivIcon {
  return L.divIcon({
    className: 'super-volcano-wrap',
    html: '<span class="super-volcano-marker" aria-hidden="true">✦</span>',
    iconSize: [36, 36], iconAnchor: [18, 18],
  });
}

function superVolcanoPopup(volcano: Volcano): HTMLElement {
  const info = SUPER_VOLCANOES[volcano.vn];
  const root = document.createElement('div'); root.className = 'historical-geo-popup super-volcano-popup';
  const title = document.createElement('h3'); title.textContent = info?.displayName || volcano.name; root.appendChild(title);
  const badge = document.createElement('div'); badge.className = 'super-volcano-badge';
  badge.textContent = info?.classification === 'supereruption-documented'
    ? 'SISTEMA ASSOCIADO A SUPERERUPÇÃO · VEI 8'
    : info?.classification === 'large-caldera-system'
      ? 'GRANDE SISTEMA DE CALDEIRA · NÃO VEI 8 CONFIRMADO'
      : 'GRANDE CALDEIRA · CANDIDATA / SISTEMA DE INTERESSE';
  root.appendChild(badge);
  const region = document.createElement('p'); region.textContent = `${volcano.country} · ${volcano.type}`; root.appendChild(region);
  const evidence = document.createElement('p'); evidence.textContent = info?.evidence || 'Sistema de grande caldeira selecionado para destaque no mapa.'; root.appendChild(evidence);
  const note = document.createElement('p'); note.className = 'historical-geo-note';
  note.textContent = info?.classification === 'supereruption-documented'
    ? 'Este sistema é citado pelo USGS entre os exemplos de supervulcões/supererupções. A classificação descreve somente seu histórico e não indica atividade, alerta ou perigo iminente.'
    : info?.classification === 'large-caldera-system'
      ? 'Este sistema é destacado por ser uma grande caldeira. Isso não significa que tenha uma supererupção VEI 8 confirmada, nem indica atividade, alerta ou perigo iminente.'
      : 'Este sistema foi incluído como grande caldeira candidata/de interesse. Isso não comprova uma supererupção VEI 8. Não indica atividade, alerta ou perigo iminente.';
  root.appendChild(note);
  const gvp = document.createElement('a'); gvp.href = `https://volcano.si.edu/volcano.cfm?vn=${volcano.vn}`; gvp.target = '_blank'; gvp.rel = 'noopener noreferrer'; gvp.textContent = 'Perfil do Smithsonian GVP ↗'; root.appendChild(gvp);
  const source = document.createElement('a'); source.href = info?.sourceUrl || 'https://www.usgs.gov/faqs/what-a-supervolcano-what-a-supereruption'; source.target = '_blank'; source.rel = 'noopener noreferrer'; source.textContent = `Evidência: ${info?.sourceLabel || 'USGS'} ↗`; root.appendChild(source);
  return root;
}

function historicalGeologyIcon(): L.DivIcon {
  return L.divIcon({
    className: 'historical-geo-icon-wrap',
    html: '<span class="historical-geo-icon" aria-hidden="true">◇</span>',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function pleistoceneVolcanoPopup(volcano: Volcano): HTMLElement {
  const root = document.createElement('div');
  root.className = 'historical-geo-popup';
  const title = document.createElement('h3');
  title.textContent = volcano.name;
  root.appendChild(title);
  const badge = document.createElement('div');
  badge.className = 'historical-geo-badge';
  badge.textContent = 'VULCÃO DO PLEISTOCENO · CAMADA HISTÓRICA · SEM ERUPÇÃO ATUAL CONFIRMADA';
  root.appendChild(badge);
  const region = document.createElement('p');
  region.textContent = volcano.country;
  root.appendChild(region);
  const rows: Array<[string, string]> = [
    ['Período', 'Pleistoceno (aprox. 2,58 milhões a 11.700 anos atrás)'],
    ['Tipo de estrutura', volcano.type || 'Não informado no registro'],
    ['Coordenadas', `${volcano.lat.toFixed(4)}, ${volcano.lon.toFixed(4)}`],
    ['Identificador GVP', String(volcano.vn)],
  ];
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    row.className = 'historical-geo-row';
    const strong = document.createElement('strong'); strong.textContent = `${label}: `;
    const span = document.createElement('span'); span.textContent = value;
    row.append(strong, span); root.appendChild(row);
  }
  const note = document.createElement('p');
  note.className = 'historical-geo-note';
  note.textContent = 'O Smithsonian GVP inclui este registro em sua lista de vulcões do Pleistoceno. O próprio GVP informa que essa lista é preliminar e pode conter dados incompletos ou incorretos. A classificação não indica atividade atual. As coordenadas podem representar o centro de um campo vulcânico, não necessariamente uma cratera ou cume.';
  root.appendChild(note);
  const source = document.createElement('a');
  source.href = `https://volcano.si.edu/volcanolist_pleistocene.cfm`;
  source.target = '_blank'; source.rel = 'noopener noreferrer';
  source.textContent = 'Fonte: Smithsonian Global Volcanism Program — lista Pleistoceno ↗';
  root.appendChild(source);
  return root;
}

function historicalGeologyPopup(feature: HistoricalGeologyFeature): HTMLElement {
  const root = document.createElement('div');
  root.className = 'historical-geo-popup';
  const title = document.createElement('h3');
  title.textContent = feature.name;
  root.appendChild(title);
  const badge = document.createElement('div');
  badge.className = 'historical-geo-badge';
  badge.textContent = 'ESTRUTURA GEOLÓGICA HISTÓRICA · SEM ERUPÇÃO ATUAL CONFIRMADA';
  root.appendChild(badge);
  const region = document.createElement('p');
  region.textContent = `${feature.region} · ${feature.country}`;
  root.appendChild(region);
  const rows: Array<[string, string]> = [
    ['Idade / período', feature.age],
    ['Geologia', feature.geology],
    ['Localização', feature.locationNote],
  ];
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    row.className = 'historical-geo-row';
    const strong = document.createElement('strong'); strong.textContent = `${label}: `;
    const span = document.createElement('span'); span.textContent = value;
    row.append(strong, span); root.appendChild(row);
  }
  const note = document.createElement('p');
  note.className = 'historical-geo-note';
  note.textContent = feature.note;
  root.appendChild(note);
  const source = document.createElement('a');
  source.href = feature.sourceUrl; source.target = '_blank'; source.rel = 'noopener noreferrer';
  source.textContent = `Fonte científica: ${feature.sourceName} ↗`;
  root.appendChild(source);
  return root;
}

/* ---------- Popups (elementos DOM, traduzidos, com foto) ---------- */

function resolvePhoto(box: HTMLElement, v: Volcano, gvpFile?: string) {
  box.innerHTML = '<div class="photo-placeholder small"><span class="ph-icon">⛰</span><span class="ph-sub">…</span></div>';
  const gvpUrl = GVP_IMAGE_URL(gvpFile);
  if (!gvpUrl) { commonsLookup(box, v); return; }
  const probe = new Image();
  probe.onload = () => {
    box.innerHTML = '';
    const img = document.createElement('img');
    img.src = gvpUrl; img.alt = v.name; img.loading = 'lazy';
    box.appendChild(img);
    const cap = document.createElement('div');
    cap.className = 'pp-credit';
    cap.textContent = `Smithsonian GVP · vn ${v.vn}`;
    box.appendChild(cap);
  };
  probe.onerror = () => commonsLookup(box, v);
  probe.src = gvpUrl;
}
async function commonsLookup(box: HTMLElement, v: Volcano) {
  const c = await commonsImage(v.name);
  if (!c?.url) {
    box.innerHTML = '<div class="photo-placeholder small"><span class="ph-icon">⛰</span></div>';
    return;
  }
  box.innerHTML = '';
  const img = document.createElement('img');
  img.src = c.url; img.alt = v.name; img.loading = 'lazy';
  img.onerror = () => { box.innerHTML = '<div class="photo-placeholder small"><span class="ph-icon">⛰</span></div>'; };
  box.appendChild(img);
  if (c.credit) {
    const cap = document.createElement('div');
    cap.className = 'pp-credit';
    cap.textContent = `Wikimedia Commons · ${c.credit}`;
    box.appendChild(cap);
  }
}

function alertLabel(v: Volcano, t: any): string | null {
  const a = v.alertInfo;
  if (!a) return null;
  const lvl = a.source === 'USGS' ? `${a.level}${a.colorCode ? ` · ${a.colorCode}` : ''}` : String(a.level);
  return `${a.source} · ${lvl}${a.noticeTime ? ` · ${t('pp.bulletin')} ${a.noticeTime}` : ''}`;
}

function volcanoPopupHtml(v: Volcano, ongoing: Map<number, { start: string; end: string | null; vei: number | null }> | undefined, t: any): HTMLElement {
  const meta = STATUS_META[v.status] ?? STATUS_META.INDEFINIDO;
  const alert = alertLabel(v, t);
  const inf = ongoing?.get(v.vn);
  const el = document.createElement('div');
  el.className = 'pp';
  el.innerHTML = `
    <h3>${v.name} ${v.status === 'ERUPCAO' ? `<span class="badge live">${t('status.ERUPCAO')}</span>` : ''}</h3>
    <div class="row">${v.country} · ${v.type}</div>
    <div class="kv"><span>${t('pp.status')}</span><b style="color:${meta.color}">${t(`status.${v.status}`)}</b></div>
    ${v.activity?.length ? `<div class="pp-cats">${v.activity.slice(0, 5).map((k) => `<span class="tag cat-${k}">${t(`cat.${k}`)}</span>`).join('')}</div>` : ''}
    ${alert ? `<div class="kv"><span>${t('pp.alertLevel')}</span><b>${alert}</b></div>` : ''}
    <div class="kv"><span>${t('pp.lastEruption')}</span><b>${v.lastEruption != null ? v.lastEruption : t('pp.noRecord')}</b></div>
    ${v.status === 'ERUPCAO' ? `<div class="kv"><span>${t('erupt.last')}</span><b>${inf?.end ?? t('erupt.ongoing')}</b></div>` : ''}
    <div class="kv"><span>${t('pp.elevation')}</span><b>${v.elevation != null ? v.elevation + ' m' : t('pp.na')}</b></div>
    <div class="kv"><span>${t('pp.source')}</span><b>Smithsonian GVP${v.alertInfo ? ` · ${v.alertInfo.source}` : ''}</b></div>
    <button class="btn-more" data-act="more" data-vn="${v.vn}">${t('pp.more')}</button>
    <div class="pp-photo" data-vn="${v.vn}"></div>`;
  const photoBox = el.querySelector('.pp-photo');
  if (photoBox) setTimeout(() => resolvePhoto(photoBox as HTMLElement, v, v.image?.file), 0);
  return el;
}

function quakePopupHtml(q: Quake, t: any, locale: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'pp';
  el.innerHTML = `
    <h3>${q.mag != null && q.mag >= 0 ? 'M ' + q.mag.toFixed(1) : 'M n/d'} <span class="badge mag">${q.magType || ''}</span></h3>
    <div class="row">${q.place}</div>
    <div class="kv"><span>${t('pp.depth')}</span><b>${q.depthKm.toFixed(1)} km</b></div>
    <div class="kv"><span>${t('pp.dateTime')}</span><b>${fmtDT(q.time, locale)}</b></div>
    <div class="kv"><span>${t('pp.coords')}</span><b>${q.lat.toFixed(2)}, ${q.lon.toFixed(2)}</b></div>
    <div class="kv"><span>${t('pp.source')}</span><b>${q.source}${q.status ? ' · ' + q.status : ''}</b></div>
    ${q.url ? `<a href="${q.url}" target="_blank" rel="noreferrer">${t('pp.viewAt')} ${q.source} ↗</a>` : ''}`;
  return el;
}

/* ---------- Marcadores ---------- */

function quakeMarker(q: Quake, onSelect: (q: Quake) => void, alertMag: number, t: any, locale: string): L.Marker {
  const c = magColor(q.mag);
  const s = Math.round(Math.max(13, Math.min(34, 9 + q.mag * 3.4)));
  const alerted = q.mag >= alertMag;
  const recent24 = isWithinLast24Hours(q.time);
  const pulsing = recent24 || alerted;
  const icon = L.divIcon({
    className: 'quake-icon-wrap',
    html: `<div class="quake-icon ${pulsing ? 'pulsing-recent' : ''} ${alerted ? 'alerted' : ''}" style="--c:${c};--marker-size:${s}px" role="img" aria-label="Terremoto magnitude ${q.mag?.toFixed(1) ?? 'não disponível'}${recent24 ? ', nas últimas 24 horas' : ''}${alerted ? ', acima do limite de alerta' : ''}">` +
      `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true">` +
      `<path d="${BOLT_PATH}" fill="${c}" stroke="rgba(0,0,0,.78)" stroke-width="1.1" stroke-linejoin="round"/>` +
      '</svg></div>',
    iconSize: [s + 16, s + 16],
    iconAnchor: [(s + 16) / 2, (s + 16) / 2],
  });
  const m = L.marker([q.lat, q.lon], {
    icon, title: `M ${q.mag?.toFixed(1) ?? '?'}`, riseOnHover: true, zIndexOffset: 650,
  });
  (m.options as L.MarkerOptions & { quakeMag?: number; quakeRecent24?: boolean }).quakeMag = q.mag;
  (m.options as L.MarkerOptions & { quakeMag?: number; quakeRecent24?: boolean }).quakeRecent24 = recent24;
  m.bindPopup(() => quakePopupHtml(q, t, locale), { maxWidth: 300 });
  m.on('click', () => onSelect(q));
  return m;
}

interface Props {
  quakes: Quake[];
  volcanoes: Volcano[];
  settings: Settings;
  alertMag: number;
  ongoing?: Map<number, { start: string; end: string | null; vei: number | null }>;
  onSelectQuake: (q: Quake) => void;
  onSelectVolcano: (v: Volcano) => void;
  onKnowMore: (vn: number) => void;
  focus: { lat: number; lon: number; zoom: number; id: string; kind: 'quake' | 'volcano' | 'place'; name?: string } | null;
  mapRef: React.MutableRefObject<L.Map | null>;
}

export default function MapView({ quakes, volcanoes, settings, alertMag, ongoing, onSelectQuake, onSelectVolcano, onKnowMore, focus, mapRef }: Props) {
  const [legendCollapsed, setLegendCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const saved = localStorage.getItem('tp.mapLegendCollapsed');
      if (saved !== null) return saved === '1';
    } catch { /* armazenamento opcional */ }
    return window.matchMedia('(max-width: 900px)').matches;
  });
  const divRef = useRef<HTMLDivElement>(null);
  const qCluster = useRef<L.MarkerClusterGroup | null>(null);
  const vCluster = useRef<L.MarkerClusterGroup | null>(null);
  const vClusterFlat = useRef<L.LayerGroup | null>(null);
  const historicalLayer = useRef<L.LayerGroup | null>(null);
  const pleistoceneLayer = useRef<L.MarkerClusterGroup | null>(null);
  const superLayer = useRef<L.LayerGroup | null>(null);
  const ringRef = useRef<L.Layer | null>(null);
  const volcanoesRef = useRef(volcanoes);
  volcanoesRef.current = volcanoes;
  const ongoingRef = useRef(ongoing);
  ongoingRef.current = ongoing;
  // O backend reclassifica os vulcões a cada ciclo de alertas. Só reconstruímos
  // marcadores se coordenadas, status, alerta ou descrição visual realmente mudarem.
  const volcanoMarkerKey = useMemo(() => volcanoes.map((v) => [
    // Incluir todos os atributos usados em popups/ícones evita manter pins
    // visualmente antigos quando o catálogo é revalidado no Vercel.
    v.vn, v.name, v.country, v.type, v.lat, v.lon, v.elevation ?? '',
    v.holocene ? 1 : 0, v.status, v.lastEruption ?? '',
    v.alertInfo?.source || '', v.alertInfo?.level || '',
    v.alertInfo?.noticeTime || '', v.alertInfo?.details || '',
    v.image?.file || '', v.image?.caption || '', v.image?.credit || '',
    (v.activity || []).join(','),
  ].join('~')).join('|'), [volcanoes]);
  const ongoingMarkerKey = useMemo(() => [...(ongoing || new Map()).entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([vn, item]) => `${vn}:${item.start}:${item.end || ''}:${item.vei ?? ''}`).join('|'), [ongoing]);
  const cbRef = useRef({ onSelectQuake, onSelectVolcano, onKnowMore });
  cbRef.current = { onSelectQuake, onSelectVolcano, onKnowMore };
  const { t, locale } = useI18n();

  useEffect(() => {
    try { localStorage.setItem('tp.mapLegendCollapsed', legendCollapsed ? '1' : '0'); }
    catch { /* armazenamento opcional */ }
  }, [legendCollapsed]);

  useEffect(() => {
    const container = divRef.current;
    if (!container || mapRef.current) return;
    const map = L.map(container, {
      center: [-10, -40], zoom: 3, minZoom: 2, worldCopyJump: true,
      zoomControl: false, preferCanvas: true, touchZoom: true,
      scrollWheelZoom: !window.matchMedia('(pointer: coarse)').matches,
      zoomSnap: 0.5, maxBounds: L.latLngBounds([-90, -220], [90, 220]),
    });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Mapa: © Esri, Maxar, Earthstar Geographics © OpenStreetMap',
      maxZoom: 16,
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    (map as any)._delegated = (e: MouseEvent) => {
      const b = (e.target as HTMLElement).closest?.('[data-act="more"]') as HTMLElement | null;
      if (b) cbRef.current.onKnowMore(Number(b.dataset.vn));
    };
    document.addEventListener('click', (map as any)._delegated);
    mapRef.current = map;
    qCluster.current = L.markerClusterGroup({
      maxClusterRadius: 30, showCoverageOnHover: false, chunkedLoading: true,
      spiderfyOnMaxZoom: true, zoomToBoundsOnClick: true, disableClusteringAtZoom: 7,
      iconCreateFunction: quakeClusterIcon,
    });
    vCluster.current = L.markerClusterGroup({ maxClusterRadius: 32, showCoverageOnHover: false, chunkedLoading: true, chunkInterval: 120, chunkDelay: 20, animateAddingMarkers: false, removeOutsideVisibleBounds: true, disableClusteringAtZoom: 9 });
    vClusterFlat.current = L.layerGroup();
    historicalLayer.current = L.layerGroup();
    pleistoceneLayer.current = L.markerClusterGroup({ maxClusterRadius: 34, showCoverageOnHover: false, chunkedLoading: true, chunkInterval: 120, chunkDelay: 20, animateAddingMarkers: false, removeOutsideVisibleBounds: true, iconCreateFunction: pleistoceneClusterIcon });
    superLayer.current = L.layerGroup();
    map.addLayer(vCluster.current);
    map.addLayer(vClusterFlat.current);
    map.addLayer(qCluster.current);
    map.addLayer(pleistoceneLayer.current);
    map.addLayer(superLayer.current);

    // Leaflet precisa recalcular o viewport quando o layout muda (mobile,
    // rotação, abertura de painel, endereço do navegador ou redimensionamento).
    let resizeRaf = 0;
    const invalidate = () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        if (map.getContainer().isConnected) map.invalidateSize({ pan: false, debounceMoveend: true });
      });
    };
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(invalidate) : null;
    resizeObserver?.observe(container);
    window.addEventListener('resize', invalidate, { passive: true });
    window.addEventListener('orientationchange', invalidate, { passive: true });
    window.visualViewport?.addEventListener('resize', invalidate, { passive: true });
    const sizeTimers = [80, 240, 600].map((ms) => window.setTimeout(invalidate, ms));
    return () => {
      sizeTimers.forEach(clearTimeout);
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', invalidate);
      window.removeEventListener('orientationchange', invalidate);
      window.visualViewport?.removeEventListener('resize', invalidate);
      document.removeEventListener('click', (map as any)._delegated);
      map.remove(); mapRef.current = null; historicalLayer.current = null; pleistoceneLayer.current = null; superLayer.current = null;
    };
  }, []);

  // vulcões — no filtro "Em erupção" os marcadores ficam sempre visíveis (sem cluster)
  useEffect(() => {
    const flat = settings.volcanoFilter === 'erupting';
    const g = flat ? vClusterFlat.current : vCluster.current;
    if (!g || !vCluster.current || !vClusterFlat.current) return;
    vCluster.current.clearLayers();
    vClusterFlat.current.clearLayers();
    if (settings.showVolcanoes) {
      for (const v of volcanoesRef.current) {
        // Registros do Pleistoceno e supervulcões têm camadas próprias para evitar duplicação.
        if (!v.holocene || SUPER_VOLCANO_IDS.has(v.vn)) continue;
        if (settings.country && v.country !== settings.country) continue;
        if (settings.volcanoFilter === 'active' && !(v.status === 'ERUPCAO' || v.status === 'ATIVO')) continue;
        if (settings.volcanoFilter === 'inactive' && (v.status === 'ERUPCAO' || v.status === 'ATIVO')) continue;
        if (flat && v.status !== 'ERUPCAO') continue;
        const m = L.marker([v.lat, v.lon], { icon: volcanoIcon(v), title: v.name, riseOnHover: true, zIndexOffset: v.status === 'ERUPCAO' ? 900 : 450 });
        m.bindPopup(() => volcanoPopupHtml(v, ongoingRef.current, t), { maxWidth: 300 });
        m.on('click', () => cbRef.current.onSelectVolcano(v));
        g.addLayer(m);
      }
    }
  }, [volcanoMarkerKey, ongoingMarkerKey, settings.showVolcanoes, settings.country, settings.volcanoFilter, t]);

  // Vulcões do Pleistoceno: catálogo mundial do GVP (camada distinta dos Holocenos).
  useEffect(() => {
    const map = mapRef.current;
    const group = pleistoceneLayer.current;
    if (!map || !group) return;
    group.clearLayers();
    const filterAllowsHistorical = settings.volcanoFilter === 'all' || settings.volcanoFilter === 'inactive';
    const visible = settings.showVolcanoes && settings.showPleistoceneVolcanoes && filterAllowsHistorical;
    if (!visible) {
      if (map.hasLayer(group)) map.removeLayer(group);
      return;
    }
    if (!map.hasLayer(group)) map.addLayer(group);
    for (const volcano of volcanoesRef.current) {
      if (volcano.holocene || SUPER_VOLCANO_IDS.has(volcano.vn)) continue;
      if (settings.country && volcano.country !== settings.country) continue;
      if (!Number.isFinite(volcano.lat) || !Number.isFinite(volcano.lon)) continue;
      const marker = L.marker([volcano.lat, volcano.lon], {
        icon: pleistoceneVolcanoIcon(), title: volcano.name,
        alt: 'Vulcão do catálogo Pleistoceno do Smithsonian GVP; sem atividade atual confirmada',
      });
      marker.bindPopup(() => pleistoceneVolcanoPopup(volcano), { maxWidth: 350 });
      marker.on('click', () => cbRef.current.onSelectVolcano(volcano));
      group.addLayer(marker);
    }
  }, [volcanoMarkerKey, settings.showVolcanoes, settings.showPleistoceneVolcanoes, settings.volcanoFilter, settings.country]);

  // Supervulcões/grandes caldeiras: camada própria e destacada, sem duplicar
  // marcadores do catálogo Holoceno/Pleistoceno.
  useEffect(() => {
    const map = mapRef.current;
    const group = superLayer.current;
    if (!map || !group) return;
    group.clearLayers();
    const visibleByFilter = (v: Volcano) => {
      if (settings.volcanoFilter === 'erupting') return v.status === 'ERUPCAO';
      if (settings.volcanoFilter === 'active') return v.status === 'ERUPCAO' || v.status === 'ATIVO';
      if (settings.volcanoFilter === 'inactive') return v.status !== 'ERUPCAO' && v.status !== 'ATIVO';
      return true;
    };
    if (!settings.showVolcanoes || !settings.showSupervolcanoes) {
      if (map.hasLayer(group)) map.removeLayer(group);
      return;
    }
    if (!map.hasLayer(group)) map.addLayer(group);
    const byId = new Map(volcanoesRef.current.map((v) => [Number(v.vn), v]));
    for (const id of SUPER_VOLCANO_IDS) {
      const info = SUPER_VOLCANOES[id];
      if (!info) continue;
      // A camada especial não depende da resposta do GVP para aparecer:
      // usa a coordenada curada documentada como fallback até o catálogo chegar.
      const volcano: Volcano = byId.get(id) ?? {
        vn: id, name: info.displayName, country: info.country, type: 'Grande caldeira',
        lastEruption: null, elevation: null, lat: info.lat, lon: info.lon,
        status: 'EXTINTO', holocene: false,
      };
      if (!visibleByFilter(volcano)) continue;
      if (settings.country && volcano.country !== settings.country) continue;
      if (!Number.isFinite(volcano.lat) || !Number.isFinite(volcano.lon)) continue;
      const marker = L.marker([volcano.lat, volcano.lon], {
        icon: superVolcanoIcon(), title: info.displayName,
        alt: `Grande caldeira ${info.displayName}; classificação histórica, sem indicação de atividade atual`, zIndexOffset: 1200,
      });
      marker.bindPopup(() => superVolcanoPopup(volcano), { maxWidth: 360 });
      marker.on('click', () => cbRef.current.onSelectVolcano(volcano));
      group.addLayer(marker);
    }
  }, [volcanoMarkerKey, settings.showVolcanoes, settings.showSupervolcanoes, settings.volcanoFilter, settings.country]);

  // Estruturas geológicas muito antigas (ex.: Mendanha/Amazônia): camada manual
  // separada do catálogo de vulcões Holocenos e Pleistocenos.
  useEffect(() => {
    const map = mapRef.current;
    const group = historicalLayer.current;
    if (!map || !group) return;
    group.clearLayers();
    if (!settings.showHistoricalGeology) {
      if (map.hasLayer(group)) map.removeLayer(group);
      return;
    }
    if (!map.hasLayer(group)) map.addLayer(group);
    for (const feature of HISTORICAL_GEOLOGY) {
      if (settings.country && feature.country !== settings.country) continue;
      const marker = L.marker([feature.lat, feature.lon], {
        icon: historicalGeologyIcon(), title: feature.name,
        alt: 'Estrutura geológica histórica, sem atividade atual confirmada',
      });
      marker.bindPopup(() => historicalGeologyPopup(feature), { maxWidth: 340 });
      group.addLayer(marker);
    }
  }, [settings.showHistoricalGeology, settings.country]);

  // terremotos
  useEffect(() => {
    const g = qCluster.current; if (!g) return;
    g.clearLayers();
    if (settings.showQuakes) {
      for (const q of quakes) {
        if (q.mag < settings.minMag) continue;
        if (settings.country && !q.place?.includes(settings.country)) continue;
        g.addLayer(quakeMarker(q, cbRef.current.onSelectQuake, alertMag, t, locale));
      }
    }
  }, [quakes, settings.showQuakes, settings.minMag, settings.country, alertMag, t, locale]);

  // foco + destaque temporário (+ popup do vulcão)
  useEffect(() => {
    const map = mapRef.current; if (!map || !focus) return;
    ringRef.current?.remove?.();
    const zoom = focus.kind === 'volcano' ? Math.max(focus.zoom, 10) : focus.zoom;
    map.flyTo([focus.lat, focus.lon], zoom, { duration: 0.8 });
    const color = focus.kind === 'volcano' ? '#ff9f0a' : focus.kind === 'place' ? '#c084fc' : '#64d2ff';
    const ring = L.circleMarker([focus.lat, focus.lon], { radius: 22, color, weight: 3, fill: false, dashArray: '4 5' }).addTo(map);
    ringRef.current = ring;
    const tm = setTimeout(() => { ring.remove(); ringRef.current = null; }, 6000);
    let tp: ReturnType<typeof setTimeout> | undefined;
    if (focus.kind !== 'quake' && focus.name) {
      tp = setTimeout(() => {
        let marker: L.Marker | null = null;
        for (const g of [superLayer.current, vClusterFlat.current, vCluster.current, pleistoceneLayer.current, historicalLayer.current]) {
          const hit = (g as L.LayerGroup | null)?.getLayers?.().find((l: any) => l.options?.title === focus.name);
          if (hit) { marker = hit as L.Marker; break; }
        }
        if (!marker) return;
        // Garante que pontos da camada histórica agrupada sejam revelados antes do popup.
        const popupZoom = focus.kind === 'volcano' ? 10 : Math.max(focus.zoom, 7);
        if (pleistoceneLayer.current && pleistoceneLayer.current.hasLayer(marker)) {
          pleistoceneLayer.current.zoomToShowLayer(marker, () => marker?.openPopup());
        } else {
          if (map.getZoom() < popupZoom) map.setView(marker.getLatLng(), popupZoom, { animate: false });
          marker.openPopup();
        }
      }, 900);
    }
    return () => { clearTimeout(tm); if (tp) clearTimeout(tp); ring.remove(); };
  }, [focus]);

  const mapAlertCounts = useMemo(() => ({
    earthquakes: quakes.filter((quake) => Number.isFinite(quake.mag) && quake.mag >= alertMag).length,
    volcanoes: volcanoes.filter((volcano) => Boolean(volcano.alertInfo)).length,
  }), [quakes, volcanoes, alertMag]);

  return (
    <>
      <div ref={divRef} className="mapview" />
      {(mapAlertCounts.earthquakes > 0 || mapAlertCounts.volcanoes > 0) && (
        <div className="map-alert-summary" role="status" aria-live="polite">
          <span className="map-alert-summary-title">⚠ Alertas no mapa</span>
          {mapAlertCounts.earthquakes > 0 && <span>Terremotos ≥ M{alertMag.toFixed(1)}: <b>{mapAlertCounts.earthquakes}</b></span>}
          {mapAlertCounts.volcanoes > 0 && <span>Boletins vulcânicos: <b>{mapAlertCounts.volcanoes}</b></span>}
        </div>
      )}
      <section className={`legend ${legendCollapsed ? 'collapsed' : 'expanded'}`} aria-label={t('legend.title')}>
        <button
          type="button"
          className="legend-toggle"
          aria-expanded={!legendCollapsed}
          aria-controls="map-legend-content"
          onClick={() => setLegendCollapsed((value) => !value)}
          title={legendCollapsed ? 'Expandir legenda do mapa' : 'Minimizar legenda do mapa'}
        >
          <span>{t('legend.title')}</span><span className="legend-chevron" aria-hidden="true">{legendCollapsed ? '＋' : '−'}</span>
        </button>
        <div id="map-legend-content" className="legend-content" aria-hidden={legendCollapsed}>
          <span><i className="lg tri erup" /> {t('legend.erupting')}</span>
          <span><i className="lg tri recent" /> {t('legend.recent')}</span>
          <span><i className="lg tri ativo" /> {t('legend.active')}</span>
          <span><i className="lg tri dormente" /> {t('legend.dormant')}</span>
          <span><i className="lg tri extinto" /> {t('legend.extinct')}</span>
          {settings.showPleistoceneVolcanoes && <span><i className="lg-historical">△</i> Vulcões do Pleistoceno (catálogo mundial GVP)</span>}
          {settings.showSupervolcanoes && <span><i className="lg-super">✦</i> Supererupções documentadas / grandes caldeiras candidatas</span>}
          {settings.showHistoricalGeology && <span><i className="lg-historical">◇</i> Estruturas geológicas muito antigas</span>}
          <span><i className="lg bolt"><svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d={BOLT_PATH} fill="#64d2ff" /></svg></i> {t('legend.quake')}</span>
          <span><i className="lg-alert" /> Terremoto acima do limite de alerta</span>
          <span className="muted small">{t('pp.source')}: Smithsonian GVP · USGS/EMSC · Esri/OSM</span>
        </div>
      </section>
    </>
  );
}
