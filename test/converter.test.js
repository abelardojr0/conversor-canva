import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { exampleProducts } from '../fixtures/products.js';
import { normalizePrice } from '../src/lib/prices.js';
import { collectMappedProducts, collectProducts, safeText, transformProducts } from '../src/lib/transform.js';
import { createDefaultFields, maxProductsPerPage, validateFields } from '../src/lib/fields.js';
import { detectColumns, importCsv, importFile, importXlsx, prepareSheet, readCell } from '../src/lib/import.js';
import { exportCsv, exportXlsx } from '../src/lib/export.js';

const products = exampleProducts.map(([name, price]) => ({ name, price: normalizePrice(price).value }));

for (const [input, expected] of [
  ['13,99', '13,99'], ['5,50', '5,50'], ['5,5', '5,50'], ['0,09', '0,09'],
  ['13,9', '13,90'], ['13,995', '13,995'], ['1.234,50', '1234,50'],
  [13.99, '13,99'], [13.995, '13,995'], [0, '0,00'], ['0', '0,00'],
  ['10', '10,00'], ['13.99', '13,99'], ['R$ 13,9950', '13,9950'],
  ['1.234.567,8900', '1234567,8900'], ['1,234.50', '1234,50'],
  ['123456789012345678901234,567890', '123456789012345678901234,567890'],
  [1e-7, '0,0000001'], [1e21, '1000000000000000000000,00'],
  [-1e-7, '-0,0000001'], ['-13,995', '-13,995'], ['+5,50', '5,50'],
]) {
  test(`normaliza ${JSON.stringify(input)} sem arredondar`, () => {
    assert.deepEqual(normalizePrice(input), { status: 'valid', value: expected, message: '' });
    assert.equal(normalizePrice(input, { currency: true }).value, `R$ ${expected}`);
  });
}

for (const input of ['1.234', '13.995', '1.234.567', '1,234,567', '12.34,56', '1,23.45']) {
  test(`sinaliza pontuação ambígua: ${input}`, () => {
    assert.equal(normalizePrice(input).status, 'ambiguous');
    assert.equal(normalizePrice(input).value, '');
  });
}

for (const input of ['', '   ', null, undefined]) test(`sinaliza preço ausente: ${input}`, () => assert.equal(normalizePrice(input).status, 'missing'));
for (const input of ['grátis', '1 23', '=1+1', '13,', NaN, Infinity, false, {}]) test(`rejeita preço inválido: ${String(input)}`, () => assert.equal(normalizePrice(input).status, 'invalid'));

test('80 produtos / 10 = 8 páginas, 20 colunas, sem perder ordem nem preços', () => {
  const result = transformProducts(products, 10);
  assert.equal(result.rows.length, 8);
  assert.equal(result.headers.length, 20);
  assert.deepEqual(result.headers.slice(0, 4), ['PRODUTO1', 'PREÇO1', 'PRODUTO2', 'PREÇO2']);
  assert.deepEqual(result.headers.slice(-2), ['PRODUTO10', 'PREÇO10']);
  assert.deepEqual(result.rows.flat(), products.flatMap(({ name, price }) => [name, price]));
});

test('80 produtos / 6 = 14 páginas, 12 colunas; última página com 2 produtos', () => {
  const result = transformProducts(products, 6);
  assert.equal(result.rows.length, 14);
  assert.equal(result.headers.length, 12);
  assert.deepEqual(result.rows.at(-1).slice(0, 4), products.slice(-2).flatMap(({ name, price }) => [name, price]));
  assert.deepEqual(result.rows.at(-1).slice(4), Array(8).fill(''));
});

test('1 produto por página mantém a ordem de todas as 80 linhas', () => {
  const result = transformProducts(products, 1);
  assert.equal(result.rows.length, 80);
  assert.deepEqual(result.rows, products.map(({ name, price }) => [name, price]));
});

test('página incompleta contém somente strings vazias nos campos restantes', () => {
  assert.deepEqual(transformProducts(products.slice(0, 1), 3).rows[0], [products[0].name, '13,99', '', '', '', '']);
  assert.deepEqual(transformProducts([], 10).rows, []);
});

test('limite de 150 campos aceita 75 produtos e rejeita valores fora do intervalo', () => {
  assert.equal(transformProducts(products, 75).headers.length, 150);
  for (const amount of [0, -1, 76, 1.5, NaN, Infinity]) assert.throws(() => transformProducts(products, amount), /1 a 75/);
});

