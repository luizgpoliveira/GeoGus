import { useEffect, useState } from 'react';
import { commonsImage, GVP_IMAGE_URL } from '../api';
import { useI18n } from '../i18n';

interface Props {
  vn: number;
  name: string;
  gvpFile?: string;
}

type ImgState =
  | { kind: 'loading' }
  | { kind: 'ok'; url: string; source: 'gvp' | 'commons'; credit?: string }
  | { kind: 'none' };

/** Resolve e exibe a melhor fotografia disponível: GVP → Wikimedia Commons → placeholder. */
export default function VolcanoPhoto({ vn, name, gvpFile }: Props) {
  const { t } = useI18n();
  const [st, setSt] = useState<ImgState>({ kind: 'loading' });

  useEffect(() => {
    let alive = true;
    setSt({ kind: 'loading' });
    const gvpUrl = GVP_IMAGE_URL(gvpFile);
    if (gvpUrl) {
      // testa a URL oficial do GVP antes de assumir
      const probe = new Image();
      probe.onload = () => alive && setSt({ kind: 'ok', url: gvpUrl, source: 'gvp', credit: undefined });
      probe.onerror = () => lookupCommons();
      probe.src = gvpUrl;
    } else {
      lookupCommons();
    }
    return () => { alive = false; };

    async function lookupCommons() {
      const c = await commonsImage(name);
      if (!alive) return;
      if (c?.url) setSt({ kind: 'ok', url: c.url, source: 'commons', credit: c.credit });
      else setSt({ kind: 'none' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vn, gvpFile]);

  if (st.kind === 'none') {
    return (
      <figure className="volcano-photo">
        <div className="photo-placeholder" aria-label={name}>
          <span className="ph-icon">⛰</span>
          <span className="ph-name">{name}</span>
          <span className="ph-sub">Smithsonian GVP · vn {vn}</span>
        </div>
        <figcaption>{t('pp.source')}: Smithsonian GVP{vn ? ` (vn ${vn})` : ''}</figcaption>
      </figure>
    );
  }

  return (
    <figure className="volcano-photo">
      {st.kind === 'loading'
        ? <div className="photo-placeholder loading"><span className="ph-icon">⛰</span><span className="ph-sub">{t('dt.loading')}</span></div>
        : <img src={st.url} alt={name} loading="lazy" />}
      {st.kind === 'ok' && (
        <figcaption>
          {t('dt.imageCredit')} {st.source === 'gvp' ? 'Smithsonian GVP' : 'Wikimedia Commons'}
          {st.credit ? ` · ${st.credit}` : ''} · vn {vn}
        </figcaption>
      )}
    </figure>
  );
}
