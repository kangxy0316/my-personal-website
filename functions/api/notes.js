function withCors(headers = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

async function listNotes(kv, prefix) {
  const listed = await kv.list({ prefix: `${prefix}note:` });
  const keys = listed?.keys ?? [];
  const notes = await Promise.all(
    keys.map(async (k) => {
      const raw = await kv.get(k.name);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    })
  );
  return notes
    .filter((n) => n && typeof n.id === "string")
    .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: withCors() });
  }

  const kv = env.NOTES_KV;
  if (!kv || typeof kv.get !== "function" || typeof kv.put !== "function") {
    return serverErrorResponse("Missing NOTES_KV binding");
  }

  const prefix = await getUserPrefix(request);
  if (!prefix) return unauthorizedResponse();

  if (request.method === "GET") {
    const notes = await listNotes(kv, prefix);
    return jsonResponse({ notes });
  }

  if (request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return badRequestResponse("Invalid JSON body");
    }

    const now = new Date().toISOString();
    const id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`).toString();
    const title = normalizeText(body?.title, 120);
    const content = typeof body?.content === "string" ? body.content : "";
    const attachments = Array.isArray(body?.attachments) ? body.attachments : [];

    const note = {
      id,
      title,
      content,
      attachments,
      createdAt: now,
      updatedAt: now,
    };

    await kv.put(`${prefix}note:${id}`, JSON.stringify(note));
    return jsonResponse({ note }, { status: 201 });
  }

  return new Response("Method Not Allowed", { status: 405, headers: withCors() });
}
