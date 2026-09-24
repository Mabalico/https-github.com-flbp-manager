# Confronto e unione delle modifiche simultanee

La sincronizzazione confronta la bozza di questo PC e il database con la loro
ultima versione comune. Se le modifiche riguardano record diversi, il merge può
conservare entrambe: per esempio un nuovo titolo in Integrazioni e la modifica
remota di una squadra.

Il confronto dei dati JSON ignora l'ordine delle chiavi degli oggetti, che può
cambiare quando Supabase restituisce un valore `jsonb`. L'ordine degli array resta
significativo. Il merge comprende anche i campi opzionali dello stato, come
`fantaSettings`, e quelli aggiuntivi presenti nei backup: una modifica locale non
viene scartata solo perché il campo non è nella lista delle collezioni principali.

Due modifiche diverse allo stesso record richiedono ancora una scelta esplicita.
Anche rimuovere un record mentre un'altra sessione lo modifica è un conflitto
reale. Senza una versione comune attendibile il merge automatico resta bloccato.

Le regressioni si eseguono con `npm run test:data`; i casi dedicati sono in
`tests/data/stateConflictMergeCases.ts`.
