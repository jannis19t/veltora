const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});

function cors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  return new Response(response.body, { status: response.status, headers });
}

async function discordMember(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("Nepřihlášený uživatel");
  const token = auth.slice(7);
  const response = await fetch(`https://discord.com/api/users/@me/guilds/${env.GUILD_ID}/member`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error("Discord token není platný nebo uživatel není na serveru");
  const member = await response.json();
  return {
    id: member.user.id,
    name: member.nick || member.user.global_name || member.user.username,
    admin: Array.isArray(member.roles) && member.roles.includes(env.ADMIN_ROLE_ID)
  };
}

async function requireUser(request, env, admin = false) {
  const user = await discordMember(request, env);
  if (admin && !user.admin) throw new Error("Nemáš oprávnění administrátora");
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
    const user = await requireUser(request, env);
    const body = await request.json();
    if (!body.id || !body.items || !Number.isFinite(body.total)) return json({ error: "Neplatná objednávka" }, 400);
    await env.DB.prepare("INSERT INTO orders (id, discord_id, customer_name, items, total) VALUES (?, ?, ?, ?, ?)")
      .bind(body.id, user.id, user.name, body.items, body.total).run();
    let discordNotified = true;
    try { await notifyDiscord(env, "order", body, request.url); } catch (_) { discordNotified = false; }
    return json({ ok: true, discordNotified }, 201);
  }

  if (request.method === "GET" && path === "orders") {
    const user = await requireUser(request, env);
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
      return cors(json({ error: error.message || "Chyba serveru" }, 500));
    }
  }
};
