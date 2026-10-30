import React, { useMemo } from 'react';
import { Article } from '../../types';
import { useSettings } from '../../context/SettingsContext';
import { useVulns } from '../../hooks/useVulns';
import { articlesByCve } from './shared';
import { CvePanel } from './CvePanel';

/** The CVE panel (?cve=…), mounted once by the app over any page; vulns.json only loads once one is opened */
export const CvePanelHost: React.FC<{ cve: string; articles: Article[]; onOpenArticle: (a: Article) => void; onClose: () => void }> = ({ cve, articles, onOpenArticle, onClose }) => {
  const vulns = useVulns();
  const { settings, updateSettings } = useSettings();
  const watched = settings.watchedCves;
  const news = useMemo(() => articlesByCve(articles).get(cve) ?? [], [articles, cve]);
  return (
    <CvePanel
      cve={cve}
      vulns={vulns}
      news={news}
      watched={watched.includes(cve)}
      onToggleWatch={() => updateSettings({ watchedCves: watched.includes(cve) ? watched.filter((c) => c !== cve) : [...watched, cve] })}
      onOpenArticle={onOpenArticle}
      onClose={onClose}
    />
  );
};
