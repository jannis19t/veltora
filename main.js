/* NASTAVENÍ DISCORDU: doplň tři hodnoty a demo se vypne.
           CLIENT_ID = ID aplikace z Discord Developer Portalu (přidej Redirect na adresu stránky),
           GUILD_ID = ID vašeho serveru, ADMIN_ROLE_ID = ID role, která dává admina. */
/* API = adresa vašeho backendu (velora-backend.js), který posílá zprávy do Discord kanálů a soukromé zprávy hráčům. */
var PUBLIC_API = 'https://veltora.krixxfn.workers.dev/api';
var CFG = { CLIENT_ID: '1561807208897978388', GUILD_ID: '1559887838059962481', ADMIN_ROLE_ID: '1561691507382034502', API: location.protocol === 'file:' ? PUBLIC_API : location.origin + '/api', REDIRECT: location.protocol === 'file:' ? 'https://veltora.krixxfn.workers.dev/' : location.origin + location.pathname };
var TOKEN = '';
var PRODUCTS = [
    { id: 1, n: 'Čokoládová tyčinka', c: 'Občerstvení', p: 3 },
    { id: 2, n: 'Brambůrky solené', c: 'Občerstvení', p: 4 },
    { id: 3, n: 'Energy drink 0,5 l', c: 'Občerstvení', p: 5 },
    { id: 4, n: 'Proteinová tyčinka', c: 'Občerstvení', p: 6 },
    { id: 5, n: 'Chléb pšenično-žitný', c: 'Potraviny', p: 4 },
    { id: 6, n: 'Mléko 1 l', c: 'Potraviny', p: 3 },
    { id: 7, n: 'Těstoviny 500 g', c: 'Potraviny', p: 4 },
    { id: 8, n: 'Rajčata 1 kg', c: 'Potraviny', p: 5 },
    { id: 9, n: 'Bezdrátová sluchátka', c: 'Elektronika', p: 129 },
    { id: 10, n: 'Powerbanka', c: 'Elektronika', p: 59 },
    { id: 11, n: 'Herní gamepad', c: 'Elektronika', p: 79 },
    { id: 12, n: 'Nabíječka USB-C', c: 'Elektronika', p: 39 },
    { id: 13, n: 'Černá mikina', c: 'Oblečení', p: 89 },
    { id: 14, n: 'Bílé tenisky', c: 'Oblečení', p: 119 },
    { id: 15, n: 'Toaletní papír 8 ks', c: 'Domácnost', p: 8 },
    { id: 16, n: 'Batoh městský', c: 'Domácnost', p: 69 }];
