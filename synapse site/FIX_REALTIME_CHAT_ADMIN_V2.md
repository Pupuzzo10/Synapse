# Fix realtime/chat/admin V2

Interventi applicati:

- Login persistente: sessione salvata in `localStorage` con TTL server predefinito a 30 giorni.
- Realtime più robusto: SSE con heartbeat già attivo + polling automatico di sicurezza per contenuti, ticket, chat e presenza admin, senza refresh pagina.
- Typing indicator rifatto: resta visibile mentre l'altro utente continua a scrivere; sparisce solo dopo inattività o blur.
- Chiusura chat corretta: quando una chat viene chiusa, viene chiuso anche il ticket collegato, il widget si chiude da solo e l'utente può aprire un nuovo ticket.
- Avvio chat da ticket admin: lato utente la chat si apre automaticamente in basso tramite realtime, senza banner alto.
- Admin panel: aggiunti pulsanti chiusura chat risolta/non risolta nella lista chat live.
- Moderazione: aggiunta azione “Chiudi/rimozione account” con motivazione; l'utente viene disconnesso e non può più rientrare con quell'account.
- Header: corretto overlap tra logo e bottone “Apri ticket”.
- Chat UI: colori riallineati al tema Synapse nero/bianco.
- Database incluso: riparata incoerenza ticket/chat già presente, chiudendo il ticket associato a una chat già chiusa.
