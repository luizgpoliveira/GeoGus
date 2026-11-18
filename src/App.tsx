import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import MapView from './components/MapView';
import SearchBar, { type Suggestion } from './components/SearchBar';
import Intel, { UpdatesList } from './components/Intel';
import { HISTORICAL_GEOLOGY } from './historicalGeology';
import { SUPER_VOLCANO_IDS } from './supervolcanoes';
import { VolcanoDetails, QuakeDetails } from './components/Details';
import type { NotifEntry, Quake, ReportItem, ReportsPayload, Settings, SourceInfo, TsunamiAlert, Volcano } from './types';
import { assessVolcanoRisk } from './volcanoRisk';
import {
  classifyVolcano, loadActiveSince1960, loadOngoingEruptions, loadRecentEruptions, loadQuakes, loadVolcanoCatalog, loadPleistoceneCatalog, countryPolygon,
  loadHansStatus, loadPhivolcsStatus, loadPvmbgStatus, loadReports, loadTsunamiAlerts, activityByVolcano,
  type AlertMaps,
} from './api';
import { I18nContext, LANGS, LOCALE_TAG, makeT, useI18n, type Lang } from './i18n';

// O feed GeoJSON 7d do USGS é atualizado a cada minuto; alinhar o polling ao ciclo oficial.
const POLL_QUAKES = 60_000;
const POLL_ERUP = 60_000; // atualização a cada minuto; as fontes podem publicar em cadências próprias
const POLL_REPORTS = 5 * 60_000;
const POLL_TSUNAMI = 60_000;

/** Dia civil local: só eventos de hoje são tratados como atividade visual do dia. */
function isTodayLocal(timestamp: number): boolean {
  if (!Number.isFinite(timestamp)) return false;
  const eventDate = new Date(timestamp);
  const today = new Date();
  return eventDate.getFullYear() === today.getFullYear()
    && eventDate.getMonth() === today.getMonth()
    && eventDate.getDate() === today.getDate();
}

function isWithinLast24Hours(timestamp: number, reference = Date.now()): boolean {
  return Number.isFinite(timestamp) && timestamp >= reference - 24 * 60 * 60_000 && timestamp <= reference + 60_000;
}

const DEFAULT_SETTINGS: Settings = {
  minMag: 1.0, alertMag: 2.5, period: 'day', country: '', volcanoFilter: 'all',
  showQuakes: true, showVolcanoes: true, showPleistoceneVolcanoes: true, showSupervolcanoes: true, showHistoricalGeology: false,
  quakeAlerts: true, eruptionAlerts: true, tsunamiAlerts: true, browserNotifs: false,
};

function loadStoredSet(key: string): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return new Set<string>(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
  } catch { return new Set<string>(); }
}

function loadNotificationKeys(): Set<string> {
  try {
    const explicit = JSON.parse(localStorage.getItem('tp.notifKeys') || '[]');
    const entries = JSON.parse(localStorage.getItem('tp.notifs') || '[]');
    return new Set<string>([
      ...(Array.isArray(explicit) ? explicit : []),
      ...(Array.isArray(entries) ? entries.map((entry: NotifEntry) => entry.key) : []),
    ].filter((key): key is string => typeof key === 'string'));
  } catch { return new Set<string>(); }
}

