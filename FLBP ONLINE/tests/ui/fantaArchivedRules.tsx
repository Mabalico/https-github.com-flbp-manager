import React from 'react';
import { createRoot } from 'react-dom/client';
import { FantaBeerpong } from '../../components/FantaBeerpong';
import '../../styles.css';

function Fixture() {
  const [leftFanta, setLeftFanta] = React.useState(false);
  return <main className="mx-auto max-w-6xl p-4">
    {leftFanta ? <h1>Origine fixture</h1> : <FantaBeerpong onBack={() => setLeftFanta(true)} />}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
