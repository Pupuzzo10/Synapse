# Deploy del sito Synapse

Questo pacchetto e' pronto per il deploy come Web Service Node.js.

## Cosa NON e' incluso

Sono stati rimossi:

- `.env`
- `node_modules/`
- database SQLite locali in `data/*.db`, `data/*.db-shm`, `data/*.db-wal`

Questi file non vanno pubblicati su GitHub.

## Opzione consigliata: Render

1. Crea un repository GitHub e carica il contenuto di questa cartella.
2. Su Render crea un nuovo Web Service collegando il repository.
3. Imposta:
   - Build command: `npm ci`
   - Start command: `npm start`
4. Aggiungi un Persistent Disk:
   - Mount path: `/var/data`
   - Size: `1 GB`
5. Imposta le variabili d'ambiente.

## Variabili obbligatorie

```env
NODE_ENV=production
BASE_URL=https://TUO-SITO.onrender.com
DATABASE_PATH=/var/data/synapse-auth.db
SESSION_SECRET=usa-una-stringa-lunga-casuale
SESSION_COOKIE_NAME=synapse.sid
SESSION_TTL_MS=86400000
BCRYPT_ROUNDS=12
EMAIL_VERIFICATION_TTL_MS=86400000
EMAIL_FROM=Synapse <no-reply@tuodominio.it>
SECURE_COOKIES=true
ADMIN_EMAIL=tua-email@example.com
ADMIN_PASSWORD=una-password-forte
ADMIN_USERNAME=Admin
```

## Variabili email SMTP opzionali

Senza SMTP, le email vengono simulate nei log. Per inviare email reali:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=utente
SMTP_PASS=password
```

## Note importanti

- Il database SQLite in produzione viene creato automaticamente in `/var/data/synapse-auth.db`.
- Il disco persistente e' necessario: senza disco il database puo' essere perso a ogni redeploy/restart.
- Cambia sempre `ADMIN_PASSWORD` e `SESSION_SECRET` prima del deploy.
- Dopo il primo deploy, aggiorna `BASE_URL` con l'URL pubblico reale del servizio.
