/**
 * Pure, DOM-free engine for a classic Windows 95 Standard calculator.
 *
 * The model uses immediate-execution semantics (no algebraic precedence):
 * `2 + 3 * 4` evaluates left to right as `(2 + 3) * 4 = 20`, matching the
 * real Win95 Standard calculator rather than scientific precedence rules.
 *
 * Every method is deterministic and never throws: unsafe arithmetic such as
 * division by zero or the square root of a negative number lands in a safe
 * error state that recovers on {@link CalculatorModel.clear} or
 * {@link CalculatorModel.clearEntry}. The engine reads no browser globals and
 * uses no `Date`/`Math.random`.
 */

/** The four immediate-execution operators. */
export type CalculatorOperator = '+' | '-' | '*' | '/';

/** Read-only view of the calculator used by UI callers. */
export interface CalculatorSnapshot {
  /** The number (or error message) currently shown on screen. */
  display: string;
  /** Whether a value is held in memory (drives the `M` indicator). */
  memory: boolean;
  /** Whether the engine is in a recoverable error state. */
  error: boolean;
  /** The operator awaiting its second operand, if any. */
  operator: CalculatorOperator | null;
  /** Pending calculation, or the most recently completed calculation. */
  expression: string;
}

/** Internal discriminated result of a single arithmetic step. */
type ArithmeticResult =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly message: string };

/** Largest number of digit characters allowed in the entry. */
const MAX_DIGITS = 16;
/** Significant digits retained when formatting a result for display. */
const DISPLAY_PRECISION = 16;
const DIVIDE_BY_ZERO = 'Cannot divide by zero';
const INVALID_INPUT = 'Invalid input';
const OVERFLOW = 'Overflow';

function arithmetic(a: number, b: number, op: CalculatorOperator): ArithmeticResult {
  let value: number;
  switch (op) {
    case '+':
      value = a + b;
      break;
    case '-':
      value = a - b;
      break;
    case '*':
      value = a * b;
      break;
    case '/':
      if (b === 0) return { ok: false, message: DIVIDE_BY_ZERO };
      value = a / b;
      break;
  }
  if (!Number.isFinite(value)) return { ok: false, message: OVERFLOW };
  return { ok: true, value };
}

/** Render a finite number as a clean display string without float artefacts. */
function format(n: number): string {
  if (n === 0 || Object.is(n, -0)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e16 || abs < 1e-15) {
    return Number(n.toPrecision(DISPLAY_PRECISION - 1)).toExponential();
  }
  return String(Number(n.toPrecision(DISPLAY_PRECISION)));
}

export class CalculatorModel {
  /** The string currently being edited/shown (never empty). */
  private entry = '0';
  /** The running left-hand value for the pending operator. */
  private accumulator = 0;
  /** Operator awaiting a second operand. */
  private pending: CalculatorOperator | null = null;
  /** Operator and operand remembered for repeated `=` presses. */
  private lastOperator: CalculatorOperator | null = null;
  private lastOperand = 0;
  /** When true the next digit/decimal starts a fresh entry. */
  private overwrite = true;
  /** A unary operation/recall is an operand even when its result is not editable. */
  private awaitingOperand = false;
  private expression = '';
  /** Active error message, or empty when healthy. */
  private errorMessage = '';
  /** Stored memory value and whether the memory indicator is lit. */
  private memoryValue = 0;
  private memorySet = false;

  /** The number (or error message) currently shown. */
  get display(): string {
    return this.errorMessage || this.entry;
  }

  /** Whether a value is currently held in memory. */
  get memory(): boolean {
    return this.memorySet;
  }

  /** Whether the engine is in a recoverable error state. */
  get error(): boolean {
    return this.errorMessage !== '';
  }

  /** Immutable view of the full visible state. */
  snapshot(): CalculatorSnapshot {
    return {
      display: this.display,
      memory: this.memorySet,
      error: this.error,
      operator: this.pending,
      expression: this.pending ? `${format(this.accumulator)} ${this.pending}` : this.expression,
    };
  }

  /** Append a single decimal digit (0-9). Out-of-range input is ignored. */
  inputDigit(digit: number): void {
    if (this.error) return;
    if (!Number.isInteger(digit) || digit < 0 || digit > 9) return;
    const text = String(digit);
    if (this.overwrite) {
      if (this.pending === null) this.lastOperator = null;
      this.entry = text;
      this.overwrite = false;
      this.awaitingOperand = false;
      this.expression = '';
      return;
    }
    if (this.digitCount() >= MAX_DIGITS) return;
    if (this.entry === '0') this.entry = text;
    else if (this.entry === '-0') this.entry = `-${text}`;
    else this.entry += text;
  }

  /** Begin or continue a decimal fraction. */
  inputDecimal(): void {
    if (this.error) return;
    if (this.overwrite) {
      if (this.pending === null) this.lastOperator = null;
      this.entry = '0.';
      this.overwrite = false;
      this.awaitingOperand = false;
      this.expression = '';
      return;
    }
    if (!this.entry.includes('.')) this.entry += '.';
  }

  /**
   * Replace the entry with an external value (a pasted number). Accepts an
   * optional sign, digits with at most one decimal point and an optional
   * exponent — the same shapes {@link snapshot}.display can produce. Returns
   * whether the value was accepted; malformed text leaves the state untouched.
   */
  enter(value: string): boolean {
    const text = value.trim().toLowerCase();
    if (!/^[-+]?(\d+(\.\d*)?|\.\d+)(e[-+]?\d+)?$/.test(text)) return false;
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return false;
    this.errorMessage = '';
    this.entry = format(parsed);
    // Exponential notation is a result, not a decimal entry. Appending a dot
    // or backspacing its exponent could otherwise create NaN/Infinity.
    this.overwrite = this.entry.includes('e');
    this.awaitingOperand = false;
    this.expression = '';
    if (this.pending === null) this.lastOperator = null;
    return true;
  }

