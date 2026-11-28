import { defineCanvasApp } from '../../../src/lib/os/host/app-session';

/** Exercises the production host/session Interface with visible, deterministic controls. */
function application(id: string, title: string, w: number, h: number) {
  return defineCanvasApp({
    id,
    title,
    w,
    h,
    create: () => ({
      field: { text: '', caret: 0 },
      slider: 0.5,
      flash: false,
      status: true,
      details: '',
      sample: undefined as HTMLCanvasElement | undefined,
    }),
    menus: () => ({
      View: [
        { command: 'theme', label: 'Switch theme' },
        { command: 'effect', label: 'Toggle flash' },
        { command: 'status', label: 'Toggle status' },
      ],
    }),
    draw(state, frame, env) {
      if (frame.menuSel?.command === 'theme')
        env.setTheme(env.themeName() === 'std' ? 'phosphor' : 'std');
      if (frame.menuSel?.command === 'effect') state.flash = !state.flash;
      if (frame.menuSel?.command === 'status') state.status = !state.status;
      frame.draw.text('MHK10 中文', 8, 8);
      state.field = frame.widgets.textField('shared-field', 8, 30, 150, 20, state.field, {
        focused: frame.focused,
      });
      state.slider = frame.widgets.hslider('shared-slider', 8, 64, 150, state.slider);
      frame.effects.wordart(title, frame.client.w / 2, 120, 1);
      const raster = (state.sample ??= frame.draw.offscreen(24, 12, (outer) => {
        outer.rect(0, 0, 24, 12, '#ff0000');
        const inner = outer.offscreen(6, 6, (inner) => inner.rect(0, 0, 6, 6, '#0000ff'));
        outer.getCtx().drawImage(inner, 4, 3);
        outer.rect(16, 3, 4, 4, '#ffffff');
      }));
      frame.draw.getCtx().drawImage(raster, frame.client.w - 32, 8);
      const snapshot = frame.effects.snap();
      state.details = `${state.field.text} | ${Math.round(state.slider * 100)} | ${env.themeName()} | ${snapshot.width}×${snapshot.height}`;
      if (state.flash) frame.effects.FX.flash = ['#ffffff', 0.5];
    },
    status: (state) => (state.status ? state.details : undefined),
    dispose(state) {
      if (state.sample) {
        state.sample.width = 0;
        state.sample.height = 0;
      }
      state.sample = undefined;
    },
  });
}

export const APPS = [
  application('notepad', 'Surface A', 340, 250),
  application('calculator', 'Surface B', 430, 290),
];
export async function loadApp(id: string) {
  return APPS.find((app) => app.id === id);
}
