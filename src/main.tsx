import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './utils/theme'
import { AppSettingsProvider } from './utils/appSettings'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppSettingsProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </AppSettingsProvider>
  </StrictMode>,
)