  /** Select an operator, folding any pending operation first (chaining). */
  setOperator(op: CalculatorOperator): void {
    if (this.error) return;
    const current = Number(this.entry);
    if (this.pending !== null && !this.awaitingOperand) {
      const result = arithmetic(this.accumulator, current, this.pending);
      if (!result.ok) return this.fail(result.message);
      this.accumulator = result.value;
      this.entry = format(result.value);
    } else {
      this.accumulator = current;
    }
    this.pending = op;
    this.overwrite = true;
    this.awaitingOperand = true;
    this.lastOperator = null;
    this.lastOperand = 0;
  }

  /** Evaluate the pending operation, or repeat the previous one. */
  equals(): void {
    if (this.error) return;
    if (this.pending !== null) {
      const operand = Number(this.entry);
      const result = arithmetic(this.accumulator, operand, this.pending);
      if (!result.ok) return this.fail(result.message);
      this.lastOperator = this.pending;
      this.lastOperand = operand;
      this.expression = `${format(this.accumulator)} ${this.pending} ${format(operand)} =`;
      this.accumulator = result.value;
      this.entry = format(result.value);
      this.pending = null;
      this.overwrite = true;
      return;
    }
    if (this.lastOperator !== null) {
      this.expression = `${this.entry} ${this.lastOperator} ${format(this.lastOperand)} =`;
      const result = arithmetic(Number(this.entry), this.lastOperand, this.lastOperator);
      if (!result.ok) return this.fail(result.message);
      this.accumulator = result.value;
      this.entry = format(result.value);
      this.overwrite = true;
    }
  }

  /**
   * Add/subtract a percentage of the base; multiply/divide by the percentage
   * itself. A standalone percentage converts the entry to a fraction.
   */
  percent(): void {
    if (this.error) return;
    const fraction = Number(this.entry) / 100;
    const result =
      this.pending === '+' || this.pending === '-' ? this.accumulator * fraction : fraction;
    if (!Number.isFinite(result)) return this.fail(OVERFLOW);
    this.entry = format(result);
    this.overwrite = true;
    this.awaitingOperand = false;
  }

  /** Toggle the sign of the current entry. */
  negate(): void {
    if (this.error) return;
    if (this.entry === '0' || this.entry === '0.') return;
    if (this.entry.startsWith('-')) this.entry = this.entry.slice(1);
    else this.entry = `-${this.entry}`;
  }

  /** Replace the entry with its square root; negatives error out. */
  sqrt(): void {
    if (this.error) return;
    const value = Number(this.entry);
    if (value < 0) return this.fail(INVALID_INPUT);
    this.entry = format(Math.sqrt(value));
    this.overwrite = true;
    this.awaitingOperand = false;
  }

  /** Replace the entry with its reciprocal; `1/0` errors out. */
  reciprocal(): void {
    if (this.error) return;
    const value = Number(this.entry);
    if (value === 0) return this.fail(DIVIDE_BY_ZERO);
    const reciprocal = 1 / value;
    if (!Number.isFinite(reciprocal)) return this.fail(OVERFLOW);
    this.entry = format(reciprocal);
    this.overwrite = true;
    this.awaitingOperand = false;
  }

  /** Delete the last entered character while actively typing. */
  backspace(): void {
    if (this.error || this.overwrite) return;
    let next = this.entry.slice(0, -1);
    if (next === '' || next === '-') next = '0';
    this.entry = next;
  }

  /** Full reset (`C`): clears the entry, pending operation and any error. */
  clear(): void {
    this.entry = '0';
    this.accumulator = 0;
    this.pending = null;
    this.lastOperator = null;
    this.lastOperand = 0;
    this.overwrite = true;
    this.errorMessage = '';
    this.awaitingOperand = false;
    this.expression = '';
  }

  /** Clear only the current entry (`CE`), keeping the pending operation. */
  clearEntry(): void {
    this.entry = '0';
    this.overwrite = true;
    this.errorMessage = '';
    this.awaitingOperand = false;
    if (this.pending === null) this.lastOperator = null;
  }

  /** `MC`: forget the stored memory value. */
  memoryClear(): void {
    this.memoryValue = 0;
    this.memorySet = false;
  }

  /** `MR`: recall the stored memory value into the entry. */
  memoryRecall(): void {
    if (this.error || !this.memorySet) return;
    this.entry = format(this.memoryValue);
    this.overwrite = true;
    this.awaitingOperand = false;
  }

  /** `MS`: store the current entry in memory. */
  memoryStore(): void {
    if (this.error) return;
    this.memoryValue = Number(this.entry);
    this.memorySet = true;
  }

  /** `M+`: add the current entry to memory. */
  memoryAdd(): void {
    if (this.error) return;
    const next = this.memoryValue + Number(this.entry);
    if (!Number.isFinite(next)) return this.fail(OVERFLOW);
    this.memoryValue = next;
    this.memorySet = true;
  }

  /** `M-`: subtract the current entry from memory. */
  memorySubtract(): void {
    if (this.error) return;
    const next = this.memoryValue - Number(this.entry);
    if (!Number.isFinite(next)) return this.fail(OVERFLOW);
    this.memoryValue = next;
    this.memorySet = true;
  }

  private digitCount(): number {
    let count = 0;
    for (const ch of this.entry) if (ch >= '0' && ch <= '9') count += 1;
    return count;
  }

  private fail(message: string): void {
    this.errorMessage = message;
    this.pending = null;
    this.lastOperator = null;
    this.lastOperand = 0;
    this.overwrite = true;
  }
}
