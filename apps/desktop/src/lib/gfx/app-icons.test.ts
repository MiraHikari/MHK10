import { describe, expect, it, vi } from 'vite-plus/test';
const defSprite = vi.fn();
import { createAppIcons } from './app-icons';
import { APP_ICON_ART, APP_ICON_IDS, appIconName, APP_ICON_DESKTOP_ART } from './app-icon-art';

const registerAppIcons = createAppIcons({ defSprite });

describe('application canvas icon registration', () => {
  it('registers both caption and desktop art once, using the shared masters', () => {
    registerAppIcons();
    registerAppIcons();
    expect(defSprite).toHaveBeenCalledTimes(APP_ICON_IDS.length * 2);
    for (const id of APP_ICON_IDS) {
      expect(defSprite).toHaveBeenCalledWith(appIconName(id), APP_ICON_ART[id]);
      expect(defSprite).toHaveBeenCalledWith(
        `desktop_${appIconName(id)}`,
        APP_ICON_DESKTOP_ART[id],
      );
    }
  });
});
