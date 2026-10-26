import { detectColumns, normalizeHeader } from './import.js';

export const MAX_FIELDS = 150;
export const DEFAULT_FIELDS = [
  { id: 'product', column: '', name: 'PRODUTO', type: 'product' },
  { id: 'price', column: '', name: 'PREÇO', type: 'price' },
];

export function createDefaultFields(columns = []) {
  const detected = detectColumns(columns);
  return DEFAULT_FIELDS.map((field) => ({ ...field, column: detected[field.id] }));
}

export const maxProductsPerPage = (fields) => fields.length ? Math.floor(MAX_FIELDS / fields.length) : 0;
export const suggestFieldName = (label) => String(label).trim().toLocaleUpperCase('pt-BR');

export function makeHeaders(fields, perPage) {
  return Array.from({ length: perPage }, (_, index) => fields.map((field) => `${field.name.trim()}${index + 1}`)).flat();
}

export function validateFields(fields, { columns, perPage } = {}) {
  const issues = [];
  const add = (fieldId, message) => issues.push({ fieldId, message });
  if (!Array.isArray(fields) || !fields.length || fields.length > MAX_FIELDS) {
    return [{ message: 'Selecione de 1 a 150 campos por produto.' }];
  }
  if (fields.filter((field) => field.type === 'product').length !== 1) add(undefined, 'Mantenha um campo para identificar o nome do produto.');
  const ids = new Set();
  const names = new Set();
  const sources = new Set();
  for (const field of fields) {
    if (!field.id || ids.has(field.id)) add(field.id, 'Os campos precisam ter identificadores diferentes.');
    ids.add(field.id);
    if (!['product', 'text', 'price'].includes(field.type)) add(field.id, 'Escolha o formato Texto ou Preço.');
    const name = typeof field.name === 'string' ? field.name.trim() : '';
    if (!name || /[\u0000-\u001f\u007f]/.test(field.name) || /^[=+@-]/.test(name)) {
      add(field.id, 'Informe um nome de saída válido, sem controles ou início de fórmula.');
    } else if (names.has(normalizeHeader(name))) {
      add(field.id, 'Use nomes de saída diferentes para cada campo.');
    }
    names.add(normalizeHeader(name));
    if (columns) {
      if (field.column === '' || !columns.some((column) => String(column.index) === String(field.column))) {
        add(field.id, 'Selecione uma coluna da planilha.');
      } else if (sources.has(String(field.column))) {
        add(field.id, 'Esta coluna já está sendo usada em outro campo.');
      }
      if (field.column !== '') sources.add(String(field.column));
      if (field.fallback) {
        if (field.type === 'product') add(field.id, 'O nome do produto usa uma única coluna.');
        else if (String(field.fallback) === String(field.column)) add(field.id, 'Escolha uma segunda coluna diferente da primeira.');
        else if (!columns.some((column) => String(column.index) === String(field.fallback))) add(field.id, 'Selecione uma segunda coluna da planilha.');
        else if (sources.has(String(field.fallback))) add(field.id, 'Esta coluna já está sendo usada em outro campo.');
        else sources.add(String(field.fallback));
      }
    } else if (field.fallback) {
      if (String(field.fallback) === String(field.column)) add(field.id, 'Escolha uma segunda coluna diferente da primeira.');
      else if (sources.has(String(field.fallback))) add(field.id, 'Esta coluna já está sendo usada em outro campo.');
      if (field.fallback !== '') sources.add(String(field.fallback));
    }
  }
  if (!issues.length && Number.isInteger(perPage) && perPage >= 1 && perPage <= maxProductsPerPage(fields)) {
    const headers = makeHeaders(fields, perPage).map(normalizeHeader);
    if (new Set(headers).size !== headers.length) add(undefined, 'Os nomes com a numeração geram colunas repetidas. Ajuste os nomes de saída.');
  }
  return issues;
}
