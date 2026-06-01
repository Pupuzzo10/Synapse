# Fix V3 — Header, ticket chiusi e AI supporto

## Correzioni

- Header/nav: breakpoint anticipato e menu responsive per evitare testi tagliati o sovrapposti al logo.
- Ticket utente: `/api/tickets/mine` restituisce solo ticket attivi. I ticket `closed` e `declined` non appaiono più in “I tuoi ticket”.
- Chiusura chat: le chat/ticket demo già presenti nel database incluso sono state chiuse per non bloccare nuovi ticket durante i test.
- Chat supporto: ogni nuovo ticket apre una chat e registra il primo messaggio dell’utente.
- Assistente AI: la chat risponde prima con l’AI Synapse; se l’utente chiede un umano o l’AI non riesce, la chat viene marcata come `needs_admin`.
- Admin panel: le tab “Ticket” e “Chat live” mostrano un badge rosso quando esistono chat che richiedono intervento umano.
- L’AI è vincolata a domande inerenti Synapse. Per domande fuori tema, esempio “quanto fa 1+1”, risponde: `Non posso rispondere a questa domanda.`

## Configurazione AI

Non inserire chiavi API nel codice. Configurare su Render o nel file `.env` locale:

```env
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-3-5-haiku-20241022
```
