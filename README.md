# VELORA MARKET

## Produkty

Produkty jsou v horní části souboru `main.js` v poli `PRODUCTS`. Každá položka má:

```js
{ id: 1, n: 'Název', c: 'Kategorie', p: 10 }
```

`p` je pevná cena. Slevy ani původní ceny se nepoužívají. Admin může produkty přidávat a odebírat také přímo v sekci **Dashboard → Správa produktů**. V této demo verzi se změny ukládají do `localStorage` konkrétního prohlížeče.

## Discord přihlášení

Frontend obsahuje OAuth2 návrat přes Discord, ale pro skutečné zapnutí je potřeba doplnit v `main.js`:

- `CLIENT_ID` – ID aplikace z Discord Developer Portalu,
- `GUILD_ID` – ID Discord serveru,
- `ADMIN_ROLE_ID` – ID admin role,
- `API` – URL vlastního backendu.

V Discord Developer Portalu musí být jako Redirect URL nastavená přesná hodnota `REDIRECT`. Pro produkční použití nepřidávej bot token do tohoto souboru; ověření rolí, objednávek a žádostí musí dělat backend. Bez těchto údajů web zůstává v bezpečném demo režimu.