/**
 * The panel pools of the three dashboards, in show order (v1 panels first, then the new ones). Each pool lives in its
 * own file; this module re-exports them for the dashboards, the TV wall and the tests.
 */
export { type VulnCtx, vulnNumberPanels, vulnPanels, WATCHLIST_EMPTY } from './vulnPanels';
export { type RansomCtx, ransomPanels } from './ransomPanels';
export { type NpmCtx, npmPanels } from './npmPanels';
