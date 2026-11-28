# Security policy

## Supported configuration

Security fixes target the repository as it builds and runs out of the box:

- Both static Astro applications, `apps/general` and `apps/desktop`, as served
  from their documented static outputs.
- The `mhk-fusion` postMessage protocol between the general site host and the
  embedded desktop (`packages/site-core/src/fusion`).
- The general site's `/admin` editor and its write allowlist over
  `packages/site-core/content`.

Older revisions and heavily modified forks are not supported.

## Reporting a vulnerability

Please report vulnerabilities privately — do not open a public issue for
security problems.

1. Preferred: open a private
   [GitHub Security Advisory](https://github.com/MiraHikari/MHK10/security/advisories/new).
2. Alternatively, email **`security@example.com`**.

> **Maintainers:** `security@example.com` is a placeholder. Replace it with a
> monitored address before publishing your own fork, and keep the advisory link
> pointed at your repository.

Include a description of the issue, the affected app or module, reproduction
steps and, if possible, a minimal proof of concept.

## Scope

In scope:

- Cross-origin trust in the fusion protocol (origin checks, window identity,
  message validation) in both directions.
- The `/admin` write allowlist and its GitHub-backed write path.
- Storage key handling, reading-data sync and the comment/counter
  integrations against cross-site misuse.
- XSS or injection paths reachable from rendered authored content or visitor
  input.

Out of scope:

- The content of visitor-local storage (`localStorage`, IndexedDB): it is the
  visitor's own data, by design, and never leaves the browser.
- Misconfiguration of self-hosted services (object storage, counter, comments,
  hosting/CDN) by a deployer who forked this repository.
- Reports about the fictional desktop story or in-app fictional content.

## Response expectations

- Acknowledgement within **7 days** of the report.
- An assessment and a remediation plan as soon as practical after that.
- Credit is offered by default; tell us if you prefer to stay anonymous.
