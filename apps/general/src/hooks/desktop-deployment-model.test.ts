import { describe, expect, it } from 'vite-plus/test';
import { parseDesktopDeployment } from './desktop-deployment-model';

describe('desktop deployment configuration', () => {
  it.each([
    ['https://mhk10.example.com', 'https://mhk10.example.com/'],
    ['  HTTPS://DESK.EXAMPLE:443/  ', 'https://desk.example/'],
    ['https://desk.example/preview/', 'https://desk.example/preview/'],
    ['http://localhost:4322', 'http://localhost:4322/'],
    ['http://127.0.0.1:4322/', 'http://127.0.0.1:4322/'],
    ['http://[::1]:4322/', 'http://[::1]:4322/'],
    ['https://localhost:4322/', 'https://localhost:4322/'],
  ])('normalizes the supported deployment %s', (value, expected) => {
    expect(parseDesktopDeployment(value)).toBe(expected);
  });

  it.each([
    undefined,
    null,
    false,
    42,
    {},
    ['https://desk.example'],
    '',
    '   ',
    'not a URL',
    '//desk.example',
    'javascript:alert(1)',
    'data:text/html,desktop',
    'ftp://desk.example/',
    'http://desk.example/',
    'http://localhost.example/',
    'http://192.168.1.2:4322/',
    'https://username@desk.example/',
    'https://username:secret@desk.example/',
    'https://desk.example/?shell=full',
    'https://desk.example/#article',
    'https://desk.example/?',
    'https://desk.example/#',
  ])('bypasses unsupported or incomplete configuration %j', (value) => {
    expect(parseDesktopDeployment(value)).toBeUndefined();
  });

  it('keeps an encoded path without treating it as a query or fragment', () => {
    expect(parseDesktopDeployment('https://desk.example/preview%3Fcopy%23one/')).toBe(
      'https://desk.example/preview%3Fcopy%23one/',
    );
  });
});
