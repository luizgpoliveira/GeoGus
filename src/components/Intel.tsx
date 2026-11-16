import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReportItem, ReportsPayload, Volcano } from '../types';
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

/** Cards consolidados por vulcão a partir dos relatórios (oficiais primeiro). */
function buildCards(items: ReportItem[], volcanoes: Volcano[]) {
  const byVn = new Map<number, { items: ReportItem[] }>();
  for (const it of items) {
    if (!it.volcanoVn) continue;
    const g = byVn.get(it.volcanoVn) ?? { items: [] };
    g.items.push(it);
    byVn.set(it.volcanoVn, g);
  }
  const out = [] as Array<{
    vn: number; name: string; country: string; latest: ReportItem; official: ReportItem | null;
    cats: string[]; volcano: Volcano | undefined;
  }>;
  for (const [vn, g] of byVn) {
    const sorted = [...g.items].sort((a, b) => b.ts - a.ts);
    const official = sorted.find((x) => x.kind === 'OFICIAL' && x.verified === 'CONFIRMADO') ?? null;
    const latest = official ?? sorted[0];
    // Quando há boletim oficial, as categorias exibidas vêm somente de fontes oficiais.
    // Notícias continuam podendo identificar o vulcão, mas não sobrescrevem a classificação oficial.
    const categoryItems = official ? sorted.filter((x) => x.kind === 'OFICIAL' && x.verified === 'CONFIRMADO') : sorted;
    const cats = [...new Set(categoryItems.flatMap((x) => x.cats))].filter((c) => CAT_ORDER.includes(c));
    out.push({
      vn,
      name: latest.volcanoName || `vn ${vn}`,
      country: latest.country || '—',
      latest, official, cats,
      volcano: volcanoes.find((v) => v.vn === vn),
    });
  }
  // erupção primeiro, depois atividade oficial recente, depois notícias
  const w = (c: typeof out[number]) => (c.volcano?.status === 'ERUPCAO' ? 0 : c.official ? 1 : 2);
  return out.sort((a, b) => w(a) - w(b) || b.latest.ts - a.latest.ts);
}

export default function Intel({ reports, error, volcanoes, onLocate, onOpen }: IntelProps) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(true);
  const cards = useMemo(() => {
    if (!reports) return [];
    // Boletins BGVN podem cobrir meses/anos anteriores: eles ficam em ATUALIZAÇÕES
    // e no histórico, mas não devem aparecer como atividade do momento nos cards.
    const recentItems = reports.items.filter((item) => Date.now() - item.ts <= 7 * 24 * 60 * 60 * 1000);
    return buildCards(recentItems, volcanoes);
  }, [reports, volcanoes]);
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
    return () => {
      viewport.removeEventListener('scroll', updateNavigation);
      observer.disconnect();
    };
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
      {open && reports && cards.length > 0 && (
        <div className="intel-body" aria-label={t('intel.cards')}>
          {/* O panorama textual e os chips de fontes continuam sendo calculados no backend,
              mas ficam ocultos na interface. Os mesmos relatórios alimentam os cards abaixo. */}
          <div className="intel-carousel">
                    <button
                      type="button"
                      className="intel-nav"
                      onClick={() => scrollCards(-1)}
                      disabled={!canScrollLeft}
                      aria-label={t('intel.previous')}
                      title={t('intel.previous')}
                    >‹</button>
                    <div className="intel-cards" ref={cardsViewportRef}>
                    {cards.map((c) => {
                      const status = c.volcano?.status;
                      const alert = c.volcano?.alertInfo;
                      const cats = c.cats.slice(0, 4);
                      return (
                        <article key={c.vn} className={`icard ${status === 'ERUPCAO' ? 'erupting' : ''}`}>
                          <div className="icard-photo">
                            <VolcanoPhoto vn={c.vn} name={c.name} gvpFile={c.volcano?.image?.file} />
                          </div>
                          <div className="icard-body">
                            <h4>{c.name} <span className="icard-country">{c.country}</span></h4>
                            <div className="icard-status">
                              {status && <span className={`badge ${status === 'ERUPCAO' ? 'live' : 'status'}`}>{t(`status.${status}`)}</span>}
                              {alert && (
                                <span className="icard-alert">{alert.source} · {String(alert.level)}{alert.colorCode ? ` · ${alert.colorCode}` : ''}</span>
                              )}
                            </div>
                            {cats.length > 0 && (
                              <div className="icard-cats">{cats.map((k) => <span key={k} className={`tag cat-${k}`}>{t(`cat.${k}` as any)}</span>)}</div>
                            )}
                            <p className="icard-sum"><span className="muted small">{t('intel.lastEvent')}: </span>{String(c.latest.title)}</p>
                            {c.latest.text && c.latest.text !== c.latest.title && (
                              <p className="icard-text">{String(c.latest.text).slice(0, 180)}</p>
                            )}
                            <div className="icard-meta">
                              <span className={`kind ${c.latest.kind === 'OFICIAL' ? 'oficial' : 'noticia'}`}>
                                {c.latest.kind === 'OFICIAL' ? t('updates.official') : t('updates.news')}
                              </span>
                              {' '}{c.latest.url
                                ? <a className="intel-source-link" href={c.latest.url} target="_blank" rel="noopener noreferrer" title={c.latest.source}>{c.latest.source}</a>
                                : c.latest.source}
                              {' · '}{c.latest.date ? String(c.latest.date) : fmtDT(c.latest.ts, locale)}
                            </div>
                            <div className="icard-actions">
                              <button className="btn" onClick={() => onLocate(c.vn)}>{t('intel.locate')}</button>
                              <button className="btn ghost" onClick={() => onOpen(c.vn)}>{t('intel.more')}</button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                    </div>
                    <button
                      type="button"
                      className="intel-nav"
                      onClick={() => scrollCards(1)}
                      disabled={!canScrollRight}
                      aria-label={t('intel.next')}
                      title={t('intel.next')}
                    >›</button>
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
