import { errors } from "./evlog";

async function readTextWithLimit(
  request: Request,
  maxBytes: number
): Promise<string> {
  const contentLength = Number(request.headers.get("Content-Length"));

  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw errors.badRequest(
      "body",
      `Request body is too large (max ${maxBytes} bytes)`
    );
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return "";
  }

  const decoder = new TextDecoder();
  let size = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw errors.badRequest(
        "body",
        `Request body is too large (max ${maxBytes} bytes)`
      );
    }

    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
}

export async function readJsonObject(
  request: Request,
  maxBytes: number
): Promise<Record<string, unknown>> {
  const text = await readTextWithLimit(request, maxBytes);

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw errors.badRequest("body", "Request body must be valid JSON");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw errors.badRequest("body", "Request body must be a JSON object");
  }

  return body as Record<string, unknown>;
}
