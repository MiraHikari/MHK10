import { REACT95_ICONS } from './react95-icon-data';

export const DESKTOP_ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(REACT95_ICONS).map(([name, icon]) => [name, icon.large]),
);
