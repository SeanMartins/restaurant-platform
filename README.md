# 🍽️ Restaurant Platform

Piattaforma SaaS multi-tenant per la gestione degli ordini di ristoranti.

---

## Stack
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Database**: Firebase Firestore (realtime)
- **Auth**: Firebase Authentication
- **Storage**: Firebase Storage (loghi, immagini piatti)
- **Deploy**: Vercel (CI/CD via GitHub)

---

## Struttura ruoli

| Ruolo | Accesso |
|---|---|
| `superadmin` | Tutto — crea ristoranti, gestisce utenti |
| `manager` | Il suo ristorante — menu, tavoli, grafica, operatori |
| `cucina` | Solo ordini cucina del suo ristorante |
| `pizzeria` | Solo ordini pizzeria |
| `bar` | Solo ordini bar/bevande |
| `pasticceria` | Solo ordini dolci |
| `antipasti` | Solo ordini antipasti |
| `cassa` | Tutti gli ordini + conto tavoli |

---

## Setup iniziale (una tantum)

### 1. Clona e installa
```bash
git clone https://github.com/tuoaccount/restaurant-platform.git
cd restaurant-platform
npm install
```

### 2. Crea progetto Firebase
1. Vai su [console.firebase.google.com](https://console.firebase.google.com)
2. Crea nuovo progetto → chiama `restaurant-platform`
3. Abilita **Authentication** → Email/Password
4. Abilita **Firestore** → modalità test (poi applichi le rules)
5. Abilita **Storage**
6. Vai in Impostazioni progetto → Aggiungi app Web → copia la config

### 3. Configura variabili ambiente
```bash
cp .env.local.example .env.local
# Apri .env.local e incolla i valori Firebase
```

### 4. Pubblica le regole Firestore
```bash
npm install -g firebase-tools
firebase login
firebase init firestore   # seleziona il tuo progetto
firebase deploy --only firestore:rules
```

### 5. Crea il primo utente Super Admin
Vai su Firebase Console → Authentication → Aggiungi utente manualmente
con la tua email. Poi in Firestore crea il documento:
```
/utenti/{tuo-uid}
{
  uid: "tuo-uid",
  email: "tua@email.com",
  role: "superadmin",
  createdAt: "2024-01-01T00:00:00.000Z"
}
```

### 6. Avvia in locale
```bash
npm run dev
# → http://localhost:3000
```

### 7. Deploy su Vercel
1. Pusha su GitHub
2. Importa su [vercel.com](https://vercel.com) 
3. Aggiungi tutte le variabili da `.env.local.example` nelle impostazioni Vercel

---

## Struttura Firestore

```
/utenti/{uid}                          ← tutti gli utenti (superadmin + manager)
/ristoranti/{restaurantId}/
  ├── (documento root)                 ← info ristorante, colori, logo, slug
  ├── categorie/{categoriaId}          ← categorie menu (Primi, Pizze, ecc)
  ├── piatti/{piattoId}                ← piatti con prezzo e reparto
  ├── tavoli/{tavoloId}                ← tavoli con QR associato
  └── ordini/{ordineId}                ← ordini attivi in realtime
```

---

## URL dell'app

| URL | Chi la usa |
|---|---|
| `/login` | Tutti gli utenti autenticati |
| `/admin` | Super Admin — gestisce tutti i ristoranti |
| `/dashboard` | Manager — gestisce il suo ristorante |
| `/[slug]` | Clienti — menu pubblico via QR |
| `/cucina` | Operatori cucina |
| `/pizzeria` | Operatori pizzeria |
| `/bar` | Operatori bar |
| `/cassa` | Cassa |

---

## Blocchi di sviluppo

- [x] **Blocco 1** — Struttura progetto + Firebase + Auth + Types
- [ ] **Blocco 2** — Super Admin panel (crea ristoranti + manager)
- [ ] **Blocco 3** — Manager panel (menu, tavoli, QR, grafica)
- [ ] **Blocco 4** — Menu cliente (pagina QR pubblica)
- [ ] **Blocco 5** — Dashboard reparti realtime (cucina, pizzeria, bar...)
- [ ] **Blocco 6** — Dashboard cassa (conto live per tavolo)
