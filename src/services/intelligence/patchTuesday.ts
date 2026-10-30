import { MsrcData, PatchCve, PatchMonth } from '../../types';

/**
 * Microsoft's monthly security releases (Patch Tuesday) from the MSRC CVRF API:
 * api.msrc.microsoft.com/cvrf/v3.0/updates lists the documents, cvrf/v3.0/cvrf/<ID> holds one.
 */

const SEVERITIES = ['Critical', 'Important', 'Moderate', 'Low'] as const;
const MONTHLY_TITLE = /^\w+ \d{4} Security Updates$/;
const DAY_MS = 24 * 60 * 60 * 1000;
export const MSRC_API = 'https://api.msrc.microsoft.com/cvrf/v3.0';
export const PATCH_MONTHS = 3;
const FRESH_RELEASE_MS = 3 * DAY_MS; // Microsoft revises a release most in its first days
const REVISION_REFETCH_MS = 7 * DAY_MS; // older months are revised too, but rarely in ways that matter here

/** The latest `count` monthly releases in the update list, newest first (out-of-band documents are skipped) */
export function pickPatchMonths(list: any, count: number): { id: string; released: string; revised?: string }[] {
  const rows: any[] = Array.isArray(list?.value) ? list.value : [];
  return rows
    .filter((r) => typeof r?.ID === 'string' && MONTHLY_TITLE.test(String(r.DocumentTitle)) && !isNaN(Date.parse(r.InitialReleaseDate)))
    .map((r) => ({ id: r.ID as string, released: String(r.InitialReleaseDate), revised: typeof r.CurrentReleaseDate === 'string' ? r.CurrentReleaseDate : undefined }))
    .sort((a, b) => Date.parse(b.released) - Date.parse(a.released))
    .slice(0, count);
}

const text = (v: any): string => (typeof v?.Value === 'string' ? v.Value.trim() : '');

// "Windows 11 Version 24H2 for x64-based Systems", "… for 32-bit Systems" and "Windows Server 2025 (Server Core installation)"
// are one product as far as anyone's stack is concerned
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
    // Every product, not just a few: stack matching and search need the whole list (the UI shows five).
    // Deduped ignoring case, since the tree has both "Version 26H1" and "version 26H1"
    const products = new Map<string, string>();
    for (const pid of ids) {
      const name = names.get(String(pid));
      if (!name) continue;
      const clean = productName(name);
      if (!products.has(clean.toLowerCase())) products.set(clean.toLowerCase(), clean);
    }

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
      products: [...products.values()],
      kb: kb.length ? kb : undefined,
    });
  }
  return { id, title: text(doc.DocumentTitle) || id, released, cves };
}

const validCve = (c: any): c is PatchCve =>
  Boolean(c) && typeof c.cve === 'string' && typeof c.title === 'string' && Array.isArray(c.products) && c.products.every((p: unknown) => typeof p === 'string');

/**
 * msrc.json as published, or null if it isn't. It comes over the network (the app's copy, and the previous
 * run's in the snapshot), so malformed months and CVE entries are dropped rather than trusted.
 */
export function decodeMsrc(raw: any): MsrcData | null {
  if (!raw || !Array.isArray(raw.months)) return null;
  const months: PatchMonth[] = raw.months
    .filter((m: any) => m && typeof m.id === 'string' && Array.isArray(m.cves))
    .map((m: any) => ({ id: m.id, title: typeof m.title === 'string' ? m.title : m.id, released: typeof m.released === 'string' ? m.released : '', cves: m.cves.filter(validCve) }));
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
 * three days and daily after that; older months come from the previous run's file and are refetched when
 * Microsoft has revised them since (CurrentReleaseDate), at most weekly. A failed fetch keeps the previous
 * copy, so a run never loses a month.
 */
export async function refreshPatchMonths(previous: MsrcData | null, getJson: (url: string) => Promise<any>, now = Date.now()): Promise<PatchRefresh> {
  const updates = { ...(previous?.updates ?? {}) };
  const result: PatchRefresh = { data: { months: previous?.months ?? [], updates }, fetched: [], carried: [], failed: [] };
  let picked: ReturnType<typeof pickPatchMonths>;
  try {
    picked = pickPatchMonths(await getJson(`${MSRC_API}/updates`), PATCH_MONTHS);
    if (!picked.length) throw new Error('no monthly releases in the update list');
  } catch (err) {
    result.listError = err instanceof Error ? err.message : String(err);
    return result;
  }

  const months: PatchMonth[] = [];
  for (const [i, { id, released, revised }] of picked.entries()) {
    const prev = previous?.months.find((m) => m.id === id);
    const lastFetched = Date.parse(updates[id] ?? '');
    const sinceFetch = now - lastFetched; // NaN when never fetched, which `!(… < …)` treats as due
    const due = !prev || (i === 0
      ? now - Date.parse(released) < FRESH_RELEASE_MS || !(sinceFetch < DAY_MS)
      : Date.parse(revised ?? '') > (lastFetched || 0) && !(sinceFetch < REVISION_REFETCH_MS));
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
