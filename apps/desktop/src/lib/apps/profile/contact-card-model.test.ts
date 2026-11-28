import { describe, expect, it } from 'vite-plus/test';
import { profile } from '../../../data/profile';
import { serializeContactCard, type ContactCardInput } from './contact-card-model';

const contact: ContactCardInput = {
  name: 'MiraHikari',
  email: 'mirahikari@example.com',
  website: 'https://example.com/',
  github: 'https://github.com/MiraHikari',
  location: '江西南昌',
  summary: '开发 Web 产品与开源工具。',
};
const unfold = (value: string): string => value.replace(/\r\n[ \t]/g, '');

describe('serializeContactCard', () => {
  it('accepts the authored public profile without a browser or a second contact record', () => {
    const value = unfold(serializeContactCard(profile));
    expect(value).toContain(`FN:${profile.name}\r\n`);
    expect(value).toContain(`EMAIL;TYPE=INTERNET:${profile.email}\r\n`);
    expect(value).toContain(`URL:${profile.website}\r\n`);
    expect(value).toContain(`URL:${profile.github}\r\n`);
    expect(value).toContain(`ADR:;;;${profile.location};;;\r\n`);
  });

  it('writes the supplied contact facts as an interoperable vCard with CRLF lines', () => {
    const value = serializeContactCard(contact);
    expect(value).toBe(
      [
        'BEGIN:VCARD',
        'VERSION:3.0',
        'N:;MiraHikari;;;',
        'FN:MiraHikari',
        'EMAIL;TYPE=INTERNET:mirahikari@example.com',
        'URL:https://example.com/',
        'URL:https://github.com/MiraHikari',
        'ADR:;;;江西南昌;;;',
        'NOTE:开发 Web 产品与开源工具。',
        'END:VCARD',
        '',
      ].join('\r\n'),
    );
    expect(value.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('escapes text delimiters and newlines without creating extra properties or cards', () => {
    const injected = 'Mira\\Hikari;团队,开发者\r\nTEL:+123\rEND:VCARD\nBEGIN:VCARD';
    const value = unfold(
      serializeContactCard({
        ...contact,
        name: injected,
        email: 'mail@example.com\r\nTEL:+123',
        location: '南昌;江西,中国\\家\n地址',
        summary: 'Literal \\n; comma,\r\nSecond line',
      }),
    );
    const lines = value.split('\r\n');
    expect(lines.filter((line) => line === 'BEGIN:VCARD')).toHaveLength(1);
    expect(lines.filter((line) => line === 'END:VCARD')).toHaveLength(1);
    expect(lines.some((line) => line.startsWith('TEL:'))).toBe(false);
    expect(lines).toContain(
      'FN:Mira\\\\Hikari\\;团队\\,开发者\\nTEL:+123\\nEND:VCARD\\nBEGIN:VCARD',
    );
    expect(lines).toContain('EMAIL;TYPE=INTERNET:mail@example.com\\nTEL:+123');
    expect(lines).toContain('ADR:;;;南昌\\;江西\\,中国\\\\家\\n地址;;;');
    expect(lines).toContain('NOTE:Literal \\\\n\\; comma\\,\\nSecond line');
  });

  it('preserves URI punctuation and existing escapes while encoding unsafe URI characters', () => {
    const value = unfold(
      serializeContactCard({
        ...contact,
        website: 'https://example.com/a;b?items=a,b&title=%E4%B8%AD#part',
        github: 'https://example.com/项目\\name\r\nTEL:+123',
      }),
    );
    expect(value).toContain('URL:https://example.com/a;b?items=a,b&title=%E4%B8%AD#part\r\n');
    expect(value).toContain('URL:https://example.com/%E9%A1%B9%E7%9B%AE%5Cname%0D%0ATEL:+123\r\n');
    expect(value.split('\r\n').some((line) => line.startsWith('TEL:'))).toBe(false);
  });

  it('folds Chinese and emoji at UTF-8 boundaries with at most 75 bytes per physical line', () => {
    const summary = '跨平台工具😀与中文文档。'.repeat(18);
    const value = serializeContactCard({ ...contact, summary });
    const lines = value.split('\r\n');
    expect(lines.some((line) => line.startsWith(' '))).toBe(true);
    for (const line of lines) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
      expect(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(line))).toBe(line);
    }
    expect(unfold(value)).toContain(`NOTE:${summary}\r\n`);
    expect(value).not.toContain('\uFFFD');
  });

  it('counts the continuation marker in the byte limit and preserves escaped text across folds', () => {
    const summary = `${'x'.repeat(70)}中${'y'.repeat(70)}\\;尾,\n${'z'.repeat(100)}`;
    const value = serializeContactCard({ ...contact, summary });
    const lines = value.split('\r\n');
    expect(lines.find((line) => line.startsWith('NOTE:'))).toBe(`NOTE:${'x'.repeat(70)}`);
    expect(unfold(value)).toContain(
      `NOTE:${'x'.repeat(70)}中${'y'.repeat(70)}\\\\\\;尾\\,\\n${'z'.repeat(100)}\r\n`,
    );
    for (const line of lines) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
  });

  it('does not invent missing contact details or mutate its input', () => {
    const input = Object.freeze({
      name: '匿名开发者',
      email: '',
      website: '',
      github: '',
      location: '',
      summary: '',
    });
    expect(serializeContactCard(input)).toBe(
      'BEGIN:VCARD\r\nVERSION:3.0\r\nN:;匿名开发者;;;\r\nFN:匿名开发者\r\nEND:VCARD\r\n',
    );
    expect(input.name).toBe('匿名开发者');
  });
});
