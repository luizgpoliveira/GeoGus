import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import MapView from './components/MapView';
import SearchBar, { type Suggestion } from './components/SearchBar';
import Intel, { UpdatesList } from './components/Intel';
import { HISTORICAL_GEOLOGY } from './historicalGeology';
import { VolcanoDetails, QuakeDetails } from './components/Details';
import type { NotifEntry, Quake, ReportsPayload, Settings, SourceInfo, Volcano } from './types';
import {
  classifyVolcano, loadActiveSince1960, loadOngoingEruptions, loadRecentEruptions, loadQuakes, loadVolcanoCatalog, countryPolygon,
  loadHansStatus, loadPhivolcsStatus, loadPvmbgStatus, loadReports, activityByVolcano,
  type AlertMaps,
} from './api';
import { I18nContext, LANGS, LOCALE_TAG, makeT, useI18n, type Lang } from './i18n';

const POLL_QUAKES = 5 * 60_000;
const POLL_ERUP = 15 * 60_000;
const POLL_REPORTS = 10 * 60_000;

const DEFAULT_SETTINGS: Settings = {
  minMag: 1.0, alertMag: 5.0, period: 'week', country: '', volcanoFilter: 'erupting',
  showQuakes: true, showVolcanoes: true, showHistoricalGeology: false,
  quakeAlerts: true, eruptionAlerts: true, browserNotifs: false,
};

const loadSettings = (): Settings => {
  try {
    const saved = JSON.parse(localStorage.getItem('tp.settings') || '{}');
    // A cada nova abertura, começar mostrando somente erupções em andamento.
    // Durante a sessão, o usuário continua livre para selecionar outros filtros.
    return { ...DEFAULT_SETTINGS, ...saved, volcanoFilter: 'erupting', showVolcanoes: true, showHistoricalGeology: false };
  } catch { return DEFAULT_SETTINGS; }
};

export default function App() {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem('tp.lang') as Lang) || 'pt-BR');
  const setLang = useCallback((l: Lang) => {
    localStorage.setItem('tp.lang', l);
    setLangState(l);
  }, []);
  const t = useMemo(() => makeT(lang), [lang]);
  const ctx = useMemo(() => ({ lang, setLang, t, locale: LOCALE_TAG[lang] }), [lang, setLang, t]);
  return (
    <I18nContext.Provider value={ctx}>
      <Shell />
    </I18nContext.Provider>
  );
}

