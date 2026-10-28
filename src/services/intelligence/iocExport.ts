import { Article, ExtractedIOC } from '../../types';

const csvCell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export function iocsToCsv(iocs: ExtractedIOC[], article: Article): string {
  const rows = [['type', 'value', 'source_title', 'source_url', 'published_at']];
  for (const ioc of iocs) rows.push([ioc.type, ioc.value, article.title, article.url, article.publishedAt]);
  return rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n';
}

const HASH_ALGORITHM: Partial<Record<ExtractedIOC['type'], string>> = {
  hash_md5: 'MD5',
  hash_sha1: "'SHA-1'",
  hash_sha256: "'SHA-256'",
};

const newId = (type: string) => `${type}--${crypto.randomUUID()}`;

/**
 * STIX 2.1 bundle: an indicator per IP/hash, a vulnerability per CVE, an attack-pattern per
 * ATT&CK technique, all attributed to a report object for the source article.
 */
export function iocsToStix(iocs: ExtractedIOC[], article: Article): string {
  const now = new Date().toISOString();
  const common = { spec_version: '2.1', created: now, modified: now };
  const objects: Record<string, unknown>[] = [];

  for (const ioc of iocs) {
    if (ioc.type === 'cve') {
      objects.push({
        type: 'vulnerability', id: newId('vulnerability'), ...common, name: ioc.value,
        external_references: [{ source_name: 'cve', external_id: ioc.value, url: `https://nvd.nist.gov/vuln/detail/${ioc.value}` }],
      });
    } else if (ioc.type === 'mitre') {
      objects.push({
        type: 'attack-pattern', id: newId('attack-pattern'), ...common, name: ioc.value,
        external_references: [{ source_name: 'mitre-attack', external_id: ioc.value, url: `https://attack.mitre.org/techniques/${ioc.value.replace('.', '/')}` }],
      });
    } else {
      const pattern = ioc.type === 'ipv4'
        ? `[ipv4-addr:value = '${ioc.value}']`
        : `[file:hashes.${HASH_ALGORITHM[ioc.type]} = '${ioc.value}']`;
      objects.push({
        type: 'indicator', id: newId('indicator'), ...common, name: ioc.value,
        pattern, pattern_type: 'stix', valid_from: now, indicator_types: ['malicious-activity'],
      });
    }
  }

  objects.push({
    type: 'report', id: newId('report'), ...common, name: article.title,
    published: new Date(article.publishedAt).toISOString(),
    report_types: ['threat-report'],
    object_refs: objects.map(o => o.id),
    external_references: article.url ? [{ source_name: article.sourceName, url: article.url }] : [],
  });

  return JSON.stringify({ type: 'bundle', id: newId('bundle'), objects }, null, 2);
}

/** Triggers a browser download of text content. */
export function downloadText(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
