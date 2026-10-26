import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Blob, File } from 'node:buffer';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import App from '../src/App.jsx';
import { exampleProducts } from '../fixtures/products.js';

const csv = '\uFEFF' + Papa.unparse([['Categoria', 'Produto', 'Oferta'], ...exampleProducts.map(([name, price]) => ['Mercearia', name, price])], { delimiter: ';' });
let downloaded;
let downloadNames;

beforeEach(() => {
  downloaded = [];
  downloadNames = [];
  vi.stubGlobal('Blob', Blob);
  vi.stubGlobal('File', File);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob([csv]) })));
  vi.stubGlobal('URL', { createObjectURL: vi.fn((blob) => { downloaded.push(blob); return 'blob:test'; }), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { downloadNames.push(this.download); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function uploadFile(contents, name = 'ofertas.csv') {
  fireEvent.change(screen.getByLabelText('Enviar planilha'), { target: { files: [new File([contents], name)] } });
}
async function uploadExample() {
  uploadFile(csv);
  await screen.findByRole('heading', { name: 'Configure sua arte' });
}
function preview() {
  fireEvent.click(screen.getByRole('button', { name: 'Conferir resultado' }));
  expect(screen.getByRole('heading', { name: 'Confira antes de baixar' })).toBeTruthy();
}
function stageButton(name) { return within(screen.getByRole('navigation', { name: 'Etapas da conversão' })).getByRole('button', { name: new RegExp(name) }); }
function visiblePreview() { return within(screen.getByRole('tabpanel')); }

describe('conversão guiada por etapas', () => {
  it('mostra apenas a ação de entrada e impede etapas sem dados', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Escolher planilha' }).disabled).toBe(false);
    expect(stageButton('Configuração').disabled).toBe(true);
    expect(stageButton('Conferência').disabled).toBe(true);
    expect(screen.queryByLabelText('Produtos por página')).toBeNull();
    expect(screen.queryByRole('button', { name: /Baixar Excel/ })).toBeNull();
  });

  it('importa 80 produtos, confere as duas visualizações e baixa CSV e XLSX idênticos', async () => {
    render(<App />);
    await uploadExample();
    expect(screen.getByLabelText('Coluna com os nomes').value).toBe('1');
    expect(screen.getByLabelText('Coluna com os preços').value).toBe('2');
    expect(screen.getByText('Não serão exportadas: Categoria.')).toBeTruthy();
    expect(screen.getByLabelText('Produtos por página').value).toBe('10');
    expect(screen.getByRole('checkbox').checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Entenda os nomes/ }));
    const mapping = within(screen.getByRole('region', { name: 'Como as colunas de saída serão nomeadas' }));
    expect(mapping.getByText('Produto')).toBeTruthy();
    expect(mapping.getByText('Oferta')).toBeTruthy();
    expect(mapping.getByText('PRODUTO1, PRODUTO2, …, PRODUTO10')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar painel' }));
    preview();
    expect(screen.getByText('Página 1 de 8')).toBeTruthy();
    expect(visiblePreview().getByText(exampleProducts[0][0])).toBeTruthy();
    expect(visiblePreview().getByText('13,99')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Arquivo final' }));
    expect(screen.getAllByRole('columnheader')).toHaveLength(20);
    fireEvent.click(screen.getByRole('button', { name: 'Última página' }));
    expect(screen.getByText('Página 8 de 8')).toBeTruthy();
    expect(screen.getByRole('cell', { name: exampleProducts[79][0] })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Primeira página' }));
    fireEvent.click(screen.getByRole('button', { name: 'Baixar CSV (.csv)' }));
    await screen.findByRole('status');
    expect(downloadNames[0]).toBe('ofertas_canva_10_itens.csv');
    const csvOutput = Papa.parse(await downloaded[0].text()).data;
    expect(csvOutput).toHaveLength(9);
    expect(csvOutput[0]).toHaveLength(20);
    expect(csvOutput[1][1]).toBe('13,99');
    fireEvent.click(screen.getByRole('button', { name: 'Baixar Excel (.xlsx)' }));
    await waitFor(() => expect(downloadNames).toHaveLength(2));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await downloaded[1].arrayBuffer());
    const xlsxOutput = [];
    workbook.worksheets[0].eachRow((row) => xlsxOutput.push(Array.from({ length: 20 }, (_, index) => row.getCell(index + 1).value)));
    expect(xlsxOutput).toEqual(csvOutput);
  });

  it('aplica o atalho de 6 itens, R$, e confere a última página incompleta', async () => {
    render(<App />);
    await uploadExample();
    fireEvent.click(screen.getByRole('button', { name: '6 produtos' }));
    expect(screen.getByLabelText('Produtos por página').value).toBe('6');
    fireEvent.click(screen.getByRole('checkbox'));
    preview();
    expect(screen.getByText('Página 1 de 14')).toBeTruthy();
    expect(visiblePreview().getByText('R$ 13,995')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Última página' }));
    expect(screen.getByText('2 produtos nesta página')).toBeTruthy();
    expect(screen.getAllByText('Posição vazia')).toHaveLength(4);
    fireEvent.click(screen.getByRole('tab', { name: 'Arquivo final' }));
    expect(screen.getAllByRole('columnheader')).toHaveLength(12);
    expect(screen.getAllByLabelText('Campo vazio')).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: 'Baixar CSV (.csv)' }));
    await screen.findByRole('status');
    expect(Papa.parse(await downloaded[0].text()).data[1][9]).toBe('R$ 13,995');
    expect(downloadNames[0]).toBe('ofertas_canva_6_itens.csv');
  });

  it('impede quantidades inválidas e deixa conferir erros sem permitir download', async () => {
    render(<App />);
    await uploadExample();
    fireEvent.change(screen.getByLabelText('Produtos por página'), { target: { value: '76' } });
    expect(screen.getByText('Informe um número inteiro de 1 a 75.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Conferir resultado' }).disabled).toBe(true);
    expect(stageButton('Conferência').disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Produtos por página'), { target: { value: '10' } });
    uploadFile('Produto;Oferta\nArroz;1.234\nCafé;');
    await screen.findByText('Confira a planilha antes de baixar');
    fireEvent.click(screen.getByRole('button', { name: 'Ver 2 avisos' }));
    const drawer = within(screen.getByRole('dialog'));
    expect(drawer.getByText(/pode indicar milhar/)).toBeTruthy();
    expect(drawer.getByText(/Preço ausente/)).toBeTruthy();
    fireEvent.click(drawer.getByRole('button', { name: 'Fechar painel' }));
    preview();
    expect(screen.getByRole('button', { name: 'Baixar Excel (.xlsx)' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Baixar CSV (.csv)' }).disabled).toBe(true);
  });

  it('permite seleção manual e sinaliza produto vazio em um painel de avisos', async () => {
    render(<App />);
    uploadFile('Título;Custo\n;13,99\nArroz;13,995');
    await screen.findAllByText('Selecione uma coluna da planilha.');
    expect(screen.getByRole('button', { name: 'Conferir resultado' }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Coluna com os nomes'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Coluna com os preços'), { target: { value: '1' } });
    expect(screen.getByText('Algumas linhas precisam de atenção')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ver 1 aviso' }));
    expect(within(screen.getByRole('dialog')).getByText(/Produto vazio/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar painel' }));
    preview();
    expect(visiblePreview().getByText('13,995')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Baixar CSV (.csv)' }).disabled).toBe(false);
  });

  it('divide 301 páginas em dois lotes e baixa somente o selecionado', async () => {
    render(<App />);
    uploadFile('Produto;Oferta\n' + Array.from({ length: 301 }, (_, index) => `Produto ${index + 1};0,09`).join('\n'));
    await screen.findByRole('heading', { name: 'Configure sua arte' });
    fireEvent.change(screen.getByLabelText('Produtos por página'), { target: { value: '1' } });
    preview();
    expect(screen.getByText('Página 1 de 301')).toBeTruthy();
    expect(screen.getByText(/Baixe cada um dos 2 lotes/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Última página' }));
    expect(screen.getByLabelText('Lote para baixar').value).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'Primeira página' }));
    expect(screen.getByLabelText('Lote para baixar').value).toBe('0');
    fireEvent.change(screen.getByLabelText('Lote para baixar'), { target: { value: '1' } });
    expect(screen.getByText('Página 301 de 301')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Baixar CSV (.csv)' }));
    await screen.findByRole('status');
    expect(downloadNames[0]).toBe('ofertas_canva_1_itens_lote_2_de_2.csv');
    expect(Papa.parse(await downloaded[0].text()).data).toEqual([['PRODUTO1', 'PREÇO1'], ['Produto 301', '0,09']]);
  });

  it('carrega o exemplo e permite voltar e remover a planilha', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Usar exemplo com 80 produtos/ }));
    await screen.findByRole('heading', { name: 'Configure sua arte' });
    expect(screen.getByText('exemplo_80_produtos.csv')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Trocar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remover planilha' }));
    expect(stageButton('Configuração').disabled).toBe(true);
    expect(stageButton('Conferência').disabled).toBe(true);
    expect(screen.queryByText('exemplo_80_produtos.csv')).toBeNull();
  });

  it('ao enviar formato inválido, limpa os dados anteriores e retorna à etapa de entrada', async () => {
    render(<App />);
    await uploadExample();
    uploadFile('texto', 'dados.pdf');
    await screen.findByText('Formato não suportado. Envie uma planilha .xlsx ou .csv.');
    expect(stageButton('Conferência').disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /Baixar CSV/ })).toBeNull();
  });

  it('troca a aba de Excel e usa somente os produtos da nova aba', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Por Categoria').addRows([['Categoria', 'Produto', 'Oferta'], ['Mercearia', 'Arroz', 13.995]]);
    workbook.addWorksheet('Segunda aba').addRows([['Nome', 'Valor'], ['Café', '0,09']]);
    render(<App />);
    uploadFile(await workbook.xlsx.writeBuffer(), 'encarte.xlsx');
    await screen.findByLabelText('Aba da planilha');
    expect(screen.getByText('Arroz')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Aba da planilha'), { target: { value: '1' } });
    expect(screen.getByText('Café')).toBeTruthy();
    expect(screen.queryByText('Arroz')).toBeNull();
    preview();
    expect(visiblePreview().getByText('Café')).toBeTruthy();
    expect(visiblePreview().getByText('0,09')).toBeTruthy();
  });

  it('abre o drawer com foco, fecha com Escape e devolve o foco ao botão de origem', () => {
    render(<App />);
    const help = screen.getByRole('button', { name: 'Como funciona' });
    help.focus();
    fireEvent.click(help);
    const close = within(screen.getByRole('dialog', { name: 'Como funciona' })).getByRole('button', { name: 'Fechar painel' });
    expect(document.activeElement).toBe(close);
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(close, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(help);
    expect(document.body.style.overflow).toBe('');
  });

  it('permite navegar pelas abas da prévia com teclado e ir direto para uma página', async () => {
    render(<App />);
    await uploadExample();
    preview();
    const tab = screen.getByRole('tab', { name: 'Por produto' });
    tab.focus();
    fireEvent.keyDown(tab, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Arquivo final' }));
    expect(screen.getAllByRole('columnheader')).toHaveLength(20);
    const page = screen.getByLabelText('Ir para a página');
    fireEvent.change(page, { target: { value: '8' } });
    fireEvent.keyDown(page, { key: 'Enter' });
    expect(screen.getByText('Página 8 de 8')).toBeTruthy();
    expect(screen.getByRole('cell', { name: exampleProducts[79][0] })).toBeTruthy();
    fireEvent.change(page, { target: { value: '999' } });
    fireEvent.blur(page);
    expect(screen.getByText('Página 8 de 8')).toBeTruthy();
  });

  it('mantém as configurações ao voltar entre as etapas', async () => {
    render(<App />);
    await uploadExample();
    fireEvent.click(screen.getByRole('button', { name: '12 produtos' }));
    fireEvent.click(screen.getByRole('checkbox'));
    preview();
    expect(screen.getByText('Página 1 de 7')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar configuração' }));
    expect(screen.getByLabelText('Produtos por página').value).toBe('12');
    expect(screen.getByRole('checkbox').checked).toBe(true);
    fireEvent.click(stageButton('Planilha'));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByLabelText('Produtos por página').value).toBe('12');
    preview();
    expect(visiblePreview().getByText('R$ 13,995')).toBeTruthy();
  });

  it('aceita arrastar uma planilha e recusa múltiplos arquivos de uma vez', async () => {
    render(<App />);
    const dropzone = screen.getByText('Arraste seu arquivo para cá').closest('.dropzone');
    fireEvent.drop(dropzone, { dataTransfer: { files: [new File([csv], 'ofertas.csv'), new File([csv], 'outra.csv')] } });
    expect(screen.getByText('Envie uma planilha por vez.')).toBeTruthy();
    fireEvent.drop(dropzone, { dataTransfer: { files: [new File([csv], 'ofertas.csv')] } });
    await screen.findByRole('heading', { name: 'Configure sua arte' });
    preview();
    expect(screen.getByText('Página 1 de 8')).toBeTruthy();
  });

  it('impede avançar com uma aba vazia e permite escolher outra aba válida', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Produtos').addRows([['Produto', 'Oferta'], ['Arroz', '0,09']]);
    workbook.addWorksheet('Vazia');
    render(<App />);
    uploadFile(await workbook.xlsx.writeBuffer(), 'planilha.xlsx');
    await screen.findByLabelText('Aba da planilha');
    fireEvent.change(screen.getByLabelText('Aba da planilha'), { target: { value: '1' } });
    expect(screen.getByText(/A aba está vazia/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Conferir resultado' }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Aba da planilha'), { target: { value: '0' } });
    preview();
    expect(visiblePreview().getByText('Arroz')).toBeTruthy();
  });

  it('inclui Categoria, personaliza o nome, reordena e exporta os mesmos dados em CSV e Excel', async () => {
    render(<App />);
    await uploadExample();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar campo' }));
    expect(screen.getByLabelText('Nome de saída (3)').value).toBe('CATEGORIA');
    expect(screen.getByLabelText('Coluna do campo 3').value).toBe('0');
    expect(screen.getByText(/10 produtos × 3 campos = 30 colunas/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Adicionar campo' }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Nome de saída (3)'), { target: { value: 'GRUPO' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mover GRUPO para cima' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mover GRUPO para cima' }));
    expect(screen.getByLabelText('Nome de saída (1)').value).toBe('GRUPO');
    preview();
    expect(visiblePreview().getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Posição', 'GRUPO', 'PRODUTO', 'PREÇO']);
    expect(visiblePreview().getAllByText('Mercearia')).toHaveLength(10);
    fireEvent.click(screen.getByRole('tab', { name: 'Arquivo final' }));
    expect(screen.getAllByRole('columnheader')).toHaveLength(30);
    fireEvent.click(screen.getByRole('button', { name: 'Baixar CSV (.csv)' }));
    await screen.findByRole('status');
    const csvData = Papa.parse(await downloaded[0].text()).data;
    expect(csvData[0].slice(0, 6)).toEqual(['GRUPO1', 'PRODUTO1', 'PREÇO1', 'GRUPO2', 'PRODUTO2', 'PREÇO2']);
    expect(csvData[1].slice(0, 3)).toEqual(['Mercearia', exampleProducts[0][0], '13,99']);
    expect(csvData).toHaveLength(9);
    fireEvent.click(screen.getByRole('button', { name: 'Baixar Excel (.xlsx)' }));
    await waitFor(() => expect(downloadNames).toHaveLength(2));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await downloaded[1].arrayBuffer());
    const excelData = [];
    workbook.worksheets[0].eachRow((row) => excelData.push(Array.from({ length: 30 }, (_, index) => row.getCell(index + 1).value)));
    expect(excelData).toEqual(csvData);
  });

  it('recalcula o limite ao incluir campos e oferece ajuste sem alterar silenciosamente a quantidade', async () => {
    render(<App />);
    await uploadExample();
    fireEvent.change(screen.getByLabelText('Produtos por página'), { target: { value: '75' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar campo' }));
    expect(screen.getByLabelText('Produtos por página').value).toBe('75');
    expect(screen.getByLabelText('Produtos por página').max).toBe('50');
    expect(screen.getByText(/75 produtos × 3 campos ultrapassam/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Conferir resultado' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar para 50 produtos' }));
    expect(screen.getByLabelText('Produtos por página').value).toBe('50');
    preview();
    fireEvent.click(screen.getByRole('tab', { name: 'Arquivo final' }));
    expect(screen.getAllByRole('columnheader')).toHaveLength(150);
    expect(screen.getByText('Página 1 de 2')).toBeTruthy();
  });

  it('permite remover preço e mantém o campo obrigatório de produto com limite de 150', async () => {
    render(<App />);
    await uploadExample();
    expect(screen.queryByRole('button', { name: 'Remover PRODUTO' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Nome de saída (1)'), { target: { value: 'NOME' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remover PREÇO' }));
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByLabelText('Produtos por página').max).toBe('150');
    fireEvent.change(screen.getByLabelText('Produtos por página'), { target: { value: '150' } });
    preview();
    expect(screen.getByText('Página 1 de 1')).toBeTruthy();
    expect(visiblePreview().getAllByText('Posição vazia')).toHaveLength(70);
    fireEvent.click(screen.getByRole('button', { name: 'Baixar CSV (.csv)' }));
    await screen.findByRole('status');
    const exported = Papa.parse(await downloaded[0].text()).data;
    expect(exported[0]).toHaveLength(150);
    expect(exported[0][0]).toBe('NOME1');
    expect(exported[1].filter(Boolean)).toEqual(exampleProducts.map(([name]) => name));
  });

  it('bloqueia nomes de saída repetidos ou perigosos e recupera a conversão após corrigir', async () => {
    render(<App />);
    await uploadExample();
    fireEvent.change(screen.getByLabelText('Nome de saída (2)'), { target: { value: 'produto' } });
    expect(screen.getByText('Use nomes de saída diferentes para cada campo.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Conferir resultado' }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Nome de saída (2)'), { target: { value: '=VALOR' } });
    expect(screen.getByText(/nome de saída válido/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nome de saída (2)'), { target: { value: 'VALOR' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mover VALOR para cima' }));
    preview();
    fireEvent.click(screen.getByRole('tab', { name: 'Arquivo final' }));
    expect(screen.getAllByRole('columnheader').slice(0, 4).map((cell) => cell.textContent)).toEqual(['VALOR1', 'PRODUTO1', 'VALOR2', 'PRODUTO2']);
    expect(screen.getByRole('cell', { name: '13,99' })).toBeTruthy();
  });

  it('formata um segundo campo de preço sem modificar o código de texto', async () => {
    render(<App />);
    uploadFile('Produto;Oferta;Preço normal;Código\nCafé;13,995;20,9990;000123');
    await screen.findByRole('heading', { name: 'Configure sua arte' });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar campo' }));
    expect(screen.getByLabelText('Nome de saída (3)').value).toBe('PREÇO NORMAL');
    fireEvent.change(screen.getByLabelText('Formato (3)'), { target: { value: 'price' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar campo' }));
    fireEvent.click(screen.getByRole('checkbox'));
    preview();
    expect(visiblePreview().getByText('R$ 13,995')).toBeTruthy();
    expect(visiblePreview().getByText('R$ 20,9990')).toBeTruthy();
    expect(visiblePreview().getByText('000123')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Baixar CSV (.csv)' }));
    await screen.findByRole('status');
    expect(Papa.parse(await downloaded[0].text()).data[1].slice(0, 4)).toEqual(['Café', 'R$ 13,995', 'R$ 20,9990', '000123']);
  });

  it('monta o preço para com club e, se estiver vazio ou zero, com loja', async () => {
    render(<App />);
    uploadFile('Descrição;DE;club;LOJA\nArroz;4,49;3,99;0\nFeijão;7,99;;5,69');
    await screen.findByRole('heading', { name: 'Configure sua arte' });
    fireEvent.change(screen.getByLabelText('Coluna com os preços'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Nome de saída (2)'), { target: { value: 'DE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar campo' }));
    fireEvent.change(screen.getByLabelText('Nome de saída (3)'), { target: { value: 'PARA' } });
    fireEvent.change(screen.getByLabelText('Formato (3)'), { target: { value: 'price' } });
    fireEvent.change(screen.getByLabelText('Se estiver vazio, usar (3)'), { target: { value: '3' } });
    expect(screen.getByText('club ou LOJA')).toBeTruthy();
    expect(screen.getByText(/Vazio ou 0 na primeira coluna usa a segunda/)).toBeTruthy();
    expect(screen.getByText(/3,99 · club/)).toBeTruthy();
    preview();
    expect(visiblePreview().getByText('3,99')).toBeTruthy();
    expect(visiblePreview().getByText('5,69')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Baixar CSV (.csv)' }));
    await screen.findByRole('status');
    const rows = Papa.parse(await downloaded[0].text()).data;
    expect(rows[1].slice(0, 6)).toEqual(['Arroz', '4,49', '3,99', 'Feijão', '7,99', '5,69']);
  });

  it('trocar de aba redefine os campos para a origem nova sem exportar colunas antigas', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Produtos').addRows([['Categoria', 'Produto', 'Oferta'], ['Mercearia', 'Arroz', '13,99']]);
    workbook.addWorksheet('Outra lista').addRows([['Nome', 'Valor'], ['Café', '0,09']]);
    render(<App />);
    uploadFile(await workbook.xlsx.writeBuffer(), 'listas.xlsx');
    await screen.findByLabelText('Aba da planilha');
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar campo' }));
    expect(screen.getByLabelText('Nome de saída (3)')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Aba da planilha'), { target: { value: '1' } });
    expect(screen.queryByLabelText('Nome de saída (3)')).toBeNull();
    expect(screen.getByLabelText('Coluna com os nomes').value).toBe('0');
    expect(screen.getByLabelText('Produtos por página').max).toBe('75');
    preview();
    fireEvent.click(screen.getByRole('button', { name: 'Baixar CSV (.csv)' }));
    await screen.findByRole('status');
    const result = Papa.parse(await downloaded[0].text()).data;
    expect(result[0]).toHaveLength(20);
    expect(result[1].slice(0, 2)).toEqual(['Café', '0,09']);
  });
});
