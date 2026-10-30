import { createContext, useContext } from 'react';
import { buildEntityMatcher, EntityMatcher } from '../services/intelligence/entityLinks';

/**
 * The matcher for the loaded entities.json, built once per file by the feed provider. Outside it (and until
 * the file loads) only CVE ids link.
 */
export const EntityMatcherContext = createContext<EntityMatcher>(buildEntityMatcher(null));

export const useEntityMatcher = () => useContext(EntityMatcherContext);
