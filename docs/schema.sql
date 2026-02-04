-- ============================================
-- GESTIONALE AGRICOLO - Schema Database D1
-- Database ID: 2a23f341-6138-4e00-b8b7-478a116870f9
-- ============================================

-- Categorie prodotto
CREATE TABLE IF NOT EXISTS product_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Unità di misura
CREATE TABLE IF NOT EXISTS units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT CHECK(type IN ('weight', 'volume', 'quantity', 'package'))
);

-- Appezzamenti / Location
CREATE TABLE IF NOT EXISTS plots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    area_sqm REAL,                    -- Superficie in mq
    notes TEXT,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Fornitori
CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact_info TEXT,                -- Email, telefono, etc.
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Prodotti (anagrafica)
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category_id INTEGER REFERENCES product_categories(id),
    stock_unit_id INTEGER REFERENCES units(id),    -- Unità di stoccaggio (busta)
    usage_unit_id INTEGER REFERENCES units(id),    -- Unità di utilizzo (pz)
    conversion_factor REAL DEFAULT 1,              -- Es: 1 busta = 100 semi
    notes TEXT,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Lotti (ogni acquisto o produzione genera un lotto)
CREATE TABLE IF NOT EXISTS batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_code TEXT NOT NULL UNIQUE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    parent_batch_id INTEGER REFERENCES batches(id),  -- Per tracciabilità inversa
    source_type TEXT NOT NULL CHECK(source_type IN ('purchase', 'production')),
    supplier_id INTEGER REFERENCES suppliers(id),
    purchase_date DATE,
    purchase_price REAL,
    initial_qty REAL NOT NULL,
    current_qty REAL NOT NULL,
    unit_id INTEGER REFERENCES units(id),
    expiry_date DATE,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tipi di operazione
CREATE TABLE IF NOT EXISTS operation_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT
);

-- Operazioni (semina, trapianto, concimazione, raccolta, etc.)
CREATE TABLE IF NOT EXISTS operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_type_id INTEGER NOT NULL REFERENCES operation_types(id),
    operation_date DATE NOT NULL,
    plot_id INTEGER REFERENCES plots(id),
    notes TEXT,
    weather_conditions TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Movimenti materiali per operazione (input consumati, output prodotti)
CREATE TABLE IF NOT EXISTS operation_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id INTEGER NOT NULL REFERENCES operations(id),
    batch_id INTEGER NOT NULL REFERENCES batches(id),
    movement_type TEXT NOT NULL CHECK(movement_type IN ('input', 'output')),
    quantity REAL NOT NULL,
    unit_id INTEGER REFERENCES units(id),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Raccolte (dettaglio specifico per le raccolte)
CREATE TABLE IF NOT EXISTS harvests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id INTEGER NOT NULL REFERENCES operations(id),
    quantity_kg REAL NOT NULL,
    quality_grade TEXT,               -- Qualità (A, B, C...)
    destination TEXT,                 -- Vendita, autoconsumo, etc.
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- INDICI per performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_batches_product ON batches(product_id);
CREATE INDEX IF NOT EXISTS idx_batches_parent ON batches(parent_batch_id);
CREATE INDEX IF NOT EXISTS idx_batches_code ON batches(batch_code);
CREATE INDEX IF NOT EXISTS idx_operations_type ON operations(operation_type_id);
CREATE INDEX IF NOT EXISTS idx_operations_date ON operations(operation_date);
CREATE INDEX IF NOT EXISTS idx_operations_plot ON operations(plot_id);
CREATE INDEX IF NOT EXISTS idx_movements_operation ON operation_movements(operation_id);
CREATE INDEX IF NOT EXISTS idx_movements_batch ON operation_movements(batch_id);

-- ============================================
-- DATI INIZIALI
-- ============================================

-- Categorie prodotto
INSERT OR IGNORE INTO product_categories (name, description) VALUES 
    ('sementi', 'Semi e sementi'),
    ('piantine', 'Piantine da trapianto'),
    ('concimi', 'Fertilizzanti e concimi'),
    ('fitofarmaci', 'Prodotti fitosanitari'),
    ('substrati', 'Terricci e substrati');

-- Unità di misura
INSERT OR IGNORE INTO units (code, name, type) VALUES 
    ('pz', 'Pezzi', 'quantity'),
    ('busta', 'Busta', 'package'),
    ('kg', 'Chilogrammi', 'weight'),
    ('g', 'Grammi', 'weight'),
    ('lt', 'Litri', 'volume'),
    ('ml', 'Millilitri', 'volume');

-- Tipi operazione
INSERT OR IGNORE INTO operation_types (code, name, description) VALUES 
    ('semina', 'Semina', 'Semina di semi'),
    ('trapianto', 'Trapianto', 'Trapianto di piantine'),
    ('concimazione', 'Concimazione', 'Applicazione concimi'),
    ('trattamento', 'Trattamento', 'Trattamento fitosanitario'),
    ('irrigazione', 'Irrigazione', 'Irrigazione'),
    ('raccolta', 'Raccolta', 'Raccolta prodotto'),
    ('potatura', 'Potatura', 'Potatura piante'),
    ('diserbo', 'Diserbo', 'Rimozione erbe infestanti');

-- ============================================
-- VISTE UTILI
-- ============================================

-- Vista giacenze attuali
CREATE VIEW IF NOT EXISTS v_stock AS
SELECT 
    p.sku,
    p.name AS product_name,
    pc.name AS category,
    b.batch_code,
    b.current_qty,
    u.code AS unit,
    b.expiry_date,
    s.name AS supplier
FROM batches b
JOIN products p ON b.product_id = p.id
JOIN product_categories pc ON p.category_id = pc.id
LEFT JOIN units u ON b.unit_id = u.id
LEFT JOIN suppliers s ON b.supplier_id = s.id
WHERE b.current_qty > 0;

-- Vista operazioni con dettagli
CREATE VIEW IF NOT EXISTS v_operations AS
SELECT 
    o.id,
    o.operation_date,
    ot.name AS operation_type,
    pl.name AS plot_name,
    o.notes,
    o.weather_conditions
FROM operations o
JOIN operation_types ot ON o.operation_type_id = ot.id
LEFT JOIN plots pl ON o.plot_id = pl.id
ORDER BY o.operation_date DESC;

-- Vista tracciabilità lotti
CREATE VIEW IF NOT EXISTS v_batch_traceability AS
SELECT 
    b.id,
    b.batch_code,
    p.sku,
    p.name AS product_name,
    b.source_type,
    b.purchase_date,
    pb.batch_code AS parent_batch_code,
    pp.sku AS parent_sku,
    pp.name AS parent_product_name
FROM batches b
JOIN products p ON b.product_id = p.id
LEFT JOIN batches pb ON b.parent_batch_id = pb.id
LEFT JOIN products pp ON pb.product_id = pp.id;
