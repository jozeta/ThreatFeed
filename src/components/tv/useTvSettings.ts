import { useMemo } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { useHashRoute } from '../../hooks/useHashRoute';
import { effectiveTv, readTvOverrides, type TvEffective } from '../../services/tv/tvOverrides';

/** The TV settings this screen uses: saved settings with the link's parameters on top (never saved) */
export function useTvSettings(): TvEffective {
  const { settings } = useSettings();
  const [route] = useHashRoute();
  const query = route.params.toString();
  return useMemo(() => effectiveTv(settings, readTvOverrides(new URLSearchParams(query))), [settings, query]);
}
