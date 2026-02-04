# 🌱 Gestionale Agricolo

Sistema di gestione per aziende agricole con tracciabilità completa delle operazioni colturali.

## 🌐 Demo Live

- **Frontend**: https://gestionale-agricolo-ui.pages.dev
- **API**: https://gestionale-agricolo-api.aziendamalbosca.workers.dev

## 📱 Installazione PWA

L'app è installabile su qualsiasi dispositivo:
- **iPhone/iPad**: Safari → Condividi → Aggiungi a Home
- **Android**: Chrome → Menu → Installa app
- **Desktop**: Clicca icona installazione nella barra indirizzi

## ✨ Funzionalità

### 🖥️ Interfaccia

**Desktop:**
- Sidebar fissa con menu organizzato per sezioni
- Contatori in tempo reale per ogni sezione
- Azioni rapide sempre visibili

**Mobile:**
- Bottom navigation con 6 tab
- Header con pulsante azioni rapide (+)
- Dropdown per creare velocemente nuovi elementi

### 📦 Gestione Magazzino
- **Prodotti**: SKU auto-generati (SEM-2026-001)
- **Lotti/Giacenze**: Tracciabilità con documenti (DDT/Fattura)
- **Fornitori**: Codice auto (FOR-001), P.IVA, contatti

### 🌾 Coltivazione
- **Appezzamenti**: Numerazione personalizzata
- **Operazioni**: Semina, Trapianto, Concimazione, Trattamento, Raccolta, Potatura
- **Piantine**: Tracciamento da semina alveolo o acquisto

### 📊 Operazioni Colturali

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

## 🛠️ Stack Tecnologico

- **Frontend**: Alpine.js + Tailwind CSS (PWA)
- **Backend**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Hosting**: Cloudflare Pages

## 📁 Struttura

```
gestionale-agricolo/
├── frontend/
│   ├── index.html      # SPA completa
│   ├── manifest.json   # PWA config
│   ├── sw.js           # Service Worker
│   └── icons/          # Icone PWA
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
