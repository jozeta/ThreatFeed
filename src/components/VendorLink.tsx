import React from 'react';
import { openPanel } from '../hooks/useHashRoute';
import { canonicalVendor } from '../services/intelligence/vendor';

/** Opens the vendor panel (?vendor=…) over the current page and any open panels, with a history entry so Back closes it */
export const openVendor = (name: string) => openPanel('vendor', canonicalVendor(name));

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
