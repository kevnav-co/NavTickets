
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { ModalProvider } from './context/ModalContext';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error("Root element not found");

console.log("🚀 Index.tsx Ejecutándose...");
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AuthProvider>
      <DataProvider>
        <ModalProvider>
          <App />
        </ModalProvider>
      </DataProvider>
    </AuthProvider>
  </React.StrictMode>
);
