CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price INTEGER NOT NULL CHECK (price >= 0)
);

CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    discord_id TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    items TEXT NOT NULL,
    total INTEGER NOT NULL CHECK (total >= 0),
    status TEXT NOT NULL DEFAULT 'Nová',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS collaboration_requests (
    id TEXT PRIMARY KEY,
    discord_id TEXT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    phone TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Nová',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    discord_id TEXT NOT NULL,
    name TEXT NOT NULL,
    admin INTEGER NOT NULL DEFAULT 0,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (unixepoch())
);

INSERT OR IGNORE INTO products (id, name, category, price) VALUES
    (1, 'Čokoládová tyčinka', 'Občerstvení', 3),
    (2, 'Brambůrky solené', 'Občerstvení', 4),
    (3, 'Energy drink 0,5 l', 'Občerstvení', 5),
    (4, 'Proteinová tyčinka', 'Občerstvení', 6),
    (5, 'Chléb pšenično-žitný', 'Potraviny', 4),
    (6, 'Mléko 1 l', 'Potraviny', 3),
    (7, 'Těstoviny 500 g', 'Potraviny', 4),
    (8, 'Rajčata 1 kg', 'Potraviny', 5),
    (9, 'Bezdrátová sluchátka', 'Elektronika', 129),
    (10, 'Powerbanka', 'Elektronika', 59),
    (11, 'Herní gamepad', 'Elektronika', 79),
    (12, 'Nabíječka USB-C', 'Elektronika', 39),
    (13, 'Černá mikina', 'Oblečení', 89),
    (14, 'Bílé tenisky', 'Oblečení', 119),
    (15, 'Toaletní papír 8 ks', 'Domácnost', 8),
    (16, 'Batoh městský', 'Domácnost', 69);
