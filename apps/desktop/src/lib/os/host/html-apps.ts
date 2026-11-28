import type { HtmlApp } from './app-contracts';
import { APP_CATALOG, NON_CANVAS_APPS, appMetadata } from '../../../data/app-catalog';

const registrations = NON_CANVAS_APPS.filter((app) => app.kind === 'html');
export const personalApps = APP_CATALOG.flatMap<HtmlApp>(({ id }) => {
  const app = registrations.find((registration) => registration.id === id);
  return app ? [{ ...appMetadata(app.id), kind: 'html', html: app.route }] : [];
});
export const htmlApps = personalApps;
