import { useEffect, useRef, useState } from 'react';
import { commonsImage, curatedVolcanoPhoto, GVP_IMAGE_URL } from '../api';
import { useI18n } from '../i18n';

interface Props {
  vn: number;
  name: string;
  gvpFile?: string;
}

type ImgState =
  | { kind: 'loading' }
  | { kind: 'ok'; url: string; source: 'gvp' | 'commons' | 'curated'; credit?: string; sourceUrl?: string }
  | { kind: 'none' };

/**
 * Carregamento realmente preguiçoso: não consulta GVP/Commons para dezenas de
 * cards fora da área visível. O fallback do Commons só é aceito se o nome do
 * arquivo corresponder ao vulcão; caso contrário, mostra placeholder.
 */
export default function VolcanoPhoto({ vn, name, gvpFile }: Props) {
  const { t } = useI18n();
  const figureRef = useRef<HTMLElement | null>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [st, setSt] = useState<ImgState>({ kind: 'loading' });

  useEffect(() => {
    const node = figureRef.current;
    if (!node) { setNearViewport(true); return; }
    if (!('IntersectionObserver' in window)) { setNearViewport(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { root: null, rootMargin: '260px 520px', threshold: 0.01 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nearViewport) return;
    let alive = true;
    setSt({ kind: 'loading' });

    const curated = curatedVolcanoPhoto(vn);
    if (curated) {
      setSt({ kind: 'ok', url: curated.url, source: 'curated', credit: curated.credit, sourceUrl: curated.sourceUrl });
      return () => { alive = false; };
    }

    const gvpUrl = GVP_IMAGE_URL(gvpFile);
    if (gvpUrl) {
      setSt({ kind: 'ok', url: gvpUrl, source: 'gvp' });
    } else {
      void loadCommons();
    }

    return () => { alive = false; };

    async function loadCommons() {
      const result = await commonsImage(name, vn);
      if (!alive) return;
      if (result?.url) setSt({ kind: 'ok', url: result.url, source: 'commons', credit: result.credit });
      else setSt({ kind: 'none' });
    }
  }, [nearViewport, vn, name, gvpFile]);

  const handleImageError = () => {
    if (st.kind !== 'ok') return;
    if (st.source === 'gvp' || st.source === 'curated') {
      setSt({ kind: 'loading' });
      void commonsImage(name, vn).then((result) => {
        if (result?.url) setSt({ kind: 'ok', url: result.url, source: 'commons', credit: result.credit });
        else setSt({ kind: 'none' });
      });
    } else {
      setSt({ kind: 'none' });
    }
  };

  if (st.kind === 'none') {
    return (
      <figure className="volcano-photo" ref={figureRef as any}>
        <div className="photo-placeholder" aria-label={name}>
          <span className="ph-icon">⛰</span>
          <span className="ph-name">{name}</span>
          <span className="ph-sub">Imagem específica não localizada</span>
        </div>
        <figcaption>{t('pp.source')}: Smithsonian GVP · vn {vn}</figcaption>
      </figure>
    );
  }

  return (
    <figure className="volcano-photo" ref={figureRef as any}>
      {!nearViewport || st.kind === 'loading'
        ? <div className="photo-placeholder loading"><span className="ph-icon">⛰</span><span className="ph-sub">{t('dt.loading')}</span></div>
        : <img src={st.url} alt={`${name} — vulcão`} loading="lazy" decoding="async" onError={handleImageError} />}
      {st.kind === 'ok' && (
        <figcaption>
          {t('dt.imageCredit')} {st.source === 'gvp' ? 'Smithsonian GVP' : st.source === 'curated' ? st.credit : 'Wikimedia Commons'}
          {st.source === 'commons' && st.credit ? ` · ${st.credit}` : ''} · vn {vn}
          {st.sourceUrl && <> · <a href={st.sourceUrl} target="_blank" rel="noopener noreferrer">origem</a></>}
        </figcaption>
      )}
    </figure>
  );
}
