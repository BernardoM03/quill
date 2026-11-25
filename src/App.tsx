import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'

import { logout } from './api/auth'
import { deleteDraft, listDrafts, type DraftSummary } from './api/drafts'
import { getUser } from './api/users'
import CampaignCard from './components/CampaignCard'
import ConfirmDialog from './components/ConfirmDialog'
import LegalFooter from './components/LegalFooter'
import { CharacterPortrait } from './components/portrait/CharacterPortrait'
import type { User } from './datatypes/user'

import './App.css'

// After this long the welcome line shows even if the user hasn't loaded.
const WELCOME_FALLBACK_DELAY_MS = 2000
const DEFAULT_WELCOME = 'Welcome to Quill! Please make sure to set up your user profile to get the best experience.'

// The home page with the user's campaigns, characters and unfinished drafts.
export default function App() {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  // Newest first.
  const [drafts, setDrafts] = useState<DraftSummary[]>([])
  const [discarding, setDiscarding] = useState<DraftSummary | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [welcomeMessage, setWelcomeMessage] = useState(DEFAULT_WELCOME)

  // A signed-out user gets a 401, which the API client turns into a trip to /login.
  useEffect(() => {
    getUser()
      .then(loadedUser => {
        setUser(loadedUser)
        setIsLoading(false)
        setWelcomeMessage(`Welcome, ${loadedUser.name}!`)
      })
      .catch(error => console.error('Error fetching user data:', error))
    listDrafts()
      .then(setDrafts)
      .catch(error => console.error('Error fetching drafts:', error))
    const timer = setTimeout(() => setIsLoading(false), WELCOME_FALLBACK_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  function handleSignOut() {
    logout()
      .then(() => navigate('/login', { replace: true }))
      .catch(error => console.error('Error signing out:', error))
  }

  function handleCampaignDeleted(id: string) {
    // The server deleted the campaign's characters along with it.
    setUser(current => current && {
      ...current,
      campaigns: current.campaigns.filter(campaign => campaign.id !== id),
      characters: current.characters.filter(character => character.campaignId !== id),
    })
    setDrafts(all => all.filter(draft => draft.campaignId !== id))
  }

  const hasCampaigns = Boolean(user?.campaigns?.length)

  return (
    <div className="page">
      <header className="home-header">
        <h1>Quill</h1>
        {user && (
          <div className="home-header__account">
            {user.isAdmin && <Link to="/admin" className="home-header__name">Admin</Link>}
            <Link to="/account" className="home-header__name" title="Account settings">{user.name}</Link>
            <button type="button" className="setting-button" onClick={handleSignOut}>Sign out</button>
          </div>
        )}
      </header>
      {isLoading ? <div /> : <p className="welcome muted">{welcomeMessage}</p>}
      {user && hasCampaigns && (
        <div className="setting-section">
          <span className="setting-caption">Your Campaigns</span>
          <div className="campaign-grid-wrap">
            <div className="campaign-grid">
              {user.campaigns.map(campaign => (
                <CampaignCard key={campaign.id} campaign={campaign} onDeleted={handleCampaignDeleted} />
              ))}
            </div>
          </div>
          {/* Only the admin can create campaigns for now. */}
          {user.isAdmin && (
            <div className="home-actions">
              <Link to="/setup/campaign" className="setting-button">New Campaign</Link>
            </div>
          )}
        </div>
      )}
      {user && !hasCampaigns && (
        <div className="setting-section">
          <span className="setting-caption">Your Campaigns</span>
          {user.isAdmin ? (
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
      )}
      {user && (
        <div className="setting-section">
          <span className="setting-caption">Your Characters</span>
          {user.characters.length > 0 ? (
            <ul className="character-list">
              {user.characters.map(character => (
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
                  {character.needsChanges && (
                    <Link to={`/characters/${character.id}`} className="character-row__badge character-row__badge--warning">Needs changes</Link>
                  )}
                  {character.status === 'pending' && <span className="character-row__badge">Awaiting approval</span>}
                  {character.status === 'draft' && (
                    <Link to={`/characters/${character.id}`} className="character-row__badge character-row__badge--warning">Not submitted</Link>
                  )}
                  {character.status === 'rejected' && (
                    <Link to={`/characters/${character.id}`} className="character-row__badge character-row__badge--warning">Sent back</Link>
                  )}
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
                {drafts.map(draft => (
                  <li key={draft.id} className="character-row">
                    <div className="character-row__info">
                      <Link to={`/characters/new?draft=${draft.id}`} className="character-row__name">
                        {draft.name || 'Unnamed character'}
                      </Link>
                      <span className="character-row__campaign">
                        {[draft.species, draft.class, draft.campaignName ?? (draft.campaignId ? null : 'Character Sandbox')]
                          .filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    <Link to={`/characters/new?draft=${draft.id}`} className="setting-button">Continue</Link>
                    <button type="button" className="setting-button setting-button--quiet" onClick={() => setDiscarding(draft)}>
                      Discard
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {discarding && (
            <ConfirmDialog title="Discard this draft?" confirmLabel="Discard" busyLabel="Discarding…" danger
              onConfirm={() => deleteDraft(discarding.id).then(() => setDrafts(all => all.filter(draft => draft.id !== discarding.id)))}
              onClose={() => setDiscarding(null)}>
              <p>{discarding.name || 'This unnamed character'} and everything chosen for it so far will be gone.</p>
            </ConfirmDialog>
          )}
          {/* Always available, since a character can go in the Character Sandbox without a campaign. */}
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
