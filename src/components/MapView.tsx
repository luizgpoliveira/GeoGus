import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import type { Quake, Volcano, Settings } from '../types';
import { useI18n } from '../i18n';
import { commonsImage, GVP_IMAGE_URL } from '../api';
import { HISTORICAL_GEOLOGY, type HistoricalGeologyFeature } from '../historicalGeology';

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

const VOLCANO_PATH = 'M2 21 L9 7 L11.2 11.5 L12.5 9 L14 12 L15 9.5 L22 21 Z';
const BOLT_PATH = 'M13.5 2 L4.5 13.5 L10 13.5 L8.5 22 L19.5 10 L13 10 Z';

function volcanoIcon(v: Volcano): L.DivIcon {
  const c = STATUS_META[v.status]?.color ?? '#8e8e93';
  const erupting = v.status === 'ERUPCAO';
  const size = erupting ? 22 : 16;
  return L.divIcon({
    className: 'volc-icon-wrap',
    html: `<div class="volc-icon ${erupting ? 'erupting' : ''}" style="--c:${c}">` +
      `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">` +
      `<path d="${VOLCANO_PATH}" fill="${c}" stroke="rgba(0,0,0,.65)" stroke-width="1.2" stroke-linejoin="round"/>` +
      (erupting ? '<circle cx="12" cy="6" r="1.7" fill="#fff" opacity=".92"/><circle cx="14.6" cy="3.8" r="1.15" fill="#fff" opacity=".65"/>' : '') +
      '</svg></div>',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** Ícone separado: estrutura geológica antiga, não um vulcão em atividade. */
function historicalGeologyIcon(): L.DivIcon {
  return L.divIcon({
    className: 'historical-geo-icon-wrap',
    html: '<span class="historical-geo-icon" aria-hidden="true">◇</span>',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
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
  const icon = L.divIcon({
    className: 'quake-icon-wrap',
    html: `<div class="quake-icon ${alerted ? 'alerted' : ''}" style="--c:${c}">` +
      `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true">` +
      `<path d="${BOLT_PATH}" fill="${c}" stroke="rgba(0,0,0,.7)" stroke-width="1.1" stroke-linejoin="round"/>` +
      '</svg></div>',
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2],
  });
  const m = L.marker([q.lat, q.lon], { icon, title: `M ${q.mag?.toFixed(1) ?? '?'}` });
  m.bindPopup(() => quakePopupHtml(q, t, locale), { maxWidth: 300 });
  m.on('click', () => onSelect(q));
  if (alerted) {
    m.on('add', () => {
      const ring = L.circleMarker([q.lat, q.lon], { radius: s / 2 + 6, color: '#ff3b30', weight: 1.5, fill: false, dashArray: '3 4' }).addTo((m as any)._map);
      (m as any)._ring = ring;
    });
    m.on('remove', () => { (m as any)._ring?.remove(); });
  }
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
  const divRef = useRef<HTMLDivElement>(null);
  const qCluster = useRef<L.MarkerClusterGroup | null>(null);
  const vCluster = useRef<L.MarkerClusterGroup | null>(null);
  const vClusterFlat = useRef<L.LayerGroup | null>(null);
  const historicalLayer = useRef<L.LayerGroup | null>(null);
  const ringRef = useRef<L.Layer | null>(null);
  const cbRef = useRef({ onSelectQuake, onSelectVolcano, onKnowMore });
  cbRef.current = { onSelectQuake, onSelectVolcano, onKnowMore };
  const { t, locale } = useI18n();

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current, {
      center: [-10, -40], zoom: 3, minZoom: 2, worldCopyJump: true,
      zoomControl: false, preferCanvas: true, maxBounds: L.latLngBounds([-90, -220], [90, 220]),
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
    qCluster.current = L.markerClusterGroup({ maxClusterRadius: 45, showCoverageOnHover: false, chunkedLoading: true });
    vCluster.current = L.markerClusterGroup({ maxClusterRadius: 35, showCoverageOnHover: false, chunkedLoading: true, disableClusteringAtZoom: 9 });
    vClusterFlat.current = L.layerGroup();
    historicalLayer.current = L.layerGroup();
    map.addLayer(vCluster.current);
    map.addLayer(vClusterFlat.current);
    map.addLayer(historicalLayer.current);
    map.addLayer(qCluster.current);
    setTimeout(() => map.invalidateSize(), 60);
    return () => { document.removeEventListener('click', (map as any)._delegated); map.remove(); mapRef.current = null; historicalLayer.current = null; };
  }, []);

  // vulcões — no filtro "Em erupção" os marcadores ficam sempre visíveis (sem cluster)
  useEffect(() => {
    const flat = settings.volcanoFilter === 'erupting';
    const g = flat ? vClusterFlat.current : vCluster.current;
    if (!g || !vCluster.current || !vClusterFlat.current) return;
    vCluster.current.clearLayers();
    vClusterFlat.current.clearLayers();
    if (settings.showVolcanoes) {
      for (const v of volcanoes) {
        if (settings.country && v.country !== settings.country) continue;
        if (settings.volcanoFilter === 'active' && !(v.status === 'ERUPCAO' || v.status === 'ATIVO')) continue;
        if (settings.volcanoFilter === 'inactive' && (v.status === 'ERUPCAO' || v.status === 'ATIVO')) continue;
        if (flat && v.status !== 'ERUPCAO') continue;
        const m = L.marker([v.lat, v.lon], { icon: volcanoIcon(v), title: v.name });
        m.bindPopup(() => volcanoPopupHtml(v, ongoing, t), { maxWidth: 300 });
        m.on('click', () => cbRef.current.onSelectVolcano(v));
        g.addLayer(m);
      }
    }
  }, [volcanoes, ongoing, settings.showVolcanoes, settings.country, settings.volcanoFilter, t]);

  // Estruturas antigas são uma camada educativa independente: não entram no catálogo
  // operacional, não recebem status eruptivo e permanecem visíveis no filtro 'erupting'.
  useEffect(() => {
    const group = historicalLayer.current;
    if (!group) return;
    group.clearLayers();
    if (!settings.showVolcanoes) return;
    for (const feature of HISTORICAL_GEOLOGY) {
      if (settings.country && feature.country !== settings.country) continue;
      const marker = L.marker([feature.lat, feature.lon], {
        icon: historicalGeologyIcon(),
        title: feature.name,
        alt: 'Estrutura geológica histórica, sem atividade atual confirmada',
      });
      marker.bindPopup(() => historicalGeologyPopup(feature), { maxWidth: 340 });
      group.addLayer(marker);
    }
  }, [settings.showVolcanoes, settings.country]);

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
        for (const g of [vClusterFlat.current, vCluster.current, historicalLayer.current]) {
          const hit = (g as L.LayerGroup | null)?.getLayers?.().find((l: any) => l.options?.title === focus.name);
          if (hit) { marker = hit as L.Marker; break; }
        }
        if (!marker) return;
        // garante zoom sem cluster (o popup não abre com o marcador agrupado)
        const popupZoom = focus.kind === 'volcano' ? 10 : Math.max(focus.zoom, 7);
        if (map.getZoom() < popupZoom) map.setView(marker.getLatLng(), popupZoom, { animate: false });
        marker.openPopup();
      }, 900);
    }
    return () => { clearTimeout(tm); if (tp) clearTimeout(tp); ring.remove(); };
  }, [focus]);

  return (
    <>
      <div ref={divRef} className="mapview" />
      <div className="legend">
        <b>{t('legend.title')}</b>
        <span><i className="lg tri erup" /> {t('legend.erupting')}</span>
        <span><i className="lg tri recent" /> {t('legend.recent')}</span>
        <span><i className="lg tri ativo" /> {t('legend.active')}</span>
        <span><i className="lg tri dormente" /> {t('legend.dormant')}</span>
        <span><i className="lg tri extinto" /> {t('legend.extinct')}</span>
        <span><i className="lg-historical">◇</i> Estrutura geológica histórica (sem atividade atual)</span>
        <span><i className="lg bolt"><svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d={BOLT_PATH} fill="#64d2ff" /></svg></i> {t('legend.quake')}</span>
        <span className="muted small">{t('pp.source')}: Smithsonian GVP · USGS/EMSC · Esri/OSM</span>
      </div>
    </>
  );
}
