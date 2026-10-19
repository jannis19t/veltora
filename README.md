# VELORA MARKET

## Produkty

Produkty jsou v horní části souboru `main.js` v poli `PRODUCTS`. Každá položka má:

```js
{ id: 1, n: 'Název', c: 'Kategorie', p: 10 }
```

`p` je pevná cena. Slevy ani původní ceny se nepoužívají. Admin může produkty přidávat a odebírat také přímo v sekci **Dashboard → Správa produktů**. V této demo verzi se změny ukládají do `localStorage` konkrétního prohlížeče.

## Cloudflare Worker a D1 API

Projekt obsahuje [worker.js](./worker.js), [wrangler.toml](./wrangler.toml) a [schema.sql](./schema.sql). Před prvním nasazením:

1. V Cloudflare vytvoř databázi D1 s názvem `velora`.
2. Vlož do `wrangler.toml` její skutečné `database_id` místo `DOPLNIT_PO_VYTVORENI_D1`.
3. Spusť nad databází obsah `schema.sql`.
4. V Cloudflare Workeru nastav secrets `ORDERS_WEBHOOK_URL`, `REQUESTS_WEBHOOK_URL` a `COMPLAINTS_WEBHOOK_URL`. Webhook URL se neposílají do frontendu ani do chatu.
5. Po deployi bude web na `https://veltora.krixxfn.workers.dev/` a API na `https://veltora.krixxfn.workers.dev/api`.

`GUILD_ID` a `ADMIN_ROLE_ID` jsou nastavené jako veřejné Worker variables. API ověřuje každý požadavek přes Discord OAuth token a admin endpointy kontrolují admin roli.

## Discord přihlášení

Frontend používá původní Discord OAuth implicitní přihlášení. Veřejné hodnoty aplikace jsou nastavené v `main.js`:

- `CLIENT_ID` – ID aplikace z Discord Developer Portalu,
- `GUILD_ID` – ID Discord serveru,
- `ADMIN_ROLE_ID` – ID admin role,
- `API` – URL vlastního backendu.

Při otevření lokálního souboru přes `file://` frontend používá produkční API automaticky. Pro přihlášení přes Discord ale doporučujeme testovat přímo na produkční URL.

V Discord Developer Portalu musí být Redirect URL nastavená na produkční adresu:

```text
https://veltora.krixxfn.workers.dev/
```

Client Secret ani bot token pro tuto verzi nejsou potřeba.

Webhooky nevyžadují Discord bota ani jeho online stav. Pokud se objednávka uloží, ale zpráva nepřijde, zkontroluj příslušný webhook secret a Cloudflare Worker Logs.

Webhook vytvoř v každém cílovém Discord kanálu přes **Edit Channel → Integrations → Webhooks → New Webhook**. URL potom nastav v Cloudflare:

```bash
npx wrangler secret put ORDERS_WEBHOOK_URL
npx wrangler secret put REQUESTS_WEBHOOK_URL
npx wrangler secret put COMPLAINTS_WEBHOOK_URL
```

Po každém `secret put` vlož URL webhooku daného kanálu. Webhooky posílají zprávy do kanálů, ale neumí posílat soukromé zprávy uživatelům; změny stavů proto zůstávají viditelné v profilu uživatele na webu.