function Shell() {
  const { t, locale, lang, setLang } = useI18n();
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [quakes, setQuakes] = useState<Quake[]>([]);
  const [quakeInfo, setQuakeInfo] = useState<SourceInfo>({ id: 'quakes', label: 'Terremotos', ok: false, updated: null });
  const [volcanoes, setVolcanoes] = useState<Volcano[]>([]);
  const [volcanoInfo, setVolcanoInfo] = useState<SourceInfo>({ id: 'gvp', label: 'Smithsonian GVP', ok: false, updated: null });
  const [notifs, setNotifs] = useState<NotifEntry[]>(() => { try { return JSON.parse(localStorage.getItem('tp.notifs') || '[]'); } catch { return []; } });
  const [tab, setTab] = useState<'quakes' | 'volcanoes' | 'updates'>('quakes');
  const [reports, setReports] = useState<ReportsPayload | null>(null);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [selQuake, setSelQuake] = useState<Quake | null>(null);
  const [selVolcano, setSelVolcano] = useState<Volcano | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lon: number; zoom: number; id: string; kind: 'quake' | 'volcano' | 'place'; name?: string } | null>(null);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSide, setShowSide] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const mapRef = useRef<L.Map | null>(null);
  const seenQuakes = useRef<Set<string>>(new Set(JSON.parse(localStorage.getItem('tp.seen') || '[]')));
  const baseline = useRef({ quakes: false, eruptions: false });
  const ongoingRef = useRef<Set<number>>(new Set());
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => { localStorage.setItem('tp.settings', JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem('tp.notifs', JSON.stringify(notifs.slice(0, 80))); }, [notifs]);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const pushNotif = useCallback((n: NotifEntry, browser: boolean) => {
    setNotifs((prev) => [n, ...prev.filter((x) => x.key !== n.key)].slice(0, 80));
    if (browser && Notification.permission === 'granted') {
      try { new Notification(n.title, { body: n.body, tag: n.key }); } catch { /* alguns navegadores exigem SW */ }
    }
  }, []);

  /* ---------- Catálogo de vulcões + alertas de observatórios (1x) ---------- */
  const ongoingRef2 = useRef<Map<number, { start: string; end: string | null; vei: number | null }>>(new Map());
  const recentRef = useRef<Set<number>>(new Set());
  const reportedCurrentEruptionsRef = useRef<Set<number>>(new Set());
  const activeRef = useRef<Set<number>>(new Set());
  const alertsRef = useRef<AlertMaps | undefined>(undefined);
  const eruptingRef = useRef<Set<number>>(new Set());
  const [obsInfo, setObsInfo] = useState<Record<'phivolcs' | 'pvmbg' | 'usgs', SourceInfo | null>>({ phivolcs: null, pvmbg: null, usgs: null });
  const refreshRunning = useRef(false);
  const activityRef = useRef<Map<number, string[]>>(new Map());
  const volcanoesRef = useRef(volcanoes);
  volcanoesRef.current = volcanoes;

  const withActivity = useCallback((list: Volcano[]) =>
    list.map((v) => (activityRef.current.has(v.vn) ? { ...v, activity: activityRef.current.get(v.vn) } : v)), []);

  const classifyAll = useCallback((ongoing: Set<number>, alerts?: AlertMaps) => {
    const confirmedCurrent = new Set([...ongoing, ...reportedCurrentEruptionsRef.current]);
    return withActivity(volcanoesRef.current.map((v) => classifyVolcano(v, confirmedCurrent, activeRef.current, recentRef.current, alerts)));
  }, [withActivity]);

  const srcInfo = (id: string, label: string, s: PromiseSettledResult<any>): SourceInfo => {
    if (s.status === 'rejected') return { id, label, ok: false, updated: null, error: String(s.reason?.message ?? s.reason) };
    const value = s.value as { stale?: boolean; stamp?: string; cacheAgeMs?: number };
    const updated = value?.stamp ? Date.parse(value.stamp) : Date.now();
    return {
      id, label, ok: true, stale: !!value?.stale,
      updated: Number.isFinite(updated) ? updated : Date.now(),
      error: value?.stale ? `Fonte sem atualização; usando cache de ${Math.max(1, Math.round((value.cacheAgeMs || 0) / 60_000))} min.` : undefined,
    };
  };

  /** GVP WFS + observatórios nacionais: coleta, registra erros por fonte e reclassifica. */
  const refreshEruptions = useCallback(async (notify: boolean) => {
    if (refreshRunning.current) return;
    refreshRunning.current = true;
    try {
    const [erupR, hansR, phivR, pvmbgR] = await Promise.allSettled([
      loadOngoingEruptions(), loadHansStatus(), loadPhivolcsStatus(), loadPvmbgStatus(),
    ]);
    if (erupR.status !== 'fulfilled') return; // proxy do WFS mantém cache stale; erro só se proxy morto
    const erup = erupR.value;
    const alerts: AlertMaps = {
      hans: hansR.status === 'fulfilled' ? hansR.value : (alertsRef.current?.hans ?? new Map()),
      phivolcs: phivR.status === 'fulfilled' ? phivR.value : (alertsRef.current?.phivolcs ?? new Map()),
      pvmbg: pvmbgR.status === 'fulfilled' ? pvmbgR.value : (alertsRef.current?.pvmbg ?? new Map()),
    };
    alertsRef.current = alerts;
    setObsInfo({
      phivolcs: srcInfo('phivolcs', 'PHIVOLCS', phivR),
      pvmbg: srcInfo('pvmbg', 'PVMBG', pvmbgR),
      usgs: srcInfo('usgs', 'USGS HANS', hansR),
    });
    const ongoing = new Set(erup.ongoing.keys());
    const list = classifyAll(ongoing, alerts);
    const eruptingNow = new Set(list.filter((v) => v.holocene && v.status === 'ERUPCAO').map((v) => v.vn));
    if (notify && baseline.current.eruptions && settingsRef.current.eruptionAlerts) {
      for (const vn of eruptingNow) {
        if (!eruptingRef.current.has(vn)) {
          const v = list.find((x) => x.vn === vn);
          if (v) pushNotif({ key: `e:${vn}`, kind: 'eruption', title: t('nt.e.new', { name: v.name }), body: t('nt.e.newBody', { country: v.country }), time: Date.now(), url: `https://volcano.si.edu/volcano.cfm?vn=${vn}` }, settingsRef.current.browserNotifs);
        }
      }
      for (const vn of eruptingRef.current) {
        if (!eruptingNow.has(vn)) {
          const v = list.find((x) => x.vn === vn);
          if (v) pushNotif({ key: `e-end:${vn}`, kind: 'eruption', title: t('nt.e.end', { name: v.name }), body: t('nt.e.endBody', { country: v.country }), time: Date.now() }, false);
        }
      }
    }
    eruptingRef.current = eruptingNow;
    ongoingRef.current = ongoing;
    ongoingRef2.current = erup.ongoing;
    setVolcanoes(list);
    } finally { refreshRunning.current = false; }
  }, [classifyAll, pushNotif, t]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [cat, erup, active, recent, obs] = await Promise.all([
          loadVolcanoCatalog(), loadOngoingEruptions(), loadActiveSince1960(), loadRecentEruptions(90),
          Promise.allSettled([loadHansStatus(), loadPhivolcsStatus(), loadPvmbgStatus()]),
        ]);
        if (!alive) return;
        const [hansR, phivR, pvmbgR] = obs;
        ongoingRef.current = new Set(erup.ongoing.keys());
        ongoingRef2.current = erup.ongoing;
        recentRef.current = recent;
        activeRef.current = active;
        alertsRef.current = {
          hans: hansR.status === 'fulfilled' ? hansR.value : new Map(),
          phivolcs: phivR.status === 'fulfilled' ? phivR.value : new Map(),
          pvmbg: pvmbgR.status === 'fulfilled' ? pvmbgR.value : new Map(),
        } as AlertMaps;
        setObsInfo({ phivolcs: srcInfo('phivolcs', 'PHIVOLCS', phivR), pvmbg: srcInfo('pvmbg', 'PVMBG', pvmbgR), usgs: srcInfo('usgs', 'USGS HANS', hansR) });
        const initialCurrent = new Set([...erup.ongoing.keys(), ...reportedCurrentEruptionsRef.current]);
        const list = withActivity(cat.map((v) => classifyVolcano(v, initialCurrent, active, recent, alertsRef.current)));
        eruptingRef.current = new Set(list.filter((v) => v.holocene && v.status === 'ERUPCAO').map((v) => v.vn));
        setVolcanoes(list);
        setVolcanoInfo({ id: 'gvp', label: 'Smithsonian GVP', ok: true, updated: Date.now() });
        baseline.current.eruptions = true;
      } catch (e) {
        if (!alive) return;
        setVolcanoInfo({ id: 'gvp', label: 'Smithsonian GVP', ok: false, updated: null, error: String(e) });
      }
    })();
    return () => { alive = false; };
  }, []);

  /* ---------- Terremotos (inicial + polling) ---------- */
  const fetchQuakes = useCallback(async (first = false) => {
    try {
      const { quakes: q, source } = await loadQuakes(settingsRef.current.period, settingsRef.current.minMag);
      setQuakes(q);
      setQuakeInfo({ id: 'quakes', label: `Terremotos (${source})`, ok: true, updated: Date.now() });
      const now = Date.now();
      const fresh = q.filter((k) => !seenQuakes.current.has(k.id));
      if (!first && baseline.current.quakes && fresh.length) {
        for (const k of fresh) {
          seenQuakes.current.add(k.id);
          if (k.mag >= settingsRef.current.alertMag && settingsRef.current.quakeAlerts) {
            pushNotif({
              key: `q:${k.id}`, kind: 'quake',
              title: t('nt.q.title', { mag: k.mag.toFixed(1), place: k.place }),
              body: t('nt.q.body', { depth: k.depthKm.toFixed(0), source }),
              time: now, url: k.url,
            }, settingsRef.current.browserNotifs);
          }
        }
        localStorage.setItem('tp.seen', JSON.stringify([...seenQuakes.current].slice(-3000)));
      } else {
        for (const k of fresh) seenQuakes.current.add(k.id);
        baseline.current.quakes = true;
        localStorage.setItem('tp.seen', JSON.stringify([...seenQuakes.current].slice(-3000)));
      }
    } catch (e) {
      setQuakeInfo((prev) => ({ ...prev, ok: false, error: String(e) }));
      pushNotif({ key: 'sys:quakes', kind: 'sistema', title: t('nt.sys.down'), body: t('nt.sys.downBody'), time: Date.now() }, false);
    }
  }, [pushNotif, t]);

  useEffect(() => { fetchQuakes(true); }, [settings.period, settings.minMag, settings.showQuakes]);
  useEffect(() => {
    const tm = setInterval(() => fetchQuakes(false), POLL_QUAKES);
    return () => clearInterval(tm);
  }, [fetchQuakes]);

  /* ---------- Ciclos: erupções (15 min) + reparo de observatórios (5 min enquanto incompleto) ---------- */
  useEffect(() => {
    if (!volcanoInfo.ok) return;
    const tm = setInterval(() => refreshEruptions(true), POLL_ERUP);
    return () => clearInterval(tm);
  }, [volcanoInfo.ok, refreshEruptions]);

  useEffect(() => {
    if (!volcanoInfo.ok) return;
    const complete = () => {
      const a = alertsRef.current;
      return !!a && a.hans.size > 0 && a.phivolcs.size > 0 && a.pvmbg.size > 0;
    };
    const tm = setInterval(() => { if (!complete()) refreshEruptions(true); }, 5 * 60_000);
    const onOnline = () => refreshEruptions(true);
    window.addEventListener('online', onOnline);
    return () => { clearInterval(tm); window.removeEventListener('online', onOnline); };
  }, [volcanoInfo.ok, refreshEruptions]);

  /* ---------- Central de Inteligência: relatórios + notícias (10 min) ---------- */
  useEffect(() => {
    if (!volcanoInfo.ok) return;
    let alive = true;
    let loading = false;
    const load = () => {
      if (loading) return;
      loading = true;
      loadReports()
        .then((r) => { if (!alive) return; setReports(r); setReportsError(null); })
        .catch((e) => {
          if (!alive) return;
          setReportsError(e instanceof Error ? e.message : String(e || 'Falha ao consultar a central de relatórios.'));
        })
        .finally(() => { loading = false; });
    };
    load();
    const tm = setInterval(load, POLL_REPORTS);
    const onOnline = () => load();
    window.addEventListener('online', onOnline);
    return () => { alive = false; clearInterval(tm); window.removeEventListener('online', onOnline); };
  }, [volcanoInfo.ok]);

  // Tags e confirmação de erupções em andamento: somente relatório oficial,
  // confirmado, recente (48 h) e com texto/registro classificado explicitamente como ERUPCAO.
  useEffect(() => {
    if (!reports) return;
    const now = Date.now();
    activityRef.current = activityByVolcano(reports.items);
    reportedCurrentEruptionsRef.current = new Set(reports.items
      .filter((item) => item.kind === 'OFICIAL'
        && item.verified === 'CONFIRMADO'
        && item.volcanoVn != null && item.volcanoVn > 0
        && item.cats.includes('ERUPCAO')
        && item.ts <= now + 60 * 60_000
        && now - item.ts >= -60 * 60_000
        && now - item.ts <= 48 * 60 * 60_000)
      .map((item) => Number(item.volcanoVn)));
    const updated = classifyAll(ongoingRef.current, alertsRef.current);
    eruptingRef.current = new Set(updated.filter((v) => v.holocene && v.status === 'ERUPCAO').map((v) => v.vn));
    setVolcanoes(updated);
  }, [reports, classifyAll]);

  /* ---------- Seleção / busca ---------- */
  const pick = useCallback((s: Suggestion) => {
    if (s.kind === 'volcano') {
      const v = volcanoes.find((x) => x.vn === s.vn);
      if (v) { setSelVolcano(v); setSelQuake(null); }
    } else if (s.kind === 'place') {
      setSelVolcano(null); setSelQuake(null);
      // Ao escolher uma estrutura histórica/localidade, não deixe filtros anteriores ocultarem o ponto.
      const isHistoricalFeature = !!s.id?.startsWith('geo-');
      setSettings((prev) => ({
        ...prev, country: '', showVolcanoes: true,
        ...(isHistoricalFeature ? { showHistoricalGeology: true } : {}),
      }));
    }
    setFocus({ lat: s.lat, lon: s.lon, zoom: s.zoom, id: s.id || s.label, kind: s.kind === 'quake' ? 'quake' : s.kind === 'place' ? 'place' : 'volcano', name: s.kind === 'quake' ? undefined : s.label });
  }, [volcanoes]);

  const selectQuake = (q: Quake) => { setSelQuake(q); setSelVolcano(null); setFocus({ lat: q.lat, lon: q.lon, zoom: 6, id: q.id, kind: 'quake' }); };
  const selectVolcano = (v: Volcano) => { setSelVolcano(v); setSelQuake(null); setFocus({ lat: v.lat, lon: v.lon, zoom: 8, id: 'v' + v.vn, kind: 'volcano', name: v.name }); };
  /** Cards/atualizações → centraliza no mapa e abre o popup. */
  const locateVolcano = useCallback((vn: number) => {
    const v = volcanoes.find((x) => x.vn === vn);
    if (!v) return;
    setSelVolcano(null); setSelQuake(null);
    setFocus({ lat: v.lat, lon: v.lon, zoom: 10, id: 'v' + v.vn, kind: 'volcano', name: v.name });
    setShowSide(false);
  }, [volcanoes]);
  const openVolcanoDetails = useCallback((vn: number) => {
    const v = volcanoes.find((x) => x.vn === vn);
    if (!v) return;
    setSelVolcano(v);
    setSelQuake(null);
    setShowSide(false);
  }, [volcanoes]);

  /* ---------- País selecionado: enquadrar a área geográfica ---------- */
  const flyToCountry = useCallback(async (name: string) => {
    const map = mapRef.current;
    if (!map) return;
    if (!name) { map.flyTo([-10, -40], 3, { duration: 0.8 }); return; }
    const rings = await countryPolygon(name);
    if (!rings?.length) { map.flyTo([20, 0], 2); return; }
    const pts = rings.flat().map(([la, lo]) => [la, lo] as [number, number]);
    const bounds = L.latLngBounds(pts);
    map.fitBounds(bounds.pad(0.06), { maxZoom: 8, duration: 0.8 });
  }, []);

  /* ---------- Derivados ---------- */
  const countries = useMemo(() => {
    const set = new Set<string>();
    for (const v of volcanoes) set.add(v.country);
    for (const feature of HISTORICAL_GEOLOGY) set.add(feature.country);
    for (const q of quakes) { const c = q.place?.split(',').pop()?.trim(); if (c && c.length > 2) set.add(c); }
    return [...set].sort((a, b) => a.localeCompare(b, locale));
  }, [volcanoes, quakes, locale]);

  const stats = useMemo(() => {
    const now = Date.now();
    const m = settings.minMag;
    const c24 = quakes.filter((q) => q.time > now - 86400e3 && q.mag >= m).length;
    const c7 = quakes.filter((q) => q.time > now - 7 * 86400e3 && q.mag >= m).length;
    const erupting = volcanoes.filter((v) => v.holocene && v.status === 'ERUPCAO').length;
    return { c24, c7, erupting };
  }, [quakes, volcanoes, settings.minMag]);

  const sortedQuakes = useMemo(() => [...quakes].sort((a, b) => b.time - a.time), [quakes]);
  const eruptingList = useMemo(() => volcanoes.filter((v) => v.holocene && v.status === 'ERUPCAO').sort((a, b) => (b.lastEruption ?? 0) - (a.lastEruption ?? 0)), [volcanoes]);

  const historicalCount = HISTORICAL_GEOLOGY.length + volcanoes.filter((v) => !v.holocene).length;
  const unread = notifs.filter((n) => n.kind !== 'sistema').length;

  const askBrowserNotifs = async () => {
    if (!('Notification' in window)) { return; }
    const p = await Notification.requestPermission();
    if (p === 'granted') {
      setSettings((s) => ({ ...s, browserNotifs: true }));
      try { new Notification('GeoGus', { body: t('nt.enabled') }); } catch { /* ok */ }
    } else {
      setSettings((s) => ({ ...s, browserNotifs: false }));
    }
  };

  const upd = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));

  const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="logo">🌋</span><span className="brand-name">Geo<b>Gus</b></span></div>
        <SearchBar volcanoes={volcanoes} quakes={quakes} onPick={pick} />
        <select
          className="lang-select"
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
          aria-label={t('app.language')}
        >
          {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
        <div className="top-actions">
          <button className={`icon-btn ${showNotifs ? 'active' : ''}`} onClick={() => { setShowNotifs((v) => !v); setShowSettings(false); }} title={t('app.notifications')}>
            🔔{unread > 0 && <em className="dot">{unread > 9 ? '9+' : unread}</em>}
          </button>
          <button className={`icon-btn ${showSettings ? 'active' : ''}`} onClick={() => { setShowSettings((v) => !v); setShowNotifs(false); }} title={t('app.settings')}>⚙</button>
        </div>
      </header>

      <div className="statusbar">
        <span className={`chip conn ${online ? 'ok' : 'err'}`}>{online ? t('conn.online') : t('conn.offline')}</span>
        <span className={`chip ${quakeInfo.ok ? 'ok' : 'err'}`} title={quakeInfo.error || `${fmtTime(quakeInfo.updated ?? 0)}`}>
          {quakeInfo.label} {quakeInfo.updated ? `· ${fmtTime(quakeInfo.updated)}` : `· ${t('pp.na')}`}
        </span>
        <span className={`chip ${volcanoInfo.ok ? 'ok' : 'err'}`} title={volcanoInfo.error || ''}>
          {volcanoInfo.label} {volcanoInfo.updated ? `· ${fmtTime(volcanoInfo.updated)}` : `· ${t('pp.na')}`}
        </span>
        {(['phivolcs', 'pvmbg', 'usgs'] as const).map((k) => obsInfo[k] && (
          <span key={k} className={`chip ${obsInfo[k]!.stale ? 'stale' : obsInfo[k]!.ok ? 'ok' : 'err'}`} title={obsInfo[k]!.error || `${obsInfo[k]!.label} · ${fmtTime(obsInfo[k]!.updated ?? 0)}`}>
            {obsInfo[k]!.label} {obsInfo[k]!.ok ? `· ${obsInfo[k]!.stale ? 'cache' : fmtTime(obsInfo[k]!.updated ?? 0)}` : `· ${t('pp.na')}`}
          </span>
        ))}
        <span className="chip stat">{t('stats.24h')} <b>{stats.c24}</b></span>
        <span className="chip stat">{t('stats.7d')} <b>{stats.c7}</b></span>
        <button
          className={`chip stat erupting chip-btn ${settings.volcanoFilter === 'erupting' ? 'on' : ''}`}
          onClick={() => { setTab('volcanoes'); setShowSide(true); upd({ volcanoFilter: 'erupting' }); }}
          title={t('side.tab.erupting')}
        >
          {t('stats.erupting')} <b>{stats.erupting}</b>
        </button>
      </div>

      <div className="filters">
        {settings.showQuakes && (
          <>
            <label>{t('filters.period')}
              <select value={settings.period} onChange={(e) => upd({ period: e.target.value as Settings['period'] })}>
                <option value="day">{t('filters.period.day')}</option>
                <option value="week">{t('filters.period.week')}</option>
                <option value="month">{t('filters.period.month')}</option>
              </select>
            </label>
            <label>{t('filters.minMag')}
              <select value={settings.minMag} onChange={(e) => upd({ minMag: Number(e.target.value) })}>
                <option value={1}>1.0+</option>
                <option value={2.5}>2.5+</option>
                <option value={4.5}>4.5+</option>
                <option value={5.5}>5.5+</option>
              </select>
            </label>
          </>
        )}
        <label>{t('filters.country')}
          <select value={settings.country} onChange={(e) => { upd({ country: e.target.value }); flyToCountry(e.target.value); }}>
            <option value="">{t('filters.country.all')}</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {settings.showVolcanoes && (
          <label>{t('filters.volcanoStatus')}
            <select value={settings.volcanoFilter} onChange={(e) => upd({ volcanoFilter: e.target.value as Settings['volcanoFilter'] })}>
              <option value="all">{t('vs.all')}</option>
              <option value="active">{t('vs.active')}</option>
              <option value="inactive">{t('vs.inactive')}</option>
              <option value="erupting">{t('side.tab.erupting')}</option>
            </select>
          </label>
        )}
        {settings.showVolcanoes && settings.volcanoFilter === 'erupting' && (
          <button className="btn ghost" onClick={() => upd({ volcanoFilter: 'all' })}>{t('erupt.showAll')}</button>
        )}
        <label className="chk"><input type="checkbox" checked={settings.showQuakes} onChange={(e) => upd({ showQuakes: e.target.checked })} /> {t('filters.quakes')}</label>
        <label className="chk"><input type="checkbox" checked={settings.showVolcanoes} onChange={(e) => upd({ showVolcanoes: e.target.checked })} /> {t('filters.volcanoes')}</label>
        <label className="chk historical-toggle" title="Camada independente: registros do GVP do Pleistoceno e estruturas geológicas antigas; não representa atividade atual.">
          <input type="checkbox" checked={settings.showHistoricalGeology} onChange={(e) => upd({ showHistoricalGeology: e.target.checked })} />
          <span className="historical-toggle-symbol">◇</span> Estruturas antigas ({historicalCount.toLocaleString(locale)})
        </label>
        <button className="btn ghost side-toggle" onClick={() => setShowSide(true)}>{t('filters.panel')}</button>
      </div>

      <Intel reports={reports} error={reportsError} volcanoes={volcanoes} onLocate={locateVolcano} onOpen={openVolcanoDetails} />

      <main className="layout">
        <section className={`sidebar ${showSide ? 'open' : ''}`}>
          <div className="side-head">
            <button className={`tab ${tab === 'quakes' ? 'on' : ''}`} onClick={() => setTab('quakes')}>{t('side.tab.quakes')} ({sortedQuakes.filter((q) => q.mag >= settings.minMag).length})</button>
            <button className={`tab ${tab === 'volcanoes' ? 'on' : ''}`} onClick={() => setTab('volcanoes')}>{t('side.tab.erupting')} ({eruptingList.length})</button>
            <button className={`tab ${tab === 'updates' ? 'on' : ''}`} onClick={() => setTab('updates')}>{t('updates.title')} ({reports?.items.length ?? 0})</button>
            <button className="icon-btn close-side" onClick={() => setShowSide(false)}>✕</button>
          </div>
          <div className="side-body">
            {tab === 'quakes' && (
              <ul className="list">
                {sortedQuakes.filter((q) => q.mag >= settings.minMag).slice(0, 120).map((q) => (
                  <li key={q.id} className={`${selQuake?.id === q.id ? 'sel ' : ''}${q.mag >= settings.alertMag ? 'alert' : ''}`} onClick={() => selectQuake(q)}>
                    <span className={`m-badge m${Math.floor(q.mag)}`}>{q.mag != null && q.mag >= 0 ? q.mag.toFixed(1) : '—'}</span>
                    <div className="li-main">
                      <span className="li-title">{q.place}</span>
                      <span className="li-sub">{new Date(q.time).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })} · {q.depthKm.toFixed(0)} km · {q.source}</span>
                    </div>
                  </li>
                ))}
                {sortedQuakes.length === 0 && <li className="empty">{t('side.emptyQuakes')}</li>}
              </ul>
            )}
            {tab === 'volcanoes' && (
              <ul className="list">
                {eruptingList.map((v) => {
                  const inf = ongoingRef2.current.get(v.vn);
                  return (
                    <li key={v.vn} className={selVolcano?.vn === v.vn ? 'sel' : ''} onClick={() => selectVolcano(v)}>
                      <span className="m-badge v-erup">{t('status.ERUPCAO').slice(0, 5)}</span>
                      <div className="li-main">
                        <span className="li-title">{v.name}</span>
                        <span className="li-sub">{v.country} · {t('erupt.start')}: {inf?.start ?? v.lastEruption ?? t('pp.noRecord')} · {t('erupt.last')}: {inf?.end ?? t('erupt.ongoing')}</span>
                        {v.alertInfo && (
                          <span className="li-sub">
                            {v.alertInfo.source} · {t('pp.alertLevel')} {v.alertInfo.level}{v.alertInfo.colorCode ? ` · ${v.alertInfo.colorCode}` : ''}
                            {v.alertInfo.noticeTime ? ` · ${t('pp.bulletin')} ${v.alertInfo.noticeTime}` : ''}
                          </span>
                        )}
                        {v.alertInfo?.details && <span className="li-sub">{v.alertInfo.details}</span>}
                      </div>
                    </li>
                  );
                })}
                {eruptingList.length === 0 && <li className="empty">{t('side.emptyErupting')}</li>}
              </ul>
            )}
            {tab === 'updates' && (
              <UpdatesList
                items={reports?.items ?? []}
                onLocate={locateVolcano}
                onOpen={(vn) => { const v = volcanoes.find((x) => x.vn === vn); if (v) { setSelVolcano(v); setSelQuake(null); } }}
              />
            )}
          </div>
        </section>

        <div className="map-wrap">
          <MapView
            quakes={sortedQuakes} volcanoes={volcanoes} settings={settings} alertMag={settings.alertMag}
            ongoing={ongoingRef2.current}
            onSelectQuake={selectQuake} onSelectVolcano={selectVolcano} onKnowMore={(vn) => { const v = volcanoes.find((x) => x.vn === vn); if (v) { setSelVolcano(v); setSelQuake(null); } }}
            focus={focus} mapRef={mapRef}
          />
        </div>

        {selVolcano && <VolcanoDetails v={selVolcano} reports={reports?.items ?? []} onClose={() => setSelVolcano(null)} />}
        {selQuake && !selVolcano && <QuakeDetails q={selQuake} onClose={() => setSelQuake(null)} />}
      </main>

      {showNotifs && (
        <div className="panel-overlay" onClick={() => setShowNotifs(false)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <header><h2>{t('nt.title')}</h2><button className="icon-btn" onClick={() => setShowNotifs(false)}>✕</button></header>
            {!('Notification' in window) ? <p className="muted small">{t('nt.noSupport')}</p>
              : Notification.permission !== 'granted' ? (
                <button className="btn" onClick={askBrowserNotifs}>{t('nt.activate')}</button>
              ) : !settings.browserNotifs ? (
                <button className="btn" onClick={() => upd({ browserNotifs: true })}>{t('nt.reenable')}</button>
              ) : <p className="muted small">{t('nt.enabled')}</p>}
            <ul className="notif-list">
              {notifs.length === 0 && <li className="empty">{t('nt.empty')} M≥{settings.alertMag.toFixed(1)}</li>}
              {notifs.map((n) => (
                <li key={n.key} className={`n-${n.kind}`}>
                  <div><b>{n.title}</b></div>
                  <div className="li-sub">{n.body} · {new Date(n.time).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}</div>
                  {n.url && <a href={n.url} target="_blank" rel="noreferrer">{t('pp.viewAt')} ↗</a>}
                </li>
              ))}
            </ul>
            <button className="btn ghost" onClick={() => setNotifs([])}>{t('nt.clear')}</button>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="panel-overlay" onClick={() => setShowSettings(false)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <header><h2>{t('st.title')}</h2><button className="icon-btn" onClick={() => setShowSettings(false)}>✕</button></header>
            <label className="chk">{t('st.quakeAlerts')} (M≥{settings.alertMag.toFixed(1)})
              <input type="checkbox" checked={settings.quakeAlerts} onChange={(e) => upd({ quakeAlerts: e.target.checked })} />
            </label>
            <label className="chk">{t('st.alertMin')}
              <select value={settings.alertMag} onChange={(e) => upd({ alertMag: Number(e.target.value) })}>
                <option value={2.5}>2.5+</option>
                <option value={3}>3.0+</option>
                <option value={4}>4.0+</option>
                <option value={5}>5.0+</option>
                <option value={6}>6.0+</option>
                <option value={7}>7.0+</option>
              </select>
            </label>
            <label className="chk">{t('st.eruptionAlerts')}
              <input type="checkbox" checked={settings.eruptionAlerts} onChange={(e) => upd({ eruptionAlerts: e.target.checked })} />
            </label>
            <label className="chk">{t('st.browserNotifs')}
              <input type="checkbox" checked={settings.browserNotifs} onChange={(e) => e.target.checked ? askBrowserNotifs() : upd({ browserNotifs: false })} />
            </label>
            <p className="muted small">{t('st.howItWorks')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
