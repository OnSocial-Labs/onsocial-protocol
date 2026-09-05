import { describe, expect, it } from 'vitest';
import {
  buildDiscoverWhere,
  discoverFaceSearchOptions,
  parseDiscoverFaceFilter,
} from './profiles.js';

describe('discover face filters', () => {
  it('parses chip values and ignores unknown faces', () => {
    expect(parseDiscoverFaceFilter('people')).toBe('people');
    expect(parseDiscoverFaceFilter('org')).toBe('orgs');
    expect(parseDiscoverFaceFilter('hiring')).toBe('hiring');
    expect(parseDiscoverFaceFilter('dao')).toBe('daos');
    expect(parseDiscoverFaceFilter('daos')).toBe('daos');
  });

  it('maps hiring to org + open jobs', () => {
    expect(discoverFaceSearchOptions('hiring', 'Healthcare')).toEqual({
      kind: 'org',
      hiring: true,
      industry: 'Healthcare',
    });
    expect(discoverFaceSearchOptions('people', 'Healthcare')).toEqual({
      kind: 'person',
    });
    expect(discoverFaceSearchOptions('people', null, 'writer')).toEqual({
      kind: 'person',
      craft: 'writer',
    });
    expect(discoverFaceSearchOptions('daos', 'Film')).toEqual({
      kind: 'dao',
      industry: 'Film',
    });
    expect(discoverFaceSearchOptions('all')).toEqual({});
  });

  it('builds GraphQL where clauses without a search pattern', () => {
    const hiring = buildDiscoverWhere(
      discoverFaceSearchOptions('hiring', 'Healthcare')
    );
    expect(hiring.filter).toContain('kind: {_eq: "org"}');
    expect(hiring.filter).toContain('openJobsCount: {_gt: 0}');
    expect(hiring.variables.industry).toBe('Healthcare');
    expect(hiring.variableDecl).toContain('$industry');

    const daos = buildDiscoverWhere(
      discoverFaceSearchOptions('daos', 'Film')
    );
    expect(daos.filter).toContain('kind: {_eq: "dao"}');
    expect(daos.filter).not.toContain('openJobsCount');
    expect(daos.variables.industry).toBe('Film');

    const craft = buildDiscoverWhere({
      kind: 'person',
      accountIds: ['alice.near', 'bob.near'],
    });
    expect(craft.filter).toContain('accountId: {_in: $accountIds}');
    expect(craft.variables.accountIds).toEqual(['alice.near', 'bob.near']);

    expect(buildDiscoverWhere({}).filter).toBe('');
  });
});
