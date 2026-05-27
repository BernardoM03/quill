import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from "react-router";
import './index.css'

//Routes and React Elements
import App from './App'
import Rules from './routes/Rules'
import SetupCampaign from './routes/SetupCampaign'
import CampaignSettings from './routes/CampaignSettings';

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
  },
  {
    path : "/setupcampaign",
    element : <SetupCampaign />
  },
  {
    path : "campaignsettings/:id",
    element : <CampaignSettings />
  }
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)

