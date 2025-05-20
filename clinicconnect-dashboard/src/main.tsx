// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './App.css';
import './utilities.css';
// Import new stylesheets
import './styles/components.css';
import './styles/layouts.css';
import './styles/animations.css';
import './styles/healthcare.css';
import './styles/updated-styles.css';
import './styles/responsive.css';
import './styles/interactions.css';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext'; // Import AuthProvider

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider> {/* Wrap with AuthProvider */}
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
);