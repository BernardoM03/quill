import {Link, Outlet} from 'react-router-dom'
import { useState, useEffect } from 'react'
import type { user } from './datatypes/user'
import CampaignCard from './components/CampaignCard'
import LegalFooter from './components/LegalFooter'

import './App.css'

export default function App() {
  const [userData, setUserData] = useState<user | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [welcomeMessage, setWelcomeMessage] = useState('Welcome to Quill! Please make sure to set up your user profile to get the best experience.')

  // Fetch user data from the JSON file at startup
  useEffect(() => {
    fetch('/user.json')
      .then(response => response.json())
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

  function handleCampaignDeleted(id: string) {
    setUserData(data => data && { ...data, campaigns: data.campaigns.filter(c => c.id !== id) })
  }

  setTimeout(() => {
    setIsLoading(false);
  }, 2000);

  return (
    <div className="page">
      <h1>Quill</h1>
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
                  <CampaignCard key={campaign.id} props={{name: campaign.name, id: campaign.id}} onDeleted={handleCampaignDeleted} />
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
      {
        !userData ? (
          <div className="setting-section">
            <span className="setting-caption">New User</span>
            <p className="muted">You don't have a profile yet.</p>
            <div className="home-actions">
              <Link to="/setup/user" className="setting-button">Set Up Your Account</Link>
            </div>
          </div>
        ) : null
      }
      <Outlet />
      <LegalFooter />
    </div>
  )
}
