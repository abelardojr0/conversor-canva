import { useRef, useState } from 'react';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Columns3, List } from 'lucide-react';

export default function ResultPreview({ output, page, setPage, perPage, fields }) {
  const [view, setView] = useState('products');
  const [jump, setJump] = useState(null);
  const productTab = useRef(null);
  const fileTab = useRef(null);
  const row = output.rows[page];
  const fieldCount = fields.length;
  const productIndex = fields.findIndex((field) => field.type === 'product');
  const productCount = row.filter((value, index) => index % fieldCount === productIndex && value).length;
  function switchView(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'products' : event.key === 'End' ? 'file' : view === 'products' ? 'file' : 'products';
    setView(next);
    (next === 'products' ? productTab : fileTab).current.focus();
  }
  function goToPage() {
    const target = Number(jump);
    if (jump !== null && Number.isInteger(target) && target >= 1 && target <= output.rows.length) setPage(target - 1);
    setJump(null);
  }
  return <>
    <div className="preview-controls">
      <div className="view-tabs" role="tablist" aria-label="Visualização da prévia" onKeyDown={switchView}>
        <button ref={productTab} id="products-tab" role="tab" aria-selected={view === 'products'} aria-controls="products-panel" tabIndex={view === 'products' ? 0 : -1} onClick={() => setView('products')}><List size={16} /> Por produto</button>
        <button ref={fileTab} id="file-tab" role="tab" aria-selected={view === 'file'} aria-controls="file-panel" tabIndex={view === 'file' ? 0 : -1} onClick={() => setView('file')}><Columns3 size={16} /> Arquivo final</button>
      </div>
      <span className="preview-count">{productCount} {productCount === 1 ? 'produto' : 'produtos'} nesta página</span>
    </div>
    <div id="products-panel" role="tabpanel" aria-labelledby="products-tab" className="preview-panel" hidden={view !== 'products'} tabIndex="0">
      <div className="product-preview-scroll" tabIndex="0" role="region" aria-label="Campos por produto"><table className={`product-table ${fieldCount > 2 ? 'expanded-fields' : ''}`}><caption className="sr-only">Campos da página {page + 1}</caption>
        <thead><tr><th scope="col">Posição</th>{fields.map((field) => <th scope="col" key={field.id} className={field.type === 'price' ? 'price-column' : ''}>{field.name.trim()}</th>)}</tr></thead>
        <tbody>{Array.from({ length: perPage }, (_, index) => <tr key={index} className={!row[index * fieldCount + productIndex] ? 'vacant-row' : ''}>
          <td><span className="position-number">{String(index + 1).padStart(2, '0')}</span></td>
          {fields.map((field, fieldIndex) => {
            const value = row[index * fieldCount + fieldIndex];
            const emptyProduct = !row[index * fieldCount + productIndex];
            return <td key={field.id} className={field.type === 'price' ? 'price-column' : ''}>{value ? <><span className={field.type === 'price' ? 'product-price' : 'product-name'}>{value}</span><span className="field-key">{field.name.trim()}{index + 1}</span></> : emptyProduct && field.type === 'product' ? <span className="blank-slot">Posição vazia</span> : <span className="blank-value" aria-label={field.type === 'price' ? 'Preço vazio' : 'Campo vazio'}>—</span>}</td>;
          })}
        </tr>)}</tbody>
      </table></div>
    </div><div id="file-panel" role="tabpanel" aria-labelledby="file-tab" className="preview-panel" hidden={view !== 'file'} tabIndex="0">
      <p className="table-description">Esta é a estrutura exata do download. Role para ver todas as {output.headers.length} colunas.</p>
      <div className="file-table-scroll" tabIndex="0" role="region" aria-label="Colunas do arquivo de saída"><table className="file-table"><caption className="sr-only">Página {page + 1} do arquivo de saída</caption><thead><tr>{output.headers.map((header) => <th scope="col" key={header}>{header}</th>)}</tr></thead><tbody><tr>{row.map((value, index) => <td key={index}>{value || <span className="blank-value" aria-label="Campo vazio">—</span>}</td>)}</tr></tbody></table></div>
    </div>
    <div className="pagination"><div><strong>Página {page + 1} de {output.rows.length}</strong><span>Uma linha do arquivo = uma página no Canva.</span></div><div className="page-actions">
      <button className="icon-button" disabled={page === 0} onClick={() => setPage(0)} aria-label="Primeira página"><ChevronFirst size={18} /></button><button className="icon-button" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Página anterior"><ChevronLeft size={18} /></button>
      <label className="sr-only" htmlFor="jump-page">Ir para a página</label><input id="jump-page" className="page-input" type="number" min="1" max={output.rows.length} value={jump ?? page + 1} onChange={(event) => setJump(event.target.value)} onBlur={goToPage} onKeyDown={(event) => { if (event.key === 'Enter') goToPage(); }} />
      <button className="icon-button" disabled={page === output.rows.length - 1} onClick={() => setPage(page + 1)} aria-label="Próxima página"><ChevronRight size={18} /></button><button className="icon-button" disabled={page === output.rows.length - 1} onClick={() => setPage(output.rows.length - 1)} aria-label="Última página"><ChevronLast size={18} /></button>
    </div></div><p className="preview-footnote">Posições vazias permanecem em branco no Excel e no CSV.</p>
  </>;
}