var CATS = ['Občerstvení', 'Potraviny', 'Elektronika', 'Oblečení', 'Domácnost'];
var CICON = { 'Občerstvení': 'cup', 'Potraviny': 'basket', 'Elektronika': 'cpu', 'Oblečení': 'bag', 'Domácnost': 'house' };
var state = { user: null, cart: {}, orders: [], collabs: [], filter: 'Vše' };
var $ = function (s) { return document.querySelector(s) };
function clearSession() {
    TOKEN = '';
    state.user = null;
    save();
    renderAuth();
}
function ic(n) { return '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><use href="#i-' + n + '"/></svg>' }
function usd(n) { return '$' + n.toLocaleString('en-US') }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
var toastTimer;
function toast(t) {
    var e = $('#toast'), text = String(t), error = /nepodařilo|nepodařil|neplatn|přihlas|selhala|chyb/i.test(text);
    e.className = 'toast on ' + (error ? 'error' : 'success');
    e.innerHTML = '<span class="toast-icon">' + ic(error ? 'x' : 'check') + '</span><span class="toast-text">' + esc(text) + '</span><button class="toast-close" type="button" aria-label="Zavřít upozornění">' + ic('x') + '</button>';
    e.querySelector('.toast-close').onclick = function () { e.classList.remove('on') };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { e.classList.remove('on') }, 3600);
}
/* Bez přihlášení nebo bez admin role je každý visitor. */
function isAdmin() { return !!(state.user && state.user.admin) }
function save() { try { localStorage.setItem('velora3', JSON.stringify({ user: state.user, orders: state.orders, collabs: state.collabs, products: PRODUCTS })) } catch (e) { } }
function load() {
    try {
        var d = JSON.parse(localStorage.getItem('velora3') || 'null');
        if (d) {
            state.user = d.user;
            if (state.user && /^100000000000000/.test(state.user.id)) state.user = null;
            state.orders = d.orders || []; state.collabs = d.collabs || [];
            if (Array.isArray(d.products)) PRODUCTS = d.products
        }
    } catch (e) { }
}
function productById(id) { return PRODUCTS.find(function (p) { return p.id === Number(id) }) }
function categoryClass(category) {
    return 'category-' + String(category).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function api(path, options) {
    if (!CFG.API) return Promise.reject(new Error('API není nastaveno'));
    options = options || {}; options.headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    options.credentials = 'include';
    return fetch(CFG.API + path, options).then(function (r) {
        if (r.status === 204) return null;
        return r.json().catch(function () { return {}; }).then(function (body) {
            if (r.status === 401) {
                clearSession();
                throw new Error(body.error || 'Přihlášení vypršelo');
            }
            if (!r.ok) throw new Error(body.error || ('API ' + r.status));
            return body;
        });
    });
}
function loadProducts() {
    api('/products').then(function (data) {
        if (Array.isArray(data)) { PRODUCTS = data; renderHome(); renderShop(); renderCart() }
    }).catch(function () { });
}
function loadAdminData() {
    if (!isAdmin() || !CFG.API) return;
    Promise.all([api('/orders'), api('/requests')]).then(function (data) {
        state.orders = data[0] || []; state.collabs = data[1] || [];
        if (document.querySelector('.view.on').id === 'dash') renderDash();
        if (document.querySelector('.view.on').id === 'orders') renderOrders();
        if (document.querySelector('.view.on').id === 'inbox') renderInbox();
    }).catch(function (error) {
        toast(error.message === 'Nepřihlášený uživatel' || error.message.indexOf('Discord token') > -1 || error.message.indexOf('Přihlášení') > -1
            ? 'Přihlášení vypršelo. Přihlas se přes Discord znovu.'
            : 'Admin data se nepodařilo načíst ze serveru');
    });
}
function loadUserData() {
    if (!state.user || !CFG.API) return;
    api('/orders').then(function (orders) {
        state.orders = orders || [];
        if (document.querySelector('.view.on').id === 'profile') renderProfile();
    }).catch(function (error) { toast(error.message === 'Nepřihlášený uživatel' || error.message.indexOf('Discord token') > -1 ? 'Přihlášení vypršelo. Přihlas se přes Discord znovu.' : 'Objednávky se nepodařilo načíst') });
    api('/requests').then(function (requests) {
        state.collabs = requests || [];
        if (document.querySelector('.view.on').id === 'profile') renderProfile();
    }).catch(function (error) { toast(error.message === 'Nepřihlášený uživatel' || error.message.indexOf('Discord token') > -1 ? 'Přihlášení vypršelo. Přihlas se přes Discord znovu.' : 'Žádosti se nepodařilo načíst') });
}

function go(v) {
    document.querySelectorAll('.view').forEach(function (s) { s.classList.toggle('on', s.id === v) });
    document.querySelectorAll('nav button').forEach(function (b) { b.classList.toggle('on', b.dataset.go === v) });
    var p = $('.prof'); if (p) p.classList.toggle('on', v === 'profile');
    if (v === 'dash') renderDash(); if (v === 'orders') renderOrders(); if (v === 'inbox') renderInbox(); if (v === 'profile') renderProfile();
    if (v === 'dash' || v === 'orders' || v === 'inbox') loadAdminData();
    if (v === 'profile') loadUserData();
    document.querySelector('nav').classList.remove('open');
    $('#menuToggle').setAttribute('aria-expanded', 'false');
    window.scrollTo(0, 0);
}
document.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest('[data-login]')) { login(); return }
    if (t.closest('[data-logout]')) { api('/auth/logout', { method: 'POST' }).catch(function () { }).then(function () { clearSession(); go('home'); toast('Odhlášen') }); return }
    var g = t.closest('[data-go]'); if (g) { go(g.dataset.go); return }
    var a = t.closest('[data-add]'); if (a) { addCart(+a.dataset.add); return }
    var c = t.closest('[data-cat]'); if (c) { state.filter = c.dataset.cat; renderShop(); go('shop'); return }
    var q = t.closest('[data-q]'); if (q) { chg(+q.dataset.id, +q.dataset.q); return }
    var dc = t.closest('[data-dec]'); if (dc) { decide(+dc.dataset.dec, dc.dataset.v); return }
    var s = t.closest('[data-st]'); if (s) { setSt(s.dataset.oid, s.dataset.s) }
    var rp = t.closest('[data-remove-product]'); if (rp) { removeProduct(+rp.dataset.removeProduct); return }
});

