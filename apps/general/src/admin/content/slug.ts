export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * 校验 slug 是否只含小写字母、数字与连字符，且不以连字符开头或结尾。
 * 合法返回 null，否则返回中文错误文案。
 */
export function validateSlug(slug: string): string | null {
  if (slug === '') {
    return 'slug 不能为空';
  }

  if (SLUG_RE.test(slug)) {
    return null;
  }

  return 'slug 只能包含小写字母、数字和连字符，且不能以连字符开头或结尾';
}

/**
 * 将任意字符串转换为合法 slug：小写、非 [a-z0-9] 折叠为连字符、
 * 合并连续连字符、去除首尾连字符。
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
