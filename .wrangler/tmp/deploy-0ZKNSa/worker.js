var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var json = /* @__PURE__ */ __name((data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
}), "json");
function cors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  return new Response(response.body, { status: response.status, headers });
}
__name(cors, "cors");
var ApiError = class extends Error {
  static {
    __name(this, "ApiError");
  }
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
};
async function discordMember(request, env, withRoles = false) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new ApiError("Nep\u0159ihl\xE1\u0161en\xFD u\u017Eivatel", 401);
  const token = auth.slice(7);
  const userResponse = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!userResponse.ok) throw new ApiError("Discord token nen\xED platn\xFD", 401);
  const user = await userResponse.json();
  let name = user.global_name || user.username;
  let admin = false;
  if (withRoles) {
    const memberResponse = await fetch(`https://discord.com/api/users/@me/guilds/${env.GUILD_ID}/member`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (memberResponse.status === 429) throw new ApiError("Discord je do\u010Dasn\u011B p\u0159et\xED\u017Een\xFD. Zkus to za chv\xEDli znovu.", 429);
    if (!memberResponse.ok) throw new ApiError("U\u017Eivatel nen\xED na Discord serveru", 401);
    const member = await memberResponse.json();
    name = member.nick || name;
    admin = Array.isArray(member.roles) && member.roles.includes(env.ADMIN_ROLE_ID);
  }
  return { id: user.id, name, admin };
}
__name(discordMember, "discordMember");
async function requireUser(request, env, admin = false, withRoles = admin) {
  const user = await discordMember(request, env, withRoles);
  if (admin && !user.admin) throw new ApiError("Nem\xE1\u0161 opr\xE1vn\u011Bn\xED administr\xE1tora", 403);
  return user;
}
__name(requireUser, "requireUser");
function product(row) {
  return { id: row.id, n: row.name, c: row.category, p: row.price };
}
__name(product, "product");
async function notifyDiscord(env, type, data, requestUrl) {
  const webhookUrl = type === "order" ? env.ORDERS_WEBHOOK_URL : data.type === "St\xED\u017Enost" ? env.COMPLAINTS_WEBHOOK_URL : env.REQUESTS_WEBHOOK_URL;
  if (!webhookUrl) throw new Error("Discord webhook nen\xED nastaven\xFD");
  const siteUrl = env.PUBLIC_URL || new URL(requestUrl).origin;
  const content = type === "order" ? `\u{1F4E6} **P\u0159i\u0161la nov\xE1 objedn\xE1vka ${data.id}**

Otev\u0159\xEDt administraci: ${siteUrl}` : data.type === "St\xED\u017Enost" ? `\u26A0\uFE0F **Nov\xE1 st\xED\u017Enost ${data.id}**
Jm\xE9no: ${data.name}
\u010C\xEDslo objedn\xE1vky: ${data.phone}
Popis: ${data.msg}

Otev\u0159\xEDt administraci: ${siteUrl}` : `\u{1F91D} **Nov\xE1 \u017E\xE1dost o spolupr\xE1ci**
Jm\xE9no: ${data.name}
Typ: ${data.type}
Kontakt: ${data.phone}

Otev\u0159\xEDt administraci: ${siteUrl}`;
  const response = await fetch(`${webhookUrl}?wait=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content })
  });
  if (!response.ok) throw new Error(`Discord webhook selhal (${response.status})`);
}
__name(notifyDiscord, "notifyDiscord");
async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, "");
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method === "GET" && path === "products") {
    const rows = await env.DB.prepare("SELECT id, name, category, price FROM products ORDER BY id").all();
    return json(rows.results.map(product));
  }
  if (request.method === "POST" && path === "products") {
    await requireUser(request, env, true);
    const body = await request.json();
    if (!body.n || !body.c || !Number.isInteger(body.p) || body.p < 0) return json({ error: "Neplatn\xFD produkt" }, 400);
    const result = await env.DB.prepare("INSERT INTO products (name, category, price) VALUES (?, ?, ?) RETURNING id, name, category, price").bind(String(body.n).trim(), String(body.c).trim(), body.p).first();
    return json(product(result), 201);
  }
  if (request.method === "DELETE" && path.startsWith("products/")) {
    await requireUser(request, env, true);
    const id = Number(path.split("/")[1]);
    if (!Number.isInteger(id)) return json({ error: "Neplatn\xE9 ID" }, 400);
    await env.DB.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
    return new Response(null, { status: 204 });
  }
  if (request.method === "POST" && path === "order") {
    const user = await requireUser(request, env);
    const body = await request.json();
    if (!body.id || !body.items || !Number.isFinite(body.total)) return json({ error: "Neplatn\xE1 objedn\xE1vka" }, 400);
    await env.DB.prepare("INSERT INTO orders (id, discord_id, customer_name, items, total) VALUES (?, ?, ?, ?, ?)").bind(body.id, user.id, user.name, body.items, body.total).run();
    let discordNotified = true;
    try {
      await notifyDiscord(env, "order", { ...body, by: user.name }, request.url);
    } catch (_) {
      discordNotified = false;
    }
    return json({ ok: true, discordNotified }, 201);
  }
  if (request.method === "GET" && path === "orders") {
    const user = await requireUser(request, env, false, true);
    const rows = user.admin ? await env.DB.prepare("SELECT id, discord_id AS uid, customer_name AS by, items, total, status, created_at AS date FROM orders ORDER BY created_at DESC").all() : await env.DB.prepare("SELECT id, discord_id AS uid, customer_name AS by, items, total, status, created_at AS date FROM orders WHERE discord_id = ? ORDER BY created_at DESC").bind(user.id).all();
    return json(rows.results);
  }
  if (request.method === "POST" && path === "order-status") {
    await requireUser(request, env, true);
    const body = await request.json();
    if (!body.id || !body.status) return json({ error: "Neplatn\xFD stav objedn\xE1vky" }, 400);
    await env.DB.prepare("UPDATE orders SET status = ? WHERE id = ?").bind(body.status, body.id).run();
    return json({ ok: true });
  }
  if (request.method === "GET" && path === "requests") {
    const user = await requireUser(request, env, false, true);
    const rows = user.admin ? await env.DB.prepare("SELECT id, discord_id AS uid, name, type, phone, message AS msg, status FROM collaboration_requests ORDER BY created_at DESC").all() : await env.DB.prepare("SELECT id, discord_id AS uid, name, type, phone, message AS msg, status FROM collaboration_requests WHERE discord_id = ? ORDER BY created_at DESC").bind(user.id).all();
    return json(rows.results);
  }
  if (request.method === "POST" && path === "request-decision") {
    await requireUser(request, env, true);
    const body = await request.json();
    if (!body.id || !body.status) return json({ error: "Neplatn\xFD stav \u017E\xE1dosti" }, 400);
    await env.DB.prepare("UPDATE collaboration_requests SET status = ? WHERE id = ?").bind(body.status, body.id).run();
    return json({ ok: true });
  }
  if (request.method === "POST" && path === "request") {
    const user = await requireUser(request, env);
    const body = await request.json();
    if (!body.name || !body.type || !body.phone || !body.msg) return json({ error: "Neplatn\xE1 \u017E\xE1dost" }, 400);
    await env.DB.prepare("INSERT INTO collaboration_requests (id, discord_id, name, type, phone, message) VALUES (?, ?, ?, ?, ?, ?)").bind(body.id, user.id, body.name, body.type, body.phone, body.msg).run();
    let discordNotified = true;
    try {
      await notifyDiscord(env, "request", body, request.url);
    } catch (_) {
      discordNotified = false;
    }
    return json({ ok: true, discordNotified }, 201);
  }
  return json({ error: "Endpoint nenalezen" }, 404);
}
__name(handleApi, "handleApi");
var worker_default = {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/") || url.pathname === "/api") return cors(await handleApi(request, env));
      return env.ASSETS.fetch(request);
    } catch (error) {
      return cors(json({ error: error.message || "Chyba serveru" }, error.status || 500));
    }
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
