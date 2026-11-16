import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReportItem, ReportsPayload, Volcano } from '../types';
import { GVP_PAGE, loadHistoricalHazards, type HistoricalHazard } from '../api';
import { useI18n } from '../i18n';
import VolcanoPhoto from './VolcanoPhoto';

const fmtDT = (ts: number, locale: string) =>
  new Date(ts).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });

const CAT_ORDER = ['ERUPCAO', 'ERUPCAO_RECENTE', 'EXPLOSIVA', 'CINZAS', 'ERUPCAO_MODERADA', 'STROMBOLIANA', 'LAVA', 'PIROCLASTICO', 'LAHAR', 'INCANDESCENCIA', 'SISMICIDADE', 'GASES', 'INQUIETACAO'];

interface IntelProps {
  reports: ReportsPayload | null;
  error?: string | null;
  volcanoes: Volcano[];
  onLocate: (vn: number) => void;
  onOpen: (vn: number) => void;
}

interface ActiveCard {
  volcano: Volcano;
  latest?: ReportItem;
  cats: string[];
  hazard?: HistoricalHazard;
}

function riskInfo(hazard?: HistoricalHazard) {
  if (!hazard || hazard.maxVei == null || !Number.isFinite(hazard.maxVei)) {
    return {
      key: 'unknown', label: 'Histórico não classificado',
      note: 'Sem VEI máximo confiável no histórico Holoceno consultado do Smithsonian GVP; não é possível atribuir uma faixa.', rank: -1,
    };
  }
  const vei = hazard.maxVei;
  if (vei >= 6) return { key: 'extreme', label: 'Extremamente perigoso · histórico', note: `Faixa visual GeoGus baseada no maior VEI (${vei}) no histórico Holoceno do GVP. Não é avaliação de risco atual, exposição ou previsão.`, rank: 4 };
  if (vei >= 4) return { key: 'high', label: 'Perigoso · histórico', note: `Faixa visual GeoGus baseada no maior VEI (${vei}) no histórico Holoceno do GVP. Não é avaliação de risco atual, exposição ou previsão.`, rank: 3 };
  if (vei >= 2) return { key: 'moderate', label: 'Moderado · histórico', note: `Faixa visual GeoGus baseada no maior VEI (${vei}) no histórico Holoceno do GVP. Não é avaliação de risco atual, exposição ou previsão.`, rank: 2 };
  return { key: 'low', label: 'Tranquilo · histórico', note: `Maior VEI documentado: ${vei}. Indica menor explosividade registrada no histórico consultado, não ausência de outros perigos nem garantia de segurança.`, rank: 1 };
}

