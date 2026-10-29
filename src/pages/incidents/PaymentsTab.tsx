import React, { useMemo, useState } from 'react';
import { PaymentFamily } from '../../types';
import { StackedBars } from '../vulns/StackedBars';
import { StatCards } from '../vulns/shared';
import { BarList, formatCount, SectionTitle } from './shared';
import { ExternalLink } from 'lucide-react';

/** Ransom payments traced to known ransomware wallets (Ransomwhere), per family and year */
export const PaymentsTab: React.FC<{ families: PaymentFamily[]; updatedAt: string }> = ({ families, updatedAt }) => {
  const [family, setFamily] = useState('');
  const selected = families.find((f) => f.family === family);
  const shown = selected ? [selected] : families;

  const years = useMemo(() => {
    const totals = new Map<string, number>();
    for (const f of shown) for (const [y, usd] of Object.entries(f.byYear)) totals.set(y, (totals.get(y) || 0) + usd);
    return [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [shown]);

  const total = shown.reduce((sum, f) => sum + f.totalUsd, 0);
  const transactions = shown.reduce((sum, f) => sum + f.transactions, 0);
  const latestYear = years[years.length - 1];

  return (
    <div className="space-y-6">
      <StatCards stats={[
        { label: 'Traced payments', value: `$${formatCount(total)}`, note: selected ? selected.family : `${families.length} families` },
        { label: 'Transactions', value: transactions.toLocaleString('en-US') },
        { label: 'Average payment', value: transactions ? `$${formatCount(Math.round(total / transactions))}` : '—' },
        { label: latestYear ? `In ${latestYear[0]}` : 'Latest year', value: latestYear ? `$${formatCount(latestYear[1])}` : '—', note: 'so far' },
      ]} />

      <div className="p-4 rounded-lg bg-theme-surface border border-theme-border">
        <SectionTitle>Payments per year{selected ? `: ${selected.family}` : ''} (USD at the time of payment)</SectionTitle>
        <StackedBars
          ariaLabel="Ransom payments per year"
          unit="paid"
          format={(n) => `$${formatCount(n)}`}
          buckets={years.map(([y, usd]) => ({ label: y, short: y, segments: [{ name: 'paid', value: Math.round(usd), className: 'fill-rose-500' }] }))}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <SectionTitle>Families by total paid</SectionTitle>
          <BarList rows={families.slice(0, 20).map((f) => ({
            key: f.family, label: f.family, value: f.totalUsd, active: family === f.family, onClick: () => setFamily(family === f.family ? '' : f.family),
          }))} format={(n) => `$${formatCount(n)}`} />
          <p className="mt-2 text-[10px] font-mono text-theme-text-muted">Click a family for its yearly breakdown.</p>
        </div>
        <div className="space-y-3 text-xs font-serif text-theme-text-muted leading-relaxed">
          <SectionTitle>About this data</SectionTitle>
          <p>
            <a href="https://ransomwhe.re" target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-1">Ransomwhere <ExternalLink className="w-3 h-3" /></a> is
            an open, crowd-sourced list of Bitcoin addresses that victims and researchers have tied to ransomware families, with the payments made to them.
          </p>
          <p>
            It only sees payments to reported addresses, so treat every number as a floor: real totals are far higher, recent years are under-reported
            (addresses get reported late), and many current groups barely appear. Use it for relative trends, not totals.
          </p>
          <p>Refreshed daily (last update {updatedAt.slice(0, 10)}).</p>
        </div>
      </div>
    </div>
  );
};
