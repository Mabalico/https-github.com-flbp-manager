import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../App';
import { registerDraftNavigationGuard } from '../../services/draftNavigationGuard';
import '../../styles.css';

function NavigationFixture() {
  const [guardMode, setGuardMode] = React.useState<'off' | 'confirm' | 'saving'>('off');
  const [pending, setPending] = React.useState(false);
  const [guardCalls, setGuardCalls] = React.useState(0);
  const resolveRef = React.useRef<((confirmed: boolean) => void) | null>(null);
  React.useEffect(() => {
    if (guardMode === 'off') return;
    return registerDraftNavigationGuard(() => {
      setGuardCalls(count => count + 1);
      if (guardMode === 'saving') return false;
      setPending(true);
      return new Promise<boolean>(resolve => { resolveRef.current = resolve; });
    });
  }, [guardMode]);
  const answer = (confirmed: boolean) => {
    resolveRef.current?.(confirmed);
    resolveRef.current = null;
    setPending(false);
  };
  return <>
    <App />
    <aside style={{ position: 'fixed', bottom: 0, left: 0, zIndex: 200, background: '#fff', border: '2px solid #222', padding: 8 }}>
      <button onClick={() => setGuardMode('confirm')}>Arma guard fixture</button>{' | '}
      <button onClick={() => setGuardMode('saving')}>Simula salvataggio fixture</button>{' | '}
      <button onClick={() => setGuardMode('off')}>Disattiva guard fixture</button>{' | '}
      <button onClick={() => { sessionStorage.setItem('flbp_post_reload_view', 'fantabeerpong'); location.reload(); }}>Ricarica in Fanta fixture</button>
      <output aria-label="Stato guard fixture">{guardMode}</output>
      <output aria-label="Richieste guard fixture">{guardCalls}</output>
      {pending && <div role="alertdialog" aria-label="Bozza fixture">
        <button onClick={() => answer(false)}>Resta nella bozza fixture</button>{' | '}
        <button onClick={() => answer(true)}>Conferma uscita fixture</button>
      </div>}
    </aside>
  </>;
}
createRoot(document.getElementById('root')!).render(<NavigationFixture />);
