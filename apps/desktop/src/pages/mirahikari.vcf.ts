import type { APIRoute } from 'astro';
import { profile } from '../data/profile';
import { serializeContactCard } from '../lib/apps/profile/contact-card-model';

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(serializeContactCard(profile), {
    headers: {
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': 'attachment; filename="MiraHikari.vcf"',
    },
  });