function card(p) { return '<article class="card"><div class="pic">' + ic(CICON[p.c]) + '</div><b>' + esc(p.n) + '</b><div class="product-meta"><span class="meta-badge ' + categoryClass(p.c) + '">' + esc(p.c) + '</span><span class="meta-badge price">' + usd(p.p) + '</span></div><div class="pr"><span></span><button class="icon-btn" data-add="' + p.id + '" aria-label="Přidat do košíku: ' + esc(p.n) + '">' + ic('plus') + '</button></div></article>' }
function renderShop() {
    $('#chips').innerHTML = ['Vše'].concat(CATS).map(function (c) { return '<button class="pill' + (c === state.filter ? ' on' : '') + '" data-cat="' + c + '">' + c + '</button>' }).join('');
    var q = ($('#q').value || '').toLowerCase(), so = $('#sort').value;
    var l = PRODUCTS.filter(function (p) { return (state.filter === 'Vše' || p.c === state.filter) && p.n.toLowerCase().indexOf(q) > -1 });
    if (so) l.sort(function (a, b) { return so === 'a' ? a.p - b.p : b.p - a.p });
    $('#grid').innerHTML = l.length ? l.map(card).join('') : '<p class="empty">Nic nenalezeno. Zkus jiné slovo.</p>';
}
function renderHome() {
    $('#cats').innerHTML = CATS.map(function (c) { return '<button class="pill" data-cat="' + c + '">' + ic(CICON[c]) + c + '</button>' }).join('');
    $('#topGrid').innerHTML = PRODUCTS.slice(0, 4).map(card).join('');
}

function addCart(id) { state.cart[id] = (state.cart[id] || 0) + 1; renderCart(); toast('Přidáno do košíku') }
function chg(id, d) { state.cart[id] = (state.cart[id] || 0) + d; if (state.cart[id] <= 0) delete state.cart[id]; renderCart() }
function cartTotal() { return Object.keys(state.cart).reduce(function (s, id) { var p = productById(id); return s + (p ? p.p * state.cart[id] : 0) }, 0) }
function renderCart() {
    var ids = Object.keys(state.cart);
    $('#cartN').textContent = ids.reduce(function (s, i) { return s + state.cart[i] }, 0);
    if (!ids.length) { $('#cartBody').innerHTML = '<p class="empty">Košík je prázdný.</p>'; return }
    $('#cartBody').innerHTML = ids.map(function (id) { var p = productById(id); if (!p) return ''; return '<div class="line"><span>' + esc(p.n) + '<br><small style="color:var(--mut)">' + usd(p.p) + '</small></span><span class="qty"><button data-q="-1" data-id="' + id + '" aria-label="Ubrat">' + ic('minus') + '</button>' + state.cart[id] + '<button data-q="1" data-id="' + id + '" aria-label="Přidat">' + ic('plus') + '</button></span></div>' }).join('') +
        '<div class="line" style="border:0"><b>Celkem</b><b>' + usd(cartTotal()) + '</b></div><button class="btn solid" id="order">Odeslat objednávku</button>';
    $('#order').onclick = order;
}
function order() {
    if (!state.user) { $('#drawer').classList.remove('on'); toast('Pro objednávku se přihlas přes Discord'); return }
    var items = Object.keys(state.cart).map(function (id) { var p = productById(id); return p ? p.n + ' ×' + state.cart[id] : '' }).filter(Boolean);
    var o = { id: 'VM-' + (1001 + state.orders.length), date: new Date().toLocaleDateString('cs-CZ'), items: items.join(', '), total: cartTotal(), by: state.user.name, uid: state.user.id, status: 'Nová' };
    state.orders.unshift(o); notify('order', o);
    state.cart = {}; save(); renderCart(); $('#drawer').classList.remove('on'); toast('Objednávka odeslána'); go(isAdmin() ? 'orders' : 'profile');
}
$('#cartBtn').onclick = function () { $('#drawer').classList.add('on') };
$('#closeCart').onclick = function () { $('#drawer').classList.remove('on') };
$('#menuToggle').onclick = function () {
    var open = $('nav').classList.toggle('open');
    this.setAttribute('aria-expanded', open ? 'true' : 'false');
};

