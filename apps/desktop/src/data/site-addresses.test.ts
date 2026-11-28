import { describe, expect, it } from 'vite-plus/test';
import { displayAddress } from './site-addresses';

describe('displayAddress', () => {
  it('renders the host and path without a protocol or trailing slash', () => {
    expect(displayAddress('https://example.com/')).toBe('example.com');
    expect(displayAddress('https://example.com/site/')).toBe('example.com/site');
  });

  it('keeps non-URL input readable', () => {
    expect(displayAddress('not a url')).toBe('not a url');
  });
});
