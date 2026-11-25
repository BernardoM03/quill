import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import Markdown from "react-markdown";

import { getCampaign } from "../api/campaigns";
import { activateCharacter, getParty, type CampaignParty, type CharacterDisguise, type PartyCharacter } from "../api/characters";
import type { CampaignDetails } from "../datatypes/campaignDetails";
import BackButton from "../components/BackButton";
import PendingCharacters from "../components/PendingCharacters";
import CharacterChangeLog from "../components/CharacterChangeLog";
import { CampaignMaps } from "../components/maps/CampaignMaps";
import { CharacterPortrait } from "../components/portrait/CharacterPortrait";
import "../components/campaignSettings/CampaignSettings.css";
import "./CampaignView.css";

const VISIBILITY_NOTES = {
    full: null,
    limited: 'In this campaign you see only part of each other’s characters.',
    misleading: 'In this campaign, what you see of the others may not be the whole truth.',
} as const;

// Species · Class · Level, leaving out what isn't known.
function describe(c: { species: string | null, className: string | null, level?: number }): string {
    return [c.species, c.className, c.level !== undefined ? `Level ${c.level}` : null].filter(Boolean).join(' · ')
}

function hitPoints(c: PartyCharacter): string | null {
    const { current, max, temp } = c.hitPoints
    if (current === null) return null
    return `HP ${current}${max !== null ? ` / ${max}` : ''}${temp ? ` (+${temp} temp)` : ''}`
}

// The members' campaign overview with its description, the party and the viewer's own characters.
// Players land here after joining.
export default function CampaignView() {
    const { campaignID } = useParams();
    const [campaign, setCampaign] = useState<CampaignDetails | null | undefined>(undefined)
    const [party, setParty] = useState<CampaignParty | null>(null)
    const [partyError, setPartyError] = useState<string | null>(null)
    // The character being made active, and why that failed.
    const [activating, setActivating] = useState<string | null>(null)
    const [activateError, setActivateError] = useState<string | null>(null)

    useEffect(() => {
        if (!campaignID) return
        getCampaign(campaignID).then(setCampaign).catch(() => setCampaign(null))
    }, [campaignID])

    const loadParty = useCallback(() => {
        if (!campaignID) return Promise.resolve()
        return getParty(campaignID)
            .then(p => { setParty(p); setPartyError(null) })
            .catch(() => setPartyError('Could not load the party.'))
    }, [campaignID])

    useEffect(() => { loadParty() }, [loadParty])

    function handleActivate(characterId: string) {
        setActivating(characterId)
        setActivateError(null)
        activateCharacter(characterId)
            .then(loadParty)
            .catch(err => setActivateError(err.response?.data?.error ?? 'Could not make that character active.'))
            .finally(() => setActivating(null))
    }

    if (campaign === undefined) return <div className="page" />

    if (campaign === null) {
        return (
            <div className="page">
                <BackButton/>
                <h1>Campaign not found</h1>
                <p className="muted">It may have been deleted, or you aren’t a member.</p>
            </div>
        )
    }

    const mine = new Set(party?.myCharacters.map(c => c.id))
    // A GM without an active character is left out of the party, while players always appear.
    const members = party?.members.filter(m => m.character || m.role === 'player') ?? []
    const isPlayer = campaign.role === 'player'

    return (
        <div className="page">
            <BackButton/>
            <h1>{campaign.name}</h1>
            <div className="campaign-description__body markdown">
                {campaign.description ? <Markdown>{campaign.description}</Markdown> : <p className="muted">No description provided.</p>}
            </div>
            {campaignID && <PendingCharacters campaignId={campaignID} />}
            {campaignID && <CharacterChangeLog campaignId={campaignID} />}

            <section className="setting-section">
                <span className="setting-caption">The Party</span>
                {isPlayer && party && VISIBILITY_NOTES[party.visibility] && (
                    <p className="muted party__note">{VISIBILITY_NOTES[party.visibility]}</p>
                )}
                {partyError && <p className="setting-error">{partyError}</p>}
                {party && members.length === 0 && <p className="muted">No one has joined yet.</p>}
                {members.length > 0 && (
                    <ul className="character-list">
                        {members.map(member => {
                            const character = member.character
                            if (!character) {
                                return (
                                    <li key={member.userId} className="character-row">
                                        <div className="character-row__info">
                                            <span className="character-row__name muted">No active character</span>
                                            <span className="character-row__campaign">Played by {member.playerName}</span>
                                        </div>
                                    </li>
                                )
                            }
                            const hp = hitPoints(character)
                            const conditions = [...character.conditions, ...(character.exhaustion ? [`Exhaustion ${character.exhaustion}`] : [])]
                            return (
                                <li key={member.userId} className="character-row party__row">
                                    <CharacterPortrait characterId={character.id} name={character.name} version={character.portraitVersion} size={40} />
                                    <div className="character-row__info">
                                        {character.sheet
                                            ? <Link to={`/characters/${character.id}`} className="character-row__name">{character.name}</Link>
                                            : <span className="character-row__name">{character.name}</span>}
                                        <span className="character-row__campaign">
                                            {[describe(character), `Played by ${mine.has(character.id) ? 'you' : member.playerName}`].filter(Boolean).join(' · ')}
                                        </span>
                                        {conditions.length > 0 && (
                                            <span className="party__conditions">
                                                {conditions.map(name => <span key={name} className="character-row__badge">{name}</span>)}
                                            </span>
                                        )}
                                    </div>
                                    {hp && <span className="party__hp">{hp}</span>}
                                </li>
                            )
                        })}
                    </ul>
                )}
            </section>

            {/* Characters belong to memberships, so a non-member admin can't create one. */}
            {campaign.role !== 'admin' && (
                <section className="setting-section">
                    <span className="setting-caption">My Characters</span>
                    {party && party.myCharacters.length === 0 && (
                        <p className="muted">You don’t have a character here yet.</p>
                    )}
                    {party && party.myCharacters.length > 0 && (
                        <ul className="character-list">
                            {party.myCharacters.map(c => (
                                <li key={c.id} className="character-row">
                                    <CharacterPortrait characterId={c.id} name={c.name} version={c.portraitVersion} size={40} />
                                    <div className="character-row__info">
                                        <Link to={`/characters/${c.id}`} className="character-row__name">{c.name}</Link>
                                    </div>
                                    {c.status === 'pending' && <span className="character-row__badge">Awaiting approval</span>}
                                    {c.status === 'draft' && (
                                        <Link to={`/characters/${c.id}`} className="character-row__badge character-row__badge--warning">Not submitted</Link>
                                    )}
                                    {c.status === 'rejected' && (
                                        <Link to={`/characters/${c.id}`} className="character-row__badge character-row__badge--warning">Sent back</Link>
                                    )}
                                    {c.isActive && <span className="character-row__badge">Active</span>}
                                    {c.status === 'approved' && !c.isActive && (
                                        <button type="button" className="setting-button setting-button--quiet"
                                            disabled={activating !== null} onClick={() => handleActivate(c.id)}>
                                            {activating === c.id ? 'Activating…' : 'Activate'}
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                    {activateError && <p className="setting-error">{activateError}</p>}
                    <div className="home-actions campaign-view__actions">
                        <Link to={`/campaigns/${campaignID}/characters/new`} className="setting-button">Create Character</Link>
                    </div>
                </section>
            )}

            {/* Only the GM or admin can add maps, while players see the public ones. */}
            {campaignID && <CampaignMaps campaignId={campaignID} canEdit={campaign.role !== 'player'} />}
        </div>
    )
}