function gate(t) { return '<div class="box gate">' + ic('shield') + '<h2 style="margin:0">' + t + '</h2><p>' + (state.user ? 'Nemáš roli admin, takže vidíš jen verzi pro visitora.' : 'Přihlas se přes Discord. Pokud máš na serveru roli admin, sekce se ti odemkne.') + '</p>' + (state.user ? '' : '<button class="btn solid" data-login>Přihlásit přes Discord</button>') + '</div>' }
function tag(s) { var c = s === 'Nová' ? 'nova' : (s === 'Hotovo' || s === 'Přijatá') ? 'hotovo' : s === 'Zamítnutá' ? 'zam' : 'cesta'; return '<span class="tag ' + c + '">' + s + '</span>' }
/* Zprávy do Discordu jdou přes backend, nikdy přímo z prohlížeče (bot token nesmí být v kódu stránky). */
function notify(type, data, successMessage) {
    if (!CFG.API) return Promise.reject(new Error('API není nastaveno'));
    return api('/' + type, { method: 'POST', body: JSON.stringify(data) }).then(function (result) {
        if (result && result.discordNotified === false) toast('Data jsou uložená, ale Discord zpráva se nepodařila odeslat');
        else if (successMessage) toast(successMessage);
        return result;
    }).catch(function () { toast('Objednávku se nepodařilo odeslat na server') });
}
function decide(i, v) {
    var c = state.collabs[i]; if (!c) return; c.status = v; save(); renderInbox(); renderDash();
    if (CFG.API) api('/request-decision', { method: 'POST', body: JSON.stringify({ id: c.id, status: v }) }).catch(function () { toast('Stav žádosti se nepodařilo uložit') });
    toast('Žádost: ' + v.toLowerCase() + '. Stav byl uložen.');
}
function setSt(id, s) { state.orders.forEach(function (o) { if (o.id === id) o.status = s }); save(); renderOrders(); renderDash(); if (CFG.API) api('/order-status', { method: 'POST', body: JSON.stringify({ id: id, status: s }) }).catch(function () { toast('Stav objednávky se nepodařilo uložit') }); toast('Objednávka ' + id + ': ' + s) }
function ordersTable(list, act) { return '<div class="tw"><table><thead><tr><th>Číslo</th><th>Zákazník</th><th>Položky</th><th>Cena</th><th>Stav</th>' + (act ? '<th>Změnit stav</th>' : '') + '</tr></thead><tbody>' + list.map(function (o) { return '<tr><td>' + o.id + '<br><small style="color:var(--mut)">' + o.date + '</small></td><td>' + esc(o.by || 'neznámý') + '</td><td>' + esc(o.items) + '</td><td>' + usd(o.total) + '</td><td>' + tag(o.status) + '</td>' + (act ? '<td><div class="acts"><button class="btn sm' + (o.status === 'V procesu' ? ' on' : '') + '" data-st="1" data-oid="' + o.id + '" data-s="V procesu">' + ic('hourglass') + 'V procesu</button><button class="btn sm' + (o.status === 'Hotovo' ? ' on' : '') + '" data-st="1" data-oid="' + o.id + '" data-s="Hotovo">' + ic('check') + 'Hotovo</button></div></td>' : '') + '</tr>' }).join('') + '</tbody></table></div>' }
function renderDash() {
    if (!isAdmin()) { $('#dashBody').innerHTML = gate('Dashboard je jen pro admina'); return }
    var sum = state.orders.reduce(function (s, o) { return s + o.total }, 0);
    $('#dashBody').innerHTML = '<div class="stack"><h2 style="margin:0">Dashboard</h2>' +
        '<div class="stats"><div class="box stat"><b>' + state.orders.length + '</b><span>Objednávky celkem</span></div>' +
        '<div class="box stat"><b>' + usd(sum) + '</b><span>Tržby celkem</span></div>' +
        '<div class="box stat"><b>' + state.orders.filter(function (o) { return o.status !== 'Hotovo' }).length + '</b><span>Nevyřízené objednávky</span></div>' +
        '<div class="box stat"><b>' + state.collabs.length + '</b><span>Žádosti o spolupráci</span></div></div>' +
        '<div class="box"><h3 style="margin-bottom:1rem">Správa produktů</h3><form id="productForm" class="product-form"><input name="name" placeholder="Název produktu" required><select name="category">' + CATS.map(function (c) { return '<option>' + c + '</option>' }).join('') + '</select><input name="price" type="number" min="0" step="1" placeholder="Cena" required><button class="btn solid" type="submit">' + ic('plus') + 'Přidat produkt</button></form><div class="product-list">' + PRODUCTS.map(function (p) { return '<div class="line"><span>' + esc(p.n) + '<span class="product-meta"><span class="meta-badge ' + categoryClass(p.c) + '">' + esc(p.c) + '</span><span class="meta-badge price">' + usd(p.p) + '</span></span></span><button class="btn sm" data-remove-product="' + p.id + '">' + ic('x') + 'Odebrat</button></div>' }).join('') + '</div></div>' +
        '<div class="box"><h3 style="margin-bottom:0.5rem">Poslední objednávky</h3>' + (state.orders.length ? ordersTable(state.orders.slice(0, 3)) : '<p class="empty">Zatím žádná objednávka.</p>') + '</div></div>';
}
function removeProduct(id) {
    var p = productById(id); if (!p) return;
    PRODUCTS = PRODUCTS.filter(function (item) { return item.id !== id });
    delete state.cart[id];
    var result = !CFG.API ? Promise.resolve() : api('/products/' + id, { method: 'DELETE' });
    result.then(function () { save(); renderDash(); renderHome(); renderShop(); renderCart(); toast('Produkt „' + p.n + '“ byl odebrán') }).catch(function () { PRODUCTS.push(p); toast('Produkt se nepodařilo odebrat') });
}
function renderOrders() {
    if (!isAdmin()) { $('#ordersBody').innerHTML = gate('Objednávky vidí jen admin'); return }
    $('#ordersBody').innerHTML = '<div class="stack"><h2 style="margin:0">Objednávky</h2>' + (state.orders.length ? '<div class="box">' + ordersTable(state.orders, true) + '</div>' : '<p class="empty">Zatím žádné objednávky.</p>') + '</div>';
}
function renderInbox() {
    if (!isAdmin()) { $('#inboxBody').innerHTML = gate('Žádosti vidí jen admin'); return }
    $('#inboxBody').innerHTML = '<div class="stack"><h2 style="margin:0">Žádosti o spolupráci</h2>' + (state.collabs.length ? state.collabs.map(function (c, i) { var s = c.status || 'Nová'; return '<div class="box"><b>' + esc(c.name) + '</b> ' + tag(s) + '<br><small style="color:var(--mut)">' + esc(c.type) + ', tel. ' + esc(c.phone) + (c.uid ? '' : ', bez Discord účtu (zpráva nepůjde)') + '</small><p>' + esc(c.msg) + '</p>' + (s === 'Nová' ? '<div class="acts"><button class="btn solid sm" data-dec="' + i + '" data-v="Přijatá">' + ic('check') + 'Přijmout</button><button class="btn sm" data-dec="' + i + '" data-v="Zamítnutá">' + ic('x') + 'Zamítnout</button></div>' : '') + '</div>' }).join('') : '<p class="empty">Zatím žádné žádosti.</p>') + '</div>';
}
function renderProfile() {
    if (!state.user) { $('#profileBody').innerHTML = gate('Nejsi přihlášený'); return }
    var u = state.user, mine = state.orders.filter(function (o) { return o.uid === u.id || (!o.uid && o.by === u.name) });
    var myRequests = state.collabs.filter(function (c) { return c.uid === u.id });
    $('#profileBody').innerHTML = '<div class="stack"><h2 style="margin:0">Profil</h2><div class="box who"><span class="av lg">' + esc((u.name || '?')[0]) + '</span><div><b style="font-size:1.25rem">' + esc(u.name) + '</b><br><span class="role' + (isAdmin() ? ' a' : '') + '">' + (isAdmin() ? 'Admin' : 'Člen Discordu') + '</span><br><small style="color:var(--mut)">Discord ID: ' + esc(u.id) + '</small></div><button class="btn" data-logout style="margin-left:auto">' + ic('logout') + 'Odhlásit se</button></div>' +
        '<div class="stats"><div class="box stat"><b>' + mine.length + '</b><span>Moje objednávky</span></div><div class="box stat"><b>' + usd(mine.reduce(function (s, o) { return s + o.total }, 0)) + '</b><span>Moje útrata</span></div></div>' +
        '<div class="box"><h3 style="margin-bottom:0.5rem">Moje objednávky</h3>' + (mine.length ? ordersTable(mine) : '<p class="empty">Zatím jsi nic neobjednal.</p>') + '</div>' +
        '<div class="box"><h3 style="margin-bottom:0.5rem">Moje žádosti</h3>' + (myRequests.length ? myRequests.map(function (c) { return '<div class="line"><span><b>' + esc(c.name) + '</b><br><small style="color:var(--mut)">' + esc(c.type) + '</small></span>' + tag(c.status || 'Nová') + '</div>' }).join('') : '<p class="empty">Zatím jsi neposlal žádnou žádost.</p>') + '</div></div>';
}
document.addEventListener('submit', function (e) {
    if (e.target.id !== 'productForm') return;
    e.preventDefault();
    var f = new FormData(e.target), name = String(f.get('name') || '').trim(), price = Number(f.get('price'));
    if (!name || !Number.isFinite(price) || price < 0) { toast('Vyplň platný název a cenu'); return }
    var product = { id: PRODUCTS.reduce(function (max, p) { return Math.max(max, p.id) }, 0) + 1, n: name, c: String(f.get('category')), p: price };
    var result = !CFG.API ? Promise.resolve(product) : api('/products', { method: 'POST', body: JSON.stringify(product) });
    result.then(function (saved) { if (CFG.API && saved) product = saved; PRODUCTS.push(product); save(); renderDash(); renderHome(); renderShop(); toast('Produkt byl přidán') }).catch(function () { toast('Produkt se nepodařilo uložit na server') });
});
function updateContactFields() {
    var complaint = $('#contactType').value === 'complaint';
    $('#cooperationFields').hidden = complaint;
    $('#complaintFields').hidden = !complaint;
    $('#cooperationFields').querySelectorAll('input, select, textarea').forEach(function (field) {
        field.required = !complaint;
        field.disabled = complaint;
    });
    $('#complaintFields').querySelectorAll('input, textarea').forEach(function (field) {
        field.required = complaint && field.name !== 'orderId';
        field.disabled = !complaint;
    });
}
$('#contactType').onchange = updateContactFields;
$('#collabForm').onsubmit = function (e) {
    e.preventDefault();
    if (!state.user) { toast('Pro odeslání zprávy se přihlas přes Discord'); return }
    var f = new FormData(e.target), complaint = f.get('contactType') === 'complaint';
    var c = complaint
        ? { id: 'ST-' + (state.collabs.length + 1001), name: f.get('complaintName'), type: 'Stížnost', phone: f.get('orderId') || 'Bez čísla objednávky', msg: f.get('complaintMsg'), uid: state.user.id, status: 'Nová' }
        : { id: 'ZD-' + (state.collabs.length + 1001), name: f.get('name'), type: f.get('type'), phone: f.get('phone'), msg: f.get('msg'), uid: state.user.id, status: 'Nová' };
    state.collabs.unshift(c);
    notify('request', c, 'Zpráva byla odeslána').then(function () { loadUserData() });
    save(); e.target.reset(); updateContactFields();
};

