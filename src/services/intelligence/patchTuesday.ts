import { MsrcData, PatchCve, PatchMonth } from '../../types';

/**
 * Microsoft's monthly security releases (Patch Tuesday) from the MSRC CVRF API:
 * api.msrc.microsoft.com/cvrf/v3.0/updates lists the documents, cvrf/v3.0/cvrf/<ID> holds one.
 */

const SEVERITIES = ['Critical', 'Important', 'Moderate', 'Low'] as const;
const MONTHLY_TITLE = /^\w+ \d{4} Security Updates$/;
const MAX_PRODUCTS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
export const MSRC_API = 'https://api.msrc.microsoft.com/cvrf/v3.0';
export const PATCH_MONTHS = 3;
const FRESH_RELEASE_MS = 3 * DAY_MS; // Microsoft revises a release most in its first days

/** The latest `count` monthly releases in the update list, newest first (out-of-band documents are skipped) */
export function pickPatchMonths(list: any, count: number): { id: string; released: string }[] {
  const rows: any[] = Array.isArray(list?.value) ? list.value : [];
  return rows
    .filter((r) => typeof r?.ID === 'string' && MONTHLY_TITLE.test(String(r.DocumentTitle)) && !isNaN(Date.parse(r.InitialReleaseDate)))
    .map((r) => ({ id: r.ID as string, released: String(r.InitialReleaseDate) }))
    .sort((a, b) => Date.parse(b.released) - Date.parse(a.released))
    .slice(0, count);
}

const text = (v: any): string => (typeof v?.Value === 'string' ? v.Value.trim() : '');

// "Windows 11 Version 24H2 for x64-based Systems", "… for 32-bit Systems" and "Windows Server 2025 (Server Core installation)"
// would otherwise use up the five product slots on one product
const productName = (name: string) => name.replace(/ for [\w-]+ Systems$/, '').replace(/ \(Server Core installation\)$/, '').trim();

