import Papa from 'papaparse';
import { normalizePrice } from './prices.js';

export const normalizeHeader = (text) => String(text ?? '').trim().toLocaleLowerCase('pt-BR')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');

const productAliases = ['produto', 'nome', 'descricao', 'item', 'nome do produto'];
const priceAliases = ['oferta', 'preco', 'valor', 'preco de oferta', 'preco oferta'];
const isBlank = (cell) => !cell?.issue && (cell?.value === null || cell?.value === undefined || String(cell.value).trim() === '');

export function detectColumns(columns) {
  const find = (aliases) => {
    for (const alias of aliases) {
      const index = columns.findIndex((column) => normalizeHeader(column.label) === alias);
      if (index >= 0) return String(index);
    }
    return '';
  };
  return { product: find(productAliases), price: find(priceAliases) };
}

export function readCell(value) {
  if (value === null || value === undefined) return { value: '' };
  if (typeof value !== 'object') return { value };
  if ('formula' in value || 'sharedFormula' in value) {
    if (value.result === undefined || value.result === null) {
      return { value: '', issue: 'Fórmula sem valor calculado. Abra e recalcule o arquivo no Excel antes de enviar novamente.' };
    }
    return readCell(value.result);
  }
  if (value.error) return { value: '', issue: 'A célula contém um erro do Excel. Corrija o arquivo de origem.' };
  if (Array.isArray(value.richText)) return { value: value.richText.map((part) => part.text).join('') };
  if (typeof value.text === 'string') return { value: value.text };
  return { value: '', issue: 'Tipo de célula incompatível. Utilize texto ou número.' };
}

export function prepareSheet(rawRows, name) {
  const nonEmpty = rawRows.filter((row) => row.cells.some((cell) => !isBlank(cell)));
  if (!nonEmpty.length) throw new Error('A aba está vazia. Escolha uma aba com cabeçalhos e produtos.');
  // Titles often repeat one phrase across the row. The real header may name the
  // price LOJA, CLUB or NOVO instead of Oferta, so a product name plus distinct labels is enough.
  const known = nonEmpty.find((row) => {
    const detected = detectColumns(row.cells.map((cell) => ({ label: cell.value })));
    if (detected.product !== '' && detected.price !== '') return true;
    if (detected.product === '') return false;
    const labels = row.cells.filter((cell) => !isBlank(cell) && !cell.issue && typeof cell.value === 'string' && normalizePrice(cell.value).status !== 'valid');
    return new Set(labels.map((cell) => normalizeHeader(cell.value))).size >= 2;
  });
  const header = known || nonEmpty[0];
  const populated = header.cells.filter((cell) => !isBlank(cell));
  if (populated.length < 2 || populated.some((cell) => cell.issue || typeof cell.value !== 'string' || normalizePrice(cell.value).status === 'valid')) {
    throw new Error('Não encontramos um cabeçalho válido. Inclua uma linha com os nomes das colunas, como Produto e Oferta.');
  }
  let width = header.cells.length;
  while (width > 0 && isBlank(header.cells[width - 1])) width--;
  const columns = Array.from({ length: width }, (_, index) => ({
    index,
    label: String(header.cells[index]?.value ?? '').trim() || `Coluna ${index + 1} (sem título)`,
  }));
  const rows = nonEmpty.filter((row) => row.line > header.line);
  const warnings = rows.flatMap((row) => row.cells.flatMap((cell, index) => cell.issue
    ? [{ line: row.line, column: index, message: `${columns[index]?.label || `Coluna ${index + 1}`}: ${cell.issue}` }] : []));
  return { name, columns, rows, warnings, headerLine: header.line };
}

export function importCsv(text, name = 'CSV') {
  const parsed = Papa.parse(text.replace(/^\uFEFF/, ''), {
    dynamicTyping: false,
    skipEmptyLines: false,
    delimitersToGuess: [',', ';'],
  });
  if (parsed.errors.some((error) => error.code !== 'UndetectableDelimiter')) {
    throw new Error('Não foi possível ler o CSV. Confira as aspas e os separadores do arquivo.');
  }
  if (![';', ','].includes(parsed.meta.delimiter)) {
    throw new Error('Use um CSV separado por vírgula ou ponto e vírgula.');
  }
  const sheet = prepareSheet(parsed.data.map((values, index) => ({
    line: index + 1, cells: values.map((value) => ({ value })),
  })), name);
  if (sheet.rows.some((row) => row.cells.slice(sheet.columns.length).some((cell) => !isBlank(cell)))) {
    throw new Error('O CSV contém linhas com mais campos que o cabeçalho. Coloque preços com vírgula entre aspas, ou use ponto e vírgula como separador.');
  }
  return sheet;
}

export async function importXlsx(buffer) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer); }
  catch { throw new Error('Não foi possível abrir o Excel. O arquivo pode estar corrompido ou protegido. Salve uma cópia em .xlsx e tente novamente.'); }
  if (!workbook.worksheets.length) throw new Error('O arquivo não contém abas.');
  return workbook.worksheets.map((sheet) => {
    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row, line) => {
      const cells = [];
      row.eachCell({ includeEmpty: true }, (cell, column) => { cells[column - 1] = readCell(cell.value); });
      rows.push({ line, cells: Array.from({ length: cells.length }, (_, index) => cells[index] || { value: '' }) });
    });
    try { return prepareSheet(rows, sheet.name); }
    catch (error) { return { name: sheet.name, error: error.message, columns: [], rows: [], warnings: [] }; }
  });
}

export async function importFile(file) {
  if (/\.csv$/i.test(file.name)) return [importCsv(await file.text(), 'CSV')];
  if (/\.xlsx$/i.test(file.name)) return importXlsx(await file.arrayBuffer());
  throw new Error('Formato não suportado. Envie uma planilha .xlsx ou .csv.');
}