test('limite de 300 páginas divide em lotes mantendo todos os dados e cabeçalhos', () => {
  const many = Array.from({ length: 601 }, (_, index) => ({ name: `Item ${index}`, price: '0,09' }));
  const result = transformProducts(many, 1);
  assert.deepEqual(result.batches.map((batch) => batch.length), [300, 300, 1]);
  assert.deepEqual(result.batches.flat(), result.rows);
  for (const batch of result.batches) assert.equal(Papa.parse(exportCsv(result.headers, batch)).data.length, batch.length + 1);
  assert.equal(transformProducts(many.slice(0, 300), 1).batches.length, 1);
  assert.throws(() => exportCsv(result.headers, result.rows), /300/);
});

test('detecta aliases, acentos, caixa e espaços extras; Oferta tem prioridade', () => {
  for (const product of ['  PrOdUtO  ', 'Nome', 'Descrição', 'Item']) {
    for (const price of [' OFERTA ', 'Preço', 'Valor', 'Preço   de   Oferta']) {
      assert.deepEqual(detectColumns([{ label: 'Categoria' }, { label: product }, { label: price }]), { product: '1', price: '2' });
    }
  }
  assert.deepEqual(detectColumns([{ label: 'Preço' }, { label: 'Produto' }, { label: 'Oferta' }]), { product: '1', price: '2' });
  assert.deepEqual(detectColumns([{ label: 'Título' }, { label: 'Custo' }]), { product: '', price: '' });
});

test('importa CSV com BOM, ponto e vírgula, aspas, acentos e linhas vazias', () => {
  const sheet = importCsv('\uFEFFCategoria; Produto ; Oferta\r\nMercearia;"Café, \"\"especial\"\"";13,995\r\n;;\r\nMercearia;Açúcar;0,09\r\n');
  assert.equal(sheet.rows.length, 2);
  const result = collectProducts(sheet, '1', '2');
  assert.equal(result.products[0].name, 'Café, "especial"');
  assert.deepEqual(result.products.map((product) => product.price), ['13,995', '0,09']);
});

test('importa CSV com vírgula sem dividir preços entre aspas', () => {
  const result = collectProducts(importCsv('Produto,Oferta\r\nArroz,"13,99"'), '0', '1');
  assert.equal(result.products[0].price, '13,99');
});

test('bloqueia CSV com vírgula decimal sem aspas para nunca descartar centavos', () => {
  assert.throws(() => importCsv('Produto,Oferta\r\nArroz,13,99'), /mais campos/);
});

test('detecta cabeçalho depois de título e aceita mapeamento manual', () => {
  const sheet = importCsv('Encarte de inauguração;;\n;;\nCategoria;Produto;Oferta\nMercearia;Arroz;13,99');
  assert.equal(sheet.headerLine, 3);
  const manual = importCsv('Título;Custo\nArroz;13,99');
  assert.equal(collectProducts(manual, '0', '1').products[0].price, '13,99');
});

test('encontra Descrição mesmo sem coluna chamada Oferta e ignora título repetido', () => {
  const title = Array(6).fill('fds 02 a 04/10').join(';');
  const sheet = importCsv(`${title}\n;Descrição;Custo;NOVO;LOJA;% loja\n;Arroz;3,80;3,80;4,49;10%`);
  assert.equal(sheet.headerLine, 2);
  assert.equal(sheet.columns[1].label, 'Descrição');
  assert.equal(sheet.columns[4].label, 'LOJA');
  assert.equal(createDefaultFields(sheet.columns)[0].column, '1');
  assert.equal(createDefaultFields(sheet.columns)[1].column, '');
});

test('ignora cabeçalho repetido e faixa de seção sem bloquear os produtos', () => {
  const sheet = importCsv('Descrição;NOVO;LOJA\nArroz;3,80;0\nDescrição;NOVO;LOJA\nOFERTA LL;OFERTA LL;OFERTA LL\nFeijão;4,50;5,69');
  const fields = [
    { id: 'product', column: '0', name: 'PRODUTO', type: 'product' },
    { id: 'price', column: '1', name: 'PREÇO', type: 'price' },
  ];
  const result = collectMappedProducts(sheet, fields);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.products.map((product) => product.name), ['Arroz', 'Feijão']);
  assert.deepEqual(result.products.map((product) => product.price), ['3,80', '4,50']);
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0].message, /ignorada/);
  assert.equal(result.warnings[0].line, 3);
  assert.equal(result.warnings[1].line, 4);
});

