import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Quake, Volcano, Settings } from '../types';
import { useI18n } from '../i18n';
import { commonsImage, GVP_IMAGE_URL } from '../api';
import { HISTORICAL_GEOLOGY, type HistoricalGeologyFeature } from '../historicalGeology';
import { SUPER_VOLCANOES, SUPER_VOLCANO_IDS } from '../supervolcanoes';
import { shouldPulseVolcano } from '../volcanoPulse';

// MapLibre fornece o mapa-base vetorial/WebGL; Leaflet continua responsável
// por todos os ícones, marcadores, clusters, popups, controles e animações.
setWorkerUrl(workerUrl);
const DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const ESRI_FALLBACK_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';

export type MapController = {
  flyTo: (center: [number, number], zoom: number, options?: { duration?: number }) => void;
  fitBounds: (bounds: [[number, number], [number, number]], options?: { maxZoom?: number; duration?: number }) => void;
};

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

function volcanoRiskClass(level: string): string {
  return level === 'RED' ? 'risk-red' : level === 'ORANGE' ? 'risk-orange' : level === 'YELLOW' ? 'risk-yellow' : 'risk-green';
}

function volcanoIcon(v: Volcano, reference = Date.now()): L.DivIcon {
  const riskLevel = v.risk?.level ?? 'GREEN';
  const c = v.risk?.color ?? '#22c55e';
  const recent = shouldPulseVolcano(v, reference);
  const riskClass = volcanoRiskClass(riskLevel);
  // Ícone sem medalhão/círculo: o símbolo fica limpo e a pulsação é aplicada
  // diretamente ao SVG apenas enquanto a evidência tiver até 24 horas.
  const size = riskLevel === 'RED' ? 26 : riskLevel === 'ORANGE' ? 24 : riskLevel === 'YELLOW' ? 22 : 20;
  const svgSize = riskLevel === 'RED' ? 21 : riskLevel === 'ORANGE' ? 19 : riskLevel === 'YELLOW' ? 18 : 16;
  const label = riskLevel === 'RED' ? 'perigo'
    : riskLevel === 'ORANGE' ? 'atenção'
      : riskLevel === 'YELLOW' ? 'aviso' : 'normal / sem sinal elevado detectado';
  const pulseDuration = riskLevel === 'RED' ? '1.55s' : riskLevel === 'ORANGE' ? '1.95s' : '2.65s';
  return L.divIcon({
    className: 'volc-icon-wrap',
    html: `<div class="volc-icon ${riskClass} ${recent ? 'pulse-active' : ''}" style="--c:${c};--marker-size:${size}px;--pulse-duration:${pulseDuration}" role="img" aria-label="${escapeHtml(v.name)} — ${escapeHtml(label)}${recent ? ', atualização nas últimas 24 horas' : ''}">` +
      `<svg viewBox="0 0 24 24" width="${svgSize}" height="${svgSize}" aria-hidden="true">` +
      `<path d="${VOLCANO_PATH}" fill="${c}" stroke="rgba(0,0,0,.78)" stroke-width="1.35" stroke-linejoin="round"/>` +
      (riskLevel === 'RED' ? '<path d="M9.2 8.5 C7.2 6.7 9.7 5.5 9.4 3.5 M14.4 7.8 C12.8 5.7 15.6 4.8 15.1 2.5" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" opacity=".92"/>' : '') +
      '</svg></div>',
    iconSize: [size + 16, size + 16], iconAnchor: [(size + 16) / 2, (size + 16) / 2], tooltipAnchor: [0, -(size + 16) / 2],
  });
}

