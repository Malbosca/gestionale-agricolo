# 🌱 Gestionale Agricolo

Sistema di gestione per aziende agricole con tracciabilità completa delle operazioni colturali.

## 🌐 Demo Live

- **Frontend**: https://gestionale-agricolo-ui.pages.dev
- **API**: https://gestionale-agricolo-api.aziendamalbosca.workers.dev

## ✨ Funzionalità

### 📦 Gestione Prodotti
- Categorie: Sementi, Piantine, Concimi, Fitofarmaci, Substrati
- SKU auto-generati (es: SEM-2026-001, CON-2026-002)
- Tracciabilità lotti con documenti (DDT/Fattura)

### 👥 Fornitori
- Codice auto-generato (FOR-001)
- Dati completi: P.IVA, indirizzo, contatti

### 🗺️ Appezzamenti
- Numerazione personalizzata
- Superficie e tipo terreno

### 🌾 Operazioni Colturali

| Operazione | Campi Specifici |
|------------|-----------------|
| **Semina** | Tipo (Alveolo/Campo), Piantine previste |
| **Trapianto** | Selezione piantine disponibili |
| **Concimazione** | Dosaggio (ml/hl, gr/hl), Litri acqua |
| **Trattamento** | Dosaggio (ml/hl, gr/hl), Litri acqua |
| **Raccolta** | Prodotto raccolto, Kg |
| **Potatura** | Note |

### 🌱 Flusso Piantine

```
Semina in Alveolo → Piantine disponibili → Trapianto
       ↑                    ↑
    Sementi          Oppure acquisto
```

### 💊 Calcolo Dosaggi

Formula automatica per trattamenti:
```
Quantità effettiva = (dosaggio_per_hl / 1000) × litri_acqua
```

Esempio: 500 ml/hl × 200 lt = 100 ml

## 🛠️ Stack Tecnologico

- **Frontend**: Alpine.js + Tailwind CSS
- **Backend**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Hosting**: Cloudflare Pages

## 📁 Struttura

```
gestionale-agricolo/
├── frontend/
│   └── index.html      # SPA completa
├── worker/
│   └── src/index.ts    # API REST
└── docs/
    └── schema.sql      # Schema database
```

## 🚀 Deploy

### Worker (API)
```bash
cd worker
npx wrangler deploy
```

### Frontend
```bash
cd frontend
npx wrangler pages deploy . --project-name gestionale-agricolo-ui
```

## 📄 Licenza

MIT
