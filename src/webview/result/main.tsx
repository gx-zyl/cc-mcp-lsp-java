import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ResultPanel from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ResultPanel />
  </StrictMode>
)
