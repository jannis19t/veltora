const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});
const cookie = (name, value, options = {}) => `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax${options.maxAge ? `; Max-Age=${options.maxAge}` : ""}${options.secure === false ? "" : "; Secure"}`;
const getCookie = (request, name) => {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
};

function cors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  return new Response(response.body, { status: response.status, headers });
}

class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

async function discordMember(request, env, withRoles) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new ApiError("Nepřihlášený uživatel", 401);
  const token = auth.slice(7);
  const response = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new ApiError("Discord token není platný nebo uživatel není na serveru", 401);
  const user = await response.json();
  let roles = [];
  let name = user.global_name || user.username;
  if (withRoles) {
    const memberResponse = await fetch(`https://discord.com/api/users/@me/guilds/${env.GUILD_ID}/member`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (memberResponse.status === 429) throw new ApiError("Discord je dočasně přetížený. Zkus to za chvíli znovu.", 429);
    if (!memberResponse.ok) throw new ApiError("Uživatel není na Discord serveru", 401);
    const member = await memberResponse.json();
    roles = member.roles || [];
    name = member.nick || name;
  }

  async function createSession(env, code, redirectUri) {
    if (!env.DISCORD_CLIENT_SECRET) throw new ApiError("DISCORD_CLIENT_SECRET není nastavený", 500);
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri
      })
    });
    if (!tokenResponse.ok) throw new ApiError("Discord OAuth přihlášení selhalo", 401);
    const tokens = await tokenResponse.json();
    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    if (!userResponse.ok) throw new ApiError("Discord uživatele se nepodařilo načíst", 401);
    const user = await userResponse.json();
    const memberResponse = await fetch(`https://discord.com/api/users/@me/guilds/${env.GUILD_ID}/member`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    if (!memberResponse.ok) throw new ApiError("Uživatel není na Discord serveru", 401);
    const member = await memberResponse.json();
    const id = crypto.randomUUID();
    const name = member.nick || user.global_name || user.username;
    const admin = Array.isArray(member.roles) && member.roles.includes(env.ADMIN_ROLE_ID) ? 1 : 0;
    await env.DB.prepare("INSERT INTO auth_sessions (id, discord_id, name, admin, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, user.id, name, admin, tokens.access_token, tokens.refresh_token, Math.floor(Date.now() / 1000) + tokens.expires_in).run();
    return { id, name, admin: Boolean(admin) };
  }

  async function refreshSession(env, session) {
    if (session.expires_at > Math.floor(Date.now() / 1000) + 60) return session;
    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: session.refresh_token
      })
    });
    if (!response.ok) throw new ApiError("Přihlášení vypršelo. Přihlas se přes Discord znovu.", 401);
    const tokens = await response.json();
    const expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;
    await env.DB.prepare("UPDATE auth_sessions SET access_token = ?, refresh_token = ?, expires_at = ? WHERE id = ?")
      .bind(tokens.access_token, tokens.refresh_token || session.refresh_token, expiresAt, session.id).run();
    return Object.assign({}, session, { access_token: tokens.access_token, refresh_token: tokens.refresh_token || session.refresh_token, expires_at: expiresAt });
  }

  async function ensureSessions(env) {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS auth_sessions (id TEXT PRIMARY KEY, discord_id TEXT NOT NULL, name TEXT NOT NULL, admin INTEGER NOT NULL DEFAULT 0, access_token TEXT NOT NULL, refresh_token TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()))").run();
  }
  return {
    id: user.id,
    name: name,
    admin: Array.isArray(roles) && roles.includes(env.ADMIN_ROLE_ID)
  };
}

async function requireUser(request, env, admin = false, withRoles = admin) {
  const sessionId = getCookie(request, "velora_session");
  if (sessionId) {
    const session = await env.DB.prepare("SELECT * FROM auth_sessions WHERE id = ?").bind(sessionId).first();
    if (!session) throw new ApiError("Přihlášení vypršelo. Přihlas se přes Discord znovu.", 401);
    const current = await refreshSession(env, session);
    const user = { id: current.discord_id, name: current.name, admin: Boolean(current.admin) };
    if (admin && !user.admin) throw new ApiError("Nemáš oprávnění administrátora", 403);
    return user;
  }
  const user = await discordMember(request, env, withRoles);
  if (admin && !user.admin) throw new ApiError("Nemáš oprávnění administrátora", 403);
  return user;
}

