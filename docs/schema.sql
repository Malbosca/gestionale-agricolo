-- ============================================
-- GESTIONALE AGRICOLO - DATABASE SCHEMA
-- Ultimo aggiornamento: 04/02/2026
-- ============================================

-- Categorie prodotti
CREATE TABLE product_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT
);

-- Unità di misura
CREATE TABLE units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('weight', 'volume', 'quantity', 'package'))
);

-- Contatori SKU per generazione automatica
CREATE TABLE sku_counters (
    prefix TEXT PRIMARY KEY,
    last_number INTEGER DEFAULT 0
);

-- Fornitori
CREATE TABLE suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,           -- Auto-generato: FOR-001
    name TEXT NOT NULL,
    address TEXT,
    city TEXT,
    province TEXT,
    zip_code TEXT,
    vat_number TEXT,            -- P.IVA
    phone TEXT,
    email TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Prodotti (sementi, concimi, fitofarmaci, piantine, substrati)
CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE,            -- Auto-generato: SEM-2026-001
    name TEXT NOT NULL,
    category_id INTEGER REFERENCES product_categories(id),
    stock_unit_id INTEGER REFERENCES units(id),
    usage_unit_id INTEGER REFERENCES units(id),
    conversion_factor REAL DEFAULT 1.0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Lotti (tracciabilità acquisti)
CREATE TABLE batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_code TEXT NOT NULL UNIQUE,    -- Auto-generato: LOT-2026-0001
    product_id INTEGER NOT NULL REFERENCES products(id),
    parent_batch_id INTEGER REFERENCES batches(id),
    source_type TEXT NOT NULL CHECK(source_type IN ('purchase', 'production', 'transfer')),
    supplier_id INTEGER REFERENCES suppliers(id),
    purchase_date DATE,
    purchase_price REAL,
    initial_qty REAL NOT NULL,
    current_qty REAL NOT NULL,
    unit_id INTEGER REFERENCES units(id),
    expiry_date DATE,
    document_type TEXT CHECK(document_type IN ('ddt', 'fattura')),
    document_number TEXT,
    document_date DATE,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Appezzamenti
CREATE TABLE plots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,      -- N° Appezzamento (es: 456)
    name TEXT NOT NULL,
    area_sqm REAL,
    location TEXT,
    soil_type TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tipi di operazione
CREATE TABLE operation_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT
);

-- Operazioni colturali
CREATE TABLE operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_type_id INTEGER NOT NULL REFERENCES operation_types(id),
    operation_date DATE NOT NULL,
    plot_id INTEGER REFERENCES plots(id),
    notes TEXT,
    weather_conditions TEXT,
    seed_location TEXT CHECK(seed_location IN ('alveolo', 'campo')),
    water_liters REAL,              -- Litri acqua per trattamenti
    dosage_per_hl REAL,             -- Dosaggio per hl (ml o gr)
    dosage_unit TEXT,               -- ml_hl o gr_hl
    seedlings_produced INTEGER,     -- Piantine prodotte da semina alveolo
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Appezzamenti multipli per operazione
CREATE TABLE operation_plots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id INTEGER NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
    plot_id INTEGER NOT NULL REFERENCES plots(id),
    UNIQUE(operation_id, plot_id)
);

-- Movimenti materiali (uso prodotti nelle operazioni)
CREATE TABLE operation_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id INTEGER NOT NULL REFERENCES operations(id),
    batch_id INTEGER NOT NULL REFERENCES batches(id),
    movement_type TEXT NOT NULL CHECK(movement_type IN ('input', 'output')),
    quantity REAL NOT NULL,
    unit_id INTEGER REFERENCES units(id),
    notes TEXT
);

-- Piantine (da semina alveolo o acquistate)
CREATE TABLE seedlings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id INTEGER REFERENCES operations(id),  -- Semina che le ha prodotte (null se acquistate)
    batch_id INTEGER REFERENCES batches(id),          -- Batch piantine acquistate (null se da semina)
    name TEXT NOT NULL,                               -- Nome piantina (es: "Pomodoro San Marzano")
    source TEXT NOT NULL CHECK(source IN ('semina_alveolo', 'acquisto')),
    produced_qty INTEGER NOT NULL,                    -- Quantità prodotta/acquistata
    available_qty INTEGER NOT NULL,                   -- Quantità ancora disponibile
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Raccolte
CREATE TABLE harvests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id INTEGER REFERENCES operations(id),
    plot_id INTEGER REFERENCES plots(id),
    product_name TEXT,              -- Prodotto raccolto (es: Fragole)
    quantity_kg REAL NOT NULL,
    quality_grade TEXT,
    destination TEXT,
    harvest_date DATE NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- DATI INIZIALI
-- ============================================

-- Categorie
INSERT INTO product_categories (name, description) VALUES
    ('sementi', 'Semi per la semina'),
    ('piantine', 'Piantine pronte per trapianto'),
    ('concimi', 'Fertilizzanti e concimi'),
    ('fitofarmaci', 'Prodotti fitosanitari'),
    ('substrati', 'Terricci e substrati');

-- Unità di misura
INSERT INTO units (code, name, type) VALUES
    ('busta', 'Buste', 'package'),
    ('kg', 'Kg', 'weight'),
    ('g', 'Grammi', 'weight'),
    ('lt', 'Litri', 'volume'),
    ('piantine', 'Piantine', 'quantity'),
    ('ml_hl', 'ml/hl', 'volume'),
    ('gr_hl', 'gr/hl', 'weight');

-- Tipi operazione
INSERT INTO operation_types (code, name, description) VALUES
    ('semina', 'Semina', 'Semina di semi'),
    ('trapianto', 'Trapianto', 'Trapianto di piantine'),
    ('concimazione', 'Concimazione', 'Applicazione concimi'),
    ('trattamento', 'Trattamento', 'Trattamento fitosanitario'),
    ('raccolta', 'Raccolta', 'Raccolta prodotto'),
    ('potatura', 'Potatura', 'Potatura piante');

-- Prefissi SKU
INSERT INTO sku_counters (prefix, last_number) VALUES
    ('SEM', 0), ('PIA', 0), ('CON', 0), ('FIT', 0), ('SUB', 0), ('GEN', 0),
    ('FOR', 0), ('LOT', 0);
