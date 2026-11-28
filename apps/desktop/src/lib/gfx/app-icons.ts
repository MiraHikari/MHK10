import type { Sprites } from './sprites';
import { APP_ICON_ART, APP_ICON_IDS, appIconName, APP_ICON_DESKTOP_ART } from './app-icon-art';
export function createAppIcons(sprites: Pick<Sprites, 'defSprite'>) {
  let registered = false;
  return function registerAppIcons(): void {
    if (registered) return;
    for (const id of APP_ICON_IDS) {
      const name = appIconName(id);
      sprites.defSprite(name, APP_ICON_ART[id]);
      sprites.defSprite(`desktop_${name}`, APP_ICON_DESKTOP_ART[id]);
    }
    registered = true;
  };
}
export { appIconName, appIconUrl } from './app-icon-art';
