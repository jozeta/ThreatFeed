import React, { useEffect, useMemo } from 'react';
import { EntityRef, linkify } from '../services/intelligence/entityLinks';
import { useEntityMatcher } from '../hooks/useEntityMatcher';
import { openPanel, PanelParam } from '../hooks/useHashRoute';
import { canonicalVendor } from '../services/intelligence/vendor';
import { entityFromEvent, ENTITY_LINK_CLASS, linkifyHtmlTextNodes } from './entityDom';

const PARAM: Record<EntityRef['kind'], PanelParam> = { vendor: 'vendor', group: 'group', actor: 'actor', malware: 'malware', cve: 'cve' };

/** Opens the entity's panel on top of any open ones, with a history entry so Back closes it */
export function openEntity(entity: EntityRef) {
  openPanel(PARAM[entity.kind], entity.kind === 'vendor' ? canonicalVendor(entity.id) : entity.id);
}

// Inside a card or row that is itself clickable, the link acts alone
const activate = (entity: EntityRef) => (e: React.MouseEvent | React.KeyboardEvent) => {
  if ('key' in e && e.key !== 'Enter') return;
  e.preventDefault();
  e.stopPropagation();
  openEntity(entity);
};

/**
 * A name that opens its panel. It looks like the text around it (same colour, no underline) until hovered or
 * focused (.entity-link in index.css).
 */
export const EntityLink: React.FC<{ entity: EntityRef; className?: string; children: React.ReactNode }> = ({ entity, className = '', children }) => (
  <span className={`${ENTITY_LINK_CLASS} ${className}`} role="link" tabIndex={0} onClick={activate(entity)} onKeyDown={activate(entity)}>
    {children}
  </span>
);

/**
 * Plain text with every vendor, ransomware group, actor, malware and CVE in it linked. `context` is more text
 * that may hold the threat word a plain name needs (a card's title, for its summary). `self` is the panel's own
 * entity, left plain: a link to the panel it's in would go nowhere.
 */
export const EntityText: React.FC<{ text: string; context?: string; self?: EntityRef }> = ({ text, context, self }) => {
  const matcher = useEntityMatcher();
  const segments = useMemo(() => linkify(text, matcher, context), [text, matcher, context]);
  const isSelf = (e: EntityRef) => Boolean(self && e.kind === self.kind && e.id.toLowerCase() === self.id.toLowerCase());
  return (
    <>
      {segments.map((s, i) => (s.entity && !isSelf(s.entity) ? <EntityLink key={i} entity={s.entity}>{s.text}</EntityLink> : s.text))}
    </>
  );
};

/**
 * Links the names in rendered HTML (the reader's sanitized article) once it is in the DOM, and again when the
 * entity list arrives; `html` is what the container was given, so new content is linked too
 */
export function useLinkedHtml(ref: React.RefObject<HTMLElement>, html: string | undefined) {
  const matcher = useEntityMatcher();
  useEffect(() => {
    if (ref.current) linkifyHtmlTextNodes(ref.current, matcher);
  }, [ref, html, matcher]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const open = (e: Event) => {
      const entity = entityFromEvent(e);
      if (!entity) return;
      e.preventDefault();
      e.stopPropagation();
      openEntity(entity);
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', open);
    return () => {
      el.removeEventListener('click', open);
      el.removeEventListener('keydown', open);
    };
  }, [ref, html]);
}
