# 🌱 Gestionale Agricolo

Sistema di tracciabilità e gestione delle lavorazioni agricole costruito su Cloudflare Workers + D1.

## Panoramica

Questo gestionale permette di:
- **Tracciare acquisti** di materie prime (sementi, concimi, piantine)
- **Registrare lavorazioni** (semina, trapianto, concimazione, raccolta)
- **Tracciabilità inversa** (risalire dal prodotto finale ai lotti di origine)
- **Gestire giacenze** con aggiornamento automatico
- **Associare operazioni ad appezzamenti**

## Database

**ID Database D1:** `2a23f341-6138-4e00-b8b7-478a116870f9`
**Nome:** `gestionale-agricolo`

### Schema ER

```
┌─────────────────┐     ┌─────────────┐     ┌──────────────┐
│ product_        │     │  products   │     │   batches    │
│ categories      │◄────┤             │◄────┤              │
└─────────────────┘     └─────────────┘     └──────┬───────┘
                              │                    │
                              │              parent_batch_id
                              │                    │
                        ┌─────┴─────┐              │
                        │   units   │              ▼
                        └───────────┘        ┌───────────┐
                                             │  batches  │ (lotti derivati)
┌─────────────────┐                          └───────────┘
│   suppliers     │◄─────────────────────────────────┘
└─────────────────┘

┌─────────────────┐     ┌─────────────┐     ┌───────────────────┐
│ operation_types │◄────┤ operations  │◄────┤operation_movements│
└─────────────────┘     └──────┬──────┘     └───────────────────┘
                               │
                               ▼
                        ┌─────────────┐
                        │    plots    │
                        └─────────────┘
```

### Tabelle

| Tabella | Descrizione |
|---------|-------------|
| `product_categories` | Categorie prodotto (sementi, piantine, concimi...) |
| `units` | Unità di misura (pz, busta, kg, lt...) |
| `suppliers` | Anagrafica fornitori |
| `plots` | Appezzamenti/parcelle |
| `products` | Anagrafica prodotti con SKU |
| `batches` | Lotti (acquisti + produzioni derivate) |
| `operation_types` | Tipi di operazione |
| `operations` | Operazioni eseguite |
| `operation_movements` | Movimenti materiali per operazione |
| `harvests` | Dettaglio raccolte |

## Flusso Operativo

### 1. Registrazione Acquisto

```
Acquisto 2 buste semi pomodoro dal fornitore X
    ↓
Crea prodotto SKU-SEM-001 (se non esiste)
    ↓
Crea lotto LOTTO-2024-001 con:
  - source_type: 'purchase'
  - supplier_id: fornitore X
  - initial_qty: 2, current_qty: 2
  - unit_id: busta
```

### 2. Semina

```
Semino 180 semi nell'appezzamento "Serra 1"
    ↓
Crea operazione tipo 'semina' + plot_id
    ↓
Crea movement INPUT: 180 pz da LOTTO-2024-001
    ↓
Aggiorna current_qty del lotto
```

### 3. Produzione Piantine

```
Ottengo 165 piantine dalla semina
    ↓
Crea prodotto SKU-PIA-001 (piantine pomodoro)
    ↓
Crea lotto LOTTO-2024-002 con:
  - source_type: 'production'
  - parent_batch_id: LOTTO-2024-001 (tracciabilità!)
  - initial_qty: 165, current_qty: 165
```

### 4. Trapianto

```
Trapianto 50 piantine in "Campo A"
    ↓
Crea operazione tipo 'trapianto' + plot_id
    ↓
Crea movement INPUT: 50 pz da LOTTO-2024-002
```

### 5. Concimazione

```
Applico 2kg concime NPK
    ↓
Crea operazione tipo 'concimazione' + plot_id
    ↓
Crea movement INPUT: 2 kg da LOTTO-CONC-001
```

### 6. Raccolta

```
Raccolgo 15kg fragole
    ↓
Crea operazione tipo 'raccolta' + plot_id
    ↓
Crea record in harvests con quantity_kg: 15
```

## Tracciabilità Inversa

Query per risalire all'origine:

```sql
-- Da un lotto, risali a tutti i genitori
WITH RECURSIVE batch_tree AS (
  SELECT id, batch_code, parent_batch_id, 0 as level
  FROM batches WHERE id = ?
  
  UNION ALL
  
  SELECT b.id, b.batch_code, b.parent_batch_id, bt.level + 1
  FROM batches b
  JOIN batch_tree bt ON b.id = bt.parent_batch_id
)
SELECT * FROM batch_tree;
```

## Roadmap - Funzionalità Future

Ispirato da [Agricolus](https://www.agricolus.com/):

### Fase 2 - Mappatura
- [ ] Integrazione mappe catastali (foglio/particella)
- [ ] Disegno appezzamenti su mappa
- [ ] Calcolo automatico superficie

### Fase 3 - Meteo
- [ ] Integrazione API meteo
- [ ] Previsioni 7 giorni per appezzamento
- [ ] Storico condizioni meteo

### Fase 4 - Monitoraggio Colture
- [ ] Indici vegetazione (NDVI) - immagini satellitari
- [ ] Stress idrico (NDMI)
- [ ] Alert automatici

### Fase 5 - Gestione Attività
- [ ] Pianificazione attività
- [ ] Calendario lavorazioni
- [ ] Promemoria scadenze trattamenti

### Fase 6 - Reporting
- [ ] Report per coltura
- [ ] Costi per appezzamento
- [ ] Export dati per quaderno di campagna

### Fase 7 - Mobile
- [ ] App mobile per registrazioni in campo
- [ ] Geolocalizzazione operazioni
- [ ] Foto allegate alle operazioni

## Struttura Progetto

```
gestionale-agricolo/
├── README.md
├── docs/
│   └── schema.sql
├── worker/
│   ├── wrangler.toml
│   └── src/
│       └── index.ts
└── frontend/
    └── (React/Vue app)
```

## Deployment

```bash
# Deploy Worker
cd worker
wrangler deploy

# Il database D1 è già creato e configurato
```

## Licenza

Proprietario - Azienda Malbosca