test('preço condicionado usa club e, sem valor ou com zero, usa loja', () => {
  const sheet = importCsv('Descrição;DE;club;LOJA\nArroz;4,49;3,99;0\nFeijão;7,99;;5,69\nCafé;13,49;0;0\nAçúcar;3,49;2,99;4,99');
  const fields = [
    { id: 'product', column: '0', name: 'PRODUTO', type: 'product' },
    { id: 'from', column: '1', name: 'DE', type: 'price' },
    { id: 'to', column: '2', name: 'PARA', type: 'price', fallback: '3' },
  ];
  assert.equal(validateFields(fields, { columns: sheet.columns }).length, 0);
  assert.match(validateFields([fields[0], { ...fields[2], fallback: '2' }], { columns: sheet.columns })[0].message, /segunda coluna diferente/);
  assert.match(validateFields([fields[0], fields[1], { ...fields[2], fallback: '1' }], { columns: sheet.columns })[0].message, /já está sendo usada/);
  const result = collectMappedProducts(sheet, fields);
  assert.deepEqual(result.products.map((product) => product.values), [
    ['Arroz', '4,49', '3,99'],
    ['Feijão', '7,99', '5,69'],
    ['Café', '13,49', ''],
    ['Açúcar', '3,49', '2,99'],
  ]);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /Sem valor em club nem em LOJA/);
  assert.match(result.warnings[0].message, /Foi usado club/);
  assert.equal(collectProducts(importCsv('Produto;Oferta\nArroz;0'), '0', '1').products[0].price, '0,00');
  const asText = collectMappedProducts(sheet, [fields[0], { ...fields[2], type: 'text' }]);
  assert.deepEqual(asText.products.map((product) => product.values[1]), ['3,99', '5,69', '', '2,99']);
  assert.equal(asText.errors.length, 0);
  const excelNumbers = prepareSheet([
    { line: 1, cells: [{ value: 'Descrição' }, { value: 'club' }, { value: 'LOJA' }] },
    { line: 2, cells: [{ value: 'absorvente diana lv16 pg14' }, { value: 0 }, { value: 5.99 }] },
    { line: 3, cells: [{ value: 'ARROZ BRANCO ARA 1KG' }, { value: 3.99 }, { value: 0 }] },
  ], 'SEMANAL');
  const para = { id: 'to', column: '1', name: 'PARA', type: 'text', fallback: '2' };
  const numeric = collectMappedProducts(excelNumbers, [{ id: 'product', column: '0', name: 'PRODUTO', type: 'product' }, para]);
  assert.deepEqual(numeric.products.map((product) => product.values[1]), ['5.99', '3.99']);
  const priced = collectMappedProducts(excelNumbers, [{ id: 'product', column: '0', name: 'PRODUTO', type: 'product' }, { ...para, type: 'price' }]);
  assert.deepEqual(priced.products.map((product) => product.values[1]), ['5,99', '3,99']);
  assert.equal(priced.errors.length, 0);
});

test('rejeita planilha vazia, sem cabeçalho e CSV malformado', () => {
  assert.throws(() => importCsv(''), /vazia/);
  assert.throws(() => importCsv('Arroz;13,99\nFeijão;8,50'), /cabeçalho/);
  assert.throws(() => importCsv('Produto,Oferta\n"sem fechar,13'), /CSV/);
});

test('ignora produto vazio, sinaliza preços ausentes e ambíguos, preserva ordem', () => {
  const sheet = importCsv('Produto;Oferta\n;13,99\nArroz;\nFeijão;1.234\nCafé;0,09');
  const result = collectProducts(sheet, '0', '1');
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].line, 2);
  assert.equal(result.errors.length, 2);
  assert.deepEqual(result.products.map((product) => product.name), ['Arroz', 'Feijão', 'Café']);
  assert.equal(result.products[2].price, '0,09');
  const output = transformProducts(result.products, 10);
  assert.throws(() => exportCsv(output.headers, output.rows), /preços/);
});

