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
4. V Cloudflare Workeru nastav secret `DISCORD_BOT_TOKEN` (Bot Token se neposílá do chatu). ID kanálu objednávek a žádostí jsou nastavená ve `wrangler.toml`.
5. Po deployi bude API na `https://veltora.krixxfn.workers.dev/api`.

`GUILD_ID` a `ADMIN_ROLE_ID` jsou nastavené jako veřejné Worker variables. API ověřuje každý požadavek přes Discord OAuth token a admin endpointy kontrolují admin roli.

## Discord přihlášení

Frontend obsahuje OAuth2 návrat přes Discord, ale pro skutečné zapnutí je potřeba doplnit v `main.js`:

- `CLIENT_ID` – ID aplikace z Discord Developer Portalu,
- `GUILD_ID` – ID Discord serveru,
- `ADMIN_ROLE_ID` – ID admin role,
- `API` – URL vlastního backendu.

V Discord Developer Portalu musí být jako Redirect URL nastavená přesná hodnota `REDIRECT`. Pro produkční použití nepřidávej bot token do tohoto souboru; ověření rolí, objednávek a žádostí musí dělat backend. Bez těchto údajů web zůstává v bezpečném demo režimu.