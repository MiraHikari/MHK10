import { AiReplyError, validateEndpoint, type AiRequest, type AiTransport } from './ai-connection';

/** Browser adapter. The SDK is loaded only for a configured online request. */
export function createBrowserAiTransport(fetcher: typeof fetch = fetch): AiTransport {
  const controllers = new Set<AbortController>();
  let disposed = false;
  const cancel = () => {
    controllers.forEach((controller) => controller.abort());
    controllers.clear();
  };
  return {
    cancel,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
    },
    async request(request: AiRequest): Promise<string> {
      if (disposed) throw new AiReplyError('cancelled', 'Request cancelled.');
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (request.signal.aborted) abort();
      request.signal.addEventListener('abort', abort, { once: true });
      controllers.add(controller);
      const safeFetch: typeof fetch = (input, init) =>
        fetcher(input, {
          ...init,
          signal: controller.signal,
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          cache: 'no-store',
        });
      try {
        if (controller.signal.aborted) throw new AiReplyError('cancelled', 'Request cancelled.');
        if (request.config.transport === 'relay') {
          const response = await safeFetch(validateEndpoint(request.config.endpoint), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(request.apiKey ? { Authorization: `Bearer ${request.apiKey}` } : {}),
            },
            body: JSON.stringify({
              model: request.config.model || undefined,
              messages: request.messages,
              stream: false,
              max_tokens: 600,
            }),
          });
          if (!response.ok) throw httpError(response.status);
          const value: unknown = await response.json();
          if (controller.signal.aborted) throw new AiReplyError('cancelled', 'Request cancelled.');
          const data = record(value),
            first = Array.isArray(data.choices) ? record(data.choices[0]) : {};
          const message = record(first.message);
          const reply = typeof message.content === 'string' ? message.content : data.reply;
          if (typeof reply !== 'string' || !reply.trim())
            throw new AiReplyError('response', 'The service returned no text reply.');
          const text = reply.trim().slice(0, 6000);
          request.onText?.(text);
          return text;
        }
        const [{ streamText }, { createOpenAICompatible }] = await Promise.all([
          import('ai'),
          import('@ai-sdk/openai-compatible'),
        ]);
        if (controller.signal.aborted) throw new AiReplyError('cancelled', 'Request cancelled.');
        const provider = createOpenAICompatible({
          name: 'mhk10',
          baseURL: validateEndpoint(request.config.endpoint).replace(/\/$/, ''),
          apiKey: request.apiKey || undefined,
          fetch: safeFetch,
        });
        const result = streamText({
          model: provider.chatModel(request.config.model),
          instructions:
            request.messages
              .filter((message) => message.role === 'system')
              .map((message) => message.content)
              .join('\n\n') || undefined,
          messages: request.messages.filter((message) => message.role !== 'system'),
          abortSignal: controller.signal,
          maxOutputTokens: 600,
          maxRetries: 0,
          // Errors are handled below; provider bodies and request headers are never logged.
          onError: () => {},
        });
        let text = '';
        for await (const part of result.stream) {
          if (part.type === 'error') throw part.error;
          if (part.type === 'abort' || controller.signal.aborted)
            throw new AiReplyError('cancelled', 'Request cancelled.');
          if (part.type === 'text-delta') {
            text = (text + part.text).slice(0, 6000);
            request.onText?.(text);
            if (text.length >= 6000) {
              controller.abort();
              return text;
            }
          }
        }
        if (controller.signal.aborted) throw new AiReplyError('cancelled', 'Request cancelled.');
        if (!text.trim()) throw new AiReplyError('response', 'The service returned no text reply.');
        return text.trim();
      } catch (error) {
        if (controller.signal.aborted) throw new AiReplyError('cancelled', 'Request cancelled.');
        if (error instanceof AiReplyError) throw error;
        const details = record(error);
        if (
          error instanceof SyntaxError ||
          [
            'AI_InvalidResponseDataError',
            'AI_JSONParseError',
            'AI_TypeValidationError',
            'AI_NoOutputGeneratedError',
          ].includes(String(details.name))
        )
          throw new AiReplyError('response', 'The service returned an invalid text response.');
        const status = details.statusCode;
        if (typeof status === 'number') throw httpError(status);
        throw new AiReplyError(
          'connection',
          'Connection failed. Check the service URL and browser CORS permission.',
        );
      } finally {
        request.signal.removeEventListener('abort', abort);
        controllers.delete(controller);
      }
    },
  };
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}
function httpError(status: number): AiReplyError {
  if (status === 401 || status === 403)
    return new AiReplyError('authentication', 'Authentication failed. Check the API key.');
  if (status === 429)
    return new AiReplyError('rate-limit', 'The service rate limit was reached. Try again later.');
  return new AiReplyError('connection', `The service returned HTTP ${status}.`);
}
