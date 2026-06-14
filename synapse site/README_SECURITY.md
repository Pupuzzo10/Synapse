# SynapseHub™ Security sul sito

Questa versione aggiunge al sito principale una nuova voce nella navbar: **SynapseHub™ Security**.

La voce apre una nuova scheda su `/security`, dove è presente una pagina dedicata con:

- stile coerente con il sito principale;
- layout più tecnico/terminal per la sezione security;
- barra di ricerca tramite ID utente Discord;
- collegamento read-only al database SQLite del bot;
- sezione “La nostra storia” con origine CoreProtection e passaggio a Synapse.

## Collegamento con il bot

Il sito legge la tabella `utenti_segnalati` dal database usato dal bot Discord.

Nel file `.env` del sito imposta:

```env
SECURITY_REPORTS_DB_PATH=percorso/al/database/segnalazioni.db
```

Esempi:

```env
SECURITY_REPORTS_DB_PATH=./data/segnalazioni.db
```

oppure, se bot e sito sono in cartelle vicine:

```env
SECURITY_REPORTS_DB_PATH=../SynapseHub_Security_Bot_V14/segnalazioni.db
```

Il database del bot deve contenere la tabella:

```sql
utenti_segnalati(user_id, motivo, durata, data_segnalazione, expires_at)
```

Le segnalazioni scadute vengono ignorate e ripulite anche dal sito.

## Avvio

Se scarichi la cartella pulita senza `node_modules`:

```bash
npm install
npm start
```

Poi apri:

```txt
http://localhost:3000/security
```