async function showSystemNotification(title: string, options: NotificationOptions = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const opts: NotificationOptions = { icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', ...options };
  try {
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (registration?.active && 'showNotification' in registration) {
      await registration.showNotification(title, opts);
    } else {
      new Notification(title, opts);
    }
  } catch {
    // Permissão/restrição do navegador não deve interromper a atualização dos dados.
  }
}

const loadSettings = (): Settings => {
  try {
    const saved = JSON.parse(localStorage.getItem('tp.settings') || '{}');
    // Migração única: instalações anteriores tinham 7 dias como padrão.
    // Na primeira abertura desta versão, adota 24 h; depois respeita o período
    // escolhido pelo usuário nas próximas sessões.
    const periodDefaultApplied = localStorage.getItem('tp.periodDefault24h.v1') === '1';
    const savedPeriod = ['day', 'week', 'month'].includes(String(saved.period))
      ? saved.period as Settings['period'] : 'day';
    const period = periodDefaultApplied ? savedPeriod : 'day';
    localStorage.setItem('tp.periodDefault24h.v1', '1');
    // Mantém a experiência existente de abrir com o catálogo mundial completo.
    return { ...DEFAULT_SETTINGS, ...saved, period, country: '', volcanoFilter: 'all', showVolcanoes: true, showPleistoceneVolcanoes: true, showSupervolcanoes: true, showHistoricalGeology: false };
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
  const [tsunamiAlerts, setTsunamiAlerts] = useState<TsunamiAlert[]>([]);
  const [tsunamiInfo, setTsunamiInfo] = useState<SourceInfo>({ id: 'tsunami', label: 'NOAA Tsunami Centers', ok: false, updated: null });
  const [quakeInfo, setQuakeInfo] = useState<SourceInfo>({ id: 'quakes', label: 'Terremotos', ok: false, updated: null });
  const [volcanoSeismicInfo, setVolcanoSeismicInfo] = useState<SourceInfo>({ id: 'volcano-seismic', label: 'Sismicidade próxima aos vulcões', ok: false, updated: null });
  const [volcanoes, setVolcanoes] = useState<Volcano[]>([]);
  const [volcanoInfo, setVolcanoInfo] = useState<SourceInfo>({ id: 'gvp', label: 'Smithsonian GVP', ok: false, updated: null });
  const [notifs, setNotifs] = useState<NotifEntry[]>(() => { try { return JSON.parse(localStorage.getItem('tp.notifs') || '[]'); } catch { return []; } });
  const [liveNotif, setLiveNotif] = useState<NotifEntry | null>(null);
  const [tab, setTab] = useState<'quakes' | 'volcanoes' | 'updates'>('quakes');
  const [reports, setReports] = useState<ReportsPayload | null>(null);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [selQuake, setSelQuake] = useState<Quake | null>(null);
  const [selVolcano, setSelVolcano] = useState<Volcano | null>(null);
  // Mantém o painel de detalhes sincronizado quando chega um novo boletim,
  // uma atualização sísmica ou uma mudança de nível de risco.
  useEffect(() => {
    if (!selVolcano) return;
    const latest = volcanoes.find((item) => item.vn === selVolcano.vn);
    if (latest && latest !== selVolcano) setSelVolcano(latest);
  }, [volcanoes, selVolcano]);
  const [focus, setFocus] = useState<{ lat: number; lon: number; zoom: number; id: string; kind: 'quake' | 'volcano' | 'place'; name?: string } | null>(null);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSide, setShowSide] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches);
  const [online, setOnline] = useState(navigator.onLine);
  const mapRef = useRef<L.Map | null>(null);
  const seenQuakes = useRef<Set<string>>(loadStoredSet('tp.seen'));
  const seenTsunami = useRef<Set<string>>(loadStoredSet('tp.tsunamiSeen'));
  const notificationKeys = useRef<Set<string>>(loadNotificationKeys());
  const lastQuakeCheck = useRef(0);
  const quakeFetchRunning = useRef(false);
  const tsunamiFetchRunning = useRef(false);
  const tsunamiBaseline = useRef(false);
  const baseline = useRef({ quakes: false, eruptions: false });
  const reportsBaseline = useRef(false);
  const ongoingRef = useRef<Set<number>>(new Set());
  const ongoingRef2 = useRef<Map<number, { start: string; end: string | null; vei: number | null }>>(new Map());
  const volcanicQuakesRef = useRef<Quake[]>([]);
  const riskReportsRef = useRef<ReportItem[]>([]);
  const volcanicSeismicRunning = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => { localStorage.setItem('tp.settings', JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem('tp.notifs', JSON.stringify(notifs.slice(0, 80))); }, [notifs]);
  useEffect(() => {
    if (!liveNotif) return;
    const timer = window.setTimeout(() => setLiveNotif(null), 9_000);
    return () => window.clearTimeout(timer);
  }, [liveNotif]);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const pushNotif = useCallback((n: NotifEntry, browser: boolean, announce = false) => {
    if (notificationKeys.current.has(n.key)) return;
    notificationKeys.current.add(n.key);
    try { localStorage.setItem('tp.notifKeys', JSON.stringify([...notificationKeys.current].slice(-3000))); } catch { /* quota/private mode */ }
    setNotifs((prev) => [n, ...prev.filter((x) => x.key !== n.key)].slice(0, 80));
    // Toast interno aparece mesmo sem permissão de notificações do sistema.
    if (announce) setLiveNotif(n);
    if (browser && settingsRef.current.browserNotifs) {
      void showSystemNotification(n.title, {
        body: n.body,
        tag: n.key,
        data: { url: n.url || '/' },
      });
    }
  }, []);

  /* ---------- Catálogo de vulcões + alertas de observatórios (1x) ---------- */
  const recentRef = useRef<Set<number>>(new Set());
  const reportedCurrentEruptionsRef = useRef<Set<number>>(new Set());
  const activeRef = useRef<Set<number>>(new Set());
  const alertsRef = useRef<AlertMaps | undefined>(undefined);
  const eruptingRef = useRef<Set<number>>(new Set());
  const volcanoNotificationBaseline = useRef(false);
  const [obsInfo, setObsInfo] = useState<Record<'phivolcs' | 'pvmbg' | 'usgs', SourceInfo | null>>({ phivolcs: null, pvmbg: null, usgs: null });
  const refreshRunning = useRef(false);
  const activityRef = useRef<Map<number, string[]>>(new Map());
  const volcanoesRef = useRef(volcanoes);
  volcanoesRef.current = volcanoes;
  // Catálogo-base unificado (Holoceno + Pleistoceno), usado em cada reclassificação
  // para não descartar os registros históricos quando uma fonte de alertas atualizar.
  const catalogRef = useRef<Array<Omit<Volcano, 'status'>>>([]);
  const [pleistoceneLoaded, setPleistoceneLoaded] = useState(false);
  const [pleistoceneInfo, setPleistoceneInfo] = useState<SourceInfo>({ id: 'gvp-pleistocene', label: 'GVP Pleistoceno', ok: false, updated: null });
  const pleistoceneLoading = useRef(false);

  const withActivity = useCallback((list: Volcano[]) =>
    list.map((v) => {
      const enriched = activityRef.current.has(v.vn) ? { ...v, activity: activityRef.current.get(v.vn) } : v;
      return { ...enriched, risk: assessVolcanoRisk(enriched, {
        quakes: volcanicQuakesRef.current, reports: riskReportsRef.current,
        ongoing: ongoingRef2.current.get(v.vn) ?? null,
      }) };
    }), []);

  const classifyAll = useCallback((ongoing: Set<number>, alerts?: AlertMaps) => {
    const confirmedCurrent = new Set([...ongoing, ...reportedCurrentEruptionsRef.current]);
    const base = catalogRef.current.length ? catalogRef.current : volcanoesRef.current;
    return withActivity(base.map((v) => classifyVolcano(v, confirmedCurrent, activeRef.current, recentRef.current, alerts)));
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
    // Cada observatório é independente: a falha do WFS GVP não pode bloquear
    // alertas válidos recebidos de USGS, PHIVOLCS ou PVMBG.
    const erup = erupR.status === 'fulfilled' ? erupR.value : null;
    const ongoing = erup ? new Set(erup.ongoing.keys()) : new Set(ongoingRef.current);
    const ongoingMap = erup?.ongoing ?? ongoingRef2.current;
    const alerts: AlertMaps = {
      hans: hansR.status === 'fulfilled' ? hansR.value : (alertsRef.current?.hans ?? new Map()),
      phivolcs: phivR.status === 'fulfilled' ? phivR.value : (alertsRef.current?.phivolcs ?? new Map()),
      pvmbg: pvmbgR.status === 'fulfilled' ? pvmbgR.value : (alertsRef.current?.pvmbg ?? new Map()),
    };
    if (erupR.status === 'rejected') {
      setVolcanoInfo((prev) => ({ ...prev, stale: true, error: `GVP: ${String(erupR.reason?.message ?? erupR.reason)}. Mantidos os últimos dados válidos.` }));
    }
    alertsRef.current = alerts;
    setObsInfo({
      phivolcs: srcInfo('phivolcs', 'PHIVOLCS', phivR),
      pvmbg: srcInfo('pvmbg', 'PVMBG', pvmbgR),
      usgs: srcInfo('usgs', 'USGS HANS', hansR),
    });
    if (erup) { ongoingRef.current = ongoing; ongoingRef2.current = ongoingMap; }
    const list = classifyAll(ongoing, alerts);
    const eruptingNow = new Set(list.filter((v) => v.holocene && v.status === 'ERUPCAO').map((v) => v.vn));
    // Na primeira coleta válida, apresentar o que já está ativo na Central de
    // Notificações sem disparar notificações do sistema como se fosse novidade.
    const hasVolcanoSourceData = Boolean(erup) || alerts.hans.size > 0 || alerts.phivolcs.size > 0 || alerts.pvmbg.size > 0;
    if (notify && !volcanoNotificationBaseline.current && hasVolcanoSourceData && list.length > 0 && settingsRef.current.eruptionAlerts) {
      const currentItems = list.filter((v) => v.holocene && (v.status === 'ERUPCAO' || Boolean(v.alertInfo)));
      for (const v of currentItems) {
        const episodeDate = ongoingRef2.current.get(v.vn)?.start || new Date().toISOString().slice(0, 10);
        const isErupting = v.status === 'ERUPCAO';
        const alert = v.alertInfo;
        const key = isErupting
          ? `e:${v.vn}:${episodeDate}`
          : `v-alert:${v.vn}:${alert?.source || 'observatorio'}:${String(alert?.level ?? 'boletim')}:${alert?.noticeTime || 'atual'}`;
        const detail = alert?.details ? ` · ${alert.details}` : '';
        pushNotif({
          key, kind: 'eruption',
          title: isErupting ? `🌋 Erupção em andamento: ${v.name}` : `Boletim de observatório: ${v.name}`,
          body: `${v.country}${alert ? ` · ${alert.source} · nível ${alert.level}${alert.colorCode ? ` · ${alert.colorCode}` : ''}` : ''}${detail}`,
          time: (alert?.noticeTime ? (Date.parse(alert.noticeTime) || Date.now()) : Date.now()),
          url: `https://volcano.si.edu/volcano.cfm?vn=${v.vn}`,
        }, false);
      }
      volcanoNotificationBaseline.current = true;
    } else if (notify && hasVolcanoSourceData && list.length > 0 && !settingsRef.current.eruptionAlerts) {
      volcanoNotificationBaseline.current = true;
    }
    if (notify && baseline.current.eruptions && settingsRef.current.eruptionAlerts) {
      for (const vn of eruptingNow) {
        if (!eruptingRef.current.has(vn)) {
          const v = list.find((x) => x.vn === vn);
          if (v) {
            const episodeDate = ongoingRef2.current.get(vn)?.start || new Date().toISOString().slice(0, 10);
            pushNotif({ key: `e:${vn}:${episodeDate}`, kind: 'eruption', title: t('nt.e.new', { name: v.name }), body: t('nt.e.newBody', { country: v.country }), time: Date.now(), url: `https://volcano.si.edu/volcano.cfm?vn=${vn}` }, settingsRef.current.browserNotifs, true);
          }
        }
      }
      for (const vn of eruptingRef.current) {
        if (!eruptingNow.has(vn)) {
          const v = list.find((x) => x.vn === vn);
          if (v) {
            const endedDate = new Date().toISOString().slice(0, 10);
            pushNotif({ key: `e-end:${vn}:${endedDate}`, kind: 'eruption', title: t('nt.e.end', { name: v.name }), body: t('nt.e.endBody', { country: v.country }), time: Date.now() }, false, true);
          }
        }
      }
    }
    eruptingRef.current = eruptingNow;
    // Se o carregamento inicial do endpoint de erupções falhou, a primeira
    // resposta recuperada estabelece baseline sem gerar alertas retroativos.
    if (!baseline.current.eruptions && erup) baseline.current.eruptions = true;
    if (erup) { ongoingRef.current = ongoing; ongoingRef2.current = ongoingMap; setVolcanoInfo({ id: 'gvp', label: 'Smithsonian GVP', ok: true, updated: Date.now() }); }
    setVolcanoes(list);
    } finally { refreshRunning.current = false; }
  }, [classifyAll, pushNotif, t]);

  useEffect(() => {
    let alive = true;
    let catalogBusy = false;
    const publishClassification = () => {
      if (!alive || !catalogRef.current.length) return;
      const current = new Set([...ongoingRef.current, ...reportedCurrentEruptionsRef.current]);
      const list = withActivity(catalogRef.current.map((v) => classifyVolcano(v, current, activeRef.current, recentRef.current, alertsRef.current)));
      eruptingRef.current = new Set(list.filter((v) => v.holocene && v.status === 'ERUPCAO').map((v) => v.vn));
      setVolcanoes(list);
    };

    // Catálogo Holoceno carrega primeiro, mas falhas temporárias não impedem
    // consultas independentes nem deixam o app sem uma tentativa de recuperação.
    const loadCatalog = async () => {
      if (!alive || catalogBusy || !navigator.onLine) return;
      catalogBusy = true;
      try {
        const cat = await loadVolcanoCatalog();
        if (!alive) return;
        if (!cat.length) throw new Error('O Smithsonian retornou catálogo Holoceno vazio.');
        const merged = new Map<number, Omit<Volcano, 'status'>>();
        for (const v of cat) merged.set(Number(v.vn), v);
        // Se o Pleistoceno já havia sido carregado, uma revalidação do Holoceno
        // não pode apagar os registros da segunda camada.
        for (const v of catalogRef.current) if (!v.holocene && !merged.has(Number(v.vn))) merged.set(Number(v.vn), v);
        catalogRef.current = [...merged.values()];
        setVolcanoInfo({ id: 'gvp', label: 'Smithsonian GVP', ok: true, updated: Date.now() });
        publishClassification();
        // Com o catálogo carregado, cruza-o imediatamente com os boletins
        // dos observatórios para preencher a Central sem esperar o próximo ciclo.
        void refreshEruptions(true);
      } catch (error) {
        if (!alive) return;
        setVolcanoInfo((prev) => ({ ...prev, id: 'gvp', label: 'Smithsonian GVP', ok: false, error: String(error) }));
      } finally { catalogBusy = false; }
    };

    void loadCatalog();

    // Os feeds de alertas e atividade são consultados mesmo se o catálogo global
    // estiver temporariamente indisponível. Assim, uma origem não bloqueia as outras.
    void loadOngoingEruptions().then((erup) => {
      if (!alive) return;
      ongoingRef.current = new Set(erup.ongoing.keys());
      ongoingRef2.current = erup.ongoing;
      baseline.current.eruptions = true;
      publishClassification();
    }).catch(() => { baseline.current.eruptions = false; });

    void loadActiveSince1960().then((value) => {
      if (!alive) return;
      activeRef.current = value;
      publishClassification();
    }).catch(() => {});

    void loadRecentEruptions(90).then((value) => {
      if (!alive) return;
      recentRef.current = value;
      publishClassification();
    }).catch(() => {});

    void Promise.allSettled([loadHansStatus(), loadPhivolcsStatus(), loadPvmbgStatus()]).then((results) => {
      if (!alive) return;
      const [hansR, phivR, pvmbgR] = results;
      alertsRef.current = {
        hans: hansR.status === 'fulfilled' ? hansR.value : new Map(),
        phivolcs: phivR.status === 'fulfilled' ? phivR.value : new Map(),
        pvmbg: pvmbgR.status === 'fulfilled' ? pvmbgR.value : new Map(),
      } as AlertMaps;
      setObsInfo({
        phivolcs: srcInfo('phivolcs', 'PHIVOLCS', phivR),
        pvmbg: srcInfo('pvmbg', 'PVMBG', pvmbgR),
        usgs: srcInfo('usgs', 'USGS HANS', hansR),
      });
      publishClassification();
    });

    // Se GVP estiver fora, tenta novamente a cada 2 min e imediatamente quando a rede voltar.
    const retryCatalog = window.setInterval(() => {
      if (!catalogRef.current.some((v) => v.holocene)) void loadCatalog();
    }, 120_000);
    const onOnline = () => { void loadCatalog(); };
    window.addEventListener('online', onOnline);
    return () => {
      alive = false;
      window.clearInterval(retryCatalog);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  // Carrega automaticamente o catálogo Pleistoceno do GVP. Em falhas transitórias
  // (inclusive 403/timeout do upstream), tenta novamente sem bloquear o catálogo Holoceno.
  useEffect(() => {
    if (!settings.showPleistoceneVolcanoes || pleistoceneLoaded) return;
    let alive = true;
    const attempt = async () => {
      if (pleistoceneLoading.current || !alive || !navigator.onLine) return;
      pleistoceneLoading.current = true;
      try {
        const historical = await loadPleistoceneCatalog();
        if (!alive) return;
        if (!historical.length) throw new Error('O GVP retornou catálogo Pleistoceno vazio.');
        const merged = new Map<number, Omit<Volcano, 'status'>>();
        for (const v of catalogRef.current) merged.set(Number(v.vn), v);
        for (const v of historical) if (!merged.has(Number(v.vn))) merged.set(Number(v.vn), v);
        catalogRef.current = [...merged.values()];
        const current = new Set([...ongoingRef.current, ...reportedCurrentEruptionsRef.current]);
        const classified = withActivity(catalogRef.current.map((v) => classifyVolcano(v, current, activeRef.current, recentRef.current, alertsRef.current)));
        setVolcanoes(classified);
        setPleistoceneLoaded(true);
        setPleistoceneInfo({ id: 'gvp-pleistocene', label: 'GVP Pleistoceno', ok: true, updated: Date.now() });
      } catch (error) {
        if (!alive) return;
        setPleistoceneInfo((prev) => ({ ...prev, ok: false, error: String(error) }));
        console.warn('[GeoGus] Catálogo Pleistoceno indisponível; mantendo Holoceno e tentando novamente.', error);
      } finally { pleistoceneLoading.current = false; }
    };
    void attempt();
    const retry = window.setInterval(() => { void attempt(); }, 120_000);
    const onOnline = () => { void attempt(); };
    window.addEventListener('online', onOnline);
    return () => { alive = false; window.clearInterval(retry); window.removeEventListener('online', onOnline); };
  }, [settings.showPleistoceneVolcanoes, pleistoceneLoaded, withActivity]);

  /* ---------- Sismicidade para classificação de risco vulcânico ---------- */
  const refreshVolcanoSeismic = useCallback(async () => {
    if (volcanicSeismicRunning.current) return;
    volcanicSeismicRunning.current = true;
    try {
      // Janela fixa de 7 dias com magnitude mínima 1.0: não depende do filtro
      // visual do usuário e permite comparar 24 h recentes contra os 6 dias prévios.
      const result = await loadQuakes('week', 1.0);
      volcanicQuakesRef.current = result.quakes;
      setVolcanoSeismicInfo({
        id: 'volcano-seismic', label: 'Sismicidade próxima aos vulcões', ok: true,
        updated: Date.now(), error: result.error,
      });
      setVolcanoes((current) => withActivity(current));
    } catch (error) {
      // Preserva a última janela válida; nunca rebaixa vulcões por falha de feed.
      setVolcanoSeismicInfo((prev) => ({ ...prev, ok: false, stale: volcanicQuakesRef.current.length > 0,
        error: String((error as Error)?.message || error) }));
    } finally { volcanicSeismicRunning.current = false; }
  }, [withActivity]);

  useEffect(() => {
    void refreshVolcanoSeismic();
    const timer = window.setInterval(() => { void refreshVolcanoSeismic(); }, 5 * 60_000);
    const onAvailable = () => { if (document.visibilityState === 'visible' && navigator.onLine) void refreshVolcanoSeismic(); };
    document.addEventListener('visibilitychange', onAvailable);
    window.addEventListener('online', onAvailable);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onAvailable);
      window.removeEventListener('online', onAvailable);
    };
  }, [refreshVolcanoSeismic]);

  /* ---------- Terremotos (inicial + polling) ---------- */
  const fetchQuakes = useCallback(async (first = false) => {
    if (quakeFetchRunning.current) return;
    quakeFetchRunning.current = true;
    try {
      const { quakes: q, source, error: sourceError } = await loadQuakes(settingsRef.current.period, Math.min(settingsRef.current.minMag, settingsRef.current.alertMag));
      setQuakes(q);
      setQuakeInfo({ id: 'quakes', label: `Terremotos (${source})`, ok: true, updated: Date.now(), error: sourceError });
      const now = Date.now();
      const previousCheck = lastQuakeCheck.current;
      const fresh = q.filter((k) => !seenQuakes.current.has(k.id));
      if (first || !baseline.current.quakes) {
        // Popula a Central com os eventos relevantes já existentes nas últimas
        // 24 h. Não gera pop-ups do sistema no carregamento inicial.
        if (settingsRef.current.quakeAlerts) {
          for (const k of q) {
            if (!isWithinLast24Hours(k.time, now) || k.mag < settingsRef.current.alertMag) continue;
            pushNotif({
              key: `q:${k.id}`, kind: 'quake',
              title: t('nt.q.title', { mag: k.mag.toFixed(1), place: k.place }),
              body: t('nt.q.body', { depth: k.depthKm.toFixed(0), source }),
              time: k.time, url: k.url,
            }, false);
          }
        }
        for (const k of q) seenQuakes.current.add(k.id);
        baseline.current.quakes = true;
      } else if (fresh.length) {
        for (const k of fresh) {
          seenQuakes.current.add(k.id);
          // O catálogo pode publicar com atraso; aceitar eventos atualizados
          // desde a última consulta, desde que ainda estejam na janela móvel de 24 h.
          const observedAt = Math.max(Number(k.time) || 0, Number(k.updated) || 0);
          const arrivedSinceLastCheck = previousCheck > 0 && observedAt >= previousCheck - 25 * 60_000 && k.time <= now + 60_000;
          if (arrivedSinceLastCheck && isWithinLast24Hours(k.time, now) && k.mag >= settingsRef.current.alertMag && settingsRef.current.quakeAlerts) {
            pushNotif({
              key: `q:${k.id}`, kind: 'quake',
              title: t('nt.q.title', { mag: k.mag.toFixed(1), place: k.place }),
              body: t('nt.q.body', { depth: k.depthKm.toFixed(0), source }),
              time: k.time, url: k.url,
            }, settingsRef.current.browserNotifs, true);
          }
        }
      }
      lastQuakeCheck.current = now;
      try { localStorage.setItem('tp.seen', JSON.stringify([...seenQuakes.current].slice(-3000))); } catch { /* armazenamento opcional */ }
    } catch (e) {
      setQuakeInfo((prev) => ({ ...prev, ok: false, error: String(e) }));
      pushNotif({ key: `sys:quakes:${Math.floor(Date.now() / 300_000)}`, kind: 'sistema', title: t('nt.sys.down'), body: t('nt.sys.downBody'), time: Date.now() }, false);
    } finally {
      quakeFetchRunning.current = false;
    }
  }, [pushNotif, t]);

  // Na primeira consulta apenas cria a linha de base. Mudanças de filtro não devem
  // silenciar um terremoto novo que chegou enquanto o usuário ajustava as opções.
  useEffect(() => { fetchQuakes(!baseline.current.quakes); }, [settings.period, settings.minMag, settings.showQuakes]);
  useEffect(() => {
    const tm = window.setInterval(() => { void fetchQuakes(false); }, POLL_QUAKES);
    const refreshWhenAvailable = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void fetchQuakes(false);
    };
    document.addEventListener('visibilitychange', refreshWhenAvailable);
    window.addEventListener('online', refreshWhenAvailable);
    return () => {
      clearInterval(tm);
      document.removeEventListener('visibilitychange', refreshWhenAvailable);
      window.removeEventListener('online', refreshWhenAvailable);
    };
  }, [fetchQuakes]);

  /* ---------- Alertas de tsunami: CAP oficial NOAA PTWC/NTWC ---------- */
  const fetchTsunami = useCallback(async () => {
    if (tsunamiFetchRunning.current) return;
    tsunamiFetchRunning.current = true;
    try {
      const data = await loadTsunamiAlerts();
      setTsunamiAlerts(data.alerts || []);
      setTsunamiInfo({
        id: 'tsunami', label: 'NOAA Tsunami Centers', ok: !!data.ok,
        stale: !!data.stale, updated: data.stamp ? Date.parse(data.stamp) : Date.now(),
        error: data.errors?.join('; ') || (data.coverage ? data.coverage : undefined),
      });
      // O centro de notificações recebe somente alertas operacionais (Watch, Advisory, Warning).
      // Statements meramente informativos continuam no status da fonte, sem gerar ruído.
      const current = (data.alerts || []).filter((alert) => alert.actionable);
      const unseen = current.filter((alert) => !seenTsunami.current.has(`${alert.id}:${alert.sent}`));
      for (const alert of unseen) {
        const key = `${alert.id}:${alert.sent}`;
        seenTsunami.current.add(key);
        const entry: NotifEntry = {
          key: `tsunami:${key}`, kind: 'tsunami',
          title: `🌊 ${alert.level === 'INFORMATION' ? 'Informação de tsunami' : `Alerta de tsunami · ${alert.level}`}: ${alert.area}`,
          body: `${alert.title}${alert.body ? ` — ${alert.body}` : ''} · ${alert.sourceLabel}`,
          time: Date.parse(alert.sent) || Date.now(), url: alert.url,
        };
        // Alertas já ativos no primeiro carregamento entram no centro, sem disparo sonoro inesperado.
        if (settingsRef.current.tsunamiAlerts) {
          pushNotif(entry, tsunamiBaseline.current && settingsRef.current.browserNotifs, tsunamiBaseline.current);
        }
      }
      if (unseen.length) { try { localStorage.setItem('tp.tsunamiSeen', JSON.stringify([...seenTsunami.current].slice(-1000))); } catch { /* armazenamento opcional */ } }
      tsunamiBaseline.current = true;
    } catch (error) {
      setTsunamiInfo((prev) => ({ ...prev, ok: false, error: String((error as Error)?.message || error) }));
    } finally {
      tsunamiFetchRunning.current = false;
    }
  }, [pushNotif]);

  useEffect(() => {
    void fetchTsunami();
    const timer = window.setInterval(() => { void fetchTsunami(); }, POLL_TSUNAMI);
    const onVisible = () => { if (document.visibilityState === 'visible') void fetchTsunami(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', onVisible); };
  }, [fetchTsunami]);

  /* ---------- Ciclos: verificação de alertas vulcânicos a cada minuto ---------- */
  useEffect(() => {
    const tm = window.setInterval(() => { void refreshEruptions(true); }, POLL_ERUP);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void refreshEruptions(true);
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('online', refreshWhenVisible);
    return () => {
      clearInterval(tm);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('online', refreshWhenVisible);
    };
  }, [refreshEruptions]);

  useEffect(() => {
    const complete = () => {
      const a = alertsRef.current;
      return !!a && a.hans.size > 0 && a.phivolcs.size > 0 && a.pvmbg.size > 0;
    };
    const tm = setInterval(() => { if (!complete()) refreshEruptions(true); }, 5 * 60_000);
    const onOnline = () => refreshEruptions(true);
    window.addEventListener('online', onOnline);
    return () => { clearInterval(tm); window.removeEventListener('online', onOnline); };
  }, [refreshEruptions]);

  /* ---------- Central de Inteligência: relatórios + notícias (5 min) ---------- */
  useEffect(() => {
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
    const tm = window.setInterval(load, POLL_REPORTS);
    const onAvailable = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onAvailable);
    window.addEventListener('online', onAvailable);
    return () => { alive = false; clearInterval(tm); document.removeEventListener('visibilitychange', onAvailable); window.removeEventListener('online', onAvailable); };
  }, []);

  // Tags e confirmação de erupções em andamento: somente relatório oficial,
  // confirmado, recente (48 h) e com texto/registro classificado explicitamente como ERUPCAO.
  useEffect(() => {
    if (!reports) return;
    const now = Date.now();
    riskReportsRef.current = reports.items;
    activityRef.current = activityByVolcano(reports.items);
    reportedCurrentEruptionsRef.current = new Set(reports.items
      .filter((item) => item.kind === 'OFICIAL'
        && item.verified === 'CONFIRMADO'
        && item.volcanoVn != null && item.volcanoVn > 0
        && item.cats.includes('ERUPCAO')
        && item.ts <= now + 60 * 60_000
        && isTodayLocal(item.ts))
      .map((item) => Number(item.volcanoVn)));
    const updated = classifyAll(ongoingRef.current, alertsRef.current);
    const nextErupting = new Set(updated.filter((v) => v.holocene && v.status === 'ERUPCAO').map((v) => v.vn));
    if (reportsBaseline.current && baseline.current.eruptions && settingsRef.current.eruptionAlerts) {
      for (const vn of nextErupting) {
        if (eruptingRef.current.has(vn)) continue;
        const volcano = updated.find((v) => v.vn === vn);
        if (!volcano) continue;
        const episode = ongoingRef2.current.get(vn);
        const supportingReport = reports.items
          .filter((item) => item.volcanoVn === vn && item.kind === 'OFICIAL' && item.verified === 'CONFIRMADO' && item.cats.includes('ERUPCAO'))
          .sort((a, b) => b.ts - a.ts)[0];
        const episodeDate = episode?.start || (supportingReport ? new Date(supportingReport.ts).toISOString().slice(0, 10) : new Date(now).toISOString().slice(0, 10));
        pushNotif({
          key: `e:${vn}:${episodeDate}`, kind: 'eruption',
          title: `🌋 Erupção confirmada: ${volcano.name}`,
          body: `Local: ${volcano.country}`,
          time: supportingReport?.ts || now,
          url: `https://volcano.si.edu/volcano.cfm?vn=${vn}`,
        }, settingsRef.current.browserNotifs, true);
      }
    }
    eruptingRef.current = nextErupting;
    reportsBaseline.current = true;
    setVolcanoes(updated);
  }, [reports, classifyAll, pushNotif, t]);

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
    const erupting = volcanoes.filter((v) => v.holocene && (v.risk?.rank ?? 0) > 0).length;
    return { c24, c7, erupting };
  }, [quakes, volcanoes, settings.minMag]);

  const sortedQuakes = useMemo(() => [...quakes].sort((a, b) => b.time - a.time), [quakes]);
  const eruptingList = useMemo(() => volcanoes.filter((v) => v.holocene && (v.risk?.rank ?? 0) > 0).sort((a, b) => (b.risk?.rank ?? 0) - (a.risk?.rank ?? 0) || (b.lastEruption ?? 0) - (a.lastEruption ?? 0)), [volcanoes]);

  const historicalCount = HISTORICAL_GEOLOGY.length;
  const holoceneCount = volcanoes.filter((v) => v.holocene).length;
  const pleistoceneCount = volcanoes.filter((v) => !v.holocene).length;
  const globalCatalogCount = volcanoes.length;
  const unread = notifs.filter((n) => n.kind !== 'sistema').length;

  const askBrowserNotifs = async () => {
    if (!('Notification' in window)) { return; }
    const p = await Notification.requestPermission();
    if (p === 'granted') {
      setSettings((s) => ({ ...s, browserNotifs: true }));
      void showSystemNotification('GeoGus', { body: t('nt.enabled'), tag: 'geogus-permission-test' });
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

      {liveNotif && (
        <aside className={`live-notification-toast n-${liveNotif.kind}`} role="status" aria-live="polite">
          <div className="live-notification-head">
            <span>🔔 NOVO ALERTA</span>
            <button type="button" aria-label="Fechar notificação" onClick={() => setLiveNotif(null)}>×</button>
          </div>
          <b className="live-notification-title">{liveNotif.title}</b>
          <span className="live-notification-body">{liveNotif.body}</span>
          <button type="button" className="live-notification-open" onClick={() => { setShowNotifs(true); setShowSettings(false); setLiveNotif(null); }}>Abrir central de notificações</button>
        </aside>
      )}

      <div className="statusbar">
        <span className={`chip conn ${online ? 'ok' : 'err'}`}>{online ? t('conn.online') : t('conn.offline')}</span>
        <span className={`chip ${quakeInfo.ok ? 'ok' : 'err'}`} title={quakeInfo.error || `${fmtTime(quakeInfo.updated ?? 0)}`}>
          {quakeInfo.label} {quakeInfo.updated ? `· ${fmtTime(quakeInfo.updated)}` : `· ${t('pp.na')}`}
        </span>
        <span className={`chip ${volcanoInfo.ok ? 'ok' : 'err'}`} title={volcanoInfo.error || ''}>
          {volcanoInfo.label} {volcanoInfo.updated ? `· ${fmtTime(volcanoInfo.updated)}` : `· ${t('pp.na')}`}
        </span>
        <span className={`chip ${holoceneCount > 0 ? 'ok' : 'stale'}`} title="Catálogo global do Smithsonian GVP: Holoceno + Pleistoceno. A lista Pleistoceno é preliminar.">
          🌋 Catálogo GVP · {globalCatalogCount.toLocaleString(locale)} vulcões
        </span>
        {settings.showPleistoceneVolcanoes && <span className={`chip ${pleistoceneInfo.ok ? 'ok' : 'stale'}`} title={pleistoceneInfo.error || 'Catálogo Pleistoceno do Smithsonian GVP'}>
          {pleistoceneInfo.label} · {pleistoceneInfo.ok ? pleistoceneCount.toLocaleString(locale) : 'carregando/reconectando'}
        </span>}
        {(['phivolcs', 'pvmbg', 'usgs'] as const).map((k) => obsInfo[k] && (
          <span key={k} className={`chip ${obsInfo[k]!.stale ? 'stale' : obsInfo[k]!.ok ? 'ok' : 'err'}`} title={obsInfo[k]!.error || `${obsInfo[k]!.label} · ${fmtTime(obsInfo[k]!.updated ?? 0)}`}>
            {obsInfo[k]!.label} {obsInfo[k]!.ok ? `· ${obsInfo[k]!.stale ? 'cache' : fmtTime(obsInfo[k]!.updated ?? 0)}` : `· ${t('pp.na')}`}
          </span>
        ))}
        <span className={`chip ${tsunamiInfo.ok ? (tsunamiInfo.stale ? 'stale' : 'ok') : 'err'}`} title={tsunamiInfo.error || 'Alertas oficiais NOAA PTWC/NTWC'}>
          🌊 Tsunami {tsunamiAlerts.filter((a) => a.actionable).length > 0 ? `· ${tsunamiAlerts.filter((a) => a.actionable).length} alerta(s)` : tsunamiInfo.ok ? '· sem alerta ativo' : '· n/d'}
        </span>
        <span className={`chip ${volcanoSeismicInfo.ok ? 'ok' : volcanoSeismicInfo.stale ? 'stale' : 'err'}`} title={volcanoSeismicInfo.error || 'Janela fixa de 7 dias, magnitude mínima 1.0; comparação das últimas 24 h com os 6 dias anteriores.'}>Sismicidade vulcânica {volcanoSeismicInfo.ok ? `· ${fmtTime(volcanoSeismicInfo.updated ?? 0)}` : '· indisponível'}</span>
        <span className="chip stat">{t('stats.24h')} <b>{stats.c24}</b></span>
        <span className="chip stat">{t('stats.7d')} <b>{stats.c7}</b></span>
        <button
          className={`chip stat erupting chip-btn ${settings.volcanoFilter === 'erupting' ? 'on' : ''}`}
          onClick={() => { setTab('volcanoes'); setShowSide(true); upd({ volcanoFilter: 'erupting' }); }}
          title={t('side.tab.erupting')}
        >
          {t('side.tab.erupting')} <b>{stats.erupting}</b>
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
        <label className="chk pleistocene-toggle" title="Vulcões do catálogo Pleistoceno do Smithsonian GVP; não indica atividade atual.">
          <input type="checkbox" checked={settings.showPleistoceneVolcanoes} onChange={(e) => upd({ showPleistoceneVolcanoes: e.target.checked })} />
          <span className="pleistocene-toggle-symbol">△</span> Vulcões Pleistocenos ({pleistoceneCount.toLocaleString(locale) || '…'})
        </label>
        <label className="chk super-toggle" title="Sistemas com supererupções documentadas e grandes caldeiras candidatas; nem todos são VEI 8 confirmado e nenhum marcador indica perigo ou atividade atual.">
          <input type="checkbox" checked={settings.showSupervolcanoes} onChange={(e) => upd({ showSupervolcanoes: e.target.checked })} />
          <span className="super-toggle-symbol">✦</span> Supervulcões e grandes caldeiras ({SUPER_VOLCANO_IDS.size})
        </label>
        <label className="chk historical-toggle" title="Estruturas geológicas antigas documentadas separadamente; não são vulcões monitorados nem indicam atividade atual.">
          <input type="checkbox" checked={settings.showHistoricalGeology} onChange={(e) => upd({ showHistoricalGeology: e.target.checked })} />
          <span className="historical-toggle-symbol">◇</span> Estruturas geológicas antigas ({historicalCount.toLocaleString(locale)})
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
                      <span className={`m-badge ${v.risk?.level === 'RED' ? 'v-erup' : v.risk?.level === 'ORANGE' ? 'v-attention' : v.risk?.level === 'YELLOW' ? 'v-activity' : 'v-normal'}`}>{v.risk?.label ?? 'NORMAL'}</span>
                      <div className="li-main">
                        <span className="li-title">{v.name}</span>
                        <span className="li-sub">{v.country} · {v.status === 'ERUPCAO' ? `${t('erupt.start')}: ${inf?.start ?? v.lastEruption ?? t('pp.noRecord')} · ${t('erupt.last')}: ${inf?.end ?? t('erupt.ongoing')}` : (v.activity?.map((k) => t(`cat.${k}`)).join(' · ') || 'Atualização de observatório')}</span>
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
            {tsunamiAlerts.filter((a) => a.actionable).length > 0 && (
              <section className="tsunami-active-list">
                <h3>🌊 Alertas oficiais de tsunami ativos</h3>
                {tsunamiAlerts.filter((a) => a.actionable).map((alert) => (
                  <article key={`${alert.id}:${alert.sent}`} className="tsunami-active-item">
                    <b>{alert.level}: {alert.area}</b>
                    <p>{alert.title}</p>
                    <small>{alert.sourceLabel} · {new Date(alert.sent).toLocaleString(locale)}</small>
                    <a href={alert.url} target="_blank" rel="noreferrer">Boletim oficial ↗</a>
                  </article>
                ))}
              </section>
            )}
            <ul className="notif-list">
              {notifs.length === 0 && <li className="empty">{t('nt.empty')} · M≥{settings.alertMag.toFixed(1)}</li>}
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
            <h3 className="settings-group-title">🌐 Terremotos</h3>
            <label className="chk">{t('st.quakeAlerts')} (M≥{settings.alertMag.toFixed(1)})
              <input type="checkbox" checked={settings.quakeAlerts} onChange={(e) => upd({ quakeAlerts: e.target.checked })} />
            </label>
            <label className="chk">{t('st.alertMin')}
              <select value={settings.alertMag} onChange={(e) => upd({ alertMag: Number(e.target.value) })}>
                <option value={1}>1.0+</option>
                <option value={2.5}>2.5+</option>
                <option value={3}>3.0+</option>
                <option value={4}>4.0+</option>
                <option value={5}>5.0+</option>
                <option value={6}>6.0+</option>
                <option value={7}>7.0+</option>
              </select>
            </label>
            <h3 className="settings-group-title">🌋 Erupções</h3>
            <label className="chk">{t('st.eruptionAlerts')}
              <input type="checkbox" checked={settings.eruptionAlerts} onChange={(e) => upd({ eruptionAlerts: e.target.checked })} />
            </label>
            <h3 className="settings-group-title">🌊 Tsunami</h3>
            <label className="chk">{t('st.tsunamiAlerts')}
              <input type="checkbox" checked={settings.tsunamiAlerts} onChange={(e) => upd({ tsunamiAlerts: e.target.checked })} />
            </label>
            <h3 className="settings-group-title">Notificações do dispositivo</h3>
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