test('colunas iguais ou incompletas não produzem conversão silenciosa', () => {
  const sheet = importCsv('Produto;Oferta\nArroz;13,99');
  assert.equal(collectProducts(sheet, '', '1').products.length, 0);
  assert.equal(collectProducts(sheet, '0', '0').errors.length, 1);
});

test('previne fórmulas em nomes e mantém exatamente a mesma representação na prévia e exportações', async () => {
  for (const name of ['=SUM(A1:A2)', '+cmd', '@nome', '-produto', '  =1+1', '\ttexto', '\rtexto']) {
    assert.equal(safeText(name), `'${name}`);
    assert.equal(safeText(safeText(name)), safeText(name));
  }
  const sheet = importCsv('Produto;Oferta\n=1+1;13,995\nProduto normal;-0,09');
  const collected = collectProducts(sheet, '0', '1');
  assert.equal(collected.warnings.length, 1);
  const result = transformProducts(collected.products, 2);
  assert.deepEqual(Papa.parse(exportCsv(result.headers, result.rows)).data.slice(1), result.rows);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await exportXlsx(result.headers, result.rows));
  assert.equal(workbook.worksheets[0].getCell('A2').value, "'=1+1");
  assert.equal(workbook.worksheets[0].getCell('D2').value, '-0,09');
});

test('CSV usa vírgula, BOM, CRLF e escape RFC 4180, sem perder nomes nem centavos', () => {
  const source = [{ name: 'Café, "especial"\n500g', price: '13,99500' }, ...products];
  const output = transformProducts(source, 6);
  const csv = exportCsv(output.headers, output.rows);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.includes('"13,99500"'));
  assert.ok(csv.includes('"Café, ""especial""\n500g"'));
  assert.ok(csv.includes('\r\n'));
  const parsed = Papa.parse(csv, { delimiter: ',' });
  assert.deepEqual(parsed.data, [output.headers, ...output.rows]);
  assert.equal(parsed.errors.length, 0);
});

test('XLSX de 80 produtos tem uma aba Canva, preços string @, nenhuma fórmula ou célula mesclada', async () => {
  const result = transformProducts(products, 10);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await exportXlsx(result.headers, result.rows));
  assert.equal(workbook.worksheets.length, 1);
  const sheet = workbook.getWorksheet('Canva');
  assert.equal(sheet.rowCount, 9);
  assert.equal(sheet.columnCount, 20);
  assert.deepEqual(sheet.model.merges, []);
  for (let row = 2; row <= 9; row++) {
    for (let column = 1; column <= 20; column++) {
      const cell = sheet.getCell(row, column);
      assert.equal(typeof cell.value, 'string');
      assert.equal(cell.value, result.rows[row - 2][column - 1]);
      assert.equal(cell.numFmt, '@');
      assert.equal(cell.type, ExcelJS.ValueType.String);
    }
  }
});

test('XLSX mantém células vazias e todas as colunas na última página incompleta', async () => {
  const result = transformProducts(products, 6);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await exportXlsx(result.headers, result.rows));
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.rowCount, 15);
  assert.equal(sheet.columnCount, 12);
  for (let column = 5; column <= 12; column++) {
    assert.equal(sheet.getCell(15, column).value, '');
    assert.equal(sheet.getCell(15, column).numFmt, '@');
  }
});

test('Excel com múltiplas abas, fórmula com cache, sem cache e valores numéricos', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Vazia');
  const sheet = workbook.addWorksheet('Por Categoria');
  sheet.addRows([['Categoria', 'Produto', 'Oferta'], ['Mercearia', 'Arroz', 13.99], ['Mercearia', 'Café', { formula: '1+1', result: 13.995 }], ['Mercearia', 'Leite', { formula: '1+1' }]]);
  const imported = await importXlsx(await workbook.xlsx.writeBuffer());
  assert.equal(imported.length, 2);
  assert.match(imported[0].error, /vazia/);
  assert.equal(imported[1].name, 'Por Categoria');
  const collected = collectProducts(imported[1], '1', '2');
  assert.deepEqual(collected.products.map((product) => product.price), ['13,99', '13,995', '']);
  assert.match(collected.errors[0].message, /sem valor calculado/);
  assert.equal(imported[1].warnings[0].line, 4);
  await assert.rejects(importXlsx(new Uint8Array([1, 2, 3])), /corrompido/);
});

