import { ArrowDown, ArrowRight, ArrowUp, LockKeyhole, Plus, Trash2 } from 'lucide-react';
import { suggestFieldName } from '../lib/fields.js';

const usesColumn = (field, index) => String(field.column) === String(index) || String(field.fallback || '') === String(index);

export default function FieldManager({ fields, columns, issues, perPage, onChange, onAdd, getExample }) {
  const available = columns.filter((column) => !fields.some((field) => usesColumn(field, column.index)));

  function update(id, changes) {
    onChange(fields.map((field) => {
      if (field.id !== id) return field;
      const next = { ...field, ...changes };
      if ('column' in changes && String(changes.column) === String(field.fallback || '')) next.fallback = '';
      if ('column' in changes && field.autoName) {
        const column = columns.find((item) => String(item.index) === String(changes.column));
        if (column) next.name = suggestFieldName(column.label);
      }
      return next;
    }));
  }

  function move(index, direction) {
    const reordered = [...fields];
    [reordered[index], reordered[index + direction]] = [reordered[index + direction], reordered[index]];
    onChange(reordered);
  }

  return <div className="field-manager">
    <div className="managed-field-list">{fields.map((field, index) => {
      const label = columns.find((column) => String(column.index) === String(field.column))?.label;
      const fallbackLabel = columns.find((column) => String(column.index) === String(field.fallback || ''))?.label;
      const title = field.name.trim() || `Campo ${index + 1}`;
      const fieldIssues = issues.filter((issue) => issue.fieldId === field.id);
      const sourceLabel = field.type === 'product' ? 'Coluna com os nomes' : field.id === 'price' && field.type === 'price' ? 'Coluna com os preços' : `Coluna do campo ${index + 1}`;
      const taken = (column) => fields.some((item) => item.id !== field.id && usesColumn(item, column.index));
      return <fieldset className="managed-field" key={field.id} aria-label={`Campo ${index + 1}: ${title}`}>
        <legend className="sr-only">Campo {index + 1}: {title}</legend>
        <div className="managed-field-heading"><div><span className="managed-index">{String(index + 1).padStart(2, '0')}</span><strong>{field.type === 'product' ? 'Nome do produto' : fallbackLabel ? `${label} ou ${fallbackLabel}` : label || 'Campo adicional'}</strong>{field.type === 'product' && <span className="required-tag"><LockKeyhole size={11} /> Obrigatório</span>}</div><div className="managed-field-actions">
          <button className="icon-button" type="button" disabled={index === 0} aria-label={`Mover ${title} para cima`} onClick={() => move(index, -1)}><ArrowUp size={16} /></button>
          <button className="icon-button" type="button" disabled={index === fields.length - 1} aria-label={`Mover ${title} para baixo`} onClick={() => move(index, 1)}><ArrowDown size={16} /></button>
          {field.type !== 'product' && <button className="icon-button remove-field" type="button" aria-label={`Remover ${title}`} onClick={() => onChange(fields.filter((item) => item.id !== field.id))}><Trash2 size={16} /></button>}
        </div></div>
        <div className="managed-inputs"><div><label htmlFor={`source-${field.id}`}>{sourceLabel}</label><select id={`source-${field.id}`} value={field.column} aria-invalid={fieldIssues.length > 0} onChange={(event) => update(field.id, { column: event.target.value })}><option value="">Selecione uma coluna</option>{columns.map((column) => <option key={column.index} value={column.index} disabled={taken(column)}>{column.label} · coluna {column.index + 1}</option>)}</select></div>
          <div><label htmlFor={`name-${field.id}`}>Nome de saída ({index + 1})</label><input id={`name-${field.id}`} type="text" value={field.name} aria-invalid={fieldIssues.length > 0} onChange={(event) => update(field.id, { name: event.target.value, autoName: false })} placeholder="Ex.: CATEGORIA" autoComplete="off" /></div>
        </div>
        {field.type !== 'product' && <div className="field-fallback"><label htmlFor={`fallback-${field.id}`}>Se estiver vazio, usar ({index + 1})</label><select id={`fallback-${field.id}`} value={field.fallback || ''} onChange={(event) => update(field.id, { fallback: event.target.value })}><option value="">Não usar outra coluna</option>{columns.map((column) => <option key={column.index} value={column.index} disabled={taken(column) || String(column.index) === String(field.column)}>{column.label} · coluna {column.index + 1}</option>)}</select>{field.fallback && <p className="field-hint">Vazio ou 0 na primeira coluna usa a segunda. Se as duas tiverem valor, vale a primeira.</p>}</div>}
        <div className="managed-details"><p className="managed-example"><span>Exemplo:</span> {getExample(field) || 'Sem valor de exemplo.'}</p>{field.type === 'product' ? <span className="field-format-label">Texto · identifica o produto</span> : <div className="field-format"><label htmlFor={`format-${field.id}`}>Formato ({index + 1})</label><select id={`format-${field.id}`} value={field.type} onChange={(event) => update(field.id, { type: event.target.value })}><option value="text">Texto</option><option value="price">Preço</option></select></div>}</div>
        <p className="managed-destination"><ArrowRight size={14} /><span>Saída: <strong>{field.name.trim() ? `${field.name.trim()}1${perPage > 1 ? ` … ${field.name.trim()}${perPage}` : ''}` : 'informe um nome'}</strong></span></p>
        {fieldIssues.map((issue, issueIndex) => <p key={issueIndex} className="field-error" role="alert">{issue.message}</p>)}
      </fieldset>;
    })}</div>
    {issues.filter((issue) => !issue.fieldId).map((issue, index) => <p key={index} className="field-error" role="alert">{issue.message}</p>)}
    <div className="add-field-row"><button className="button button-secondary" type="button" disabled={!available.length || fields.length >= 150} onClick={() => onAdd(available[0])}><Plus size={17} /> Adicionar campo</button><span>{available.length ? `${available.length} ${available.length === 1 ? 'coluna disponível' : 'colunas disponíveis'} na planilha` : 'Todas as colunas da planilha estão selecionadas.'}</span></div>
  </div>;
}
