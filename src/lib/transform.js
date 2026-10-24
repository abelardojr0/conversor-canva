import { normalizePrice } from './prices.js';
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
    let validPrice = true;
    const values = fields.map((field) => {
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
