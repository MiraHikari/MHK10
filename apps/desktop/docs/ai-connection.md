# Assistant and optional AI connection

Open **Chat** from its desktop icon, Start > Programs, or the paperclip. The
assistant answers desktop and public-content questions in English or Chinese
without a network connection. Open **Guide** for **Projects**, **Skills**,
**Reading**, **Files**, **Story** and **Help**. These buttons always answer
locally, even in Online mode. The guide uses the authored profile, projects and
article library. Story questions get short, stage-appropriate remarks without
changing the story or reading visitor files.

Explicit requests such as `open blog`, `open profile`, `open notepad` and
`请帮我打开计算器。` propose a registered application. A system dialog asks before
opening it. Cancel, Escape and closing the dialog release the request so another
question can be sent. Model replies remain plain text and cannot launch apps.

Type directly in **Message** on both the desktop and standalone Chat page. Use
**Send** or Enter after completing any input-method composition. Pressing Enter
to choose a Chinese input-method candidate does not send the message. Switching
between guide and online modes keeps the draft. The Desk log starts at the first
line of a completed long reply. The mouse wheel, scroll arrows and draggable
scrollbar let visitors read earlier messages without being pulled away when a
new reply arrives.

**Edit > Copy latest reply** and **Copy transcript** copy text for pasting into
Notepad or another application. **Edit > Paste into message** or Ctrl+V inserts
clipboard text into the selected Chat input without sending it. When browser
clipboard access is unavailable, copying and pasting within MHK10 use the current
session's text copy. **File > Save transcript** stores a local file in
My Documents; **Save transcript as...** chooses its name and folder.
**Export transcript...** downloads the complete conversation as a `.txt` file.
Drawing never discards earlier messages. A conversation above the local file
limit of 20,000 characters offers copy/export instead of silently saving a
truncated transcript. Minimizing keeps the session; save, copy or export what
you need before closing Chat. **File > Clear conversation** asks before removing
the current session's messages. It does not delete saved or exported copies.

## Configure and verify a connection

Every new Chat starts in **Desktop guide**, even if a service is already enabled.
To send a question to the service, explicitly select **Online · host** in Chat.
Enabling a connection, asking an unrecognized local question or changing
services never switches Chat to Online. **Connection** or **File > Connection**
opens the configuration. Select **OpenAI compatible** and supply a base URL and
model ID. The browser adapter uses pinned Vercel AI SDK packages
`ai@7.0.128` and `@ai-sdk/openai-compatible@3.0.63` for streamed text responses.

The base URL is the provider's compatible API root, for example a local service's
`http://localhost:1234/v1`. Model IDs are supplied by the user. The service must
support the compatible chat-completions API and permit requests from the site's
origin. This does not claim native support for unrelated provider protocols.

The API-key field is masked. Keys remain in memory unless the user explicitly
selects **Remember key**. Session-key connections reload disabled. Changing the
service clears the retained key. The public configuration, transcript exports,
status messages and errors do not expose the key. Enablement has one confirmation
showing the destination and what will be sent.

After enabling, **Test connection** sends a fixed, short diagnostic using the
confirmed settings. It does not send a chat transcript or documents. The result
shows the selected model, or a specific failure such as authentication, rate
limit, missing text or browser CORS access. Edited settings must be enabled and
confirmed before testing. **Stop test**, changing settings, Work Offline,
clearing the key or closing the window cancels a running test. Tests time out
after 20 seconds.

Streaming text stays plain text. **Stop** and switching to **Desktop guide**
cancel the request and keep any text already received; closing or changing
configuration also cancels pending work. Authentication, rate-limit, connection
and malformed-response errors are classified without displaying raw server
responses. The earlier full-URL relay remains a separate **Legacy relay** mode
so saved connections stay compatible.

Failed questions receive a local fallback. **Retry** or **Edit > Retry online
question** resends the last failed or stopped question while Online. A
configuration change resets Chat to Desktop guide and clears the retry and
online context. Only the current online question, recent completed online turns
and public site context go to the selected service. Offline conversations,
local guide answers, credentials for other services, and visitor files and
story state are not included in messages to the model.

The pure `AiConnection` owns configuration and request lifetime; browser I/O and
SDK imports live in `src/lib/os/ai/browser-ai-transport.ts`. Tests use a real controlled local
HTTP/CORS/SSE endpoint and cover the custom model, authorization header, streaming,
cancellation, consent, verification, retries and sanitized failures. Chat session
tests cover guide buttons, confirmation cancellation, long history, scroll
position, copying, exports, save failures and delayed callbacks. No external vendor credentials were
supplied or used during verification.
