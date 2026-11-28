import {
  blogPostingJsonLd,
  breadcrumbJsonLd,
  type JsonLdPerson,
} from '@mhk/site-core/content-model/json-ld';
import { profile } from '@/data/profile';
import { SITE_ORIGIN } from '@/data/site-origin';
import { canonicalUrl } from '@/lib/canonical-url';
import { resolveImageSrc } from '@/lib/images/url';
import { blogArticlePageTitle, blogIndexPageTitle, blogTagPageTitle } from '@/lib/page-title';
import { aiLevelLabel } from './ai';
import { blogIndexUrl, postUrl } from './client';
import { BLOG_LICENSE, copyrightLine } from './legal';
import type { Post } from './types';

export interface BlogHead {
  title: string;
  description: string;
  canonical: string;
  type: 'website' | 'article';
  image: string;
  keywords: string[];
  publishedTime?: string;
  modifiedTime?: string;
  authors: string[];
  tags: string[];
  jsonLd: Record<string, unknown>[];
}

const BLOG_DESCRIPTION = `${profile.name}'s Blog：关于工程、设计与创造的过程记录。`;
const person = (name: string): JsonLdPerson => ({ '@type': 'Person', name, url: SITE_ORIGIN });
const socialImage = (image = '/images/og/default.webp') =>
  new URL(resolveImageSrc(image), SITE_ORIGIN).href;

function breadcrumbs(name: string, canonical: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    ...breadcrumbJsonLd([
      { name: '首页', item: canonicalUrl('/') },
      { name: 'Blog', item: blogIndexUrl() },
      { name, item: canonical },
    ]),
  };
}

export function articleHead(article: Post): BlogHead {
  const canonical = postUrl(article.id);
  const image = socialImage(article.heroImage);
  return {
    title: blogArticlePageTitle(article.title),
    description: article.description,
    canonical,
    type: 'article',
    image,
    keywords: [...article.tags],
    publishedTime: article.publishedTimeISO,
    modifiedTime: article.modifiedTimeISO,
    authors: [article.author],
    tags: [...article.tags],
    jsonLd: [
      {
        '@context': 'https://schema.org',
        ...blogPostingJsonLd({
          headline: article.title,
          description: article.description,
          datePublished: article.publishedTimeISO,
          dateModified: article.modifiedTimeISO,
          image: [image],
          url: canonical,
          mainEntityOfPage: canonical,
          author: person(article.author),
          publisher: person(profile.name),
          keywords: article.tags.join(', '),
          articleSection: article.category,
          license: BLOG_LICENSE.url,
          copyrightYear: new Date(article.publishedTimeISO).getUTCFullYear(),
          copyrightHolder: { '@type': 'Person', name: article.author },
          copyrightNotice: `${copyrightLine()}，采用 ${BLOG_LICENSE.id} 许可（${BLOG_LICENSE.url}）`,
          creditText:
            article.aiLevel !== 'human'
              ? `创作来源：${aiLevelLabel(article.aiLevel, article.aiModel)}`
              : undefined,
        }),
      },
      breadcrumbs(article.title, canonical),
    ],
  };
}

function blogSchema(articles: readonly Post[], canonical: string, description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': canonical,
    name: `${profile.name} · Blog`,
    description,
    url: canonical,
    author: person(profile.name),
    blogPost: articles
      .filter((article) => article.listed !== false)
      .slice(0, 12)
      .map((article) =>
        blogPostingJsonLd({
          headline: article.title,
          description: article.description,
          datePublished: article.publishedTimeISO,
          url: postUrl(article.id),
        }),
      ),
  };
}

export function blogIndexHead(articles: readonly Post[]): BlogHead {
  const canonical = blogIndexUrl();
  return {
    title: blogIndexPageTitle(),
    description: BLOG_DESCRIPTION,
    canonical,
    type: 'website',
    image: socialImage(),
    keywords: [],
    authors: [profile.name],
    tags: [],
    jsonLd: [blogSchema(articles, canonical, BLOG_DESCRIPTION)],
  };
}

export function blogTagHead(tag: string, articles: readonly Post[]): BlogHead {
  const filtered = articles.filter(
    (article) => article.listed !== false && article.tags.includes(tag),
  );
  const canonical = canonicalUrl(`/blog/tag/${encodeURIComponent(tag)}/`);
  const description = `标签 #${tag} —— ${profile.name} 博客中标记为「${tag}」的 ${filtered.length} 篇文章`;
  const head = blogIndexHead(filtered);
  return {
    ...head,
    title: blogTagPageTitle(tag),
    description,
    canonical,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: blogTagPageTitle(tag),
        description,
        url: canonical,
        mainEntity: blogSchema(filtered, canonical, description),
      },
      breadcrumbs(`#${tag}`, canonical),
    ],
  };
}