/** Carrossel operacional: somente vulcões cuja erupção em andamento foi confirmada. */
export default function Intel({ reports, volcanoes, onLocate, onOpen }: IntelProps) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(true);
  const eruptingVolcanoes = useMemo(
    () => volcanoes.filter((v) => v.status === 'ERUPCAO'),
    [volcanoes],
  );
  const eruptingKey = useMemo(
    () => eruptingVolcanoes.map((v) => v.vn).sort((a, b) => a - b).join(','),
    [eruptingVolcanoes],
  );
  const [hazards, setHazards] = useState<Map<number, HistoricalHazard>>(new Map());

  useEffect(() => {
    if (!eruptingKey) { setHazards(new Map()); return; }
    let alive = true;
    const ids = eruptingKey.split(',').map(Number);
    loadHistoricalHazards(ids)
      .then((data) => { if (alive) setHazards(data); })
      .catch(() => { /* o carrossel continua; mostra histórico sem classificação até nova tentativa */ });
    return () => { alive = false; };
  }, [eruptingKey]);

  const cards = useMemo<ActiveCard[]>(() => {
    const now = Date.now();
    const list = eruptingVolcanoes.map((volcano) => {
      const latest = (reports?.items || [])
        .filter((item) => item.volcanoVn === volcano.vn
          && item.kind === 'OFICIAL'
          && item.verified === 'CONFIRMADO'
          && item.ts <= now + 60 * 60_000
          && now - item.ts <= 7 * 24 * 60 * 60_000)
        .sort((a, b) => b.ts - a.ts)[0];
      const cats = [...new Set(['ERUPCAO', ...(volcano.activity || []), ...(latest?.cats || [])])]
        .filter((cat) => CAT_ORDER.includes(cat));
      return { volcano, latest, cats, hazard: hazards.get(volcano.vn) };
    });
    return list.sort((a, b) => riskInfo(b.hazard).rank - riskInfo(a.hazard).rank
      || (b.hazard?.maxVei ?? -1) - (a.hazard?.maxVei ?? -1)
      || a.volcano.name.localeCompare(b.volcano.name));
  }, [eruptingVolcanoes, reports, hazards]);

  const cardsViewportRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const viewport = cardsViewportRef.current;
    if (!viewport) return;
    const updateNavigation = () => {
      const maxScroll = viewport.scrollWidth - viewport.clientWidth;
      setCanScrollLeft(viewport.scrollLeft > 2);
      setCanScrollRight(maxScroll > 2 && viewport.scrollLeft < maxScroll - 2);
    };
    updateNavigation();
    viewport.addEventListener('scroll', updateNavigation, { passive: true });
    const observer = new ResizeObserver(updateNavigation);
    observer.observe(viewport);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    return () => { viewport.removeEventListener('scroll', updateNavigation); observer.disconnect(); };
  }, [cards.length, open]);

  const scrollCards = (direction: -1 | 1) => {
    const viewport = cardsViewportRef.current;
    if (!viewport) return;
    viewport.scrollBy({ left: direction * viewport.clientWidth * 0.82, behavior: 'smooth' });
  };

  return (
    <section className={`intel ${open ? 'open' : ''}`}>
      <div className="intel-head">
        <button className="intel-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="intel-dot" /> {t('intel.title')}
          <span className="intel-count">{cards.length}</span>
          <span className="intel-chev">{open ? '▾' : '▸'}</span>
        </button>
      </div>
      {open && cards.length > 0 && (
        <div className="intel-body intel-body-carousel-only">
          <div className="intel-carousel">
            <button type="button" className="intel-nav" onClick={() => scrollCards(-1)} disabled={!canScrollLeft} aria-label={t('intel.previous')} title={t('intel.previous')}>‹</button>
            <div className="intel-cards" ref={cardsViewportRef}>
                {cards.map((card) => {
                  const v = card.volcano;
                  const alert = v.alertInfo;
                  const risk = riskInfo(card.hazard);
                  const latest = card.latest;
                  const profileUrl = GVP_PAGE(v.vn);
                  return (
                    <article key={v.vn} className="icard erupting">
                      <div className="icard-photo"><VolcanoPhoto vn={v.vn} name={v.name} gvpFile={v.image?.file} /></div>
                      <div className="icard-body">
                        <h4>{v.name} <span className="icard-country">{v.country}</span></h4>
                        <div className="icard-status">
                          <span className="badge live">{t('status.ERUPCAO')}</span>
                          <span className={`risk-badge risk-${risk.key}`} title={risk.note}>{risk.label}{card.hazard?.maxVei != null ? ` · VEI ${card.hazard.maxVei}` : ''}</span>
                          {alert && <span className="icard-alert">{alert.source} · {String(alert.level)}{alert.colorCode ? ` · ${alert.colorCode}` : ''}</span>}
                        </div>
                        {card.cats.length > 0 && <div className="icard-cats">{card.cats.slice(0, 4).map((k) => <span key={k} className={`tag cat-${k}`}>{t(`cat.${k}` as any)}</span>)}</div>}
                        <p className="icard-sum"><span className="muted small">{t('intel.lastEvent')}: </span>{latest?.title || 'Erupção em andamento registrada no catálogo vulcânico.'}</p>
                        {latest?.text && latest.text !== latest.title && <p className="icard-text">{String(latest.text).slice(0, 180)}</p>}
                        <div className="icard-meta">
                          <span className="kind oficial">CONFIRMADO</span>
                          {' '}{latest?.url
                            ? <a className="intel-source-link" href={latest.url} target="_blank" rel="noopener noreferrer" title={latest.source}>{latest.source}</a>
                            : <a className="intel-source-link" href={profileUrl} target="_blank" rel="noopener noreferrer">Smithsonian GVP</a>}
                          {' · '}{latest?.date ? String(latest.date) : 'Registro de erupção em andamento'}
                        </div>
                        <div className="icard-actions">
                          <button className="btn" onClick={() => onLocate(v.vn)}>{t('intel.locate')}</button>
                          <button className="btn ghost" onClick={() => onOpen(v.vn)}>{t('intel.more')}</button>
                        </div>
                      </div>
                    </article>
                  );
                })}
            </div>
            <button type="button" className="intel-nav" onClick={() => scrollCards(1)} disabled={!canScrollRight} aria-label={t('intel.next')} title={t('intel.next')}>›</button>
          </div>
        </div>
      )}
    </section>
  );
}

