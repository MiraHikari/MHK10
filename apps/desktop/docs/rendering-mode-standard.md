# Rendering mode standard

Every new MHK10 surface chooses its rendering mode from the content and
interaction contract. The choice is recorded in the application registration
(`desktop: ['canvas']`, `['hybrid']`, or both) and is reviewed alongside its
tests.

## Canvas first for compact system tools

Use Canvas when a surface is a small, immediate-mode utility whose value comes
from the 640x360 desktop rather than searchable document content. Canvas is the
right default for:

- desktop chrome, taskbar, Start and window management;
- clocks, calculators, games, diagnostics and other bounded tools;
- pixel art, animations and interactions that must obey integer coordinates,
  thresholded text, dithering and the 16-colour system palette.

Canvas applications expose a typed `defineCanvasApp` session. State and domain
logic stay outside the renderer; drawing and hit testing use the shared geometry
and input interfaces. A simple tool should not grow a DOM façade merely to
avoid writing a small Canvas view.

## Hybrid HTML for content and semantics

Use the hybrid route when the surface benefits from HTML's document model:

- personal pages, articles, galleries and other SEO or deep-link content;
- long text, headings, links, forms, tables, trees and native selection;
- accessibility semantics, browser find/print, responsive layouts or native
  mobile input.

These pages remain independently addressable Astro routes with server-rendered
metadata and canonical URLs. When opened from the desktop, the same route is
embedded by `src/lib/os/windows/html-windows.ts`; the bridge validates origin, source window and
registered application identity before forwarding actions.

## Mixed windows

An application may register both modes when the desktop shell needs a Canvas
window while its public route needs SEO-friendly HTML. Keep one domain model and
two composition adapters: the Canvas host owns the session, and the HTML host
owns DOM enhancement and native controls. Do not duplicate file, document,
story or association rules in a page script.

The iframe is a client surface, not a second desktop. It must not draw shell
chrome, access browser globals from pure modules, or send arbitrary executable
messages. Shared hybrid controls use the Canvas palette and integer metrics so a
window still reads as MHK10 when embedded.

## Decision and review checklist

1. Identify whether the primary output is a bounded tool state or addressable
   content. Tool state selects Canvas; content selects hybrid HTML.
2. List required semantics: headings, links, forms, text selection, browser
   find/print, accessibility and SEO are strong HTML signals.
3. List pixel constraints: immediate animation, strict integer geometry and
   16-colour rendering are strong Canvas signals.
4. If both lists matter, register both modes and share the pure model instead of
   making either host reach into the other.
5. Test the chosen mode through its public interface. Canvas scenarios use real
   logical-coordinate input; HTML scenarios inspect rendered semantics,
   navigation and keyboard behavior.

The mode decision is part of the application contract, not an afterthought. A
later redesign may change the registration, but it must preserve public routes,
storage keys and the shared model's observable behavior.
