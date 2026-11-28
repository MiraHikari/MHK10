import { describe, expect, it } from 'vite-plus/test';
import { directoryContacts } from './friend-directory';

const friend = (name: string, url = `https://${name}.example/`, group = 'close') => ({
  name,
  url,
  description: `原站点介绍：${name}`,
  group,
});

describe('shared telephone directory selection', () => {
  it('keeps the first three authored close entries and does not rewrite names, descriptions or destinations', () => {
    const first = friend('第一位', 'https://www.first.example/path');
    const second = friend('Second');
    const third = friend('Third');
    const contacts = directoryContacts([
      first,
      friend('Other', undefined, 'regular'),
      second,
      third,
      friend('Fourth'),
    ]);
    expect(contacts).toEqual([
      { name: first.name, url: first.url, description: first.description, host: 'first.example' },
      {
        name: second.name,
        url: second.url,
        description: second.description,
        host: 'second.example',
      },
      { name: third.name, url: third.url, description: third.description, host: 'third.example' },
    ]);
  });

  it('does not pad a short directory or emit invalid, non-web, credentialed, or duplicate links', () => {
    expect(
      directoryContacts([
        friend('First', 'https://example.com'),
        friend('Duplicate', 'https://example.com/'),
        friend('Bad', 'not a URL'),
        friend('Phone', 'tel:+1000'),
        friend('Private', 'https://user:password@example.com'),
      ]),
    ).toHaveLength(1);
    expect(directoryContacts([friend('Other', undefined, 'regular')])).toEqual([]);
  });
});
