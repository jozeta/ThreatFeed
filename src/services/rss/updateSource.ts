/** Human-readable description of how a feed was last fetched, from FeedHealth.gatewayUsed. */
export interface UpdateSource {
  label: string;
  detail: string;
  kind: 'snapshot' | 'proxy' | 'direct' | 'unknown';
}

export function describeUpdateSource(gatewayUsed?: string): UpdateSource {
  switch (gatewayUsed) {
    case 'snapshot':
      return { label: 'GitHub Action', detail: 'Fetched server-side by the scheduled GitHub Action and published in the site snapshot', kind: 'snapshot' };
    case 'corsfix':
      return { label: 'CORSFix proxy', detail: 'Fetched live in your browser through the CORSFix public proxy', kind: 'proxy' };
    case 'rss2json':
      return { label: 'RSS2JSON', detail: 'Fetched live in your browser through the RSS2JSON conversion API', kind: 'proxy' };
    case 'allorigins':
    case 'allorigins-raw':
    case 'allorigins-json':
      return { label: 'AllOrigins proxy', detail: 'Fetched live in your browser through the AllOrigins public proxy', kind: 'proxy' };
    case 'custom':
      return { label: 'Custom proxy', detail: 'Fetched live in your browser through your custom proxy', kind: 'proxy' };
    case 'direct':
      return { label: 'Direct fetch', detail: 'Fetched live in your browser directly from the site (it allows cross-origin requests)', kind: 'direct' };
    default:
      return { label: gatewayUsed || 'Unknown', detail: 'Fetch method not recorded', kind: 'unknown' };
  }
}
