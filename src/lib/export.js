import Papa from 'papaparse';
import { MAX_BATCH_ROWS, MAX_FIELDS, safeText } from './transform.js';
import { normalizePrice } from './prices.js';
import { DEFAULT_FIELDS, makeHeaders, validateFields } from './fields.js';

function validateExport(headers, rows, fields) {
  const issues = validateFields(fields, { perPage: headers.length / fields.length });
  if (issues.length) throw new Error(issues[0].message);
  if (!headers.length || headers.length > MAX_FIELDS || headers.length % fields.length || rows.length > MAX_BATCH_ROWS || !rows.length) {
    throw new Error('Escolha um lote com 1 a 300 páginas e até 150 campos.');
  }
  const expectedHeaders = makeHeaders(fields, headers.length / fields.length);
  headers.forEach((header, index) => {
    const expected = expectedHeaders[index];
    if (header !== expected) throw new Error('Os cabeçalhos do lote são inválidos.');
  });
  for (const row of rows) {
    if (row.length !== headers.length || row.some((value) => typeof value !== 'string')) throw new Error('Os dados do lote são inválidos.');
    for (let offset = 0; offset < row.length; offset += fields.length) {
      const values = row.slice(offset, offset + fields.length);
      const name = values[fields.findIndex((field) => field.type === 'product')];
      if (!name && values.some(Boolean)) throw new Error('Há dados sem produto. Confira a planilha.');
      for (let index = 0; index < fields.length; index++) {
        const value = values[index];
        if (fields[index].type !== 'price') {
          if (safeText(value) !== value) throw new Error('Confira os textos protegidos antes de exportar.');
        } else if (name) {
          const currency = value.startsWith('R$ ');
          const price = normalizePrice(value, { currency });
          if (price.status !== 'valid' || price.value !== value) throw new Error('Corrija os preços ausentes ou inválidos antes de exportar.');
        }
      }
    }
  }
}

export function exportCsv(headers, rows, fields = DEFAULT_FIELDS) {
  validateExport(headers, rows, fields);
  return '\uFEFF' + Papa.unparse([headers, ...rows], { delimiter: ',', newline: '\r\n', quotes: true });
}

export async function exportXlsx(headers, rows, fields = DEFAULT_FIELDS) {
  validateExport(headers, rows, fields);
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Canva');
  sheet.addRow(headers);
  sheet.addRows(rows);
  sheet.columns.forEach((column, index) => {
    column.width = fields[index % fields.length].type === 'price' ? 18 : 42;
    column.numFmt = '@';
  });
  sheet.eachRow((row) => row.eachCell({ includeEmpty: true }, (cell) => { cell.numFmt = '@'; }));
  sheet.getRow(1).font = { bold: true };
  return workbook.xlsx.writeBuffer();
}

export function downloadFile(data, filename, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
