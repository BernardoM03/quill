import {Link, Outlet, useNavigate} from 'react-router-dom'
import { useState, useEffect } from 'react'
import type { user } from './datatypes/user'
import CampaignCard from './components/CampaignCard'
import LegalFooter from './components/LegalFooter'
import { getUser } from './api/users'
import { logout } from './api/auth'

import './App.css'

export default function App() {
  const navigate = useNavigate()
  const [userData, setUserData] = useState<user | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [welcomeMessage, setWelcomeMessage] = useState('Welcome to Quill! Please make sure to set up your user profile to get the best experience.')

  // Fetch user data from the API at startup.
  // Not signed in means 401, which the API client turns into a trip to /login.
  useEffect(() => {
    getUser()
      .then(data => {
        setUserData(data)
        setIsLoading(false)
        setWelcomeMessage(`Welcome, ${data.name}!`)
      })
      .catch(error => console.error('Error fetching user data:', error))
  }
  , [])

  // Log user data to the console after it is first fetched
  useEffect(() => {
    if (userData) {
      console.log('User data loaded:', userData)
    }
  }, [userData])

  function handleSignOut() {
    logout()
      .then(() => navigate('/login', { replace: true }))
      .catch(error => console.error('Error signing out:', error))
  }

  function handleCampaignDeleted(id: string) {
    setUserData(data => data && { ...data, campaigns: data.campaigns.filter(c => c.id !== id) })
  }

  setTimeout(() => {
    setIsLoading(false);
  }, 2000);

  return (
    <div className="page">
      <header className="home-header">
        <h1>Quill</h1>
        {userData && (
          <div className="home-header__account">
            <span className="muted">{userData.name}</span>
            <button type="button" className="setting-button" onClick={handleSignOut}>Sign out</button>
          </div>
        )}
      </header>
      { isLoading ?
        < div/> :
        <p className="welcome muted">{welcomeMessage}</p>
      }
      {
        userData && userData.campaigns && userData.campaigns.length > 0 ? (
          <div className="setting-section">
            <span className="setting-caption">Your Campaigns</span>
            <div className="campaign-grid-wrap">
              <div className="campaign-grid">
                {userData.campaigns.map(campaign => (
                  <CampaignCard key={campaign.id} props={{name: campaign.name, id: campaign.id, role: campaign.role}} onDeleted={handleCampaignDeleted} />
                ))}
              </div>
            </div>
            <div className="home-actions">
              <Link to="/setup/campaign" className="setting-button">New Campaign</Link>
            </div>
          </div>
        ) : null
      }
      {
        userData && (!userData.campaigns || userData.campaigns.length === 0) ? (
          <div className="setting-section">
            <span className="setting-caption">Your Campaigns</span>
            <p className="muted">You don't have any campaigns yet.</p>
            <div className="home-actions">
              <Link to="/setup/campaign" className="setting-button">Set Up Your First Campaign</Link>
            </div>
          </div>
        ) : null
      }
      <Outlet />
      <LegalFooter />
    </div>
  )
}
