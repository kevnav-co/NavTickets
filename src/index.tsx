
import './utils/zodConfig';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { ModalProvider } from './context/ModalContext';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { assistantSlugFromHash } from './services/assistantChat';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error("Root element not found");

const root = ReactDOM.createRoot(rootElement);

// Chat público del asistente (/#/asistente/<slug>): lo usan clientes sin cuenta, así
// que se monta solo, sin la sesión ni los datos de la app.
const assistantSlug = assistantSlugFromHash(window.location.hash);

if (assistantSlug) {
  const PublicAssistantChat = React.lazy(() => import('./components/assistant/PublicAssistantChat'));
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <React.Suspense fallback={null}>
          <PublicAssistantChat slug={assistantSlug} />
        </React.Suspense>
      </ErrorBoundary>
    </React.StrictMode>
  );
} else {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <AuthProvider>
          <DataProvider>
            <ModalProvider>
              <App />
            </ModalProvider>
          </DataProvider>
        </AuthProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}
