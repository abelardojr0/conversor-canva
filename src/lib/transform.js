import { normalizePrice } from './prices.js';
import { normalizeHeader } from './import.js';
import { DEFAULT_FIELDS, makeHeaders, maxProductsPerPage, validateFields } from './fields.js';

export { MAX_FIELDS } from './fields.js';
export const MAX_BATCH_ROWS = 300;

// CSV cannot mark cells as text. Prefix formula-like source text for both
// formats, so the preview and both exports always contain identical strings.
export function safeText(text) {
  const value = String(text);
  return /^[\s\u0000-\u001f]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
}

export function collectProducts(sheet, productColumn, priceColumn, currency = false) {
  if (!sheet || sheet.error || productColumn === '' || priceColumn === '') {
    return { products: [], warnings: [], errors: [] };
  }
  if (productColumn === priceColumn) return { products: [], warnings: [], errors: [{ message: 'Escolha colunas diferentes para produto e preço.' }] };
  const fields = DEFAULT_FIELDS.map((field) => ({ ...field, column: field.id === 'product' ? productColumn : priceColumn }));
  const result = collectMappedProducts(sheet, fields, currency);
  return { ...result, products: result.products.map(({ values, ...product }) => product) };
}

const columnLabel = (columns, index) => columns.find((column) => String(column.index) === String(index))?.label || 'coluna';
const isZeroPrice = (value) => /^-?0+,0+$/.test(value);

function isBlankOffer(cell) {
  if (!cell || cell.issue) return true;
  const raw = cell.value;
  if (raw === null || raw === undefined || String(raw).trim() === '') return true;
  if (typeof raw === 'number') return raw === 0;
  const text = String(raw).trim();
  if (/^(?:r\$\s*)?[-–—]$/i.test(text)) return true;
  const price = normalizePrice(text);
  return price.status === 'valid' && isZeroPrice(price.value);
}

function readPrice(cell, currency, treatZeroAsEmpty) {
  if (!cell || cell.issue || String(cell.value ?? '').trim() === '') return { state: 'empty' };
  if (treatZeroAsEmpty && isBlankOffer(cell)) return { state: 'empty' };
  const normalized = normalizePrice(cell.value, { currency });
  if (normalized.status === 'missing') return { state: 'empty' };
  if (normalized.status !== 'valid') return { state: 'invalid', message: normalized.message };
  return { state: 'value', value: normalized.value };
}

function readText(cell, treatZeroAsEmpty = false) {
  if (!cell || cell.issue || !String(cell.value ?? '').trim()) return { state: 'empty' };
  if (treatZeroAsEmpty && isBlankOffer(cell)) return { state: 'empty' };
  const text = String(cell.value);
  const value = safeText(text);
  return { state: 'value', value, protected: value !== text };
}

export function resolveFallback(row, field, columns, currency) {
  const indexes = [field.column, field.fallback];
  const labels = indexes.map((index) => columnLabel(columns, index));
  const reads = indexes.map((index) => field.type === 'price'
    ? readPrice(row.cells[Number(index)], currency, true)
    : readText(row.cells[Number(index)], true));
  if (reads[0].state === 'invalid') return { value: '', error: reads[0].message };
  if (reads[0].state === 'value') {
    const warning = reads[1].state === 'value' ? `${labels[0]} e ${labels[1]} têm valor. Foi usado ${labels[0]}.` : '';
    return { value: reads[0].value, warning, protected: reads[0].protected, source: labels[0] };
  }
  if (reads[1].state === 'value') return { value: reads[1].value, protected: reads[1].protected, source: labels[1] };
  if (reads[1].state === 'invalid') return { value: '', error: reads[1].message };
  const issue = indexes.map((index) => row.cells[Number(index)]?.issue).find(Boolean);
  if (field.type !== 'price' && !issue) return { value: '' };
  return { value: '', error: issue || `Sem valor em ${labels[0]} nem em ${labels[1]}.` };
}

