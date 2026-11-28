import type { Renderer } from '../../gfx/context';
import type { InputScope } from './input';
import { C } from '../../gfx/palette';

/** L1 commands share DOS metrics, yellow hotkeys and one input/disabled policy. */
export function textCommand(
  frame: { draw: Renderer; input: InputScope },
  label: string,
  key: string | undefined,
  x: number,
  y: number,
  focused: boolean,
  disabled = false,
): boolean {
  const width = frame.draw.tw(label, 'dos') + 12;
  const target = frame.input.hit(x, y - 4, width, 17);
  if (target.hover && !disabled) frame.draw.rect(x, y - 4, width, 17, C.aqua);
  frame.draw.text(label, x + 6, y, {
    font: 'dos',
    color: disabled ? C.aqua : target.hover ? C.navy : C.yellow,
  });
  return (
    !disabled &&
    (target.clicked ||
      (focused &&
        key !== undefined &&
        (frame.input.io.keyPressed.has(key) || frame.input.io.keyPressed.has(key.toLowerCase()))))
  );
}
