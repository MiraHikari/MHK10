import { describe, expect, it } from 'vite-plus/test';
import { CalculatorModel } from './calculator-model';

const type = (calc: CalculatorModel, digits: string): void => {
  for (const ch of digits) {
    if (ch === '.') calc.inputDecimal();
    else calc.inputDigit(Number(ch));
  }
};

describe('win95 standard calculator engine', () => {
  it('uses percentages as fractions for multiply and standalone conversion', () => {
    const calc = new CalculatorModel();
    calc.enter('200');
    calc.setOperator('*');
    calc.enter('10');
    calc.percent();
    calc.equals();
    expect(calc.display).toBe('20');
    calc.clear();
    calc.enter('50');
    calc.percent();
    expect(calc.display).toBe('0.5');
  });

  it('folds a unary result or memory recall before selecting the next operator', () => {
    const calc = new CalculatorModel();
    calc.enter('9');
    calc.setOperator('+');
    calc.enter('81');
    calc.sqrt();
    calc.setOperator('*');
    calc.enter('2');
    calc.equals();
    expect(calc.display).toBe('36');
    calc.clear();
    calc.enter('3');
    calc.memoryStore();
    calc.enter('4');
    calc.setOperator('+');
    calc.memoryRecall();
    calc.setOperator('*');
    calc.enter('2');
    calc.equals();
    expect(calc.display).toBe('14');
  });

  it('keeps scientific values valid when decimal input resumes', () => {
    const calc = new CalculatorModel();
    calc.enter('1e30');
    calc.backspace();
    expect(calc.display).toBe('1e+30');
    calc.inputDecimal();
    calc.inputDigit(2);
    expect(calc.display).toBe('0.2');
    calc.enter('1e-320');
    calc.reciprocal();
    expect(calc.display).toBe('Overflow');
  });

  it('starts a new calculation after equals and exposes completed expression', () => {
    const calc = new CalculatorModel();
    calc.enter('2');
    calc.setOperator('+');
    calc.enter('3');
    calc.equals();
    expect(calc.snapshot().expression).toBe('2 + 3 =');
    calc.inputDigit(7);
    calc.equals();
    expect(calc.display).toBe('7');
  });
  it('shows typed digits and starts from zero', () => {
    const calc = new CalculatorModel();
    expect(calc.display).toBe('0');
    type(calc, '123');
    expect(calc.display).toBe('123');
    calc.inputDecimal();
    type(calc, '45');
    expect(calc.display).toBe('123.45');
    expect(calc.snapshot()).toMatchObject({ display: '123.45', memory: false, error: false });
  });

  it('caps the number of digits that can be entered', () => {
    const calc = new CalculatorModel();
    type(calc, '12345678901234567890');
    expect(calc.display).toBe('1234567890123456');
    expect(calc.display.replace(/[^0-9]/g, '').length).toBe(16);
  });

  it('chains with immediate execution rather than precedence', () => {
    const calc = new CalculatorModel();
    type(calc, '2');
    calc.setOperator('+');
    type(calc, '3');
    calc.setOperator('*');
    expect(calc.display).toBe('5');
    type(calc, '4');
    calc.equals();
    expect(calc.display).toBe('20');
  });

  it('repeats the last operation on successive equals', () => {
    const calc = new CalculatorModel();
    type(calc, '5');
    calc.setOperator('+');
    type(calc, '3');
    calc.equals();
    expect(calc.display).toBe('8');
    calc.equals();
    expect(calc.display).toBe('11');
    calc.equals();
    expect(calc.display).toBe('14');
  });

  it('avoids floating point noise in the display', () => {
    const calc = new CalculatorModel();
    type(calc, '0.1');
    calc.setOperator('+');
    type(calc, '0.2');
    calc.equals();
    expect(calc.display).toBe('0.3');
  });

  it('applies percent against the running value', () => {
    const calc = new CalculatorModel();
    type(calc, '200');
    calc.setOperator('+');
    type(calc, '10');
    calc.percent();
    expect(calc.display).toBe('20');
    calc.equals();
    expect(calc.display).toBe('220');
  });

  it('toggles the sign of the entry', () => {
    const calc = new CalculatorModel();
    type(calc, '42');
    calc.negate();
    expect(calc.display).toBe('-42');
    calc.negate();
    expect(calc.display).toBe('42');
    const zero = new CalculatorModel();
    zero.negate();
    expect(zero.display).toBe('0');
  });

  it('computes square root and reports negative roots as errors', () => {
    const calc = new CalculatorModel();
    type(calc, '81');
    calc.sqrt();
    expect(calc.display).toBe('9');
    const bad = new CalculatorModel();
    type(bad, '9');
    bad.negate();
    bad.sqrt();
    expect(bad.error).toBe(true);
    expect(bad.display).toBe('Invalid input');
  });

  it('computes reciprocals and rejects 1/0', () => {
    const calc = new CalculatorModel();
    type(calc, '4');
    calc.reciprocal();
    expect(calc.display).toBe('0.25');
    const bad = new CalculatorModel();
    bad.reciprocal();
    expect(bad.error).toBe(true);
    expect(bad.display).toBe('Cannot divide by zero');
  });

  it('enters a safe error state on divide by zero and recovers on clear', () => {
    const calc = new CalculatorModel();
    type(calc, '7');
    calc.setOperator('/');
    type(calc, '0');
    calc.equals();
    expect(calc.error).toBe(true);
    expect(calc.display).toBe('Cannot divide by zero');
    // Further input is ignored while in error.
    type(calc, '5');
    expect(calc.display).toBe('Cannot divide by zero');
    calc.clear();
    expect(calc.error).toBe(false);
    expect(calc.display).toBe('0');
    type(calc, '8');
    expect(calc.display).toBe('8');
  });

  it('backspaces the active entry down to zero', () => {
    const calc = new CalculatorModel();
    type(calc, '123');
    calc.backspace();
    expect(calc.display).toBe('12');
    calc.backspace();
    calc.backspace();
    expect(calc.display).toBe('0');
  });

  it('distinguishes clear-entry from full clear', () => {
    const calc = new CalculatorModel();
    type(calc, '9');
    calc.setOperator('+');
    type(calc, '5');
    // CE wipes only the current operand, keeping the pending operation.
    calc.clearEntry();
    expect(calc.display).toBe('0');
    type(calc, '1');
    calc.equals();
    expect(calc.display).toBe('10');
    // C discards everything.
    type(calc, '9');
    calc.setOperator('+');
    type(calc, '5');
    calc.clear();
    expect(calc.display).toBe('0');
    calc.equals();
    expect(calc.display).toBe('0');
  });

  it('runs the full memory cycle', () => {
    const calc = new CalculatorModel();
    expect(calc.memory).toBe(false);
    type(calc, '10');
    calc.memoryStore();
    expect(calc.memory).toBe(true);
    calc.clear();
    expect(calc.display).toBe('0');
    calc.memoryRecall();
    expect(calc.display).toBe('10');
    type(calc, '5');
    calc.memoryAdd();
    calc.clear();
    calc.memoryRecall();
    expect(calc.display).toBe('15');
    calc.memoryClear();
    expect(calc.memory).toBe(false);
    calc.clear();
    calc.memoryRecall();
    expect(calc.display).toBe('0');
  });

  it('supports optional memory subtract', () => {
    const calc = new CalculatorModel();
    type(calc, '20');
    calc.memoryStore();
    calc.clearEntry();
    type(calc, '8');
    calc.memorySubtract();
    calc.clear();
    calc.memoryRecall();
    expect(calc.display).toBe('12');
  });

  it('enters pasted numbers and rejects malformed text', () => {
    const calc = new CalculatorModel();
    expect(calc.enter('  42 ')).toBe(true);
    expect(calc.display).toBe('42');
    expect(calc.enter('3.14')).toBe(true);
    expect(calc.display).toBe('3.14');
    expect(calc.enter('-8')).toBe(true);
    expect(calc.display).toBe('-8');
    // exponent forms round-trip: the display can itself be pasted back.
    expect(calc.enter('1.5e-3')).toBe(true);
    expect(calc.display).toBe('0.0015');
    expect(calc.enter('NaN')).toBe(false);
    expect(calc.enter('1.2.3')).toBe(false);
    expect(calc.enter('hello')).toBe(false);
    expect(calc.display).toBe('0.0015');
  });

  it('paste replaces the operand but keeps the pending operation', () => {
    const calc = new CalculatorModel();
    type(calc, '5');
    calc.setOperator('+');
    type(calc, '5');
    expect(calc.enter('7')).toBe(true);
    expect(calc.display).toBe('7');
    calc.equals();
    expect(calc.display).toBe('12');
  });

  it('paste recovers from an error state', () => {
    const calc = new CalculatorModel();
    type(calc, '5');
    calc.setOperator('/');
    type(calc, '0');
    calc.equals();
    expect(calc.error).toBe(true);
    expect(calc.enter('7')).toBe(true);
    expect(calc.error).toBe(false);
    expect(calc.display).toBe('7');
  });
});
