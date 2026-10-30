import { EntityKind, EntityMatcher, EntityRef, findEntities } from '../services/intelligence/entityLinks';

/**
 * Entity links in HTML the app didn't write (the reader's sanitized article). Only text nodes are touched: each
 * name becomes a span made with createElement and textContent, so nothing from the article is parsed as markup.
 * Clicks and Enter are caught once on the container (entityFromEvent).
 */

// Text that already is a link or code, or is inside a control, stays as it is
const SKIP = 'a, code, pre, button, kbd, samp, script, style, textarea, [data-entity-kind]';
const KINDS = new Set<EntityKind>(['vendor', 'group', 'actor', 'malware', 'cve']);

export const ENTITY_LINK_CLASS = 'entity-link';

function entitySpan(text: string, entity: EntityRef): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = ENTITY_LINK_CLASS;
  span.setAttribute('role', 'link');
  span.tabIndex = 0;
  span.dataset.entityKind = entity.kind;
  span.dataset.entityId = entity.id;
  span.textContent = text;
  return span;
}

/** Wraps the names in the container's text in link spans; returns how many. Running it again links only new ones */
export function linkifyHtmlTextNodes(container: HTMLElement, matcher: EntityMatcher): number {
  const context = container.textContent ?? '';
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest(SKIP) && container.contains(node.parentElement.closest(SKIP)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  let count = 0;
  for (const node of nodes) {
    const text = node.data;
    const matches = findEntities(text, matcher, context);
    if (!matches.length) continue;
    const fragment = document.createDocumentFragment();
    let at = 0;
    for (const m of matches) {
      if (m.start > at) fragment.appendChild(document.createTextNode(text.slice(at, m.start)));
      fragment.appendChild(entitySpan(text.slice(m.start, m.end), m.entity));
      at = m.end;
    }
    if (at < text.length) fragment.appendChild(document.createTextNode(text.slice(at)));
    node.replaceWith(fragment);
    count += matches.length;
  }
  return count;
}

/** The entity a click, or Enter on a focused link, lands on; null for anything else */
export function entityFromEvent(e: Event): EntityRef | null {
  if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Enter') return null;
  const el = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-entity-kind]') : null;
  const kind = el?.dataset.entityKind as EntityKind | undefined;
  const id = el?.dataset.entityId;
  return kind && KINDS.has(kind) && id ? { kind, id } : null;
}
