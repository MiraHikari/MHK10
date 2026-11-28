interface ContactSource {
  readonly name: string;
  readonly url: string;
  readonly description: string;
  readonly group?: string;
}

interface DirectoryContact {
  readonly name: string;
  readonly url: string;
  readonly description: string;
  readonly host: string;
}

/** Three records fit one desktop directory page without scrolling. */
const DIRECTORY_LIMIT = 3;

export function directoryContacts(authored: readonly ContactSource[]): DirectoryContact[] {
  const contacts: DirectoryContact[] = [];
  const addresses = new Set<string>();
  for (const friend of authored) {
    if (contacts.length === DIRECTORY_LIMIT) break;
    if (friend.group !== 'close' || !URL.canParse(friend.url)) continue;
    const address = new URL(friend.url);
    if (address.protocol !== 'https:' && address.protocol !== 'http:') continue;
    if (address.username || address.password || addresses.has(address.href)) continue;
    addresses.add(address.href);
    contacts.push({
      name: friend.name,
      url: friend.url,
      description: friend.description,
      host: address.hostname.replace(/^www\./, ''),
    });
  }
  return contacts;
}