test('tipos de célula: cache zero, rich text, hyperlink, erros e datas', () => {
  assert.deepEqual(readCell({ formula: '1-1', result: 0 }), { value: 0 });
  assert.deepEqual(readCell({ sharedFormula: 'A1', result: '13,9950' }), { value: '13,9950' });
  assert.deepEqual(readCell({ richText: [{ text: 'Café ' }, { text: 'especial' }] }), { value: 'Café especial' });
  assert.deepEqual(readCell({ text: 'Arroz', hyperlink: 'https://example.com' }), { value: 'Arroz' });
  assert.match(readCell({ error: '#DIV/0!' }).issue, /erro/);
  assert.match(readCell(new Date()).issue, /incompatível/);
});

test('fórmula sem cache na coluna de produto bloqueia exportação e não inventa produto', () => {
  const sheet = prepareSheet([{ line: 1, cells: [{ value: 'Produto' }, { value: 'Oferta' }] }, { line: 2, cells: [readCell({ formula: 'A3' }), { value: 0.09 }] }], 'Teste');
  const result = collectProducts(sheet, '0', '1');
  assert.equal(result.products.length, 0);
  assert.equal(result.errors.length, 1);
});

test('rejeita exportações incompatíveis e entradas de formato incorreto', async () => {
  await assert.rejects(importFile({ name: 'dados.xls' }), /não suportado/);
  assert.throws(() => exportCsv(['PRODUTO1', 'PREÇO1'], []), /300/);
  assert.throws(() => exportCsv(['Nome', 'Preço'], [['Arroz', '13,99']]), /cabeçalhos/);
  assert.throws(() => exportCsv(['PRODUTO1', 'PREÇO1'], [['=1+1', '13,99']]), /protegidos/);
  await assert.rejects(exportXlsx(Array(152).fill('campo'), [['Teste']]), /150/);
});

test('arquivos de exemplo CSV e XLSX atravessam o fluxo completo sem perder produtos ou centavos', async () => {
  const csvSheet = importCsv(await readFile('public/exemplo_80_produtos.csv', 'utf8'));
  const [xlsxSheet] = await importXlsx(await readFile('public/exemplo_80_produtos.xlsx'));
  for (const sheet of [csvSheet, xlsxSheet]) {
    const collected = collectProducts(sheet, '1', '2');
    assert.equal(collected.errors.length, 0);
    assert.equal(collected.products.length, 80);
    for (const perPage of [1, 6, 10, 75]) {
      const result = transformProducts(collected.products, perPage);
      const csv = Papa.parse(exportCsv(result.headers, result.rows)).data;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await exportXlsx(result.headers, result.rows));
      assert.deepEqual(csv, [result.headers, ...result.rows]);
      const readRows = [];
      workbook.worksheets[0].eachRow((row) => readRows.push(Array.from({ length: result.headers.length }, (_, index) => row.getCell(index + 1).value)));
      assert.deepEqual(readRows, csv);
      const allProducts = result.rows.flatMap((row) => row.reduce((acc, value, index) => index % 2 === 0 && value ? [...acc, [value, row[index + 1]]] : acc, []));
      assert.deepEqual(allProducts, products.map(({ name, price }) => [name, price]));
    }
  }
});

test('80 produtos com Categoria geram 8 páginas e 30 colunas; com 6 itens geram 14 páginas e 18 colunas', async () => {
  const sheet = importCsv(await readFile('public/exemplo_80_produtos.csv', 'utf8'));
  const fields = [...createDefaultFields(sheet.columns), { id: 'category', column: '0', name: 'CATEGORIA', type: 'text' }];
  const collected = collectMappedProducts(sheet, fields);
  assert.equal(collected.products.length, 80);
  assert.equal(collected.errors.length, 0);
  const ten = transformProducts(collected.products, 10, fields);
  assert.equal(ten.rows.length, 8);
  assert.equal(ten.headers.length, 30);
  assert.deepEqual(ten.headers.slice(0, 6), ['PRODUTO1', 'PREÇO1', 'CATEGORIA1', 'PRODUTO2', 'PREÇO2', 'CATEGORIA2']);
  assert.deepEqual(ten.rows[0].slice(0, 3), [products[0].name, '13,99', 'Mercearia']);
  const six = transformProducts(collected.products, 6, fields);
  assert.equal(six.rows.length, 14);
  assert.equal(six.headers.length, 18);
  assert.deepEqual(six.rows.at(-1).slice(6), Array(12).fill(''));
  for (const output of [ten, six]) {
    const csvData = Papa.parse(exportCsv(output.headers, output.rows, fields)).data;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await exportXlsx(output.headers, output.rows, fields));
    assert.deepEqual(csvData, [output.headers, ...output.rows]);
    const xlsxData = [];
    workbook.worksheets[0].eachRow((row) => xlsxData.push(Array.from({ length: output.headers.length }, (_, index) => row.getCell(index + 1).value)));
    assert.deepEqual(xlsxData, csvData);
    const recovered = output.rows.flatMap((row) => {
      const items = [];
      for (let index = 0; index < row.length; index += 3) if (row[index]) items.push(row.slice(index, index + 3));
      return items;
    });
    assert.deepEqual(recovered, collected.products.map((product) => product.values));
  }
});