/** Most common value, for fields that are repeated once per affected product */
function mostCommon(values: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/**
 * One CVRF document as a PatchMonth. Third-party CVEs Microsoft only republishes (Chromium in Edge,
 * open-source packages in Azure Linux) are left out: their CNA note names someone other than Microsoft,
 * they aren't part of the Patch Tuesday release and outnumber it.
 */
export function normalizeCvrf(doc: any): PatchMonth | null {
  const id = text(doc?.DocumentTracking?.Identification?.ID);
  if (!id) return null;
  const rawReleased = String(doc.DocumentTracking.InitialReleaseDate ?? '');
  const released = /Z|[+-]\d\d:\d\d$/.test(rawReleased) ? rawReleased : rawReleased ? `${rawReleased}Z` : '';
  const names = new Map<string, string>();
  for (const p of Array.isArray(doc.ProductTree?.FullProductName) ? doc.ProductTree.FullProductName : []) {
    if (p?.ProductID !== undefined && typeof p.Value === 'string') names.set(String(p.ProductID), p.Value);
  }

  const cves: PatchCve[] = [];
  for (const v of Array.isArray(doc.Vulnerability) ? doc.Vulnerability : []) {
    if (typeof v?.CVE !== 'string') continue;
    const notes: any[] = Array.isArray(v.Notes) ? v.Notes : [];
    const cna = notes.find((n) => n?.Type === 8)?.Title;
    if (cna && cna !== 'Microsoft') continue;
    const threats: any[] = Array.isArray(v.Threats) ? v.Threats : [];
    const ofType = (type: number) => threats.filter((t) => t?.Type === type).map((t) => text(t.Description)).filter(Boolean);

    const severity = SEVERITIES.find((s) => ofType(3).includes(s));
    const impact = mostCommon(ofType(0));
    const exploitability = ofType(1).join(';');
    const scores = (Array.isArray(v.CVSSScoreSets) ? v.CVSSScoreSets : []).map((s: any) => Number(s?.BaseScore)).filter((n: number) => n > 0);

    // Affected products: the "known affected" status list, else whatever the threats name
    const statusIds = (Array.isArray(v.ProductStatuses) ? v.ProductStatuses : []).flatMap((s: any) => (Array.isArray(s?.ProductID) ? s.ProductID : []));
    const ids: string[] = statusIds.length ? statusIds : threats.flatMap((t) => (Array.isArray(t?.ProductID) ? t.ProductID : []));
    const products = [...new Set(ids.map((pid) => names.get(String(pid))).filter((n): n is string => Boolean(n)).map(productName))].slice(0, MAX_PRODUCTS);

    const kb = [...new Set((Array.isArray(v.Remediations) ? v.Remediations : [])
      .map((r: any) => text(r?.Description))
      .filter((d: string) => /^\d{6,8}$/.test(d))
      .map((d: string) => `KB${d}`))] as string[];

    cves.push({
      cve: v.CVE.trim().toUpperCase(),
      title: text(v.Title) || v.CVE,
      severity,
      impact,
      cvss: scores.length ? Math.max(...scores) : undefined,
      exploited: /Exploited:Yes/i.test(exploitability),
      publiclyDisclosed: /Publicly Disclosed:Yes/i.test(exploitability),
      products,
      kb: kb.length ? kb : undefined,
    });
  }
  return { id, title: text(doc.DocumentTitle) || id, released, cves };
}

/** A previous run's msrc.json, if it has the expected shape (it comes back over the network) */
export function decodeMsrc(raw: any): MsrcData | null {
  if (!raw || !Array.isArray(raw.months)) return null;
  const months = raw.months.filter((m: any) => m && typeof m.id === 'string' && Array.isArray(m.cves));
  return { generatedAt: raw.generatedAt, months, updates: raw.updates && typeof raw.updates === 'object' ? raw.updates : {} };
}

export interface PatchRefresh {
  data: MsrcData;
  fetched: string[];
  carried: string[];
  failed: { id: string; error: string }[];
  listError?: string;
}

/**
 * The latest PATCH_MONTHS releases for the snapshot. The newest month is refetched every run for its first
 * three days and daily after that; older months come from the previous run's file and are only fetched
 * when it doesn't have them. A failed fetch keeps the previous copy, so a run never loses a month.
 */
export async function refreshPatchMonths(previous: MsrcData | null, getJson: (url: string) => Promise<any>, now = Date.now()): Promise<PatchRefresh> {
  const updates = { ...(previous?.updates ?? {}) };
  const result: PatchRefresh = { data: { months: previous?.months ?? [], updates }, fetched: [], carried: [], failed: [] };
  let picked: { id: string; released: string }[];
  try {
    picked = pickPatchMonths(await getJson(`${MSRC_API}/updates`), PATCH_MONTHS);
    if (!picked.length) throw new Error('no monthly releases in the update list');
  } catch (err) {
    result.listError = err instanceof Error ? err.message : String(err);
    return result;
  }

  const months: PatchMonth[] = [];
  for (const [i, { id, released }] of picked.entries()) {
    const prev = previous?.months.find((m) => m.id === id);
    const lastFetched = Date.parse(updates[id] ?? '');
    const due = !prev || (i === 0 && (now - Date.parse(released) < FRESH_RELEASE_MS || !(now - lastFetched < DAY_MS)));
    if (!due) {
      months.push(prev);
      result.carried.push(id);
      continue;
    }
    try {
      const month = normalizeCvrf(await getJson(`${MSRC_API}/cvrf/${encodeURIComponent(id)}`));
      if (!month) throw new Error('unexpected document format');
      months.push(month);
      updates[id] = new Date(now).toISOString();
      result.fetched.push(id);
    } catch (err) {
      result.failed.push({ id, error: err instanceof Error ? err.message : String(err) });
      if (prev) months.push(prev);
    }
  }
  for (const id of Object.keys(updates)) if (!months.some((m) => m.id === id)) delete updates[id];
  result.data = { months, updates };
  return result;
}
