function withCors(headers = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    ...headers,
  };
}

function jsonResponse(payload, init = {}) {
  const headers = withCors({
    "Content-Type": "application/json; charset=utf-8",
    ...(init.headers ?? {}),
  });
  return new Response(JSON.stringify(payload), { ...init, headers });
}

function unauthorizedResponse() {
  return jsonResponse({ error: "Unauthorized" }, { status: 401 });
}

function badRequestResponse(message) {
  return jsonResponse({ error: message }, { status: 400 });
}

function notFoundResponse() {
  return jsonResponse({ error: "Not Found" }, { status: 404 });
}

function serverErrorResponse(message) {
  return jsonResponse({ error: message }, { status: 500 });
}

function getBearerToken(request) {
  const value = request.headers.get("Authorization");
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)\s*$/i);
  return match ? match[1] : null;
}

function normalizeText(value, maxLen) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function isIsoDateString(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

async function sha256Hex(text) {
  const encoded = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const bytes = new Uint8Array(hashBuffer);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

async function getUserPrefix(request) {
  const token = (getBearerToken(request) ?? "").trim();
  if (!token) return null;
  const hash = await sha256Hex(token);
  return `u:${hash}:`;
}

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: withCors() });
  }

  const kv = env.NOTES_KV;
  if (!kv || typeof kv.get !== "function" || typeof kv.put !== "function") {
    return serverErrorResponse("Missing NOTES_KV binding");
  }

  const prefix = await getUserPrefix(request);
  if (!prefix) return unauthorizedResponse();

  const id = String(params?.id ?? "").trim();
  if (!id) return badRequestResponse("Missing note id");
  const key = `${prefix}note:${id}`;

  if (request.method === "GET") {
    const raw = await kv.get(key);
    if (!raw) return notFoundResponse();
    try {
      const note = JSON.parse(raw);
      return jsonResponse({ note });
    } catch {
      return serverErrorResponse("Corrupted note data");
    }
  }

  if (request.method === "PUT") {
    let body;
    try {
      body = await request.json();
    } catch {
      return badRequestResponse("Invalid JSON body");
    }

    const now = new Date().toISOString();
    const existingRaw = await kv.get(key);
    let existing = null;
    if (existingRaw) {
      try {
        existing = JSON.parse(existingRaw);
      } catch {
        existing = null;
      }
    }

    const title = normalizeText(body?.title, 120);
    const content = typeof body?.content === "string" ? body.content : "";
    const attachments = Array.isArray(body?.attachments) ? body.attachments : [];

    const createdAt =
      (existing && isIsoDateString(existing.createdAt) && existing.createdAt) ||
      (isIsoDateString(body?.createdAt) && body.createdAt) ||
      now;

    const note = {
      id,
      title,
      content,
      attachments,
      createdAt,
      updatedAt: now,
    };

    await kv.put(key, JSON.stringify(note));
    return jsonResponse({ note });
  }

  if (request.method === "DELETE") {
    if (typeof kv.delete !== "function") {
      return serverErrorResponse("KV delete is not supported");
    }
    await kv.delete(key);
    return jsonResponse({ ok: true });
  }

  return new Response("Method Not Allowed", { status: 405, headers: withCors() });
}
