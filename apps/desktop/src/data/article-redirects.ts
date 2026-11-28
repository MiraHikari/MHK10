/** Retired publication identities remain aliases; withdrawn bodies are never republished. */
const redirects = [{ from: 'site-update', to: 'colophon' }];

export function redirectedArticlePath(pathname: string): string | undefined {
  const redirect = redirects.find(
    ({ from }) => pathname === `/blog/${from}/` || pathname === `/blog/${from}`,
  );
  return redirect && `/blog/${redirect.to}/`;
}

export function redirectedArticleFileId(id: string): string | undefined {
  const redirect = redirects.find(({ from }) => id === `library:article:${from}`);
  return redirect && `library:article:${redirect.to}`;
}