function product(row) {
  return { id: row.id, n: row.name, c: row.category, p: row.price };
}

async function notifyDiscord(env, type, data, requestUrl) {
  const webhookUrl = type === "order"
    ? env.ORDERS_WEBHOOK_URL
    : data.type === "Stížnost" ? env.COMPLAINTS_WEBHOOK_URL : env.REQUESTS_WEBHOOK_URL;
  if (!webhookUrl) throw new Error("Discord webhook není nastavený");
  const siteUrl = env.PUBLIC_URL || new URL(requestUrl).origin;
  const content = type === "order"
    ? `📦 **Nová objednávka ${data.id}**\nZákazník: ${data.by}\nPoložky: ${data.items}\nCelkem: ${data.total}\n\nOtevřít administraci: ${siteUrl}`
    : data.type === "Stížnost"
      ? `⚠️ **Nová stížnost ${data.id}**\nJméno: ${data.name}\nČíslo objednávky: ${data.phone}\nPopis: ${data.msg}\n\nOtevřít administraci: ${siteUrl}`
      : `🤝 **Nová žádost o spolupráci**\nJméno: ${data.name}\nTyp: ${data.type}\nKontakt: ${data.phone}\n\nOtevřít administraci: ${siteUrl}`;
  const response = await fetch(`${webhookUrl}?wait=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content })
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Discord zpráva selhala (${response.status}): ${details}`);
  }
}

