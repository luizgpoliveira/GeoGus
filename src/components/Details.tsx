import { useEffect, useState } from 'react';
import type { Quake, ReportItem, Volcano } from '../types';
import { GVP_PAGE, loadVolcanoDetail, loadVolcanoEruptions, loadWikipedia, type VolcanoHistory } from '../api';
import VolcanoPhoto from './VolcanoPhoto';
import { useI18n } from '../i18n';

const fmtDT = (t: number, locale: string) => new Date(t).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });

export function VolcanoDetails({ v, reports = [], onClose }: { v: Volcano; reports?: ReportItem[]; onClose: () => void }) {
  const { t, locale } = useI18n();
  const [detail, setDetail] = useState<{ remarks?: string; image?: Volcano['image'] } | null>(null);
  const [erups, setErups] = useState<VolcanoHistory | null>(null);
  const [wiki, setWiki] = useState<{ title: string; extract: string; url: string } | null>(null);
  const [wikiErr, setWikiErr] = useState(false);

  useEffect(() => {
    let alive = true;
    setDetail(null); setErups(null); setWiki(null); setWikiErr(false);
    loadVolcanoDetail(v.vn).then((d) => alive && setDetail(d)).catch(() => alive && setDetail({}));
    loadVolcanoEruptions(v.vn).then((e) => alive && setErups(e)).catch(() => alive && setErups({ list: [], stamp: null, first: null, last: null }));
    loadWikipedia(v.name).then((w) => { if (alive) w ? setWiki(w) : setWikiErr(true); }).catch(() => alive && setWikiErr(true));
    return () => { alive = false; };
  }, [v.vn]);

  const geologicNote =
    v.status === 'ERUPCAO' ? t('dt.geoErupting')
      : v.status === 'RECENTE' ? t('dt.recentNote')
      : v.holocene ? t('dt.geoActive')
      : t('dt.geoExtinct');

  const updates = reports.filter((r) => r.volcanoVn === v.vn).sort((a, b) => b.ts - a.ts);

  return (
    <aside className="drawer">
      <header>
        <h2>{v.name}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="✕">✕</button>
      </header>
      <div className="drawer-body">
        <span className="badge status" style={{ background: { ERUPCAO: '#ff3b30', RECENTE: '#a78bfa', ATIVO: '#ff9f0a', DORMENTE: '#ffd60a', EXTINTO: '#8e8e93', INDEFINIDO: '#5e5ce6' }[v.status] }}>
          {t(`status.${v.status}`)}
        </span>
        {v.activity?.length ? (
          <div className="icard-cats" style={{ marginTop: 8 }}>
            {v.activity.slice(0, 6).map((k) => <span key={k} className={`tag cat-${k}`}>{t(`cat.${k}` as any)}</span>)}
          </div>
        ) : null}
        <p className="muted small">{geologicNote}</p>
        <div className="kv-grid">
          <div><span>{t('dt.country')}</span><b>{v.country}</b></div>
          <div><span>{t('dt.type')}</span><b>{v.type}</b></div>
          <div><span>{t('pp.lastEruption')}</span><b>{v.lastEruption ?? t('pp.noRecord')}</b></div>
          {v.alertInfo && (
            <div>
              <span>{t('pp.alertLevel')}</span>
              <b>{v.alertInfo.source} · {v.alertInfo.level}{v.alertInfo.colorCode ? ` · ${v.alertInfo.colorCode}` : ''}{v.alertInfo.noticeTime ? ` · ${t('pp.bulletin')} ${v.alertInfo.noticeTime}` : ''}</b>
              {v.alertInfo.details && <div className="muted small">{v.alertInfo.details}</div>}
            </div>
          )}
          <div><span>{t('pp.elevation')}</span><b>{v.elevation != null ? `${v.elevation} m` : t('pp.na')}</b></div>
          <div><span>{t('pp.coords')}</span><b>{v.lat.toFixed(3)}, {v.lon.toFixed(3)}</b></div>
          <div><span>{t('dt.pop10')}</span><b>{v.pop?.p10 != null ? v.pop.p10.toLocaleString(locale) : t('pp.na')}</b></div>
        </div>

        {updates.length > 0 && (
          <>
            <h3>{t('updates.recent')}</h3>
            <ul className="upd-list compact">
              {updates.slice(0, 6).map((it) => (
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
                  {it.text && it.text !== it.title && <p className="upd-text">{String(it.text).slice(0, 240)}</p>}
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
          </>
        )}

        <VolcanoPhoto vn={v.vn} name={v.name} gvpFile={detail?.image?.file ?? v.image?.file} />

        <h3>{t('dt.description')}</h3>
        {detail === null ? <p className="muted small">{t('dt.loading')}</p>
          : detail.remarks ? <p>{detail.remarks}</p>
          : <p className="muted small">{t('dt.noDesc')}</p>}

        <h3>{t('dt.history')}</h3>
        {erups === null ? <p className="muted small">{t('dt.loading')}</p>
          : erups.list.length === 0 ? <p className="muted small">{t('dt.noHistory')}</p>
          : (
            <>
              <div className="kv-grid">
                <div><span>{t('dt.first')}</span><b>{erups.first ?? t('pp.noRecord')}</b></div>
                <div><span>{t('dt.last')}</span><b>{erups.last ?? t('pp.noRecord')}</b></div>
              </div>
              <ul className="erup-list">
                {erups.list.slice(0, 12).map((e, i) => (
                  <li key={i}>
                    <b>{e.start}</b>{e.end ? ` → ${e.end}` : ''}
                    {e.vei != null && <span className="muted"> · VEI {e.vei}</span>}
                    {e.type === 'Uncertain Eruption' && <span className="muted"> · ?</span>}
                  </li>
                ))}
              </ul>
              {erups.stamp && (
                <p className="muted small">{t('dt.stamp', { time: new Date(erups.stamp).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) })}</p>
              )}
            </>
          )}

        <h3>{t('dt.wikipedia')}</h3>
        {wiki ? (
          <div className="wiki">
            <p>{wiki.extract}</p>
            <a href={wiki.url} target="_blank" rel="noreferrer">{t('pp.viewAt')} Wikipedia ↗</a>
          </div>
        ) : wikiErr ? <p className="muted small">{t('dt.wikiMissing')}</p>
          : <p className="muted small">{t('dt.loading')}</p>}

        <p className="sources small muted">
          {t('dt.sources')} <a href={GVP_PAGE(v.vn)} target="_blank" rel="noreferrer">Smithsonian GVP (vn {v.vn})</a>,
          {' '}<a href="https://www.wikipedia.org" target="_blank" rel="noreferrer">Wikipedia</a>. {t('dt.updateNote')}
        </p>
      </div>
    </aside>
  );
}

export function QuakeDetails({ q, onClose }: { q: Quake; onClose: () => void }) {
  const { t, locale } = useI18n();
  return (
    <aside className="drawer">
      <header>
        <h2>{q.mag != null && q.mag >= 0 ? `M ${q.mag.toFixed(1)}` : '—'}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="✕">✕</button>
      </header>
      <div className="drawer-body">
        {q.mag >= 5 && <span className="badge status" style={{ background: '#ff3b30' }}>{t('dt.significant')}</span>}
        <div className="kv-grid">
          <div><span>{t('dt.place')}</span><b>{q.place}</b></div>
          <div><span>M</span><b>{q.mag != null && q.mag >= 0 ? q.mag.toFixed(1) : t('pp.na')} {q.magType}</b></div>
          <div><span>{t('pp.depth')}</span><b>{q.depthKm.toFixed(1)} km</b></div>
          <div><span>{t('pp.dateTime')}</span><b>{fmtDT(q.time, locale)}</b></div>
          <div><span>{t('pp.coords')}</span><b>{q.lat.toFixed(3)}, {q.lon.toFixed(3)}</b></div>
          <div><span>{t('pp.source')}</span><b>{q.source === 'USP' ? 'Centro de Sismologia USP / RSBR' : q.source}{q.status ? ` · ${q.status}` : ''}</b></div>
          {q.sources && q.sources.length > 1 && <div><span>Fontes correlacionadas</span><b>{q.sources.join(' · ')}</b></div>}
          {q.felt != null && <div><span>{t('pp.feltBy')}</span><b>{q.felt}</b></div>}
        </div>
        {q.url && <p><a href={q.url} target="_blank" rel="noreferrer">{t('pp.viewAt')} {q.source} ↗</a></p>}
      </div>
    </aside>
  );
}
