import { useEffect, useRef, useState } from 'react';
import type { Quake, Volcano } from '../types';
import { nominatimSearch } from '../api';
import { useI18n } from '../i18n';
import { HISTORICAL_GEOLOGY } from '../historicalGeology';

export interface Suggestion {
  label: string;
  sub: string;
  kind: 'volcano' | 'quake' | 'place';
  lat: number;
  lon: number;
  zoom: number;
  id?: string;
  kind2?: 'volcano' | 'quake';
  country?: string;
  vn?: number;
}

interface Props {
  volcanoes: Volcano[];
  quakes: Quake[];
  onPick: (s: Suggestion) => void;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export default function SearchBar({ volcanoes, quakes, onPick }: Props) {
  const { t, locale } = useI18n();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    const nq = norm(q.trim());
    if (!nq) { setItems([]); return; }
    const local: Suggestion[] = [];
    for (const v of volcanoes) {
      if (norm(v.name).includes(nq) || norm(v.country).includes(nq)) {
        if (!v.holocene) {
          local.push({
            label: v.name, sub: `Vulcão do Pleistoceno · ${v.country}`, kind: 'place', lat: v.lat, lon: v.lon,
            zoom: 8, id: `geo-gvp-${v.vn}`, country: v.country,
          });
        } else {
          local.push({
            label: v.name, sub: `${t('search.kind.volcano')} · ${v.country}`, kind: 'volcano', lat: v.lat, lon: v.lon,
            zoom: v.status === 'ERUPCAO' ? 9 : 8, id: 'v' + v.vn, kind2: 'volcano', country: v.country, vn: v.vn,
          });
        }
        if (local.length >= 8) break;
      }
    }
    for (const k of quakes) {
      if (k.place && norm(k.place).includes(nq)) {
        local.push({ label: `M ${k.mag.toFixed(1)} — ${k.place}`, sub: `${t('side.tab.quakes').slice(0, 1).toUpperCase() + t('side.tab.quakes').slice(1)} · ${new Date(k.time).toLocaleDateString(locale)}`, kind: 'quake', lat: k.lat, lon: k.lon, zoom: 7, id: k.id, kind2: 'quake' });
        if (local.filter((x) => x.kind === 'quake').length >= 5) break;
      }
    }
    for (const feature of HISTORICAL_GEOLOGY) {
      const terms = [feature.name, feature.region, ...(feature.aliases || [])];
      if (terms.some((value) => norm(value).includes(nq))) {
        local.push({
          label: feature.name,
          sub: `Estrutura geológica histórica · ${feature.region}`,
          kind: 'place', lat: feature.lat, lon: feature.lon, zoom: 8,
          id: `geo-${feature.id}`,
        });
      }
    }
    setItems(local);
    let cancel = false;
    if (q.trim().length >= 3 && local.length < 4) {
      const tm = setTimeout(async () => {
        try {
          const res = await nominatimSearch(q.trim());
          if (!cancel) setItems([...local, ...res.map((r) => ({ label: r.label.slice(0, 70), sub: t('search.kind.place'), kind: 'place' as const, lat: r.lat, lon: r.lon, zoom: 8 }))]);
        } catch { /* offline */ }
      }, 450);
      return () => { clearTimeout(tm); cancel = true; };
    }
  }, [q, volcanoes, quakes, t, locale]);

  return (
    <div className="searchbar" ref={boxRef}>
      <input
        value={q}
        placeholder={t('app.searchPh')}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' && items[0]) { onPick(items[0]); setOpen(false); } }}
        aria-label={t('app.searchPh')}
      />
      {open && q && (
        <ul className="search-drop">
          {items.length === 0 && <li className="empty">{t('search.noResults')}</li>}
          {items.map((s, i) => (
            <li key={i} onMouseDown={(e) => { e.preventDefault(); onPick(s); setOpen(false); }}>
              <span className={`s-kind k-${s.kind}`}>{s.kind === 'volcano' ? '🌋' : s.kind === 'quake' ? '〰' : '📍'}</span>
              <span className="s-label">{s.label}</span>
              <span className="s-sub">{s.sub}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