function volcanoClusterIcon(cluster: any): L.DivIcon {
  const children = cluster.getAllChildMarkers() as L.Marker[];
  const count = cluster.getChildCount();
  const highestRank = children.reduce((rank, marker) => Math.max(rank, Number((marker.options as any).volcanoRiskRank ?? 0)), 0);
  const activeCount = children.filter((marker) => Number((marker.options as any).volcanoRiskRank ?? 0) > 0).length;
  const recentCount = children.filter((marker) => Boolean((marker.options as any).volcanoRecent24)).length;
  const color = highestRank >= 3 ? '#ef4444' : highestRank === 2 ? '#f97316' : highestRank === 1 ? '#facc15' : '#22c55e';
  const riskClass = highestRank >= 3 ? 'risk-red' : highestRank === 2 ? 'risk-orange' : highestRank === 1 ? 'risk-yellow' : 'risk-green';
  const size = count >= 250 ? 54 : count >= 50 ? 48 : count >= 10 ? 44 : 40;
  const volcanoSvg = `<svg viewBox="0 0 24 24" width="25" height="25" aria-hidden="true"><path d="${VOLCANO_PATH}" fill="${color}" stroke="rgba(0,0,0,.8)" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
  return L.divIcon({
    className: 'volcano-cluster-wrap',
    html: `<span class="volcano-cluster ${riskClass} ${recentCount ? 'has-activity pulse-active' : ''}" style="--cluster-color:${color};--cluster-size:${size}px" role="img" aria-label="${count} vulcões agrupados; ${activeCount} com sinais de atividade; ${recentCount} atualizados em 24 h">${volcanoSvg}<b>${count}</b>${activeCount ? `<i>${activeCount} ativos</i>` : ''}</span>`,
    iconSize: [size + 16, size + 16], iconAnchor: [(size + 16) / 2, (size + 16) / 2],
  });
}

function quakeClusterIcon(cluster: any): L.DivIcon {
  const children = cluster.getAllChildMarkers() as L.Marker[];
  const maxMag = children.reduce((max, marker) => Math.max(max, Number((marker.options as any).quakeMag ?? 0)), 0);
  const count = cluster.getChildCount();
  const tone = maxMag >= 6 ? '#ff453a' : maxMag >= 4.5 ? '#ff9f0a' : '#55c7ff';
  const hasRecent = children.some((marker) => Boolean((marker.options as any).quakeRecent24));
  const size = count >= 100 ? 50 : count >= 10 ? 45 : 40;
  return L.divIcon({
    className: 'quake-cluster-wrap',
    html: `<span class="quake-cluster ${hasRecent ? 'quake-cluster-live' : ''} ${maxMag >= 4.5 ? 'quake-cluster-highmag' : ''}" style="--cluster-color:${tone};--cluster-size:${size}px" role="img" aria-label="${count} terremotos agrupados; magnitude máxima ${maxMag.toFixed(1)}"><svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true"><path d="${BOLT_PATH}" fill="${tone}" stroke="#08111e" stroke-width=".8" stroke-linejoin="round"/></svg><b>${count}</b></span>`,
    iconSize: [size + 14, size + 14], iconAnchor: [(size + 14) / 2, (size + 14) / 2],
  });
}

/** Ícone separado: estrutura geológica antiga, não um vulcão em atividade. */
function pleistoceneVolcanoIcon(): L.DivIcon {
  return L.divIcon({
    className: 'pleistocene-volcano-wrap',
    html: `<span class="pleistocene-volcano-marker" role="img" aria-label="Vulcão histórico do Pleistoceno"><svg viewBox="0 0 24 24" width="23" height="23" aria-hidden="true"><path d="${VOLCANO_PATH}" fill="#c4b5fd" stroke="#171326" stroke-width="1.2" stroke-linejoin="round"/></svg></span>`,
    iconSize: [44, 44], iconAnchor: [22, 22],
  });
}

function pleistoceneClusterIcon(cluster: any): L.DivIcon {
  const count = cluster.getChildCount();
  const size = count >= 100 ? 58 : count >= 10 ? 51 : 45;
  return L.divIcon({
    className: 'pleistocene-cluster-wrap',
    html: `<span class="pleistocene-cluster" style="--cluster-size:${size}px" role="img" aria-label="${count} estruturas do Pleistoceno agrupadas"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="${VOLCANO_PATH}" fill="#c4b5fd"/></svg><b>${count}</b></span>`,
    iconSize: [size + 12, size + 12], iconAnchor: [(size + 12) / 2, (size + 12) / 2],
  });
}

