import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, CheckCircle2, CircleHelp, FileSpreadsheet, FileText, FileUp, Info, Layers, LoaderCircle, LockKeyhole, RefreshCw, ShieldCheck, Table2, TriangleAlert, X } from 'lucide-react';
import { collectMappedProducts, transformProducts, MAX_BATCH_ROWS } from './lib/transform.js';
import { importFile } from './lib/import.js';
import { createDefaultFields, maxProductsPerPage, suggestFieldName, validateFields } from './lib/fields.js';
import { downloadFile, exportCsv, exportXlsx } from './lib/export.js';
import { normalizePrice } from './lib/prices.js';
import Drawer from './components/Drawer.jsx';
import ResultPreview from './components/ResultPreview.jsx';
import FieldManager from './components/FieldManager.jsx';

const stages = [{ title: 'Planilha', description: 'Envie seu arquivo' }, { title: 'Configuração', description: 'Defina a quantidade e as colunas' }, { title: 'Conferência', description: 'Revise e baixe' }];

function columnExample(sheet, column, price, currency) {
  if (!sheet || column === '') return '';
  for (const row of sheet.rows) {
    const cell = row.cells[Number(column)];
    if (cell?.issue) return 'Célula com erro. Confira as pendências.';
    if (!String(cell?.value ?? '').trim()) continue;
    const normalized = price ? normalizePrice(cell.value, { currency }) : null;
    return normalized?.status === 'valid' ? normalized.value : String(cell.value);
  }
  return '';
}

