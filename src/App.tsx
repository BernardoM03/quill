import {Link, Outlet, useNavigate} from 'react-router-dom'
import { useState, useEffect } from 'react'
import type { user } from './datatypes/user'
import CampaignCard from './components/CampaignCard'
import LegalFooter from './components/LegalFooter'
import { CharacterPortrait } from './components/portrait/CharacterPortrait'
import { getUser } from './api/users'
import { deleteDraft, listDrafts, type draftSummary } from './api/drafts'
import ConfirmDialog from './components/ConfirmDialog'
import { logout } from './api/auth'

import './App.css'

export default function App() {
  const navigate = useNavigate()
  const [userData, setUserData] = useState<user | null>(null)
  // Characters still being made, newest first.
  const [drafts, setDrafts] = useState<draftSummary[]>([])
  const [discarding, setDiscarding] = useState<draftSummary | null>(null)
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
    listDrafts()
      .then(setDrafts)
      .catch(error => console.error('Error fetching drafts:', error))
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
    // The campaign's characters went with it on the server.
    setUserData(data => data && {
      ...data,
      campaigns: data.campaigns.filter(c => c.id !== id),
      characters: data.characters.filter(c => c.campaignId !== id),
    })
    setDrafts(all => all.filter(d => d.campaignId !== id))
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
            {userData.isAdmin && <Link to="/admin" className="home-header__name">Admin</Link>}
            <Link to="/account" className="home-header__name" title="Account settings">{userData.name}</Link>
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
            {/* Only the admin can create campaigns for now. */}
            {userData.isAdmin && (
              <div className="home-actions">
                <Link to="/setup/campaign" className="setting-button">New Campaign</Link>
              </div>
            )}
          </div>
        ) : null
      }
      {
        userData && (!userData.campaigns || userData.campaigns.length === 0) ? (
          <div className="setting-section">
            <span className="setting-caption">Your Campaigns</span>
            {userData.isAdmin ? (
              <>
                <p className="muted">You don't have any campaigns yet.</p>
                <div className="home-actions">
                  <Link to="/setup/campaign" className="setting-button">Set Up Your First Campaign</Link>
                </div>
              </>
            ) : (
              <p className="muted">You aren't in any campaigns yet. Ask your GM for an invite link.</p>
            )}
          </div>
        ) : null
      }
      {userData && (
        <div className="setting-section">
          <span className="setting-caption">Your Characters</span>
          {userData.characters.length > 0 ? (
            <ul className="character-list">
              {userData.characters.map(character => (
                <li key={character.id} className="character-row">
                  <CharacterPortrait characterId={character.id} name={character.name} version={character.portraitVersion} size={40} />
                  <div className="character-row__info">
                    <Link to={`/characters/${character.id}`} className="character-row__name">{character.name}</Link>
                    {character.campaignId ? (
                      <Link to={`/campaign/${character.campaignId}`} className="character-row__campaign">
                        {character.campaignName}
                      </Link>
                    ) : (
                      <span className="character-row__campaign">Character Sandbox</span>
                    )}
                  </div>
                  {character.isActive && <span className="character-row__badge">Active</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">You don't have any characters yet.</p>
          )}
          {drafts.length > 0 && (
            <>
              <span className="setting-caption character-drafts__caption">Unfinished</span>
              <ul className="character-list">
                {drafts.map(d => (
                  <li key={d.id} className="character-row">
                    <div className="character-row__info">
                      <Link to={`/characters/new?draft=${d.id}`} className="character-row__name">
                        {d.name || 'Unnamed character'}
                      </Link>
                      <span className="character-row__campaign">
                        {[d.species, d.class, d.campaignName ?? (d.campaignId ? null : 'Character Sandbox')]
                          .filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    <Link to={`/characters/new?draft=${d.id}`} className="setting-button">Continue</Link>
                    <button type="button" className="setting-button setting-button--quiet" onClick={() => setDiscarding(d)}>
                      Discard
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {discarding && (
            <ConfirmDialog title="Discard this draft?" confirmLabel="Discard" busyLabel="Discarding…" danger
              onConfirm={() => deleteDraft(discarding.id).then(() => setDrafts(all => all.filter(d => d.id !== discarding.id)))}
              onClose={() => setDiscarding(null)}>
              <p>{discarding.name || 'This unnamed character'} and everything chosen for it so far will be gone.</p>
            </ConfirmDialog>
          )}
          {/* Always available: with no campaign, a character can still go in the Character Sandbox. */}
          <div className="home-actions">
            <Link to="/characters/new" className="setting-button">Create Character</Link>
          </div>
        </div>
      )}
      <Outlet />
      <LegalFooter />
    </div>
  )
}
