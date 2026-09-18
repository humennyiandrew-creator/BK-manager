import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './theme.css';
import './motion.css';
import { useGame } from './store/useGame';
import { useUI } from './store/useUI';

if (import.meta.env.DEV) Object.assign(window, { __bk: { useGame, useUI } });

const container = document.getElementById('root');
if (!container) throw new Error('root element missing');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
