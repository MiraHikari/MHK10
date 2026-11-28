/**
 * 根据 FieldSchema 动态渲染表单。
 * 支持嵌套 objectList、受控更新与空值剔除。
 */

import type { FieldSchema } from '@/admin/schema';
import {
  Button,
  Card,
  DateInput,
  FieldRow,
  NumberInput,
  Select,
  TagInput,
  TextArea,
  TextInput,
  Toggle,
} from '@/admin/ui/primitives';

export interface SchemaFormProps {
  schema: readonly FieldSchema[];
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  /** objectList 嵌套时传入，避免多层 id 冲突。 */
  idPrefix?: string;
}

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function ensureArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function updateValue(
  current: Record<string, unknown>,
  key: string,
  next: unknown,
  required?: boolean,
): Record<string, unknown> {
  const copy = { ...current };
  if (next === '' && !required) {
    delete copy[key];
  } else {
    copy[key] = next;
  }
  return copy;
}

export function SchemaForm({ schema, value, onChange, idPrefix = '' }: SchemaFormProps) {
  const handleFieldChange = (field: FieldSchema, next: unknown) => {
    onChange(updateValue(value, field.key, next, field.required));
  };

  return (
    <div className="space-y-5">
      {schema.map((field) => {
        const raw = value[field.key];
        const fieldId = `${idPrefix}schema-${field.key}`;

        return (
          <FieldRow
            key={field.key}
            label={field.label}
            // objectList 无单一可关联控件（内部是条目编辑器），不传 htmlFor
            // 避免悬空 for；其余字段均有同名 id 控件。
            htmlFor={field.type === 'objectList' ? undefined : fieldId}
            help={field.help}
            required={field.required}
          >
            {field.type === 'text' && (
              <TextArea
                id={fieldId}
                value={typeof raw === 'string' ? raw : ''}
                placeholder={field.placeholder}
                onChange={(v) => handleFieldChange(field, v)}
              />
            )}

            {field.type === 'number' && (
              <NumberInput
                id={fieldId}
                value={typeof raw === 'number' ? raw : undefined}
                placeholder={field.placeholder}
                onChange={(v) => handleFieldChange(field, v)}
              />
            )}

            {field.type === 'boolean' && (
              <Toggle
                id={fieldId}
                checked={Boolean(raw)}
                onChange={(v) => handleFieldChange(field, v)}
              />
            )}

            {field.type === 'date' && (
              <DateInput
                id={fieldId}
                value={typeof raw === 'string' ? raw : ''}
                onChange={(v) => handleFieldChange(field, v)}
              />
            )}

            {field.type === 'select' && field.options && (
              <Select
                id={fieldId}
                value={typeof raw === 'string' ? raw : ''}
                options={field.options}
                placeholder={field.placeholder}
                onChange={(v) => handleFieldChange(field, v)}
              />
            )}

            {(field.type === 'tags' || field.type === 'stringList') && (
              <TagInput
                id={fieldId}
                tags={isStringList(raw) ? raw : []}
                placeholder={field.placeholder || '回车或逗号添加'}
                onChange={(v) => handleFieldChange(field, [...v])}
              />
            )}

            {field.type === 'objectList' && field.fields && (
              <ObjectListEditor
                field={field}
                items={ensureArray(raw)}
                onChange={(next) => handleFieldChange(field, next)}
              />
            )}

            {field.type === 'string' && (
              <TextInput
                id={fieldId}
                value={typeof raw === 'string' ? raw : ''}
                placeholder={field.placeholder}
                onChange={(v) => handleFieldChange(field, v)}
              />
            )}
          </FieldRow>
        );
      })}
    </div>
  );
}

interface ObjectListEditorProps {
  field: FieldSchema;
  items: Record<string, unknown>[];
  onChange: (items: Record<string, unknown>[]) => void;
  /** 嵌套前缀（父字段 key + 条目序号），保证子表单 id 唯一。 */
  idPrefix?: string;
}

function ObjectListEditor({ field, items, onChange, idPrefix = '' }: ObjectListEditorProps) {
  const fields = field.fields ?? [];
  const label = field.itemLabel ?? '项';

  const addItem = () => {
    onChange([...items, {}]);
  };

  const updateItem = (index: number, next: Record<string, unknown>) => {
    const copy = [...items];
    copy[index] = next;
    onChange(copy);
  };

  const removeItem = (index: number) => {
    const copy = items.filter((_, i) => i !== index);
    onChange(copy);
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const copy = [...items];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    onChange(copy);
  };

  return (
    <div className="space-y-3">
      {items.length === 0 && <p className="text-sm text-zinc-500">暂无{label}</p>}
      {items.map((item, index) => (
        <Card key={index} className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-300">
              {label} {index + 1}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                onClick={() => moveItem(index, -1)}
                disabled={index === 0}
                className="px-2 py-1 min-h-8 text-xs"
              >
                ↑
              </Button>
              <Button
                variant="ghost"
                onClick={() => moveItem(index, 1)}
                disabled={index === items.length - 1}
                className="px-2 py-1 min-h-8 text-xs"
              >
                ↓
              </Button>
              <Button
                variant="danger"
                onClick={() => removeItem(index)}
                className="px-2 py-1 min-h-8 text-xs"
              >
                删除
              </Button>
            </div>
          </div>
          <SchemaForm
            schema={fields}
            value={item}
            onChange={(next) => updateItem(index, next)}
            idPrefix={`${idPrefix}${field.key}-${index}-`}
          />
        </Card>
      ))}
      <div className="flex">
        <Button variant="ghost" onClick={addItem}>
          + 添加{label}
        </Button>
      </div>
    </div>
  );
}
