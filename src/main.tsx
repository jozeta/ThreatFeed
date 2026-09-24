import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { SettingsProvider } from './context/SettingsContext';
import { FeedProvider } from './context/FeedContext';
import { FilterProvider } from './context/FilterContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SettingsProvider>
      <FeedProvider>
        <FilterProvider>
          <App />
        </FilterProvider>
      </FeedProvider>
    </SettingsProvider>
  </React.StrictMode>,
);