function superVolcanoIcon(volcano: Volcano, reference = Date.now()): L.DivIcon {
  const level = volcano.risk?.level ?? 'GREEN';
  const pulseClass = level === 'RED' ? 'risk-red' : level === 'ORANGE' ? 'risk-orange' : level === 'YELLOW' ? 'risk-yellow' : '';
  const recent = shouldPulseVolcano(volcano, reference);
  const color = volcano.risk?.color ?? '#22c55e';
  return L.divIcon({
    className: 'super-volcano-wrap',
    html: `<span class="super-volcano-marker ${pulseClass} ${recent ? 'pulse-active' : ''}" style="--risk-color:${color}" role="img" aria-label="${escapeHtml(volcano.name)} — ${escapeHtml(volcano.risk?.label ?? 'NORMAL')}">✦</span>`,
    iconSize: [44, 44], iconAnchor: [22, 22],
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
    ? 'Este sistema é citado pelo USGS entre os exemplos de supervulcões/supererupções. A classificação descreve somente seu histórico; o nível operacional atual é calculado separadamente abaixo.'
    : info?.classification === 'large-caldera-system'
      ? 'Este sistema é destacado por ser uma grande caldeira. Isso não significa que tenha uma supererupção VEI 8 confirmada; o nível operacional atual é calculado separadamente abaixo.'
      : 'Este sistema foi incluído como grande caldeira candidata/de interesse. Isso não comprova uma supererupção VEI 8; o nível operacional atual é calculado separadamente abaixo.';
  root.appendChild(note);
  if (volcano.risk) {
    const risk = document.createElement('p'); risk.className = 'historical-geo-note';
    risk.textContent = `Alerta operacional GeoGus: ${volcano.risk.label}. ${volcano.risk.reasons.join(' ')}`;
    root.appendChild(risk);
  }
  const gvp = document.createElement('a'); gvp.href = `https://volcano.si.edu/volcano.cfm?vn=${volcano.vn}`; gvp.target = '_blank'; gvp.rel = 'noopener noreferrer'; gvp.textContent = 'Perfil do Smithsonian GVP ↗'; root.appendChild(gvp);
  const source = document.createElement('a'); source.href = info?.sourceUrl || 'https://www.usgs.gov/faqs/what-a-supervolcano-what-a-supereruption'; source.target = '_blank'; source.rel = 'noopener noreferrer'; source.textContent = `Evidência: ${info?.sourceLabel || 'USGS'} ↗`; root.appendChild(source);
  return root;
}

function historicalGeologyIcon(): L.DivIcon {
  return L.divIcon({
    className: 'historical-geo-icon-wrap',
    html: '<span class="historical-geo-icon" role="img" aria-label="Estrutura geológica histórica">◇</span>',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
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

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}

function volcanoPopupHtml(v: Volcano, ongoing: Map<number, { start: string; end: string | null; vei: number | null }> | undefined, t: any): HTMLElement {
  const meta = STATUS_META[v.status] ?? STATUS_META.INDEFINIDO;
  const alert = alertLabel(v, t);
  const risk = v.risk;
  const inf = ongoing?.get(v.vn);
  const riskLabel = risk?.label ?? 'NORMAL';
  const riskColor = risk?.color ?? '#22c55e';
  const reasons = (risk?.reasons || ['Nenhum sinal acima do padrão foi identificado nas fontes disponíveis.'])
    .map((reason) => `<li>${escapeHtml(reason)}</li>`).join('');
  const el = document.createElement('div');
  el.className = 'pp';
  el.innerHTML = `
    <h3>${escapeHtml(v.name)}</h3>
    <div class="row">${escapeHtml(v.country)} · ${escapeHtml(v.type)}</div>
    <div class="kv"><span>Alerta operacional GeoGus</span><b style="color:${riskColor}">${escapeHtml(riskLabel)}</b></div>
    <div class="muted small">Confiança do sinal: ${escapeHtml(risk?.confidence ?? 'LIMITADA')} · Atualizado ${risk ? new Date(risk.updatedAt).toLocaleString() : '—'}</div>
    <ul class="volcano-risk-reasons">${reasons}</ul>
    ${risk?.seismic24h ? `<div class="kv"><span>Sismicidade até ${escapeHtml(risk.seismicRadiusKm ?? 15)} km</span><b>${risk.seismic24h} evento(s) / 24 h · ${risk.seismicPrevious6d} nos 6 dias anteriores</b></div>` : ''}
    ${v.activity?.length ? `<div class="pp-cats">${v.activity.slice(0, 5).map((k) => `<span class="tag cat-${escapeHtml(k)}">${escapeHtml(t(`cat.${k}`))}</span>`).join('')}</div>` : ''}
    ${alert ? `<div class="kv"><span>${t('pp.alertLevel')}</span><b>${escapeHtml(alert)}</b></div>` : ''}
    <div class="kv"><span>Status geológico GVP</span><b style="color:${meta.color}">${t(`status.${v.status}`)}</b></div>
    <div class="kv"><span>${t('pp.lastEruption')}</span><b>${v.lastEruption != null ? v.lastEruption : t('pp.noRecord')}</b></div>
    ${v.status === 'ERUPCAO' ? `<div class="kv"><span>${t('erupt.last')}</span><b>${escapeHtml(inf?.end ?? t('erupt.ongoing'))}</b></div>` : ''}
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
    <h3>${q.mag != null && q.mag >= 0 ? 'M ' + q.mag.toFixed(1) : 'M n/d'} <span class="badge mag">${escapeHtml(q.magType || '')}</span></h3>
    <div class="row">${escapeHtml(q.place)}</div>
    <div class="kv"><span>${t('pp.depth')}</span><b>${q.depthKm.toFixed(1)} km</b></div>
    <div class="kv"><span>${t('pp.dateTime')}</span><b>${fmtDT(q.time, locale)}</b></div>
    <div class="kv"><span>${t('pp.coords')}</span><b>${q.lat.toFixed(2)}, ${q.lon.toFixed(2)}</b></div>
    <div class="kv"><span>${t('pp.source')}</span><b>${escapeHtml(q.source)}${q.status ? ' · ' + escapeHtml(q.status) : ''}</b></div>
    ${q.url ? `<a href="${escapeHtml(q.url)}" target="_blank" rel="noopener noreferrer">${t('pp.viewAt')} ${escapeHtml(q.source)} ↗</a>` : ''}`;
  return el;
}

/* ---------- Marcadores ---------- */

function quakeMarker(q: Quake, onSelect: (q: Quake) => void, alertMag: number, t: any, locale: string): L.Marker {
  const c = magColor(q.mag);
  const magnitude = Number.isFinite(q.mag) ? q.mag : 0;
  // Símbolo sísmico solto, sem medalhão circular. A pulsação é temporal:
  // magnitude/alerta não prolongam animação depois de 24 h do evento.
  const s = Math.round(magnitude >= 6.5 ? 23 : magnitude >= 5 ? 22 : magnitude >= 4 ? 20 : magnitude >= 3 ? 19 : magnitude >= 2 ? 18 : 16);
  const alerted = q.mag >= alertMag;
  const recent24 = isWithinLast24Hours(q.time);
  const pulsing = recent24;
  const pulseDuration = alerted || magnitude >= 5 ? '1.7s' : magnitude >= 3 ? '2.05s' : '2.7s';
  const icon = L.divIcon({
    className: 'quake-icon-wrap',
    html: `<div class="quake-icon ${pulsing ? 'pulse-active' : ''} ${alerted ? 'alerted' : ''}" style="--c:${c};--marker-size:${s}px;--pulse-duration:${pulseDuration}" role="img" aria-label="Terremoto magnitude ${q.mag?.toFixed(1) ?? 'não disponível'}${recent24 ? ', nas últimas 24 horas' : ''}${alerted ? ', acima do limite de alerta' : ''}">` +
      `<svg viewBox="0 0 24 24" width="${Math.round(s * .92)}" height="${Math.round(s * .92)}" aria-hidden="true">` +
      `<path d="M3.4 9.2 C1.2 11 1.2 13 3.4 14.8 M20.6 9.2 C22.8 11 22.8 13 20.6 14.8" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" opacity=".78"/>` +
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
  mapRef: MutableRefObject<MapController | null>;
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
  const leafletMapRef = useRef<L.Map | null>(null);
  const [mapFallback, setMapFallback] = useState(false);
  const [mapError, setMapError] = useState('');
  const [pulseClock, setPulseClock] = useState(0);
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
    v.alertInfos?.map((alert) => `${alert.source}:${alert.level}:${alert.colorCode ?? ''}:${alert.noticeTime ?? ''}:${alert.details ?? ''}`).join('|') || '',
    v.risk?.level || 'GREEN', v.risk?.reasons.join(';') || '', v.risk?.activityAt ?? '', v.risk?.pulse ? 1 : 0,
    v.risk?.continuing ? 1 : 0, v.risk?.seismic24h ?? 0, v.risk?.seismicPrevious6d ?? 0,
  ].join('~')).join('|'), [volcanoes]);
  // Agenda a retirada da pulsação no instante exato em que a evidência mais
  // próxima completa 24 h; não depende de um novo terremoto ou de polling.
  useEffect(() => {
    const now = Date.now();
    const expiryTimes = [
      ...volcanoes.filter((volcano) => (volcano.risk?.rank ?? 0) > 0 && volcano.risk?.continuing !== true).map((volcano) => Number(volcano.risk?.activityAt)),
      ...quakes.map((quake) => Number(quake.time)),
    ];
    const nextExpiry = expiryTimes.reduce<number | null>((nearest, at) => {
      if (!Number.isFinite(at) || at < now - 24 * 60 * 60_000 || at > now + 60_000) return nearest;
      const deadline = at + 24 * 60 * 60_000 + 1;
      return nearest == null || deadline < nearest ? deadline : nearest;
    }, null);
    if (nextExpiry == null) return;
    const timer = window.setTimeout(() => setPulseClock((value) => value + 1), Math.max(25, nextExpiry - now));
    return () => window.clearTimeout(timer);
  }, [volcanoMarkerKey, quakes, pulseClock]);

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
    if (!container || leafletMapRef.current) return;

    let map: L.Map;
    try {
      map = L.map(container, {
        center: [-10, -40], zoom: 3, minZoom: 1, maxZoom: 18,
        zoomControl: false, preferCanvas: true, touchZoom: true,
        scrollWheelZoom: !window.matchMedia('(pointer: coarse)').matches,
        zoomSnap: 0.5,
        // Mantém a navegação horizontal contínua entre cópias do mundo.
        // O Leaflet reposiciona a câmera sem quebrar os marcadores e overlays.
        worldCopyJump: true,
      });
    } catch (error) {
      console.error('[GeoGus] Não foi possível iniciar o mapa Leaflet:', error);
      setMapError('Não foi possível iniciar o mapa neste navegador. Atualize o navegador ou tente outro dispositivo.');
      return;
    }

    leafletMapRef.current = map;
    // O ref público do App mantém uma API pequena e independente do motor.
    mapRef.current = {
      flyTo: (center, zoom, options = {}) => map.flyTo(center, zoom, { duration: Math.max(0, options.duration ?? 0.8) }),
      fitBounds: (bounds, options = {}) => map.flyToBounds(L.latLngBounds(bounds[0], bounds[1]), {
        maxZoom: options.maxZoom ?? 8,
        duration: Math.max(0, options.duration ?? 0.8),
        padding: [28, 28],
      }),
    };

    let mapLibreLayer: ReturnType<typeof maplibreGL> | null = null;
    let fallbackLayer: L.TileLayer | null = null;
    let styleReady = false;
    let fallbackTimer: number | undefined;
    const useFallback = () => {
      if (styleReady || fallbackLayer || !map.getContainer().isConnected) return;
      console.warn('[GeoGus] Estilo vetorial não carregou a tempo; usando base raster alternativa.');
      try { if (mapLibreLayer) map.removeLayer(mapLibreLayer); } catch { /* camada parcial */ }
      mapLibreLayer = null;
      fallbackLayer = L.tileLayer(ESRI_FALLBACK_URL, {
        maxZoom: 16,
        attribution: 'Mapa alternativo: © Esri, Maxar, Earthstar Geographics, OpenStreetMap contributors',
        pane: 'tilePane',
      }).addTo(map);
      setMapFallback(true);
      setMapError('');
    };

    try {
      mapLibreLayer = maplibreGL({
        style: DARK_STYLE,
        interactive: false,
        maxPitch: 0,
        pitch: 0,
        bearing: 0,
        attributionControl: false,
        fadeDuration: 120,
      }).addTo(map);
      const glMap = mapLibreLayer.getMaplibreMap();
      // Repetição horizontal explícita: permite atravessar ±180° sem borda
      // no mapa-base vetorial, em conjunto com worldCopyJump do Leaflet.
      glMap.setRenderWorldCopies(true);
      const onStyleReady = () => {
        styleReady = true;
        if (fallbackTimer) window.clearTimeout(fallbackTimer);
        setMapFallback(false);
        setMapError('');
      };
      glMap.once('style.load', onStyleReady);
      glMap.once('load', onStyleReady);
      if (glMap.isStyleLoaded()) onStyleReady();
      glMap.on('error', (event) => {
        // Usa o tipo ErrorEvent fornecido pelo MapLibre. O campo error é
        // ErrorLike (não necessariamente uma instância global de Error).
        if (!styleReady && event.error) console.warn('[GeoGus] Erro ao carregar base vetorial:', event.error);
      });
      // O fallback só entra se o estilo inicial não carregar. Marcadores Leaflet
      // permanecem nas panes superiores e continuam funcionando normalmente.
      fallbackTimer = window.setTimeout(useFallback, 16000);
    } catch (error) {
      console.error('[GeoGus] Falha no MapLibre; usando base raster:', error);
      useFallback();
    }

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.attribution({ prefix: false }).addAttribution('© OpenFreeMap · © OpenStreetMap contributors').addTo(map);
    (map as any)._delegated = (e: MouseEvent) => {
      const b = (e.target as HTMLElement).closest?.('[data-act="more"]') as HTMLElement | null;
      if (b) cbRef.current.onKnowMore(Number(b.dataset.vn));
    };
    document.addEventListener('click', (map as any)._delegated);

    qCluster.current = L.markerClusterGroup({
      maxClusterRadius: 42, showCoverageOnHover: false, chunkedLoading: true, chunkInterval: 120, chunkDelay: 20,
      spiderfyOnMaxZoom: true, zoomToBoundsOnClick: true, disableClusteringAtZoom: 7,
      iconCreateFunction: quakeClusterIcon,
    });
    vCluster.current = L.markerClusterGroup({ maxClusterRadius: 44, showCoverageOnHover: false, chunkedLoading: true, chunkInterval: 120, chunkDelay: 20, animateAddingMarkers: false, removeOutsideVisibleBounds: true, disableClusteringAtZoom: 9, spiderfyOnMaxZoom: true, zoomToBoundsOnClick: true, iconCreateFunction: volcanoClusterIcon });
    vClusterFlat.current = L.layerGroup();
    historicalLayer.current = L.layerGroup();
    pleistoceneLayer.current = L.markerClusterGroup({ maxClusterRadius: 42, showCoverageOnHover: false, chunkedLoading: true, chunkInterval: 120, chunkDelay: 20, animateAddingMarkers: false, removeOutsideVisibleBounds: true, iconCreateFunction: pleistoceneClusterIcon });
    superLayer.current = L.layerGroup();
    map.addLayer(vCluster.current);
    map.addLayer(vClusterFlat.current);
    map.addLayer(qCluster.current);
    map.addLayer(pleistoceneLayer.current);
    map.addLayer(superLayer.current);

    // Leaflet recalcula o viewport em mudanças de layout, rotação e barras do navegador.
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
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', invalidate);
      window.removeEventListener('orientationchange', invalidate);
      window.visualViewport?.removeEventListener('resize', invalidate);
      document.removeEventListener('click', (map as any)._delegated);
      qCluster.current = null; vCluster.current = null; vClusterFlat.current = null;
      historicalLayer.current = null; pleistoceneLayer.current = null; superLayer.current = null;
      try { map.remove(); } finally { leafletMapRef.current = null; mapRef.current = null; }
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
        const hasActivity = (v.risk?.rank ?? 0) > 0;
        if (flat && !hasActivity) continue;
        const severe = v.risk?.level === 'RED';
        const m = L.marker([v.lat, v.lon], { icon: volcanoIcon(v), title: v.name, alt: `${v.name} — ${v.risk?.label ?? 'NORMAL'}`, riseOnHover: true, riseOffset: 1400, zIndexOffset: severe ? 1100 : hasActivity ? 900 : 500 });
        (m.options as L.MarkerOptions & { volcanoRiskRank?: number; volcanoRiskLevel?: string; volcanoRecent24?: boolean }).volcanoRiskRank = v.risk?.rank ?? 0;
        (m.options as L.MarkerOptions & { volcanoRiskRank?: number; volcanoRiskLevel?: string; volcanoRecent24?: boolean }).volcanoRiskLevel = v.risk?.level ?? 'GREEN';
        (m.options as L.MarkerOptions & { volcanoRecent24?: boolean }).volcanoRecent24 = shouldPulseVolcano(v);
        m.bindPopup(() => volcanoPopupHtml(v, ongoingRef.current, t), { maxWidth: 340, autoPanPadding: [24, 24], closeButton: true });
        m.on('click', () => cbRef.current.onSelectVolcano(v));
        g.addLayer(m);
      }
    }
  }, [volcanoMarkerKey, ongoingMarkerKey, pulseClock, settings.showVolcanoes, settings.country, settings.volcanoFilter, t]);

  // Vulcões do Pleistoceno: catálogo mundial do GVP (camada distinta dos Holocenos).
  useEffect(() => {
    const map = leafletMapRef.current;
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
    const map = leafletMapRef.current;
    const group = superLayer.current;
    if (!map || !group) return;
    group.clearLayers();
    const visibleByFilter = (v: Volcano) => {
      if (settings.volcanoFilter === 'erupting') return (v.risk?.rank ?? 0) > 0;
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
        icon: superVolcanoIcon(volcano), title: info.displayName,
        alt: `Grande caldeira ${info.displayName}; classificação histórica, sem indicação de atividade atual`, zIndexOffset: 1200,
      });
      marker.bindPopup(() => superVolcanoPopup(volcano), { maxWidth: 360 });
      marker.on('click', () => cbRef.current.onSelectVolcano(volcano));
      group.addLayer(marker);
    }
  }, [volcanoMarkerKey, pulseClock, settings.showVolcanoes, settings.showSupervolcanoes, settings.volcanoFilter, settings.country]);

  // Estruturas geológicas muito antigas (ex.: Mendanha/Amazônia): camada manual
  // separada do catálogo de vulcões Holocenos e Pleistocenos.
  useEffect(() => {
    const map = leafletMapRef.current;
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
  }, [quakes, pulseClock, settings.showQuakes, settings.minMag, settings.country, alertMag, t, locale]);

  // foco + destaque temporário (+ popup do vulcão)
  useEffect(() => {
    const map = leafletMapRef.current; if (!map || !focus) return;
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
      <div ref={divRef} className="mapview mapview-hybrid" aria-label="Mapa global de monitoramento sísmico e vulcânico" />
      {mapFallback && <div className="map-render-notice" role="status">Mapa vetorial indisponível; usando base cartográfica alternativa.</div>}
      {mapError && <div className="map-render-error" role="alert">{mapError}</div>}
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
          <span><i className="lg-map-icon lg-volcano normal"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={VOLCANO_PATH} fill="currentColor" /></svg></i> {t('legend.normal')}</span>
          <span><i className="lg-map-icon lg-volcano aviso"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={VOLCANO_PATH} fill="currentColor" /></svg></i> {t('legend.advisory')}</span>
          <span><i className="lg-map-icon lg-volcano atencao"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={VOLCANO_PATH} fill="currentColor" /></svg></i> {t('legend.attention')}</span>
          <span><i className="lg-map-icon lg-volcano perigo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={VOLCANO_PATH} fill="currentColor" /></svg></i> {t('legend.danger')}</span>
          {settings.showPleistoceneVolcanoes && <span><i className="lg-historical">△</i> Vulcões do Pleistoceno (catálogo mundial GVP)</span>}
          {settings.showSupervolcanoes && <span><i className="lg-super">✦</i> Supererupções documentadas / grandes caldeiras candidatas</span>}
          {settings.showHistoricalGeology && <span><i className="lg-historical">◇</i> Estruturas geológicas muito antigas</span>}
          <span><i className="lg-map-icon lg-quake"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={BOLT_PATH} fill="#64d2ff" /></svg></i> {t('legend.quake')}</span>
          <span><i className="lg-alert" /> Terremoto acima do limite de alerta</span>
          <span className="muted small">{t('pp.source')}: Base vetorial: OpenFreeMap · OpenStreetMap · Dados: Smithsonian GVP · USGS/EMSC</span>
        </div>
      </section>
    </>
  );
}