interface UpdatesProps {
  items: ReportItem[];
  onLocate: (vn: number) => void;
  onOpen?: (vn: number) => void;
}

/** Lista ATUALIZAÇÕES (aba da sidebar): relatórios oficiais e notícias, com filtro. */
export function UpdatesList({ items, onLocate, onOpen }: UpdatesProps) {
  const { t, locale } = useI18n();
  const [onlyOfficial, setOnlyOfficial] = useState(false);
  const list = (onlyOfficial ? items.filter((i) => i.kind === 'OFICIAL') : items).slice(0, 120);

  return (
    <div className="updates">
      <div className="updates-bar">
        <b>{t('updates.title')}</b>
        <label className="chk">
          <input type="checkbox" checked={onlyOfficial} onChange={(e) => setOnlyOfficial(e.target.checked)} /> {t('updates.officialOnly')}
        </label>
      </div>
      {list.length === 0 && <p className="empty">{t('updates.empty')}</p>}
      <ul className="upd-list">
        {list.map((it) => (
          <li key={it.id} className={`upd ${it.kind === 'OFICIAL' ? 'oficial' : 'noticia'}`}>
            <div className="upd-head">
              <span className={`kind ${it.kind === 'OFICIAL' ? 'oficial' : 'noticia'}`}>
                {it.kind === 'OFICIAL' ? t('updates.official') : t('updates.news')}
              </span>
              <span className={`verif ${it.verified === 'CONFIRMADO' ? 'ok' : it.verified === 'NAO_CONFIRMADO' ? 'bad' : 'warn'}`}>
                {it.verified === 'CONFIRMADO' ? t('updates.confirmed') : it.verified === 'NAO_CONFIRMADO' ? t('updates.unconfirmed') : t('updates.reported')}
              </span>
              <span className="upd-date">{it.date ? String(it.date) : fmtDT(it.ts, locale)}</span>
            </div>
            <div className="upd-title">{String(it.title)}</div>
            {it.volcanoName && (
              <div className="upd-volcano">
                <button className="linklike" onClick={() => { if (it.volcanoVn) onLocate(it.volcanoVn); onOpen?.(it.volcanoVn ?? -1); }}>
                  {it.volcanoName}{it.country ? ` · ${it.country}` : ''}
                </button>
              </div>
            )}
            {it.period && <div className="upd-period muted small">{t('updates.period')}: {String(it.period)}</div>}
            {it.text && it.text !== it.title && <p className="upd-text">{String(it.text).slice(0, 400)}</p>}
            {it.cats.length > 0 && (
              <div className="icard-cats">{it.cats.slice(0, 4).map((k) => <span key={k} className={`tag cat-${k}`}>{t(`cat.${k}` as any)}</span>)}</div>
            )}
            <div className="upd-foot">
              <span className="muted small">{it.source}</span>
              {it.url && <a className="linklike" href={it.url} target="_blank" rel="noopener noreferrer">{t('pp.more')}</a>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