function isStructuralRow(row, columns, productName) {
  const labels = new Set(columns.map((column) => normalizeHeader(column.label)).filter(Boolean));
  const texts = row.cells
    .filter((cell) => cell && !cell.issue && String(cell.value ?? '').trim())
    .map((cell) => normalizeHeader(cell.value));
  if (texts.length >= 2 && texts.every((text) => text === texts[0])) return true;
  const hits = texts.filter((text) => labels.has(text));
  return hits.length >= 2 && labels.has(normalizeHeader(productName));
}

export function collectMappedProducts(sheet, fields, currency = false) {
  if (!sheet || sheet.error || validateFields(fields, { columns: sheet.columns }).length) return { products: [], warnings: [], errors: [] };
  const productField = fields.find((field) => field.type === 'product');
  const products = [];
  const warnings = [];
  const errors = [];
  for (const row of sheet.rows) {
    const productCell = row.cells[Number(productField.column)];
    if (productCell?.issue) {
      errors.push({ line: row.line, message: productCell.issue });
      continue;
    }
    const name = String(productCell?.value ?? '');
    if (!name.trim()) {
      warnings.push({ line: row.line, message: 'Produto vazio. Esta linha foi ignorada.' });
      continue;
    }
    if (isStructuralRow(row, sheet.columns, name)) {
      warnings.push({ line: row.line, message: 'Linha de título ou separador. Esta linha foi ignorada.' });
      continue;
    }
    let validPrice = true;
    const values = fields.map((field) => {
      if (field.fallback) {
        const resolved = resolveFallback(row, field, sheet.columns, currency);
        if (resolved.error) {
          validPrice = false;
          errors.push({ line: row.line, message: `${name} · ${field.name}: ${resolved.error}` });
        } else if (resolved.warning) warnings.push({ line: row.line, message: `${field.name}: ${resolved.warning}` });
        if (resolved.protected) warnings.push({ line: row.line, message: `${field.name}: texto protegido com apóstrofo para evitar interpretação como fórmula. Confira a prévia.` });
        return resolved.value;
      }
      const cell = row.cells[Number(field.column)];
      if (cell?.issue) {
        validPrice = false;
        errors.push({ line: row.line, message: `${name} · ${field.name}: ${cell.issue}` });
        return '';
      }
      if (field.type === 'price') {
        const normalized = normalizePrice(cell?.value, { currency });
        if (normalized.status !== 'valid') {
          validPrice = false;
          errors.push({ line: row.line, message: `${name} · ${field.name}: ${normalized.message}` });
        }
        return normalized.value;
      }
      const text = String(cell?.value ?? '');
      const safe = safeText(text);
      if (safe !== text) warnings.push({ line: row.line, message: `${field.name}: texto protegido com apóstrofo para evitar interpretação como fórmula. Confira a prévia.` });
      return safe;
    });
    products.push({ name: safeText(name), price: values[fields.findIndex((field) => field.type === 'price')] || '', values, validPrice, line: row.line });
  }
  return { products, warnings, errors };
}

export function transformProducts(products, perPage, fields = DEFAULT_FIELDS) {
  const issues = validateFields(fields, { perPage });
  if (issues.length) throw new Error(issues[0].message);
  const maximum = maxProductsPerPage(fields);
  if (!Number.isInteger(perPage) || perPage < 1 || perPage > maximum) {
    throw new Error(`Escolha um número inteiro de 1 a ${maximum} produtos por página (até 150 campos).`);
  }
  const headers = makeHeaders(fields, perPage);
  const rows = [];
  for (let offset = 0; offset < products.length; offset += perPage) {
    const row = Array(headers.length).fill('');
    products.slice(offset, offset + perPage).forEach((product, index) => {
      const values = product.values || fields.map((field) => field.type === 'product' ? product.name : field.id === 'price' ? product.price : '');
      fields.forEach((field, fieldIndex) => { row[index * fields.length + fieldIndex] = values[fieldIndex] ?? ''; });
    });
    rows.push(row);
  }
  const batches = [];
  for (let offset = 0; offset < rows.length; offset += MAX_BATCH_ROWS) batches.push(rows.slice(offset, offset + MAX_BATCH_ROWS));
  return { headers, rows, batches };
}
