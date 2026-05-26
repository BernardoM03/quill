import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Routes, Route } from 'react-router-dom'
import './index.css'

//Routes and React Elements
import Rules from './routes/Rules'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

function App() {
  return (
    <>
      <h1>Quill</h1>
      <nav>
        <Link to="/rules">Rules</Link>
      </nav>

      <Routes>
        <Route path="/rules" element={<Rules />} />
      </Routes>
    </>
  )
}
