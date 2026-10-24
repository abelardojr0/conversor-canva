// Work with decimal characters, never rounded floating-point calculations.
function expandScientific(value) {
  const match = value.match(/^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/i);
  if (!match) return value;
  const [, sign, integer, fraction = '', exponent] = match;
  const digits = integer + fraction;
  const position = integer.length + Number(exponent);
  if (position <= 0) return `${sign}0.${'0'.repeat(-position)}${digits}`;
  if (position >= digits.length) return sign + digits + '0'.repeat(position - digits.length);
  return `${sign}${digits.slice(0, position)}.${digits.slice(position)}`;
}

export function normalizePrice(input, { currency = false } = {}) {
  const fail = (status, message) => ({ status, value: '', message });
  if (input === null || input === undefined || (typeof input === 'string' && !input.trim())) {
    return fail('missing', 'Preço ausente.');
  }
  const numeric = typeof input === 'number';
  if ((!numeric && typeof input !== 'string') || (numeric && !Number.isFinite(input))) {
    return fail('invalid', 'Preço inválido. Use um número ou um texto monetário.');
  }
  let text = numeric ? expandScientific(String(input)) : input.trim().replace(/^R\$\s*/i, '');
  let sign = '';
  if (text.startsWith('-') || text.startsWith('+')) {
    sign = text[0] === '-' ? '-' : '';
    text = text.slice(1);
  }
  if (!/^\d+(?:[.,]\d+)*$/.test(text)) return fail('invalid', 'Preço inválido. Confira o valor na planilha de origem.');
  let integer;
  let fraction = '';
  if (numeric) {
    [integer, fraction = ''] = text.split('.');
  } else if (text.includes(',') && text.includes('.')) {
    // Accept explicitly grouped Brazilian or international notation only.
    if (/^\d{1,3}(?:\.\d{3})+,\d+$/.test(text)) {
      [integer, fraction] = text.replaceAll('.', '').split(',');
    } else if (/^\d{1,3}(?:,\d{3})+\.\d+$/.test(text)) {
      [integer, fraction] = text.replaceAll(',', '').split('.');
    } else {
      return fail('ambiguous', 'Pontuação ambígua. Use vírgula decimal e confira os separadores de milhar.');
    }
  } else if (text.includes(',')) {
    if ((text.match(/,/g) || []).length !== 1) return fail('ambiguous', 'Pontuação ambígua. Confira o preço na origem.');
    [integer, fraction] = text.split(',');
  } else if (text.includes('.')) {
    if ((text.match(/\./g) || []).length !== 1 || /^\d{1,3}\.\d{3}$/.test(text)) {
      return fail('ambiguous', 'O ponto pode indicar milhar ou decimal. Use vírgula decimal para confirmar.');
    }
    [integer, fraction] = text.split('.');
  } else {
    integer = text;
  }
  const value = `${sign}${integer},${fraction.padEnd(2, '0')}`;
  return { status: 'valid', value: currency ? `R$ ${value}` : value, message: '' };
}
