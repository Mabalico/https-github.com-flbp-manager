# Note di integrazione

## Navigazione
- non introdurre React Router
- usare lo stesso pattern a viste interne già presente in `App.tsx`
- mantenere back chiari sempre verso il flusso Fanta

## Stile
- riusare hero scuro, card bianche, bordi slate, pill e CTA uppercase
- evitare component library nuove
- non rifattorizzare le view pubbliche esistenti

## Dati
- i mock sono separati in `services/fantabeerpong/mockData.ts`
- spostare gradualmente il dominio fantasy su source reale / selectors dedicati
- evitare di allargare `AppState` troppo presto senza modello dati definitivo

## Step già coperti nel package
- shell
- overview
- my team
- standings team
- standings player
- rules
- history
- three drilldown
- team builder
- quick help
