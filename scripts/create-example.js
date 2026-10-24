import { mkdir, writeFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { exampleProducts } from '../fixtures/products.js';

const rows = [['Categoria', 'Produto', 'Oferta'], ...exampleProducts.map(([name, price]) => ['Mercearia', name, price])];
await mkdir('public', { recursive: true });
await writeFile('public/exemplo_80_produtos.csv', '\uFEFF' + Papa.unparse(rows, { delimiter: ';', newline: '\r\n' }), 'utf8');
const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet('Por Categoria');
sheet.addRows(rows);
sheet.columns = [{ width: 18 }, { width: 58 }, { width: 18 }];
await workbook.xlsx.writeFile('public/exemplo_80_produtos.xlsx');
console.log('Exemplos CSV e XLSX gerados com 80 produtos representativos.');
