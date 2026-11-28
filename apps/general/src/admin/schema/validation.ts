import type { FieldSchema } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validate form data before it reaches Markdown or profile serialization. */
export function validateSchemaValue(
  schema: readonly FieldSchema[],
  value: Record<string, unknown>,
  path = '',
): string[] {
  const errors: string[] = [];
  for (const field of schema) {
    const fieldPath = path ? `${path}.${field.key}` : field.key;
    const raw = value[field.key];
    const empty =
      raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0);
    if (field.required && empty) {
      errors.push(`${fieldPath} 不能为空`);
      continue;
    }
    if (empty) continue;

    if (
      (field.type === 'string' || field.type === 'text' || field.type === 'date') &&
      typeof raw !== 'string'
    ) {
      errors.push(`${fieldPath} 必须是文本`);
    } else if (field.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(raw as string)) {
      errors.push(`${fieldPath} 必须是 YYYY-MM-DD`);
    } else if (field.type === 'number') {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        errors.push(`${fieldPath} 必须是有效数字`);
      } else {
        if (field.min !== undefined && raw < field.min)
          errors.push(`${fieldPath} 不能小于 ${field.min}`);
        if (field.max !== undefined && raw > field.max)
          errors.push(`${fieldPath} 不能大于 ${field.max}`);
      }
    } else if (field.type === 'boolean' && typeof raw !== 'boolean') {
      errors.push(`${fieldPath} 必须是布尔值`);
    } else if (field.type === 'select') {
      if (typeof raw !== 'string' || !field.options?.some((option) => option.value === raw)) {
        errors.push(`${fieldPath} 不是有效选项`);
      }
    } else if (field.type === 'tags' || field.type === 'stringList') {
      if (!Array.isArray(raw) || raw.some((item) => typeof item !== 'string')) {
        errors.push(`${fieldPath} 必须是字符串数组`);
      }
    } else if (field.type === 'objectList') {
      if (!Array.isArray(raw) || raw.some((item) => !isRecord(item))) {
        errors.push(`${fieldPath} 必须是对象数组`);
      } else if (field.fields) {
        raw.forEach((item, index) => {
          errors.push(...validateSchemaValue(field.fields!, item, `${fieldPath}[${index}]`));
        });
      }
    }
  }
  return errors;
}