test('renomeia e reordena os campos sem trocar produtos, categorias ou centavos', async () => {
  const sheet = importCsv('Categoria;Produto;Oferta\nMercearia;Café;13,9950\nBebidas;Leite;0,09\n;Arroz;5,5');
  const defaults = createDefaultFields(sheet.columns);
  const fields = [{ id: 'category', column: '0', name: 'Grupo', type: 'text' }, { ...defaults[1], name: 'VALOR' }, { ...defaults[0], name: 'NOME' }];
  const collected = collectMappedProducts(sheet, fields);
  assert.deepEqual(collected.products.map((product) => product.values), [['Mercearia', '13,9950', 'Café'], ['Bebidas', '0,09', 'Leite'], ['', '5,50', 'Arroz']]);
  const output = transformProducts(collected.products, 2, fields);
  assert.deepEqual(output.headers, ['Grupo1', 'VALOR1', 'NOME1', 'Grupo2', 'VALOR2', 'NOME2']);
  assert.deepEqual(output.rows[1], ['', '5,50', 'Arroz', '', '', '']);
  assert.deepEqual(Papa.parse(exportCsv(output.headers, output.rows, fields)).data, [output.headers, ...output.rows]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await exportXlsx(output.headers, output.rows, fields));
  assert.equal(workbook.worksheets[0].getCell('B2').value, '13,9950');
  assert.equal(workbook.worksheets[0].getCell('B2').numFmt, '@');
});

test('remove o campo de preço e permite até 150 produtos por página com apenas um campo', () => {
  const sheet = importCsv('Produto;Oferta\nArroz;inválido\nCafé;');
  const fields = createDefaultFields(sheet.columns).filter((field) => field.type === 'product');
  const collected = collectMappedProducts(sheet, fields);
  assert.equal(collected.errors.length, 0);
  assert.equal(collected.products.length, 2);
  assert.equal(maxProductsPerPage(fields), 150);
  const output = transformProducts(collected.products, 150, fields);
  assert.equal(output.headers.length, 150);
  assert.deepEqual(output.rows[0].slice(0, 3), ['Arroz', 'Café', '']);
  assert.deepEqual(output.rows[0].slice(2), Array(148).fill(''));
  assert.equal(Papa.parse(exportCsv(output.headers, output.rows, fields)).data[1][1], 'Café');
  assert.throws(() => transformProducts(collected.products, 151, fields), /1 a 150/);
});

test('o limite depende da quantidade de campos; nenhuma configuração ultrapassa 150 colunas', () => {
  for (const [count, maximum] of [[1, 150], [2, 75], [3, 50], [4, 37], [7, 21], [150, 1]]) {
    const fields = Array.from({ length: count }, (_, index) => ({ id: `field-${index}`, column: String(index), name: `CAMPO_${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + index % 26)}`, type: index === 0 ? 'product' : 'text' }));
    assert.equal(maxProductsPerPage(fields), maximum);
    assert.ok(transformProducts([], maximum, fields).headers.length <= 150);
    assert.throws(() => transformProducts([], maximum + 1, fields), /150 campos/);
  }
});

