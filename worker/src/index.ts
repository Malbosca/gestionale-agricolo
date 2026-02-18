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

// Prodotti con giacenza disponibile (per selezione in operazioni)
route('GET', '/api/products-with-stock', async (req, env) => {
  const results = await env.DB.prepare(`
    SELECT 
      p.id, p.sku, p.name, p.category_id,
      pc.name as category_name,
      COALESCE(SUM(b.current_qty), 0) as total_stock,
      u.name as unit_name,
      (SELECT id FROM batches WHERE product_id = p.id AND current_qty > 0 ORDER BY created_at LIMIT 1) as first_batch_id
    FROM products p
    LEFT JOIN product_categories pc ON pc.id = p.category_id
    LEFT JOIN batches b ON b.product_id = p.id AND b.current_qty > 0
    LEFT JOIN units u ON u.id = b.unit_id
    GROUP BY p.id
    HAVING total_stock > 0
    ORDER BY pc.name, p.name
  `).all();
  return json(results.results);
});

// Prodotti trapiantabili: piantine da semina in alveolo O acquistate
route('GET', '/api/seedlings-available', async (req, env) => {
  const results = await env.DB.prepare(`
    SELECT 
      s.id, s.name, s.source, s.produced_qty, s.available_qty,
      s.operation_id, s.batch_id, s.created_at
    FROM seedlings s
    WHERE s.available_qty > 0
    ORDER BY s.created_at DESC
  `).all();
  return json(results.results);
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

// Modifica prodotto
route('PUT', '/api/products/:id', async (req, env, params) => {
  const { id } = params;
  const body = await req.json() as any;
  const { name, category_id, notes } = body;
  
  await env.DB.prepare(`
    UPDATE products SET name = ?, category_id = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(name, category_id || null, notes || null, id).run();
  
  return json({ message: 'Prodotto aggiornato' });
});

// Elimina prodotto
route('DELETE', '/api/products/:id', async (req, env, params) => {
  const { id } = params;
  
  // Elimina prima i movimenti dei lotti associati
  await env.DB.prepare('DELETE FROM batch_movements WHERE batch_id IN (SELECT id FROM batches WHERE product_id = ?)').bind(id).run();
  // Elimina i lotti
  await env.DB.prepare('DELETE FROM batches WHERE product_id = ?').bind(id).run();
  // Elimina il prodotto
  await env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
  
  return json({ message: 'Prodotto eliminato' });
});

// Crea prodotto + primo acquisto insieme
route('POST', '/api/products/with-purchase', async (req, env) => {
  const body = await req.json() as any;
  const { 
    name, category_id, notes,
    supplier_id, document_type, document_number, document_date,
    quantity, unit_id, purchase_price
  } = body;
  
  if (!name) return error('Nome prodotto è obbligatorio');
  if (!supplier_id) return error('Fornitore è obbligatorio');
  if (!quantity) return error('Quantità è obbligatoria');
  if (!unit_id) return error('Unità di misura è obbligatoria');
  
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
  
  // Genera SKU automatico
  const year = new Date().getFullYear();
  await env.DB.prepare(`
    INSERT INTO sku_counters (category_prefix, last_number) VALUES (?, 1)
    ON CONFLICT(category_prefix) DO UPDATE SET last_number = last_number + 1
  `).bind(prefix).run();
  
  const counter = await env.DB.prepare(
    'SELECT last_number FROM sku_counters WHERE category_prefix = ?'
  ).bind(prefix).first() as any;
  
  const sku = `${prefix}-${year}-${String(counter.last_number).padStart(3, '0')}`;
  
  // Crea prodotto
  const productResult = await env.DB.prepare(`
    INSERT INTO products (sku, name, category_id, stock_unit_id, usage_unit_id, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(sku, name, category_id || null, unit_id, unit_id, notes || null).run();
  
  const productId = productResult.meta.last_row_id;
  
  // Genera codice lotto automatico
  await env.DB.prepare(`
    INSERT INTO sku_counters (category_prefix, last_number) VALUES ('LOT', 1)
    ON CONFLICT(category_prefix) DO UPDATE SET last_number = last_number + 1
  `).run();
  
  const lotCounter = await env.DB.prepare(
    'SELECT last_number FROM sku_counters WHERE category_prefix = ?'
  ).bind('LOT').first() as any;
  
  const batchCode = `LOT-${year}-${String(lotCounter.last_number).padStart(4, '0')}`;
  
  // Crea lotto/acquisto
  const batchResult = await env.DB.prepare(`
    INSERT INTO batches (
      batch_code, product_id, source_type, supplier_id,
      document_type, document_number, document_date,
      purchase_date, purchase_price, initial_qty, current_qty, unit_id
    ) VALUES (?, ?, 'purchase', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    batchCode, productId, supplier_id,
    document_type || null, document_number || null, document_date || null,
    document_date || new Date().toISOString().split('T')[0],
    purchase_price || null, quantity, quantity, unit_id
  ).run();
  
  return json({ 
    product_id: productId, 
    sku, 
    batch_id: batchResult.meta.last_row_id,
    batch_code: batchCode,
    message: 'Prodotto e acquisto registrati' 
  }, 201);
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
  
  const batchId = result.meta.last_row_id;
  
  // Se il prodotto è della categoria "piantine", crea automaticamente seedlings
  const product = await env.DB.prepare(`
    SELECT p.name, pc.name as category_name
    FROM products p
    LEFT JOIN product_categories pc ON p.category_id = pc.id
    WHERE p.id = ?
  `).bind(product_id).first() as any;
  
  if (product && product.category_name === 'piantine') {
    await env.DB.prepare(`
      INSERT INTO seedlings (batch_id, name, source, produced_qty, available_qty)
      VALUES (?, ?, 'acquisto', ?, ?)
    `).bind(batchId, product.name, initial_qty, initial_qty).run();
  }
  
  return json({ id: batchId, message: 'Lotto creato' }, 201);
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
  const { type_code, operation_date, plot_id, plot_ids, notes, weather_conditions, movements, seed_location, harvest_kg, harvest_product, water_liters, dosage_per_hl, dosage_unit, seedlings_produced, seedling_name, seedling_id, transplant_qty } = body;
  
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
    INSERT INTO operations (operation_type_id, operation_date, plot_id, notes, weather_conditions, seed_location, water_liters, dosage_per_hl, dosage_unit, seedlings_produced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(opType.id, operation_date, plot_id || null, notes || null, weather_conditions || null, seed_location || null, water_liters || null, dosage_per_hl || null, dosage_unit || null, seedlings_produced || null).run();
  
  const operationId = opResult.meta.last_row_id;
  
  // Gestisci multi-appezzamenti
  const plotsToInsert = plot_ids && plot_ids.length > 0 ? plot_ids : (plot_id ? [plot_id] : []);
  for (const pid of plotsToInsert) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO operation_plots (operation_id, plot_id) VALUES (?, ?)
    `).bind(operationId, pid).run();
  }
  
  // Se è SEMINA IN ALVEOLO con piantine prodotte, crea entry in seedlings
  if (type_code === 'semina' && seed_location === 'alveolo' && seedlings_produced && seedling_name) {
    await env.DB.prepare(`
      INSERT INTO seedlings (operation_id, name, source, produced_qty, available_qty)
      VALUES (?, ?, 'semina_alveolo', ?, ?)
    `).bind(operationId, seedling_name, seedlings_produced, seedlings_produced).run();
  }
  
  // Se è TRAPIANTO con seedling_id, decrementa le piantine disponibili
  if (type_code === 'trapianto' && seedling_id && transplant_qty) {
    await env.DB.prepare(`
      UPDATE seedlings SET available_qty = available_qty - ? WHERE id = ? AND available_qty >= ?
    `).bind(transplant_qty, seedling_id, transplant_qty).run();
  }
  
  // Se è raccolta, registra in harvests con prodotto e per ogni appezzamento
  if (type_code === 'raccolta' && harvest_kg) {
    for (const pid of plotsToInsert) {
      await env.DB.prepare(`
        INSERT INTO harvests (operation_id, plot_id, product_name, quantity_kg, harvest_date)
        VALUES (?, ?, ?, ?, ?)
      `).bind(operationId, pid, harvest_product || null, harvest_kg, operation_date).run();
    }
  }
  
  // Inserisci movimenti e aggiorna giacenze
  // Per concimazione/trattamento: calcola quantità effettiva = (dosage_per_hl / 1000) * water_liters
  if (movements && Array.isArray(movements)) {
    for (const mov of movements) {
      let actualQty = mov.quantity;
      
      // Se è concimazione/trattamento e abbiamo dosaggio + litri acqua, calcola quantità effettiva
      if ((type_code === 'concimazione' || type_code === 'trattamento') && dosage_per_hl && water_liters) {
        actualQty = (dosage_per_hl / 1000) * water_liters;
      }
      
      await env.DB.prepare(`
        INSERT INTO operation_movements (operation_id, batch_id, movement_type, quantity, unit_id, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(operationId, mov.batch_id, mov.movement_type, actualQty, mov.unit_id || null, mov.notes || null).run();
      
      // Aggiorna giacenza (decrementa per input, incrementa per output)
      const sign = mov.movement_type === 'input' ? -1 : 1;
      await env.DB.prepare(`
        UPDATE batches SET current_qty = current_qty + ? WHERE id = ?
      `).bind(sign * actualQty, mov.batch_id).run();
    }
  }
  
  // Calcola e restituisci la quantità effettiva usata per feedback
  let actualQuantityUsed = null;
  if ((type_code === 'concimazione' || type_code === 'trattamento') && dosage_per_hl && water_liters) {
    actualQuantityUsed = (dosage_per_hl / 1000) * water_liters;
  }
  
  return json({ 
    id: operationId, 
    message: 'Operazione registrata',
    actual_quantity_used: actualQuantityUsed
  }, 201);
});

// Modifica operazione
route('PUT', '/api/operations/:id', async (req, env, params) => {
  const { id } = params;
  const body = await req.json() as any;
  const { operation_date, quantity, notes } = body;
  
  await env.DB.prepare(`
    UPDATE operations SET operation_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(operation_date, notes || null, id).run();
  
  // Se c'è una quantità, aggiorna il movimento
  if (quantity !== undefined) {
    const movement = await env.DB.prepare('SELECT * FROM operation_movements WHERE operation_id = ?').bind(id).first() as any;
    if (movement) {
      const oldQty = movement.quantity;
      const diff = quantity - oldQty;
      
      // Aggiorna movimento
      await env.DB.prepare('UPDATE operation_movements SET quantity = ? WHERE operation_id = ?').bind(quantity, id).run();
      
      // Aggiorna giacenza batch
      await env.DB.prepare('UPDATE batches SET current_qty = current_qty - ? WHERE id = ?').bind(diff, movement.batch_id).run();
    }
  }
  
  return json({ message: 'Operazione aggiornata' });
});

// Elimina operazione
route('DELETE', '/api/operations/:id', async (req, env, params) => {
  const { id } = params;
  
  // Ripristina giacenze dai movimenti
  const movements = await env.DB.prepare('SELECT * FROM operation_movements WHERE operation_id = ?').bind(id).all();
  for (const mov of movements.results as any[]) {
    // input = consumo, quindi ripristiniamo aggiungendo
    const restore = mov.movement_type === 'input' ? mov.quantity : -mov.quantity;
    await env.DB.prepare('UPDATE batches SET current_qty = current_qty + ? WHERE id = ?').bind(restore, mov.batch_id).run();
  }
  
  // Elimina movimenti
  await env.DB.prepare('DELETE FROM operation_movements WHERE operation_id = ?').bind(id).run();
  
  // Elimina collegamenti appezzamenti
  await env.DB.prepare('DELETE FROM operation_plots WHERE operation_id = ?').bind(id).run();
  
  // Elimina piantine create
  await env.DB.prepare('DELETE FROM seedlings WHERE operation_id = ?').bind(id).run();
  
  // Elimina operazione
  await env.DB.prepare('DELETE FROM operations WHERE id = ?').bind(id).run();
  
  return json({ message: 'Operazione eliminata' });
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