function headerSequence(prefix, count) {
  return count <= 3 ? Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`).join(', ') : `${prefix}1, ${prefix}2, …, ${prefix}${count}`;
}

export default function App() {
  const [step, setStep] = useState(0);
  const [sheets, setSheets] = useState([]);
  const [sheetIndex, setSheetIndex] = useState('0');
  const [fileName, setFileName] = useState('');
  const [fields, setFields] = useState(() => createDefaultFields());
  const [perPage, setPerPage] = useState('10');
  const [currency, setCurrency] = useState(false);
  const [page, setPage] = useState(0);
  const [batch, setBatch] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [drawer, setDrawer] = useState(null);
  const fileInput = useRef(null);
  const requestId = useRef(0);
  const fieldCounter = useRef(0);
  const panelTitle = useRef(null);
  const previousStep = useRef(step);
  const closeDrawer = useCallback(() => setDrawer(null), []);
  const sheet = sheets[Number(sheetIndex)];
  const amount = Number(perPage);
  const maximum = maxProductsPerPage(fields);
  const amountValid = perPage.trim() !== '' && Number.isInteger(amount) && amount >= 1 && amount <= maximum;
  const fieldIssues = useMemo(() => validateFields(fields, { columns: sheet?.columns || [], perPage: amount }), [fields, sheet, amount]);
  const mapped = fieldIssues.length === 0;
  const hasPrices = fields.some((field) => field.type === 'price');
  const { products, warnings, errors } = useMemo(() => collectMappedProducts(sheet, fields, currency), [sheet, fields, currency]);
  const output = useMemo(() => amountValid && mapped ? transformProducts(products, amount, fields) : { headers: [], rows: [], batches: [] }, [products, amount, amountValid, fields, mapped]);
  const currentPage = Math.min(page, Math.max(0, output.rows.length - 1));
  const currentBatch = Math.min(batch, Math.max(0, output.batches.length - 1));
  const issues = [...(sheet?.warnings || []), ...warnings, ...errors].filter((item, index, all) => all.findIndex((other) => other.line === item.line && other.message === item.message) === index);
  const ready = products.length > 0 && amountValid && mapped && errors.length === 0 && !loading && !sheet?.error;
  const canPreview = output.rows.length > 0 && mapped && !loading && !sheet?.error;
  const validProducts = products.filter((product) => product.validPrice).length;
  const unusedColumns = sheet?.columns.filter((column) => !fields.some((field) => String(column.index) === String(field.column))) || [];

  useEffect(() => {
    if (previousStep.current !== step) panelTitle.current?.focus();
    previousStep.current = step;
  }, [step]);

  function selectSheet(index, source = sheets) {
    setSheetIndex(index);
    setFields(createDefaultFields(source[Number(index)].columns));
    setPage(0);
    setBatch(0);
    setNotice('');
  }

  async function loadFile(file) {
    if (!file) return;
    const request = ++requestId.current;
    setLoading(true);
    setError('');
    setNotice('');
    setSheets([]);
    setFileName('');
    setStep(0);
    try {
      const imported = await importFile(file);
      if (request !== requestId.current) return;
      setSheets(imported);
      setFileName(file.name);
      selectSheet(String(Math.max(0, imported.findIndex((item) => !item.error))), imported);
      setStep(1);
    } catch (failure) {
      if (request === requestId.current) setError(failure instanceof Error && /^(Formato|Não |Use |A aba|O arquivo|O CSV)/.test(failure.message) ? failure.message : 'Não foi possível ler a planilha. Confira o arquivo e tente novamente.');
    } finally {
      if (request === requestId.current) setLoading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function loadExample() {
    try {
      const response = await fetch('/exemplo_80_produtos.csv');
      if (!response.ok) throw new Error();
      await loadFile(new File([await response.blob()], 'exemplo_80_produtos.csv', { type: 'text/csv' }));
    } catch { setError('Não foi possível abrir o exemplo. Tente novamente.'); }
  }

  async function handleExport(format) {
    if (!ready || exporting) return;
    setExporting(format);
    setError('');
    setNotice('');
    const rows = output.batches[currentBatch];
    const suffix = output.batches.length > 1 ? `_lote_${currentBatch + 1}_de_${output.batches.length}` : '';
    const filename = `ofertas_canva_${amount}_itens${suffix}.${format}`;
    try {
      const data = format === 'xlsx' ? await exportXlsx(output.headers, rows, fields) : exportCsv(output.headers, rows, fields);
      downloadFile(data, filename, format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv;charset=utf-8');
      setNotice(`Download preparado: ${filename}`);
    } catch { setError('Não foi possível gerar o arquivo. Confira os dados e tente baixar novamente.'); }
    finally { setExporting(''); }
  }

  function clearFile() {
    requestId.current++;
    setSheets([]);
    setFileName('');
    setFields(createDefaultFields());
    setError('');
    setNotice('');
    setLoading(false);
    setStep(0);
  }

  function changeAmount(value) { setPerPage(value); setPage(0); setBatch(0); setNotice(''); }
  function changePage(value) { setPage(value); setBatch(Math.floor(value / MAX_BATCH_ROWS)); setNotice(''); }
  function changeFields(value) { setFields(value); setPage(0); setBatch(0); setNotice(''); }
  function addField(column) {
    changeFields([...fields, { id: `extra-${++fieldCounter.current}`, column: String(column.index), name: suggestFieldName(column.label), type: 'text', autoName: true }]);
  }

  return <>
    <a className="skip-link" href="#workspace">Pular para o conteúdo</a>
    <header className="app-header" inert={Boolean(drawer)}><div className="header-content">
      <a className="brand" href="/" aria-label="Conversor para Canva, início"><span className="brand-icon"><Table2 size={22} strokeWidth={1.9} /></span><span>Conversor <span>para Canva</span></span></a>
      <div className="header-actions"><span className="local-label"><span className="status-dot" /> Processamento local</span><span className="header-divider" /><button className="help-button" onClick={() => setDrawer('help')}><CircleHelp size={18} /> Como funciona</button></div>
    </div></header>
    <main className="app-main" id="workspace" inert={Boolean(drawer)}>
      <div className="page-heading"><div><p className="breadcrumb">PLANILHAS PARA O CANVA</p><h1>Nova conversão</h1><p>Prepare sua planilha de ofertas para importar no Canva.</p></div><div className="private-note"><ShieldCheck size={19} /><span>Seus arquivos ficam<br /><strong>no seu dispositivo.</strong></span></div></div>
      <nav className="step-navigation" aria-label="Etapas da conversão">{stages.map((stage, index) => <button key={stage.title} aria-current={step === index ? 'step' : undefined} disabled={!!exporting || loading || (index === 1 && !sheets.length) || (index === 2 && !canPreview)} onClick={() => setStep(index)} className={`step-button ${step === index ? 'current' : ''} ${index < step ? 'completed' : ''}`}><span className="step-index">{index < step ? <Check size={17} /> : `0${index + 1}`}</span><span><strong>{stage.title}</strong><small>{stage.description}</small></span>{index < 2 && <ArrowRight className="step-arrow" size={17} />}</button>)}</nav>
      <input ref={fileInput} className="sr-only" tabIndex={-1} type="file" accept=".xlsx,.csv" aria-label="Enviar planilha" onChange={(event) => loadFile(event.target.files[0])} disabled={loading || !!exporting} />
      {error && <div className="alert alert-error" role="alert"><TriangleAlert size={20} /><span>{error}</span><button className="icon-button" onClick={() => setError('')} aria-label="Fechar mensagem de erro"><X size={18} /></button></div>}

      <div className={`work-layout ${step === 0 ? 'upload-layout' : ''}`}>
        <section className="work-panel" aria-labelledby="panel-title" aria-busy={loading}>
          <div className="panel-heading"><span className="section-kicker">ETAPA {step + 1} DE 3</span><h2 id="panel-title" ref={panelTitle} tabIndex="-1">{step === 0 ? 'Envie sua planilha' : step === 1 ? 'Configure sua arte' : 'Confira antes de baixar'}</h2><p>{step === 0 ? 'Envie o arquivo que contém sua lista de produtos e preços.' : step === 1 ? 'Primeiro, defina quantos produtos cabem em cada página. Depois, escolha os campos que quer exportar.' : 'Os nomes e preços abaixo são os mesmos que estarão no arquivo final.'}</p></div>

          {step === 0 && <>
            <div className={`dropzone ${dragging ? 'dragging' : ''} ${loading ? 'loading' : ''}`} onDragOver={(event) => { event.preventDefault(); if (!loading && !exporting) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); if (!loading && !exporting) { if (event.dataTransfer.files.length > 1) setError('Envie uma planilha por vez.'); else loadFile(event.dataTransfer.files[0]); } }}>
              <span className="dropzone-symbol">{loading ? <LoaderCircle className="spin" size={30} /> : <FileUp size={30} strokeWidth={1.6} />}</span><h3>{loading ? 'Lendo sua planilha…' : 'Arraste seu arquivo para cá'}</h3><p>ou selecione uma planilha no seu dispositivo</p><button className="button button-primary" onClick={() => fileInput.current.click()} disabled={loading}><FileUp size={18} /> Escolher planilha</button><div className="accepted-formats"><span>.XLSX</span><span>.CSV</span><small>Excel ou valores separados por vírgula</small></div>
            </div>
            {fileName && <div className="existing-file"><FileSpreadsheet size={23} /><div><strong>{fileName}</strong><p>{sheet?.rows.length || 0} linhas importadas</p></div><button className="text-button" onClick={() => setStep(1)}>Continuar <ArrowRight size={16} /></button><button className="icon-button" onClick={clearFile} aria-label="Remover planilha"><X size={18} /></button></div>}
            <div className="upload-bottom"><LockKeyhole size={16} /><p>O arquivo é processado aqui, sem envio para servidores.</p></div>
          </>}

          {step === 1 && <>
            <div className="file-strip"><span className="file-symbol"><FileSpreadsheet size={21} /></span><div><strong title={fileName}>{fileName}</strong><span>{sheet?.rows.length || 0} linhas importadas{sheet?.name ? ` · ${sheet.name}` : ''}</span></div><button className="text-button" onClick={() => setStep(0)}><RefreshCw size={14} /> Trocar</button></div>
            <section className="page-settings" aria-labelledby="quantity-title">
              <h3 id="quantity-title">1. Quantos produtos cabem em cada arte?</h3>
              <p className="section-description">Defina a quantidade primeiro. Abaixo, escolha quais campos incluir em cada produto.</p>
              <div className="quantity-controls">
                <div><label htmlFor="per-page">Produtos por página</label><input id="per-page" type="number" min="1" max={maximum} step="1" value={perPage} disabled={!!exporting} aria-invalid={!amountValid} aria-describedby="quantity-help" onChange={(event) => changeAmount(event.target.value)} /></div>
                <div className="quantity-presets" aria-label="Quantidades mais usadas">{[6, 10, 12].map((value) => <button key={value} disabled={value > maximum} aria-pressed={amount === value} onClick={() => changeAmount(String(value))}>{value} produtos</button>)}</div>
              </div>
              <p id="quantity-help" className={amountValid ? 'field-hint' : 'field-error'}>{amountValid ? `${amount} ${amount === 1 ? 'produto' : 'produtos'} × ${fields.length} ${fields.length === 1 ? 'campo' : 'campos'} = ${amount * fields.length} colunas de saída. Máximo: ${maximum} produtos por página.` : `Informe um número inteiro de 1 a ${maximum}.`}</p>
            </section>
            <fieldset className="mapping-section" disabled={loading || !!exporting}><legend>2. Gerencie os campos de cada produto</legend><p className="section-description">Inclua colunas, escolha os nomes de saída e use as setas para definir a ordem.</p>
              {sheets.length > 1 && <div className="sheet-field"><label htmlFor="sheet">Aba da planilha</label><select id="sheet" value={sheetIndex} onChange={(event) => selectSheet(event.target.value)}>{sheets.map((item, index) => <option key={index} value={index}>{item.name}{item.error ? ' (verificar)' : ''}</option>)}</select></div>}
              {sheet?.error && <div className="alert alert-error" role="alert"><TriangleAlert size={19} /><span>{sheet.error}</span></div>}
              <FieldManager fields={fields} columns={sheet?.columns || []} issues={fieldIssues} perPage={amountValid ? amount : 0} onChange={changeFields} onAdd={addField} getExample={(field) => columnExample(sheet, field.column, field.type === 'price', currency)} />
              {!amountValid && Number.isInteger(amount) && amount > maximum && <div className="field-limit-alert" role="alert"><p>{amount} produtos × {fields.length} campos ultrapassam as 150 colunas. Com esses campos, cabem até {maximum} produtos por página.</p><button className="text-button" onClick={() => changeAmount(String(maximum))}>Ajustar para {maximum} produtos <ArrowRight size={15} /></button></div>}
              {mapped && unusedColumns.length > 0 && <p className="unused-note"><Info size={15} /> Não serão exportadas: {unusedColumns.map((column) => column.label).join(', ')}.</p>}
              <button className="text-button mapping-details" type="button" onClick={() => setDrawer('fields')}>Entenda os nomes das colunas de saída <ArrowRight size={15} /></button>
            </fieldset>
            {hasPrices && <label className="currency-setting"><span><strong>Adicionar R$ aos preços</strong><small>Aplica-se a todos os campos com formato Preço.</small></span><input type="checkbox" checked={currency} onChange={(event) => { setCurrency(event.target.checked); setNotice(''); }} /><span className="switch-track" aria-hidden="true" /></label>}
            {mapped && !sheet?.error && products.length === 0 && !errors.length && <div className="alert alert-warning" role="alert"><TriangleAlert size={19} /><span>Nenhum produto encontrado. Confira a aba e as colunas selecionadas.</span></div>}
          </>}

          {step === 2 && canPreview && <ResultPreview output={output} page={currentPage} setPage={changePage} perPage={amount} fields={fields} />}
          {step !== 0 && issues.length > 0 && <div className={`issue-banner ${errors.length ? 'blocking' : ''}`} role="alert"><TriangleAlert size={20} /><div><strong>{errors.length ? 'Confira a planilha antes de baixar' : 'Algumas linhas precisam de atenção'}</strong><p>{errors.length ? `${errors.length} problema(s) precisam ser corrigidos na origem ou na seleção de colunas.` : 'Há linhas ignoradas ou dados protegidos. Confira os detalhes.'}</p></div><button className="text-button" onClick={() => setDrawer('issues')}>Ver {issues.length} {issues.length === 1 ? 'aviso' : 'avisos'} <ArrowRight size={15} /></button></div>}
          <div className="panel-actions">{step === 0 ? <><span>Não tem uma planilha em mãos?</span><button className="text-button" onClick={loadExample} disabled={loading}>Usar exemplo com 80 produtos <ArrowRight size={16} /></button></> : <><button className="button button-quiet" onClick={() => setStep(step - 1)} disabled={!!exporting}><ArrowLeft size={17} /> {step === 1 ? 'Voltar' : 'Ajustar configuração'}</button>{step === 1 ? <button className="button button-primary" onClick={() => setStep(2)} disabled={!canPreview}>Conferir resultado <ArrowRight size={18} /></button> : <span className="precision-label"><ShieldCheck size={16} /> Nenhuma casa decimal arredondada</span>}</>}</div>
        </section>

        {step === 0 ? <aside className="start-aside"><span className="aside-icon"><Layers size={23} /></span><h2>Da lista de produtos<br />para as suas artes.</h2><p>Você escolhe quantos produtos entram em cada página. O conversor organiza o restante.</p><div className="source-example"><div className="source-example-title"><FileSpreadsheet size={16} /> Exemplo de planilha</div><table><thead><tr><th>Produto</th><th>Oferta</th></tr></thead><tbody><tr><td>Café torrado 500g</td><td>13,99</td></tr><tr><td>Açúcar cristal 1kg</td><td>2,95</td></tr><tr><td>Leite integral 1L</td><td>5,50</td></tr></tbody></table></div><div className="aside-check"><CheckCircle2 size={17} /><span>Uma coluna de nomes e outra de preços. Os títulos podem variar.</span></div><button className="text-button" onClick={() => setDrawer('help')}>Ver como funciona <ArrowRight size={16} /></button></aside> : <aside className="conversion-aside">
          <div className="summary-card"><div className="summary-heading"><h2>Sua conversão</h2><span className={`state-tag ${ready ? 'is-ready' : ''}`}>{ready ? <><span /> Dados válidos</> : 'Em configuração'}</span></div><div className="page-total"><strong>{amountValid && output.rows.length ? output.rows.length : '—'}</strong><span>páginas no Canva</span></div><dl className="summary-list"><div><dt>Produtos válidos</dt><dd>{validProducts}</dd></div><div><dt>Produtos por página</dt><dd>{amountValid ? amount : '—'}</dd></div><div><dt>Campos por produto</dt><dd>{fields.length}</dd></div><div><dt>Colunas no arquivo</dt><dd>{amountValid ? amount * fields.length : '—'}</dd></div></dl><p className="summary-note">{!amountValid ? 'Ajuste a quantidade de produtos para continuar.' : errors.length ? 'A prévia inclui produtos com preço pendente. Corrija os avisos para liberar o download.' : output.rows.length ? `${products.length} produtos distribuídos em ${output.rows.length} ${output.rows.length === 1 ? 'página' : 'páginas'}, na ordem da planilha.` : 'Selecione as colunas para calcular suas páginas.'}</p>
          {step === 1 && <div className="precision-card"><ShieldCheck size={19} /><div><strong>Seus centavos, preservados.</strong><p>13,995 continua 13,995. Sem cortes ou arredondamentos.</p></div></div>}
          {step === 2 && <div className="export-section"><h3>Baixar arquivo</h3><p>Os dois formatos contêm os mesmos dados.</p>{output.batches.length > 1 && <div className="batch-picker"><div className="batch-alert"><Info size={17} /><span>Baixe cada um dos {output.batches.length} lotes separadamente. Até 300 páginas por lote.</span></div><label htmlFor="batch">Lote para baixar</label><select id="batch" value={currentBatch} disabled={!!exporting} onChange={(event) => { const value = Number(event.target.value); setBatch(value); setPage(value * 300); setNotice(''); }}>{output.batches.map((rows, index) => <option key={index} value={index}>Lote {index + 1} de {output.batches.length} · páginas {index * 300 + 1}–{index * 300 + rows.length}</option>)}</select></div>}
            <button className="button button-primary download-button" disabled={!ready || !!exporting} onClick={() => handleExport('xlsx')}>{exporting === 'xlsx' ? <LoaderCircle className="spin" size={18} /> : <FileSpreadsheet size={18} />} Baixar Excel (.xlsx)<ArrowDownToLine size={17} /></button><button className="button button-secondary download-button" disabled={!ready || !!exporting} onClick={() => handleExport('csv')}>{exporting === 'csv' ? <LoaderCircle className="spin" size={18} /> : <FileText size={18} />} Baixar CSV (.csv)<ArrowDownToLine size={17} /></button><p className="export-hint">{ready ? 'Preços em texto. Acentos preservados.' : 'Corrija as pendências para liberar os downloads.'}</p>{notice && <div className="download-notice" role="status"><CheckCircle2 size={18} /><span>{notice}</span></div>}
          </div>}</div><button className="aside-help" onClick={() => setDrawer('help')}><CircleHelp size={18} /><span>Precisa de uma orientação?<strong>Veja o passo a passo</strong></span><ArrowRight size={17} /></button>
        </aside>}
      </div>
      <footer className="app-footer"><span>Conversor para Canva <span className="footer-dot">·</span> Sem vínculo com o Canva</span><span><LockKeyhole size={14} /> Processamento local, do início ao fim.</span></footer>
    </main>

    {drawer && <Drawer title={drawer === 'help' ? 'Como funciona' : drawer === 'fields' ? 'Nomes das colunas de saída' : 'Pendências da planilha'} onClose={closeDrawer}>
      {drawer === 'help' && <><p className="drawer-lead">Da sua lista de produtos a um arquivo organizado, em três etapas.</p><ol className="help-steps"><li><span>01</span><div><h3>Envie sua planilha</h3><p>Use Excel (.xlsx) ou CSV. O arquivo precisa ter uma linha de cabeçalho, uma coluna de nomes e outra de preços.</p></div></li><li><span>02</span><div><h3>Configure sua arte</h3><p>Defina quantos produtos cabem por página. Adicione os campos desejados, escolha as colunas de origem e personalize seus nomes e ordem de saída.</p></div></li><li><span>03</span><div><h3>Confira e baixe</h3><p>Navegue até a última página para conferir os dados. Baixe o Excel ou CSV e importe no Canva, conectando os campos aos elementos do design.</p></div></li></ol><div className="drawer-note"><ShieldCheck size={21} /><div><h3>Precisão e privacidade</h3><p>Os preços não são arredondados. Seus arquivos permanecem no navegador e não são enviados a servidores.</p></div></div></>}
      {drawer === 'fields' && <div className="output-mapping" role="region" aria-label="Como as colunas de saída serão nomeadas"><p className="drawer-lead">Escolha o nome de saída de cada campo. O conversor acrescenta a posição do produto automaticamente.</p><dl className="mapping-explanation">{fields.map((field) => <div key={field.id}><dt>{sheet?.columns.find((column) => String(column.index) === String(field.column))?.label || 'Selecione a coluna'}</dt><dd>{field.name.trim() ? headerSequence(field.name.trim(), amountValid ? amount : 1) : 'Informe um nome de saída'}</dd></div>)}</dl><h3>O número é a posição na arte</h3><p>Um campo chamado CATEGORIA gera CATEGORIA1 para o primeiro produto, CATEGORIA2 para o segundo, e assim por diante. A ordem dos campos se repete em cada produto.</p><h3>Uma linha, uma página</h3><p>O total de colunas é a quantidade de produtos por página multiplicada pelos campos selecionados. Com {fields.length} campos por produto, cabem até {maximum} produtos em uma página, respeitando as 150 colunas.</p><p className="drawer-note-text">O campo que identifica o nome do produto é obrigatório. Os demais podem ser removidos. Texto preserva códigos e descrições; Preço normaliza valores monetários sem arredondar.</p></div>}
      {drawer === 'issues' && <><p className="drawer-lead">{errors.length ? 'Corrija os dados no arquivo original e envie novamente, ou ajuste as colunas selecionadas.' : 'Confira as linhas abaixo e o resultado na prévia.'}</p><div className="issue-count"><TriangleAlert size={18} />{errors.length} {errors.length === 1 ? 'problema impede' : 'problemas impedem'} o download · {issues.length} {issues.length === 1 ? 'aviso' : 'avisos'} no total</div><ol className="issue-list">{issues.map((issue, index) => <li key={index}><span>{issue.line ? `Linha ${issue.line}` : 'Configuração'}</span><p>{issue.message}</p></li>)}</ol></>}
    </Drawer>}
  </>;
}
