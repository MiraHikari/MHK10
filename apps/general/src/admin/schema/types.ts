/** 后台表单字段类型与 schema 形状（公共类型）。 */

export type FieldType =
  | 'string'
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'select'
  | 'tags'
  | 'stringList'
  | 'objectList';

export interface FieldSchema {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  help?: string;
  placeholder?: string;
  options?: readonly { value: string; label: string }[];
  min?: number;
  max?: number;
  fields?: readonly FieldSchema[];
  itemLabel?: string;
}