async function notifyDecision(env, data) {
  return;
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, "");
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (path.startsWith("auth/")) await ensureSessions(env);

  if (request.method === "GET" && path === "auth/login") {
    const redirectUri = `${env.PUBLIC_URL.replace(/\/$/, "")}/api/auth/callback`;
    const state = crypto.randomUUID();
    const location = `https://discord.com/oauth2/authorize?client_id=${env.CLIENT_ID}&response_type=code&scope=${encodeURIComponent("identify guilds.members.read")}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    return new Response(null, { status: 302, headers: { Location: location, "Set-Cookie": cookie("velora_oauth_state", state) } });
  }

  if (request.method === "GET" && path === "auth/callback") {
    const url = new URL(request.url);
    if (!url.searchParams.get("code") || url.searchParams.get("state") !== getCookie(request, "velora_oauth_state")) throw new ApiError("Neplatný OAuth návrat", 400);
    const redirectUri = `${env.PUBLIC_URL.replace(/\/$/, "")}/api/auth/callback`;
    const session = await createSession(env, url.searchParams.get("code"), redirectUri);
    const headers = new Headers({ Location: env.PUBLIC_URL });
    headers.append("Set-Cookie", cookie("velora_session", session.id));
    headers.append("Set-Cookie", cookie("velora_oauth_state", "", { maxAge: 0 }));
    return new Response(null, { status: 302, headers });
  }

  if (request.method === "GET" && path === "auth/me") {
    const user = await requireUser(request, env, false);
    return json(user);
  }

  if (request.method === "POST" && path === "auth/logout") {
    const id = getCookie(request, "velora_session");
    if (id) await env.DB.prepare("DELETE FROM auth_sessions WHERE id = ?").bind(id).run();
    return new Response(null, { status: 204, headers: { "Set-Cookie": cookie("velora_session", "", { maxAge: 0 }) } });
  }

  if (request.method === "GET" && path === "products") {
    const rows = await env.DB.prepare("SELECT id, name, category, price FROM products ORDER BY id").all();
    return json(rows.results.map(product));
  }

  if (request.method === "POST" && path === "products") {
    await requireUser(request, env, true);
    const body = await request.json();
    if (!body.n || !body.c || !Number.isInteger(body.p) || body.p < 0) return json({ error: "Neplatný produkt" }, 400);
    const result = await env.DB.prepare("INSERT INTO products (name, category, price) VALUES (?, ?, ?) RETURNING id, name, category, price")
      .bind(String(body.n).trim(), String(body.c).trim(), body.p).first();
    return json(product(result), 201);
  }

  if (request.method === "DELETE" && path.startsWith("products/")) {
    await requireUser(request, env, true);
    const id = Number(path.split("/")[1]);
    if (!Number.isInteger(id)) return json({ error: "Neplatné ID" }, 400);
    await env.DB.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
    return new Response(null, { status: 204 });
  }

  if (request.method === "POST" && path === "order") {
    const user = await requireUser(request, env, false, true);
    const body = await request.json();
    if (!body.id || !body.items || !Number.isFinite(body.total)) return json({ error: "Neplatná objednávka" }, 400);
    await env.DB.prepare("INSERT INTO orders (id, discord_id, customer_name, items, total) VALUES (?, ?, ?, ?, ?)")
      .bind(body.id, user.id, user.name, body.items, body.total).run();
    let discordNotified = true;
    try { await notifyDiscord(env, "order", body, request.url); } catch (_) { discordNotified = false; }
    return json({ ok: true, discordNotified }, 201);
  }

  if (request.method === "GET" && path === "orders") {
    const user = await requireUser(request, env, false, true);
    const rows = user.admin
      ? await env.DB.prepare("SELECT id, discord_id AS uid, customer_name AS by, items, total, status, created_at AS date FROM orders ORDER BY created_at DESC").all()
      : await env.DB.prepare("SELECT id, discord_id AS uid, customer_name AS by, items, total, status, created_at AS date FROM orders WHERE discord_id = ? ORDER BY created_at DESC").bind(user.id).all();
    return json(rows.results);
  }

  if (request.method === "POST" && path === "order-status") {
    await requireUser(request, env, true);
    const body = await request.json();
    if (!body.id || !body.status) return json({ error: "Neplatný stav objednávky" }, 400);
    await env.DB.prepare("UPDATE orders SET status = ? WHERE id = ?").bind(body.status, body.id).run();
    return json({ ok: true });
  }

  if (request.method === "GET" && path === "requests") {
    const user = await requireUser(request, env);
    const rows = user.admin
      ? await env.DB.prepare("SELECT id, discord_id AS uid, name, type, phone, message AS msg, status FROM collaboration_requests ORDER BY created_at DESC").all()
      : await env.DB.prepare("SELECT id, discord_id AS uid, name, type, phone, message AS msg, status FROM collaboration_requests WHERE discord_id = ? ORDER BY created_at DESC").bind(user.id).all();
    return json(rows.results);
  }

  if (request.method === "POST" && path === "request-decision") {
    await requireUser(request, env, true);
    const body = await request.json();
    if (!body.id || !body.status) return json({ error: "Neplatný stav žádosti" }, 400);
    await env.DB.prepare("UPDATE collaboration_requests SET status = ? WHERE id = ?").bind(body.status, body.id).run();
    return json({ ok: true });
  }

  if (request.method === "POST" && path === "decision") {
    await requireUser(request, env, true);
    const body = await request.json();
    await notifyDecision(env, body);
    return json({ ok: true });
  }

  if (request.method === "POST" && path === "request") {
    let user = null;
    try { user = await requireUser(request, env); } catch (_) { }
    const body = await request.json();
    if (!body.name || !body.type || !body.phone || !body.msg) return json({ error: "Neplatná žádost" }, 400);
    await env.DB.prepare("INSERT INTO collaboration_requests (id, discord_id, name, type, phone, message) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(body.id, user ? user.id : null, body.name, body.type, body.phone, body.msg).run();
    let discordNotified = true;
    try { await notifyDiscord(env, "request", body, request.url); } catch (_) { discordNotified = false; }
    return json({ ok: true, discordNotified }, 201);
  }

  return json({ error: "Endpoint nenalezen" }, 404);
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/") || url.pathname === "/api") return cors(await handleApi(request, env));
      return env.ASSETS.fetch(request);
    } catch (error) {
      return cors(json({ error: error.message || "Chyba serveru" }, error.status || 500));
    }
  }
};
