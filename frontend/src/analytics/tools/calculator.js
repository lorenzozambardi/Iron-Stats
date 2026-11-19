/**
 * Safe recursive-descent arithmetic calculator over EvidenceLedger references (E#.field).
 * Zero eval() or Function() usage.
 */

const FUNCTIONS = {
  min: (...args) => Math.min(...args),
  max: (...args) => Math.max(...args),
  abs: (x) => Math.abs(x),
  mean: (...args) => args.reduce((s, v) => s + v, 0) / args.length,
  round: (x, d = 2) => {
    const factor = 10 ** Math.min(6, Math.max(0, Math.round(d)));
    return Math.round(x * factor) / factor;
  },
  pct: (base, next) => {
    if (Math.abs(base) <= 1e-12) throw new Error('Division by zero in pct()');
    return ((next - base) / Math.abs(base)) * 100;
  },
};

function tokenize(expr) {
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if ('+-*/(),'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(expr[i + 1] || ''))) {
      let num = '';
      while (i < expr.length && /[\d.]/.test(expr[i])) num += expr[i++];
      const val = Number(num);
      if (!Number.isFinite(val)) throw new Error(`Invalid number: ${num}`);
      tokens.push({ type: 'num', value: val });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < expr.length && /[a-zA-Z0-9_.[\]]/.test(expr[i])) ident += expr[i++];
      if (/^E\d+\./.test(ident)) {
        tokens.push({ type: 'ref', value: ident });
      } else if (ident in FUNCTIONS) {
        tokens.push({ type: 'fn', value: ident });
      } else {
        throw new Error(`Unknown identifier or disallowed symbol: "${ident}"`);
      }
      continue;
    }
    throw new Error(`Unexpected character "${ch}" in expression`);
  }
  return tokens;
}

export function evaluateLedgerExpression(expression, ledger) {
  if (typeof expression !== 'string' || !expression.trim()) {
    throw new Error('Expression must be a non-empty string');
  }
  if (expression.length > 300) {
    throw new Error('Expression exceeds max length (300 chars)');
  }

  const tokens = tokenize(expression);
  const resolvedRefs = {};
  let pos = 0;

  const peek = () => tokens[pos] || null;
  const consume = () => tokens[pos++] || null;

  function parseExpression() {
    let left = parseTerm();
    while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = consume().value;
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm() {
    let left = parseUnary();
    while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/')) {
      const op = consume().value;
      const right = parseUnary();
      if (op === '/') {
        if (Math.abs(right) <= 1e-15) throw new Error('Division by zero');
        left = left / right;
      } else {
        left = left * right;
      }
    }
    return left;
  }

  function parseUnary() {
    if (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = consume().value;
      const val = parseUnary();
      return op === '-' ? -val : val;
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const tok = peek();
    if (!tok) throw new Error('Unexpected end of expression');
    if (tok.type === 'num') {
      consume();
      return tok.value;
    }
    if (tok.type === 'ref') {
      consume();
      const dotIdx = tok.value.indexOf('.');
      const eid = tok.value.slice(0, dotIdx);
      const fieldPath = tok.value.slice(dotIdx + 1);
      const { found, value } = ledger.resolveRef(eid, fieldPath);
      if (!found || typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`Reference ${tok.value} is not a finite number in the ledger`);
      }
      resolvedRefs[tok.value] = value;
      return value;
    }
    if (tok.type === 'fn') {
      const fnName = consume().value;
      if (!peek() || peek().value !== '(') throw new Error(`Expected "(" after ${fnName}`);
      consume();
      const args = [];
      if (!peek() || peek().value !== ')') {
        args.push(parseExpression());
        while (peek() && peek().value === ',') {
          consume();
          args.push(parseExpression());
        }
      }
      if (!peek() || peek().value !== ')') throw new Error(`Expected ")" after ${fnName} arguments`);
      consume();
      if (args.length === 0) throw new Error(`Function ${fnName} requires at least 1 argument`);
      return FUNCTIONS[fnName](...args);
    }
    if (tok.type === 'op' && tok.value === '(') {
      consume();
      const val = parseExpression();
      if (!peek() || peek().value !== ')') throw new Error('Unmatched "("');
      consume();
      return val;
    }
    throw new Error(`Unexpected token "${tok.value}"`);
  }

  const value = parseExpression();
  if (pos < tokens.length) {
    throw new Error(`Unexpected trailing token "${tokens[pos].value}"`);
  }
  if (!Number.isFinite(value)) {
    throw new Error('Calculation produced non-finite result');
  }
  return { value, resolvedRefs };
}
