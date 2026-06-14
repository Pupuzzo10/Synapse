# SynapseHub Site - Security con PostgreSQL

Questa versione della pagina `/security` legge le segnalazioni da PostgreSQL se `DATABASE_URL` è configurato.

Se `DATABASE_URL` non è configurato, il sito prova ancora a usare SQLite con `SECURITY_REPORTS_DB_PATH`.

## Variabili Render consigliate

Nel servizio web del sito su Render aggiungi:

```env
DATABASE_URL=postgresql://...
DATABASE_SSL=false
```

Usa l'Internal Database URL se il database PostgreSQL è su Render nello stesso account. Se invece usi l'External Database URL, imposta:

```env
DATABASE_SSL=true
```

## Avvio

```bash
npm install
npm start
```

Endpoint di test:

```txt
/api/security/reports/ID_UTENTE_DISCORD
```
