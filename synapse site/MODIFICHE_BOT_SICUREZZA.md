# Modifiche sicurezza bot/admin

Questo aggiornamento aggiunge:

- tracking IP nella Presenza live;
- evidenza multi-account tramite stesso IP;
- blocco anti-spam: un utente può avere una sola richiesta di supporto attiva alla volta;
- sospensione account dal pannello admin;
- ban permanente account + IP dal pannello admin;
- ban/sblocco singolo IP anche per visitatori non registrati;
- schermata di blocco server-side per account sospesi/bannati e IP bannati;
- blocco backend: utenti bannati/sospesi non possono usare API, ticket o chat;
- aggiornamenti realtime via SSE per moderazione, utenti, ticket, chat, contenuti e stato.

Nota deploy: non caricare `node_modules`, `.env` o `data` su GitHub/Render. Usa le variabili ambiente di Render e, se usi SQLite in produzione, un Persistent Disk.
