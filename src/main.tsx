import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from "react-router";
import './index.css'

//Routes and React Elements
import App from './App'
import Rules from './routes/Rules'
import Setup from './routes/Setup';
import Login from './routes/Login';
import AccountSettings from './routes/AccountSettings';
import Admin from './routes/Admin';
import NewCharacter from './routes/NewCharacter';
import CampaignSettings from './routes/CampaignSettings';
import Legal from './routes/Legal';
import Join from './routes/Join';
import CampaignView from './routes/CampaignView';

const router = createBrowserRouter([
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
    path : "/legal",
    element : <Legal />
  },
  {
    path : "/setup",
    element: <Setup />
  },
  {
    path : "/login",
    element: <Login />
  },
  {
    path : "/account",
    element: <AccountSettings />
  },
  {
    path : "/admin",
    element: <Admin />
  },
  {
    path : "/campaigns/:campaignID/characters/new",
    element: <NewCharacter />
  },
  {
    path : "/characters/new",
    element: <NewCharacter />
  },
  {
    path : "/setup/campaign",
    element : <CampaignSettings />
  },
  {
    path : "/join/:token",
    element : <Join />
  },
  {
    path : "/campaign/:campaignID",
    element : <CampaignView />
  },
  {
    path : "campaignsettings/:campaignID",
    element : <CampaignSettings />
  }
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)

