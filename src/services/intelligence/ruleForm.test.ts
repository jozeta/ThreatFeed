import { describe, expect, it } from 'vitest';
import {
  conditionFromForm, containsField, groupFromForm, groupToForm, hasEmptyGroup, newCondition, parseList,
} from './ruleForm';

describe('ruleForm', () => {
  it('parseList trims and drops blanks', () => {
    expect(parseList(' a, b ,, ,c ')).toEqual(['a', 'b', 'c']);
  });

  it('converts each value kind', () => {
    expect(conditionFromForm('vulns', { key: 'x', field: 'vendor', text: 'Fortinet, ' })).toEqual({ field: 'vendor', values: ['Fortinet'] });
    expect(conditionFromForm('vulns', { key: 'x', field: 'cvss', text: '15' })).toEqual({ field: 'cvss', min: 10 });
    expect(conditionFromForm('vulns', { key: 'x', field: 'epss', text: '25' })).toEqual({ field: 'epss', min: 0.25 });
    expect(conditionFromForm('vulns', { key: 'x', field: 'kevAddedWithinDays', text: '3' })).toEqual({ field: 'kevAddedWithinDays', days: 3 });
    expect(conditionFromForm('vulns', { key: 'x', field: 'kev', text: '' })).toEqual({ field: 'kev' });
    expect(conditionFromForm('news', { key: 'x', field: 'severity', text: 'critical' })).toEqual({ field: 'severity', min: 'critical' });
  });

  it('round-trips a nested group', () => {
    const g = {
      op: 'all' as const,
      items: [
        { field: 'vendor' as const, values: ['Fortinet'] },
        { op: 'any' as const, items: [{ field: 'kev' as const }, { field: 'epss' as const, min: 0.5 }] },
      ],
    };
    expect(groupFromForm('vulns', groupToForm(g))).toEqual(g);
  });

  it('detects empty groups at any depth', () => {
    expect(hasEmptyGroup({ items: [] })).toBe(true);
    expect(hasEmptyGroup({ items: [{ field: 'kev' }, { op: 'any', items: [] }] })).toBe(true);
    expect(hasEmptyGroup({ items: [{ field: 'kev' }, { op: 'any', items: [{ field: 'kev' }] }] })).toBe(false);
  });

  it('containsField finds nested conditions with a predicate', () => {
    const g = { items: [{ op: 'any', items: [{ field: 'cvss', min: 5 }] }] };
    expect(containsField(g, 'cvss', c => (c.min as number) < 7)).toBe(true);
    expect(containsField(g, 'cvss', c => (c.min as number) >= 7)).toBe(false);
    expect(containsField(g, 'watched')).toBe(false);
  });

  it('newCondition seeds sensible defaults', () => {
    expect(newCondition('vulns', 'cvss').text).toBe('7');
  });
});
