import { describe, expect, it } from 'vitest';

describe('lifeos shell', () => {
  it('keeps the test runner wired', () => {
    expect('ATLAS'.toLowerCase()).toBe('atlas');
  });
});
