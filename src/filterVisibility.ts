import type { Settings } from './types';

/**
 * O seletor temporal é útil sempre que pelo menos uma das camadas de eventos
 * estiver ativa. O filtro de magnitude continua exclusivo da camada sísmica.
 */
export function shouldShowPeriodFilter(settings: Pick<Settings, 'showQuakes' | 'showVolcanoes'>): boolean {
  return settings.showQuakes || settings.showVolcanoes;
}
