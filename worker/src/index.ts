/**
 * Gestionale Agricolo API
 * Cloudflare Worker + D1
 */

export interface Env {
  DB: D1Database;
}

// Helper per risposte JSON
const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });

const error = (message: string, status = 400) =>
  json({ error: message }, status);

// Router semplice
type Handler = (request: Request, env: Env, params: Record<string, string>) => Promise<Response>;

interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
}

const routes: Route[] = [];

const route = (method: string, path: string, handler: Handler) => {
  const pattern = new RegExp('^' + path.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$');
  routes.push({ method, pattern, handler });
};

// ============================================
// PRODUCTS
// ============================================

route('GET', '/api/products', async (req, env) => {
  const results = await env.DB.prepare(`
    SELECT p.*, pc.name as category_name, 
           su.code as stock_unit, uu.code as usage_unit
    FROM products p
    LEFT JOIN product_categories pc ON p.category_id = pc.id
    LEFT JOIN units su ON p.stock_unit_id = su.id
    LEFT JOIN units uu ON p.usage_unit_id = uu.id
    WHERE p.active = 1
    ORDER BY p.name
  `).all();
  return json(results.results);
});

route('GET', '/api/products/:id', async (req, env, params) => {
  const result = await env.DB.prepare(`
    SELECT p.*, pc.name as category_name
    FROM products p
    LEFT JOIN product_categories pc ON p.category_id = pc.id
    WHERE p.id = ?
  `).bind(params.id).first();
  if (!result) return error('Prodotto non trovato', 404);
  return json(result);
});

route('POST', '/api/products', async (req, env) => {
  const body = await req.json() as any;
  const { name, category_id, stock_unit_id, usage_unit_id, conversion_factor, notes } = body;
  
  if (!name) return error('Nome è obbligatorio');
  
  // Mappa categoria -> prefisso SKU
  const prefixMap: Record<string, string> = {
    'sementi': 'SEM',
    'piantine': 'PIA', 
    'concimi': 'CON',
    'fitofarmaci': 'FIT',
    'substrati': 'SUB'
  };
  
  // Trova il prefisso dalla categoria
  let prefix = 'GEN';
  if (category_id) {
    const cat = await env.DB.prepare('SELECT name FROM product_categories WHERE id = ?').bind(category_id).first() as any;
    if (cat && prefixMap[cat.name]) {
      prefix = prefixMap[cat.name];
    }
  }
  
  // Genera SKU automatico: PREFISSO-ANNO-NUMERO
  const year = new Date().getFullYear();
  
  // Incrementa contatore
  await env.DB.prepare(`
    INSERT INTO sku_counters (category_prefix, last_number) VALUES (?, 1)
    ON CONFLICT(category_prefix) DO UPDATE SET last_number = last_number + 1
  `).bind(prefix).run();
  
  const counter = await env.DB.prepare(
    'SELECT last_number FROM sku_counters WHERE category_prefix = ?'
  ).bind(prefix).first() as any;
  
  const sku = `${prefix}-${year}-${String(counter.last_number).padStart(3, '0')}`;
  
  const result = await env.DB.prepare(`
    INSERT INTO products (sku, name, category_id, stock_unit_id, usage_unit_id, conversion_factor, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(sku, name, category_id || null, stock_unit_id || null, usage_unit_id || null, conversion_factor || 1, notes || null).run();
  
  return json({ id: result.meta.last_row_id, sku, message: 'Prodotto creato' }, 201);
});

// ============================================
// BATCHES (Lotti)
// ============================================

route('GET', '/api/batches', async (req, env) => {
  const url = new URL(req.url);
  const productId = url.searchParams.get('product_id');
  const withStock = url.searchParams.get('with_stock') === 'true';
  
  let query = `
    SELECT b.*, p.sku, p.name as product_name, 
           u.code as unit_code, s.name as supplier_name,
           pb.batch_code as parent_batch_code
    FROM batches b
    JOIN products p ON b.product_id = p.id
    LEFT JOIN units u ON b.unit_id = u.id
    LEFT JOIN suppliers s ON b.supplier_id = s.id
    LEFT JOIN batches pb ON b.parent_batch_id = pb.id
  `;
  
  const conditions = [];
  const bindings: any[] = [];
  
  if (productId) {
    conditions.push('b.product_id = ?');
    bindings.push(productId);
  }
  if (withStock) {
    conditions.push('b.current_qty > 0');
  }
  
  if (conditions.length) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' ORDER BY b.created_at DESC';
  
  const stmt = env.DB.prepare(query);
  const results = bindings.length ? await stmt.bind(...bindings).all() : await stmt.all();
  return json(results.results);
});

route('POST', '/api/batches', async (req, env) => {
  const body = await req.json() as any;
  const { 
    batch_code, product_id, parent_batch_id, source_type,
    supplier_id, purchase_date, purchase_price, 
    initial_qty, unit_id, expiry_date, notes 
  } = body;
  
  if (!batch_code || !product_id || !source_type || !initial_qty) {
    return error('batch_code, product_id, source_type e initial_qty sono obbligatori');
  }
  
  const result = await env.DB.prepare(`
    INSERT INTO batches (batch_code, product_id, parent_batch_id, source_type, 
                         supplier_id, purchase_date, purchase_price, 
                         initial_qty, current_qty, unit_id, expiry_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    batch_code, product_id, parent_batch_id || null, source_type,
    supplier_id || null, purchase_date || null, purchase_price || null,
    initial_qty, initial_qty, unit_id || null, expiry_date || null, notes || null
  ).run();
  
  return json({ id: result.meta.last_row_id, message: 'Lotto creato' }, 201);
});

// Tracciabilità inversa - risali all'origine
route('GET', '/api/batches/:id/trace', async (req, env, params) => {
  const results = await env.DB.prepare(`
    WITH RECURSIVE batch_tree AS (
      SELECT id, batch_code, product_id, parent_batch_id, source_type, 
             supplier_id, purchase_date, 0 as level
      FROM batches WHERE id = ?
      
      UNION ALL
      
      SELECT b.id, b.batch_code, b.product_id, b.parent_batch_id, b.source_type,
             b.supplier_id, b.purchase_date, bt.level + 1
      FROM batches b
      JOIN batch_tree bt ON b.id = bt.parent_batch_id
    )
    SELECT bt.*, p.sku, p.name as product_name, s.name as supplier_name
    FROM batch_tree bt
    JOIN products p ON bt.product_id = p.id
    LEFT JOIN suppliers s ON bt.supplier_id = s.id
    ORDER BY bt.level
  `).bind(params.id).all();
  
  return json(results.results);
});

// ============================================
// PLOTS (Appezzamenti)
// ============================================

route('GET', '/api/plots', async (req, env) => {
  const results = await env.DB.prepare(`
    SELECT * FROM plots WHERE active = 1 ORDER BY name
  `).all();
  return json(results.results);
});

route('POST', '/api/plots', async (req, env) => {
  const body = await req.json() as any;
  const { code, name, area_sqm, notes } = body;
  
  if (!code || !name) return error('code e name sono obbligatori');
  
  const result = await env.DB.prepare(`
    INSERT INTO plots (code, name, area_sqm, notes)
    VALUES (?, ?, ?, ?)
  `).bind(code, name, area_sqm || null, notes || null).run();
  
  return json({ id: result.meta.last_row_id, message: 'Appezzamento creato' }, 201);
});

// ============================================
// SUPPLIERS (Fornitori)
// ============================================

route('GET', '/api/suppliers', async (req, env) => {
  const results = await env.DB.prepare(`SELECT * FROM suppliers ORDER BY name`).all();
  return json(results.results);
});

route('GET', '/api/suppliers/:id', async (req, env, params) => {
  const result = await env.DB.prepare(`SELECT * FROM suppliers WHERE id = ?`).bind(params.id).first();
  if (!result) return error('Fornitore non trovato', 404);
  return json(result);
});

route('POST', '/api/suppliers', async (req, env) => {
  const body = await req.json() as any;
  const { name, address, city, province, zip_code, vat_number, phone, email, notes } = body;
  
  if (!name) return error('Ragione sociale è obbligatoria');
  
  // Genera codice automatico: FOR-NUMERO
  await env.DB.prepare(`
    INSERT INTO sku_counters (category_prefix, last_number) VALUES ('FOR', 1)
    ON CONFLICT(category_prefix) DO UPDATE SET last_number = last_number + 1
  `).run();
  
  const counter = await env.DB.prepare(
    'SELECT last_number FROM sku_counters WHERE category_prefix = ?'
  ).bind('FOR').first() as any;
  
  const code = `FOR-${String(counter.last_number).padStart(3, '0')}`;
  
  const result = await env.DB.prepare(`
    INSERT INTO suppliers (code, name, address, city, province, zip_code, vat_number, phone, email, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(code, name, address || null, city || null, province || null, zip_code || null, vat_number || null, phone || null, email || null, notes || null).run();
  
  return json({ id: result.meta.last_row_id, code, message: 'Fornitore creato' }, 201);
});

route('PUT', '/api/suppliers/:id', async (req, env, params) => {
  const body = await req.json() as any;
  const { name, address, city, province, zip_code, vat_number, phone, email, notes } = body;
  
  await env.DB.prepare(`
    UPDATE suppliers SET 
      name = COALESCE(?, name),
      address = COALESCE(?, address),
      city = COALESCE(?, city),
      province = COALESCE(?, province),
      zip_code = COALESCE(?, zip_code),
      vat_number = COALESCE(?, vat_number),
      phone = COALESCE(?, phone),
      email = COALESCE(?, email),
      notes = COALESCE(?, notes)
    WHERE id = ?
  `).bind(name, address, city, province, zip_code, vat_number, phone, email, notes, params.id).run();
  
  return json({ message: 'Fornitore aggiornato' });
});

// ============================================
// OPERATIONS
// ============================================

route('GET', '/api/operations', async (req, env) => {
  const url = new URL(req.url);
  const plotId = url.searchParams.get('plot_id');
  const typeCode = url.searchParams.get('type');
  const fromDate = url.searchParams.get('from');
  const toDate = url.searchParams.get('to');
  
  let query = `
    SELECT o.*, ot.code as type_code, ot.name as type_name, 
           pl.name as plot_name, pl.code as plot_code
    FROM operations o
    JOIN operation_types ot ON o.operation_type_id = ot.id
    LEFT JOIN plots pl ON o.plot_id = pl.id
  `;
  
  const conditions = [];
  const bindings: any[] = [];
  
  if (plotId) {
    conditions.push('o.plot_id = ?');
    bindings.push(plotId);
  }
  if (typeCode) {
    conditions.push('ot.code = ?');
    bindings.push(typeCode);
  }
  if (fromDate) {
    conditions.push('o.operation_date >= ?');
    bindings.push(fromDate);
  }
  if (toDate) {
    conditions.push('o.operation_date <= ?');
    bindings.push(toDate);
  }
  
  if (conditions.length) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' ORDER BY o.operation_date DESC';
  
  const stmt = env.DB.prepare(query);
  const results = bindings.length ? await stmt.bind(...bindings).all() : await stmt.all();
  return json(results.results);
});

route('GET', '/api/operations/:id', async (req, env, params) => {
  // Operazione con movimenti
  const operation = await env.DB.prepare(`
    SELECT o.*, ot.code as type_code, ot.name as type_name,
           pl.name as plot_name
    FROM operations o
    JOIN operation_types ot ON o.operation_type_id = ot.id
    LEFT JOIN plots pl ON o.plot_id = pl.id
    WHERE o.id = ?
  `).bind(params.id).first();
  
  if (!operation) return error('Operazione non trovata', 404);
  
  const movements = await env.DB.prepare(`
    SELECT om.*, b.batch_code, p.sku, p.name as product_name, u.code as unit_code
    FROM operation_movements om
    JOIN batches b ON om.batch_id = b.id
    JOIN products p ON b.product_id = p.id
    LEFT JOIN units u ON om.unit_id = u.id
    WHERE om.operation_id = ?
  `).bind(params.id).all();
  
  return json({ ...operation, movements: movements.results });
});

route('POST', '/api/operations', async (req, env) => {
  const body = await req.json() as any;
  const { type_code, operation_date, plot_id, notes, weather_conditions, movements } = body;
  
  if (!type_code || !operation_date) {
    return error('type_code e operation_date sono obbligatori');
  }
  
  // Trova operation_type_id
  const opType = await env.DB.prepare(
    'SELECT id FROM operation_types WHERE code = ?'
  ).bind(type_code).first() as any;
  
  if (!opType) return error('Tipo operazione non valido');
  
  // Inserisci operazione
  const opResult = await env.DB.prepare(`
    INSERT INTO operations (operation_type_id, operation_date, plot_id, notes, weather_conditions)
    VALUES (?, ?, ?, ?, ?)
  `).bind(opType.id, operation_date, plot_id || null, notes || null, weather_conditions || null).run();
  
  const operationId = opResult.meta.last_row_id;
  
  // Inserisci movimenti e aggiorna giacenze
  if (movements && Array.isArray(movements)) {
    for (const mov of movements) {
      await env.DB.prepare(`
        INSERT INTO operation_movements (operation_id, batch_id, movement_type, quantity, unit_id, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(operationId, mov.batch_id, mov.movement_type, mov.quantity, mov.unit_id || null, mov.notes || null).run();
      
      // Aggiorna giacenza (decrementa per input, incrementa per output)
      const sign = mov.movement_type === 'input' ? -1 : 1;
      await env.DB.prepare(`
        UPDATE batches SET current_qty = current_qty + ? WHERE id = ?
      `).bind(sign * mov.quantity, mov.batch_id).run();
    }
  }
  
  return json({ id: operationId, message: 'Operazione registrata' }, 201);
});

// ============================================
// HARVESTS (Raccolte)
// ============================================

route('POST', '/api/harvests', async (req, env) => {
  const body = await req.json() as any;
  const { operation_date, plot_id, quantity_kg, quality_grade, destination, notes, weather_conditions } = body;
  
  if (!operation_date || !quantity_kg) {
    return error('operation_date e quantity_kg sono obbligatori');
  }
  
  // Trova operation_type_id per 'raccolta'
  const opType = await env.DB.prepare(
    'SELECT id FROM operation_types WHERE code = ?'
  ).bind('raccolta').first() as any;
  
  // Crea operazione
  const opResult = await env.DB.prepare(`
    INSERT INTO operations (operation_type_id, operation_date, plot_id, notes, weather_conditions)
    VALUES (?, ?, ?, ?, ?)
  `).bind(opType.id, operation_date, plot_id || null, notes || null, weather_conditions || null).run();
  
  // Crea record raccolta
  const harvestResult = await env.DB.prepare(`
    INSERT INTO harvests (operation_id, quantity_kg, quality_grade, destination, notes)
    VALUES (?, ?, ?, ?, ?)
  `).bind(opResult.meta.last_row_id, quantity_kg, quality_grade || null, destination || null, notes || null).run();
  
  return json({ 
    operation_id: opResult.meta.last_row_id, 
    harvest_id: harvestResult.meta.last_row_id,
    message: 'Raccolta registrata' 
  }, 201);
});

route('GET', '/api/harvests', async (req, env) => {
  const results = await env.DB.prepare(`
    SELECT h.*, o.operation_date, pl.name as plot_name
    FROM harvests h
    JOIN operations o ON h.operation_id = o.id
    LEFT JOIN plots pl ON o.plot_id = pl.id
    ORDER BY o.operation_date DESC
  `).all();
  return json(results.results);
});

// ============================================
// LOOKUP DATA
// ============================================

route('GET', '/api/categories', async (req, env) => {
  const results = await env.DB.prepare(`SELECT * FROM product_categories ORDER BY name`).all();
  return json(results.results);
});

route('GET', '/api/units', async (req, env) => {
  const results = await env.DB.prepare(`SELECT * FROM units ORDER BY type, name`).all();
  return json(results.results);
});

route('GET', '/api/operation-types', async (req, env) => {
  const results = await env.DB.prepare(`SELECT * FROM operation_types ORDER BY name`).all();
  return json(results.results);
});

// ============================================
// DASHBOARD / REPORTS
// ============================================

route('GET', '/api/dashboard', async (req, env) => {
  const [stock, recentOps, harvests] = await Promise.all([
    // Giacenze per categoria
    env.DB.prepare(`
      SELECT pc.name as category, COUNT(*) as batch_count, SUM(b.current_qty) as total_qty
      FROM batches b
      JOIN products p ON b.product_id = p.id
      JOIN product_categories pc ON p.category_id = pc.id
      WHERE b.current_qty > 0
      GROUP BY pc.id
    `).all(),
    
    // Ultime 10 operazioni
    env.DB.prepare(`
      SELECT o.*, ot.name as type_name, pl.name as plot_name
      FROM operations o
      JOIN operation_types ot ON o.operation_type_id = ot.id
      LEFT JOIN plots pl ON o.plot_id = pl.id
      ORDER BY o.operation_date DESC
      LIMIT 10
    `).all(),
    
    // Totale raccolte ultimo mese
    env.DB.prepare(`
      SELECT SUM(h.quantity_kg) as total_kg
      FROM harvests h
      JOIN operations o ON h.operation_id = o.id
      WHERE o.operation_date >= date('now', '-30 days')
    `).first()
  ]);
  
  return json({
    stock_by_category: stock.results,
    recent_operations: recentOps.results,
    monthly_harvest_kg: (harvests as any)?.total_kg || 0
  });
});

// ============================================
// MAIN HANDLER
// ============================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }
    
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Trova route corrispondente
    for (const r of routes) {
      if (r.method !== request.method) continue;
      const match = path.match(r.pattern);
      if (match) {
        const params = match.groups || {};
        try {
          return await r.handler(request, env, params);
        } catch (e: any) {
          console.error(e);
          return error(e.message || 'Errore interno', 500);
        }
      }
    }
    
    return error('Endpoint non trovato', 404);
  },
};
