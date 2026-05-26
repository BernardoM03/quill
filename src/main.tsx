import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from "react-router";
import './index.css'

//Routes and React Elements
import App from './App'
import Rules from './routes/Rules'

let router = createBrowserRouter([
  {
    path : "/",
    element : <App />,
    children: [
      {
      path : "rules",
      element : <Rules />
      }
    ]
  }
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)

