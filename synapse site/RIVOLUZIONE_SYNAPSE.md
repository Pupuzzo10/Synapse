# Synapse — Pacchetto rivoluzione ticket/chat/admin

Questo pacchetto contiene la versione aggiornata del sito Synapse con revisione del sistema ticket, chat realtime, pannello admin, UI pubblica e policy.

## Modifiche principali

- Tutti gli account e gli IP bannati nel database incluso sono stati sbloccati.
- Corretto il bug critico del realtime SSE in `js/content.js` che causava ricorsione infinita.
- La sezione “Segnalazioni” è stata convertita in “Ticket”.
- Ogni prodotto/progetto ha un pulsante “Apri ticket per informazioni”.
- I ticket prodotto aprono automaticamente una chat quando esiste almeno un admin disponibile nel sistema.
- Ricostruita la chat lato utente/admin con stile più vicino a WhatsApp, messaggi ordinati, separatori data, stato conversazione e indicatore “sta scrivendo”.
- Aggiunto endpoint realtime per typing indicator: `/api/chats/:id/typing`.
- Aggiunta tab “Chat live” nel pannello admin.
- Aggiunto pulsante admin “Sblocca tutti” per riattivare account sospesi/bannati e IP bannati attivi.
- Migliorato pannello Ticket, Moderazione, Presenza live e aggiornamento automatico tramite SSE.
- Migliorata UI dello status server, dei pulsanti di navigazione, delle card prodotto e dei badge consigliati.
- Risolto il problema del badge “Economico/Entry” che interferiva con il nome del pacchetto siti web.
- Aggiunto generatore frontend di recensioni simulate ogni 2 minuti con nomi e cognomi casuali.
- Aggiunta Privacy Policy professionale e sezione condizioni/rimborsi.
- Chiarita la policy: nessun rimborso automatico dopo conferma/avvio lavorazione, ma assistenza continuativa per avvicinare il prodotto alla richiesta iniziale.
- Aggiunti rate limit su ticket e messaggi chat.

## Avvio locale

1. Installa dipendenze sulla macchina target:

```bash
npm install
```

2. Configura l'ambiente partendo da `.env.example`.

3. Avvia il server:

```bash
npm start
```

## Nota sul pacchetto

La cartella pronta è stata pulita da `node_modules` e `.env` perché i moduli nativi inclusi nello ZIP originale erano compilati per Windows e non sono portabili. Le dipendenze vanno reinstallate sulla macchina o sul servizio di deploy.
