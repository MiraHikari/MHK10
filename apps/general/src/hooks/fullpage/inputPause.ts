export type InputPauseReason = 'command-palette' | 'lightbox' | 'navigation' | 'mobile-toc';

export interface InputPauseToken {
  readonly id: symbol;
  readonly reason: InputPauseReason;
}

const inputPauseTokens = new Map<symbol, InputPauseReason>();

export function acquireInputPause(reason: InputPauseReason): InputPauseToken {
  const token = { id: Symbol(reason), reason };
  inputPauseTokens.set(token.id, token.reason);
  return token;
}

export function releaseInputPause(token: InputPauseToken): void {
  inputPauseTokens.delete(token.id);
}

export function isInputPaused() {
  return inputPauseTokens.size > 0;
}