test('bloqueia nomes vazios, repetidos, fórmulas, colunas repetidas e colisões da numeração', () => {
  const columns = [{ index: 0, label: 'Produto' }, { index: 1, label: 'Oferta' }];
  const fields = createDefaultFields(columns);
  assert.equal(validateFields(fields, { columns, perPage: 10 }).length, 0);
  for (const name of ['', '   ', '=1+1', '+COMANDO', '@campo', '-campo', 'NOME\n']) {
    assert.ok(validateFields([{ ...fields[0], name }, fields[1]]).length > 0);
  }
  assert.match(validateFields([fields[0], { ...fields[1], name: 'produto' }])[0].message, /nomes de saída diferentes/);
  assert.match(validateFields([fields[0], { ...fields[1], column: '0' }], { columns })[0].message, /já está sendo usada/);
  assert.ok(validateFields([fields[1]]).some((issue) => /nome do produto/.test(issue.message)));
  const collision = [{ ...fields[0], name: 'A' }, { ...fields[1], name: 'A1' }];
  assert.equal(validateFields(collision, { perPage: 1 }).length, 0);
  assert.match(validateFields(collision, { perPage: 11 })[0].message, /numeração/);
  assert.throws(() => transformProducts([], 11, collision), /numeração/);
  assert.match(validateFields([])[0].message, /1 a 150/);
});

test('múltiplos campos monetários preservam casas; campos de texto preservam códigos e recebem proteção', async () => {
  const sheet = importCsv('Produto;Oferta;Preço normal;Código;Marca\nCafé;13,9950;20,999;000123;=1+1\nArroz;0,09;5,5;000004;');
  const fields = [...createDefaultFields(sheet.columns), { id: 'regular', column: '2', name: 'NORMAL', type: 'price' }, { id: 'code', column: '3', name: 'CODIGO', type: 'text' }, { id: 'brand', column: '4', name: 'MARCA', type: 'text' }];
  const collected = collectMappedProducts(sheet, fields, true);
  assert.equal(collected.errors.length, 0);
  assert.equal(collected.warnings.length, 1);
  assert.deepEqual(collected.products[0].values, ['Café', 'R$ 13,9950', 'R$ 20,999', '000123', "'=1+1"]);
  assert.deepEqual(collected.products[1].values, ['Arroz', 'R$ 0,09', 'R$ 5,50', '000004', '']);
  const output = transformProducts(collected.products, 1, fields);
  assert.deepEqual(Papa.parse(exportCsv(output.headers, output.rows, fields)).data.slice(1), output.rows);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await exportXlsx(output.headers, output.rows, fields));
  for (let row = 2; row <= 3; row++) for (let column = 1; column <= 5; column++) {
    assert.equal(workbook.worksheets[0].getCell(row, column).value, output.rows[row - 2][column - 1]);
    assert.equal(workbook.worksheets[0].getCell(row, column).numFmt, '@');
  }
});

test('fórmulas sem cache em campo adicional bloqueiam apenas quando esse campo é selecionado', () => {
  const sheet = prepareSheet([
    { line: 1, cells: ['Produto', 'Oferta', 'Categoria'].map((value) => ({ value })) },
    { line: 2, cells: [{ value: 'Café' }, { value: 13.995 }, readCell({ formula: 'D2' })] },
  ], 'Teste');
  const fields = createDefaultFields(sheet.columns);
  assert.equal(collectMappedProducts(sheet, fields).errors.length, 0);
  fields.push({ id: 'category', column: '2', name: 'CATEGORIA', type: 'text' });
  const result = collectMappedProducts(sheet, fields);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /sem valor calculado/);
  assert.deepEqual(result.products[0].values, ['Café', '13,995', '']);
});

test('campos personalizados mantêm a estrutura entre lotes e validam o esquema na exportação', () => {
  const fields = [{ id: 'category', column: '0', name: 'CATEGORIA', type: 'text' }, { id: 'product', column: '1', name: 'NOME', type: 'product' }, { id: 'price', column: '2', name: 'VALOR', type: 'price' }];
  const many = Array.from({ length: 301 }, (_, index) => ({ values: ['Mercearia', `Produto ${index + 1}`, '13,995'] }));
  const output = transformProducts(many, 1, fields);
  assert.deepEqual(output.batches.map((batch) => batch.length), [300, 1]);
  for (const batch of output.batches) {
    assert.deepEqual(Papa.parse(exportCsv(output.headers, batch, fields)).data[0], ['CATEGORIA1', 'NOME1', 'VALOR1']);
  }
  assert.throws(() => exportCsv(output.headers, output.rows, fields), /300/);
  assert.throws(() => exportCsv(output.headers, output.batches[0]), /cabeçalhos|300/);
  assert.throws(() => exportCsv(output.headers, [['Categoria', '', '13,995']], fields), /sem produto/);
});
