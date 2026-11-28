import { expect, it } from 'vite-plus/test';
import {
  desktopIconArrangement,
  desktopIconGrid,
  desktopIconSlots,
  reflowIconPositions,
  restoreIconPositions,
} from './desktop-icon-layout';
it('recovers complete legacy automatic grids while retaining explicit and partial manual layouts', () => {
  const ids = Array.from({ length: 16 }, (_, index) => `desktop-file:desktop:app:app-${index}`);
  for (const height of [338, 378, 458, 698]) {
    const positions = desktopIconGrid(ids, 1280, height);
    expect(desktopIconArrangement({ version: 1, positions }, ids)).toBe('default');
    expect(desktopIconArrangement({ version: 1, arrangement: 'manual', positions }, ids)).toBe(
      'manual',
    );
    expect(desktopIconArrangement({ version: 1, positions: positions.slice(0, 1) }, ids)).toBe(
      'manual',
    );
    positions[0].x += 7;
    expect(desktopIconArrangement({ version: 1, positions }, ids)).toBe('manual');
  }
  const legacy = desktopIconGrid(ids, 640, 338).map((item) => ({
    ...item,
    id: item.id.replace('desktop-file:desktop:app:', ''),
  }));
  expect(desktopIconArrangement({ version: 1, positions: legacy }, ids)).toBe('default');
  const named = ids.toReversed();
  expect(
    desktopIconArrangement({ version: 1, positions: desktopIconGrid(named, 640, 338) }, ids, named),
  ).toBe('name');
});
it('persists adaptive arrangement separately from sparse manual placement without losing compatibility', () => {
  expect(desktopIconArrangement({ version: 1, arrangement: 'name', positions: [] }, ['a'])).toBe(
    'name',
  );
  expect(desktopIconArrangement({ version: 1, arrangement: 'default', positions: [] }, ['a'])).toBe(
    'default',
  );
  expect(desktopIconArrangement({ version: 2, arrangement: 'manual', positions: [] }, ['a'])).toBe(
    'default',
  );
  expect(
    desktopIconArrangement({ version: 1, positions: [null, { id: 'a', x: Infinity, y: 6 }] }, [
      'a',
    ]),
  ).toBe('manual');
  const ids = Array.from({ length: 16 }, (_, index) => `icon-${index}`);
  const saved = { version: 1, arrangement: 'manual', positions: [{ id: ids[0], x: 350, y: 140 }] };
  const grown = restoreIconPositions(saved, desktopIconGrid(ids, 800, 458), 800, 458);
  expect(grown[0]).toMatchObject({ x: 350, y: 140 });
  expect(grown[6]).toMatchObject({ x: 2, y: 378 });
  const shrunk = restoreIconPositions(saved, desktopIconGrid(ids, 640, 338), 640, 338);
  expect(shrunk[0]).toMatchObject({ x: 350, y: 140 });
  expect(shrunk[6]).toMatchObject({ x: 92, y: 68 });
});
it('paginates overflow instead of stacking items at the right edge', () => {
  const ids = Array.from({ length: 36 }, (_, index) => String(index));
  expect(desktopIconGrid(ids, 640, 338)).toHaveLength(35);
  expect(desktopIconGrid(ids, 640, 338, 1)).toEqual([{ id: '35', x: 2, y: 6, w: 84, h: 58 }]);
});
it('keeps later valid placements and resolves a densely packed manual page without overlap', () => {
  expect(
    reflowIconPositions(
      [
        { id: 'a', x: 700, y: 6 },
        { id: 'b', x: 2, y: 6 },
      ],
      640,
      338,
    ),
  ).toEqual([
    { id: 'a', x: 2, y: 68 },
    { id: 'b', x: 2, y: 6 },
  ]);
  const dense = desktopIconGrid(
    Array.from({ length: 35 }, (_, index) => String(index)),
    640,
    338,
  );
  dense[0].x = 45;
  const result = reflowIconPositions(dense, 640, 338);
  for (const [index, item] of result.entries())
    expect(
      result
        .slice(index + 1)
        .some(
          (other) =>
            item.x < other.x + other.w &&
            item.x + item.w > other.x &&
            item.y < other.y + other.h &&
            item.y + item.h > other.y,
        ),
    ).toBe(false);
});
it('retains valid manual positions and relocates collided icons after a shrink', () => {
  const result = reflowIconPositions(
    [
      { id: 'a', x: 2, y: 6 },
      { id: 'b', x: 700, y: 6 },
      { id: 'c', x: 790, y: 6 },
    ],
    640,
    338,
  );
  expect(result).toEqual([
    { id: 'a', x: 2, y: 6 },
    { id: 'b', x: 2, y: 68 },
    { id: 'c', x: 2, y: 130 },
  ]);
});
it('fills the live height before opening the next column and keeps full labels in bounds', () => {
  const ids = Array.from({ length: 16 }, (_, index) => `icon-${index}`);
  const classic = desktopIconGrid(ids, 640, 338);
  const expanded = desktopIconGrid(ids, 912, 490);
  expect(classic[5]).toMatchObject({ x: 92, y: 6 });
  expect(expanded[5]).toMatchObject({ x: 2, y: 316 });
  expect(expanded[7]).toMatchObject({ x: 92, y: 6 });
  expect(new Set(expanded.map((item) => `${item.x}:${item.y}`)).size).toBe(ids.length);
  expect(expanded.every((item) => item.x + item.w <= 912 && item.y + item.h <= 490)).toBe(true);
});
it('migrates legacy app position keys to the real desktop shortcut identities', () => {
  expect(
    restoreIconPositions({ version: 1, positions: [{ id: 'home', x: 200, y: 140 }] }, [
      { id: 'desktop-file:desktop:app:home', x: 2, y: 6 },
    ]),
  ).toEqual([{ id: 'desktop-file:desktop:app:home', x: 200, y: 140 }]);
});
it.each(['home', 'desktop-file:desktop:app:home'])(
  'reserves the saved position for %s before a newly prepended folder',
  (savedId) => {
    const saved = { version: 1, positions: [{ id: savedId, x: 2, y: 6 }] };
    const reserved = [{ x: 2, y: 68, w: 84, h: 58 }];
    const defaults = [
      { id: 'desktop-folder:new', x: 2, y: 6, w: 84, h: 58 },
      { id: 'desktop-file:desktop:app:home', x: 2, y: 130, w: 84, h: 58 },
    ];
    expect(restoreIconPositions(saved, defaults, 640, 338, reserved)).toEqual([
      { id: 'desktop-folder:new', x: 2, y: 130, w: 84, h: 58 },
      { id: 'desktop-file:desktop:app:home', x: 2, y: 6, w: 84, h: 58 },
    ]);
  },
);
it('restores every page without covering reserved controls after the work area shrinks', () => {
  const ids = Array.from({ length: 36 }, (_, index) => `icon-${index}`);
  const reserved = [
    { x: 560, y: 226, w: 56, h: 100 },
    { x: 498, y: 2, w: 140, h: 25 },
  ];
  const capacity = desktopIconSlots(640, 338, reserved).length;
  const saved = {
    version: 1,
    positions: [
      { id: ids[0], x: 540, y: 240 },
      { id: ids[capacity], x: 510, y: 6 },
      { id: ids[capacity + 1], x: 810, y: 400 },
    ],
  };
  const restored = [];
  for (let page = 0; page < Math.ceil(ids.length / capacity); page++) {
    const items = restoreIconPositions(
      saved,
      desktopIconGrid(ids, 640, 338, page, reserved),
      640,
      338,
      reserved,
    );
    restored.push(...items);
    expect(items.every((item) => item.x + item.w <= 640 && item.y + item.h <= 338)).toBe(true);
    for (const item of items)
      expect(
        reserved.some(
          (area) =>
            item.x < area.x + area.w &&
            item.x + item.w > area.x &&
            item.y < area.y + area.h &&
            item.y + item.h > area.y,
        ),
      ).toBe(false);
  }
  expect(restored.map((item) => item.id)).toEqual(ids);
});
it('restores positions by identity without admitting unknown icons or off-screen values', () => {
  const defaults = [
    { id: 'home', x: 2, y: 6 },
    { id: 'blog', x: 2, y: 68 },
  ];
  expect(
    restoreIconPositions(
      {
        version: 1,
        positions: [
          { id: 'home', x: 900.4, y: -8 },
          { id: 'unknown', x: 40, y: 40 },
          { id: 'blog', x: NaN, y: 10 },
        ],
      },
      defaults,
    ),
  ).toEqual([{ id: 'home', x: 556, y: 0 }, defaults[1]]);
  expect(restoreIconPositions(null, defaults)).toEqual(defaults);
  expect(restoreIconPositions({ version: 2, positions: [] }, defaults)).toEqual(defaults);
});
