import { useRef } from 'react';
import { READER_LEVEL } from '../components/Common/panelStack';
import { PANEL_PARAMS, PanelParam, panelLevels } from './useHashRoute';

/**
 * Each open panel's stacking level (PanelLevel) from the URL: the order of the parameters, the last on top.
 * A panel opened while the reader is open (an entity link in the article) goes over the reader until it closes.
 */
export function usePanelLevels(params: URLSearchParams, readerOpen: boolean): Partial<Record<PanelParam, number>> {
  const seen = useRef<Partial<Record<PanelParam, string>>>({});
  const overReader = useRef(new Set<PanelParam>());
  const levels = panelLevels(params);
  for (const key of PANEL_PARAMS) {
    const value = params.get(key) ?? undefined;
    if (!value || !readerOpen) overReader.current.delete(key);
    else if (value !== seen.current[key]) overReader.current.add(key);
    seen.current[key] = value;
    if (overReader.current.has(key) && levels[key] !== undefined) levels[key] = READER_LEVEL + 1 + levels[key]!;
  }
  return levels;
}
