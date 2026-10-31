/**
 * Builds public/data/world-map.json from Natural Earth 110m (public domain, via world-atlas).
 * Dev-only: nothing here is imported by src/. Run: npm run world-map
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { geoEqualEarth, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import countries from 'i18n-iso-countries';

const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve('world-atlas/countries-110m.json'), 'utf8'));
const WIDTH = 1000;
// Natural Earth shapes without an ISO numeric id
const BY_NAME: Record<string, string> = { Kosovo: 'XK', 'N. Cyprus': 'CY', Somaliland: 'SO' };

const fc = feature(topo, topo.objects.countries) as unknown as { features: { id?: string; properties: { name: string }; geometry: any }[] };
const land = fc.features.filter(f => f.properties.name !== 'Antarctica');
const projection = geoEqualEarth().fitWidth(WIDTH, { type: 'FeatureCollection', features: land } as any);
const path = geoPath(projection).digits(1);

/** Drops points closer than MIN px to the previous kept one (keeps each ring's first and last point) to stay within the size budget */
const MIN = 1;
function thin(d: string): string {
  return d.split('Z').filter(Boolean).map(ring => {
    const pts = ring.replace(/^M/, '').split('L').map(p => p.split(',').map(Number));
    const kept = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const [px, py] = kept[kept.length - 1];
      if (Math.hypot(pts[i][0] - px, pts[i][1] - py) >= MIN) kept.push(pts[i]);
    }
    if (pts.length > 1) kept.push(pts[pts.length - 1]);
    const out = kept.length < 3 ? pts : kept;
    return 'M' + out.map(p => p.join(',')).join('L') + 'Z';
  }).join('');
}

const paths: Record<string, string> = {};
for (const f of land) {
  const code = (f.id && countries.numericToAlpha2(f.id)) || BY_NAME[f.properties.name];
  const d = thin(path(f as any) ?? '');
  if (!code || !d) { console.warn('skipped', f.properties.name); continue; }
  paths[code] = paths[code] ? `${paths[code]}${d}` : d;
}
const [[x0, y0], [x1, y1]] = geoPath(projection).bounds({ type: 'FeatureCollection', features: land } as any);
const viewBox = `${Math.floor(x0)} ${Math.floor(y0)} ${Math.ceil(x1 - x0)} ${Math.ceil(y1 - y0)}`;
const out = JSON.stringify({ viewBox, paths });
writeFileSync(new URL('../public/data/world-map.json', import.meta.url), out + '\n');
console.log(`world-map.json: ${Object.keys(paths).length} shapes, ${(out.length / 1024).toFixed(1)} KB, viewBox ${viewBox}`);
