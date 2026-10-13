import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import PublicReviews from './components/PublicReviews.jsx';
import './styles.css';

const shareId = new URLSearchParams(window.location.search).get('r');

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>{shareId ? <PublicReviews shareId={shareId} /> : <App />}</ErrorBoundary>,
);
