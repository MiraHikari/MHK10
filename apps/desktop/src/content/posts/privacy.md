---
title: Privacy
description: What this site stores on your computer, and what is sent elsewhere.
published: 2026-10-16
updated: 2026-10-17
tags: [privacy]
category: 公告
listed: true
comments: false
aiLevel: human
version: 1.1.0
updates:
  - version: 1.1.0
    date: 2026-10-17
    summary: Adds the self-hosted visit counter and the embedded-mode storage note.
  - version: 1.0.0
    date: 2026-10-16
    summary: Records the storage and comment behavior of the current site.
---

This is a personal site. There is no visitor account. The records below stay in this browser and are not uploaded to this site. Clearing this site's data in the browser removes them.

## Visit counts

The site runs a self-hosted Open Kounter counter (`counter.example.com`). When a page opens, the browser asks that service for the visit totals and reports one count. The counter records only how many times a page was opened. It receives no name, no address, no cookies, and builds no profile of you. A timestamp in your browser's localStorage (`kounter-flags` below) keeps repeats within one day from inflating the unique-visitor number. If the request fails, pages work as usual without counts.

## On this computer

| Key                         | Store        | What it holds                                                                                                                                                                                                                        |
| --------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `doom95.theme`              | localStorage | The selected color scheme name.                                                                                                                                                                                                      |
| `doom95.wallpaper.v1`       | localStorage | The wallpaper number.                                                                                                                                                                                                                |
| `doom95.wallpaper.pixel.v1` | localStorage | A pixel wallpaper you drew and saved.                                                                                                                                                                                                |
| `doom95.desktop.v1`         | localStorage | Desktop settings: resolution, volume, sound scheme, reduced motion, pointer, clock, screen saver, startup, window animation, assistant, risk display, pixel-image preference, icons, Quick Launch, and recent commands and programs. |
| `doom95.desktop-icons.v1`   | localStorage | Desktop icon positions.                                                                                                                                                                                                              |
| `doom95.pixelScale`         | localStorage | Whether the picture is scaled by whole pixels.                                                                                                                                                                                       |
| `doom95.crt`                | localStorage | Whether scanlines are shown.                                                                                                                                                                                                         |
| `doom95.doom`               | localStorage | The current story meter value.                                                                                                                                                                                                       |
| `doom95.story.v1`           | localStorage | The story checkpoint.                                                                                                                                                                                                                |
| `doom95.files.v1`           | localStorage | Folders, text, and shortcuts you created on this computer.                                                                                                                                                                           |
| `doom95.diary.v1`           | localStorage | The old diary key. When read, it is moved into the file records.                                                                                                                                                                     |
| `doom95.associations.v1`    | localStorage | File open-with choices.                                                                                                                                                                                                              |
| `doom95.reader.v2`          | localStorage | Reading position, layout, bookmarks, highlights, and notes.                                                                                                                                                                          |
| `doom95.ai.connection.v1`   | localStorage | A chat service address and model you entered. An API key is stored here only if you choose to remember it. The service is off by default, and the key is not remembered by default.                                                  |
| `kounter-flags`             | localStorage | Timestamps of the last counted visit, used to keep the unique-visitor number honest within one day.                                                                                                                                  |
| `doom95.assets.v1`          | IndexedDB    | Binary contents of files you saved on this computer.                                                                                                                                                                                 |
| `giscus-session`            | localStorage | A Giscus session token written after you sign in with GitHub to comment. It is absent until you do that.                                                                                                                             |

## Comments

Article discussions and the friend-link discussion use Giscus. They are stored as GitHub Discussions in the repository `example-user/blog-comments`. The frame is loaded from `https://giscus.app` only after you open Discussion.

A comment is not submitted through a form on this site. Posting uses your GitHub account. The frame shows that account's login and public display name, and the text you write. GitHub reactions are available there. Do not put passwords, keys, tokens, email addresses, or other secrets in a comment.

GitHub keeps a discussion until you or the repository maintainer deletes it. Clearing this site's data removes the local `giscus-session` token. It does not delete a comment that was already posted. Giscus and GitHub may set their own cookies when you sign in or post.

## Contact and chat

Copying the email address, opening a mail program, and downloading the contact card all happen on your computer. This site does not receive those actions. Questions can be sent to mirahikari@example.com.

Desktop chat stays off until you enter a service address and send a message. That message, and a key if you chose to remember one, go only to the address you entered. This site does not collect the conversation.

## What this site does not do

Pictures, fonts, and icons are files served with this site. There is no advertising. The only analytics is the self-hosted visit counter described above. Another website opens only when you follow a link.

When the site is shown inside the portfolio site (www.example.com), some browsers keep a separate storage partition for that embedded view. Desktop settings you change there may not carry over to visiting this site directly. The choice between the two sites is remembered by the portfolio site, in its own storage.
