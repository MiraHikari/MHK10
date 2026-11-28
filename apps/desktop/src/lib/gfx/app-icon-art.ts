// React95 source icons are transformed once to the shared 16-colour palette.
import { REACT95_ICONS, APP_ICON_SOURCES } from './react95-icon-data';

export type AppIconId = keyof typeof APP_ICON_SOURCES;
export const APP_ICON_IDS = Object.keys(APP_ICON_SOURCES) as AppIconId[];
export const APP_ICON_ART = Object.fromEntries(
  APP_ICON_IDS.map((id) => [id, REACT95_ICONS[APP_ICON_SOURCES[id]].small]),
) as Record<AppIconId, string>;
export const APP_ICON_DESKTOP_ART = Object.fromEntries(
  APP_ICON_IDS.map((id) => [id, REACT95_ICONS[APP_ICON_SOURCES[id]].large]),
) as Record<AppIconId, string>;
export const appIconStem = (id: string): string => id.replace(/^\$/, '');
export const appIconName = (id: string): string => `app_${appIconStem(id)}`;
export const appIconUrl = (id: string, size = 16): string =>
  `/icons/app-${appIconStem(id)}${size > 20 ? '-32' : ''}.svg`;
export function iconUrl(name: string, size = 16): string {
  const known = name.startsWith('app-')
    ? APP_ICON_IDS.some((id) => appIconStem(id) === name.slice(4))
    : name in REACT95_ICONS;
  return `/icons/${known ? name : 'exe'}${size > 20 ? '-32' : ''}.svg`;
}
