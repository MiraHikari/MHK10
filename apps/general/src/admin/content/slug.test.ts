import { describe, expect, it } from 'vite-plus/test';
import { SLUG_RE, slugify, validateSlug } from '@/admin/content/slug';

describe('SLUG_RE', () => {
  it('匹配小写字母、数字与连字符组合', () => {
    expect(SLUG_RE.test('hello-world')).toBe(true);
    expect(SLUG_RE.test('astro19-ssg')).toBe(true);
    expect(SLUG_RE.test('single')).toBe(true);
  });

  it('拒绝大写、空格、下划线与首尾连字符', () => {
    expect(SLUG_RE.test('HelloWorld')).toBe(false);
    expect(SLUG_RE.test('hello world')).toBe(false);
    expect(SLUG_RE.test('hello_world')).toBe(false);
    expect(SLUG_RE.test('-hello')).toBe(false);
    expect(SLUG_RE.test('hello-')).toBe(false);
    expect(SLUG_RE.test('hello--world')).toBe(false);
    expect(SLUG_RE.test('')).toBe(false);
  });
});

describe('validateSlug', () => {
  it('对合法 slug 返回 null', () => {
    expect(validateSlug('hello-world')).toBeNull();
    expect(validateSlug('a1')).toBeNull();
  });

  it('对空 slug 返回中文错误', () => {
    expect(validateSlug('')).toBe('slug 不能为空');
  });

  it('对非法 slug 返回中文错误', () => {
    expect(validateSlug('HelloWorld')).toBe(
      'slug 只能包含小写字母、数字和连字符，且不能以连字符开头或结尾',
    );
  });
});

describe('slugify', () => {
  it('小写化并折叠非 [a-z0-9] 为连字符', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
  });

  it('合并连续连字符并去除首尾连字符', () => {
    expect(slugify('---a b__c   d---')).toBe('a-b-c-d');
  });

  it('纯中文字符因无 [a-z0-9] 而折叠为空字符串', () => {
    expect(slugify('你好 世界')).toBe('');
  });

  it('中英混合保留英文字母与数字', () => {
    expect(slugify('第 1 章 hello world')).toBe('1-hello-world');
  });

  it('空结果返回空字符串', () => {
    expect(slugify('!!!')).toBe('');
  });
});
