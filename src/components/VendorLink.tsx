import React from 'react';
import { setHashParams } from '../hooks/useHashRoute';
import { canonicalVendor } from '../services/intelligence/vendor';

/**
 * Opens the vendor panel (?vendor=…) over the current page, with a history entry so Back closes it.
 * It takes the place of an open CVE panel: Back returns to that CVE.
 */
export const openVendor = (name: string) => setHashParams({ vendor: canonicalVendor(name), cve: '' }, true);

/** A vendor name that opens its panel; it stops the click so a surrounding row keeps its own action */
export const VendorButton: React.FC<{ name: string; className?: string; label?: string; children?: React.ReactNode }> = ({ name, className = '', label, children }) => (
  <button
    onClick={(e) => { e.stopPropagation(); openVendor(name); }}
    title={`${canonicalVendor(name)}: vulnerabilities, news and statistics`}
    aria-label={label}
    className={`hover:text-theme-accent hover:underline text-left ${className}`}
  >
    {children ?? name}
  </button>
);
