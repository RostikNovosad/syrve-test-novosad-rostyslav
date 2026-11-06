import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('mock-режим не вимагає apiLogin', () => {
    expect(loadConfig({ DATABASE_URL: 'x', SYRVE_MODE: 'mock' }).SYRVE_MODE).toBe('mock');
  });
  it('real-режим вимагає apiLogin', () => {
    expect(() => loadConfig({ DATABASE_URL: 'x', SYRVE_MODE: 'real' })).toThrow(/SYRVE_API_LOGIN/);
  });
});
