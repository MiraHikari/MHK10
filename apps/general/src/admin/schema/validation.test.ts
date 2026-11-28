import { describe, expect, it } from 'vite-plus/test';
import {
  BLOG_FRONTMATTER_SCHEMA,
  PROFILE_SECTION_SCHEMAS,
  validateSchemaValue,
} from '@/admin/schema';

describe('validateSchemaValue', () => {
  it('rejects missing required fields and invalid dates', () => {
    const errors = validateSchemaValue(BLOG_FRONTMATTER_SCHEMA, {
      title: '',
      description: 'summary',
      publishDate: '2026/08/03',
    });

    expect(errors).toContain('title 不能为空');
    expect(errors).toContain('publishDate 必须是 YYYY-MM-DD');
  });

  it('validates nested object lists and numeric bounds', () => {
    const schema = PROFILE_SECTION_SCHEMAS.skills.schema;
    const errors = validateSchemaValue(schema, {
      skills: [{ name: 'TypeScript', level: 101, category: 'UNKNOWN' }],
    });

    expect(errors).toContain('skills[0].level 不能大于 100');
    expect(errors).toContain('skills[0].category 不是有效选项');
    expect(validateSchemaValue(schema, { skills: [null] })).toContain('skills 必须是对象数组');
  });

  it('accepts valid nested profile data', () => {
    const schema = PROFILE_SECTION_SCHEMAS.skills.schema;
    expect(
      validateSchemaValue(schema, {
        skills: [{ name: 'TypeScript', level: 90, category: 'CORE' }],
      }),
    ).toEqual([]);
  });
});