/* Přihlášení přes Discord (implicitní OAuth2) a role z vašeho serveru.
   Role se čte z endpointu členství na serveru. Skutečná data (objednávky, žádosti) musí chránit až backend,
   protože kontrola v prohlížeči jde obejít. */
function login() {
    location.href = CFG.API + '/auth/login';
}
async function handleReturn() {
    try {
        state.user = await api('/auth/me');
        save(); renderAuth();
    } catch (e) { clearSession() }
}
function renderAuth() {
    document.body.classList.toggle('admin', isAdmin());
    var u = state.user;
    $('#auth').innerHTML = u ? '<button class="prof" data-go="profile" aria-label="Můj profil"><span class="av">' + esc(u.name[0]) + '</span>' + esc(u.name) + '<span class="role' + (isAdmin() ? ' a' : '') + '">' + (isAdmin() ? 'Admin' : 'Visitor') + '</span></button>' : '<button class="btn solid" data-login>Přihlásit přes Discord</button>';
}
load();
function renderTicker() { var T = ['Nejlepší dostupný obchod ve městě', 'Nejlepší ceny na trhu', 'Všechno na jednom místě', 'Čerstvé zboží každý den', 'Elektronika, občerstvení i oblečení', 'Objednej a my se ozveme']; var g = T.map(function (t) { return '<span>' + t + '</span>' }).join(''); $('#tick').innerHTML = g + g + g + g }
renderTicker(); renderAuth(); renderHome(); renderShop(); renderCart(); updateContactFields();
$('#q').oninput = renderShop; $('#sort').onchange = renderShop;
loadProducts();
handleReturn();