import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";

import { deletePortrait, getCharacter, uploadPortrait, type characterSummary } from "../api/characters";
import BackButton from "../components/BackButton";
import { CharacterPortrait } from "../components/portrait/CharacterPortrait";
import { makePortrait } from "../components/portrait/makePortrait";
import "../components/campaignSettings/CampaignSettings.css";
import "./CharacterPage.css";

function errorMessage(err: unknown, fallback: string): string {
    const response = (err as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
    return err instanceof Error && err.message ? err.message : fallback;
}

// /characters/:characterID: one character. For now its name, campaign and portrait;
// the sheet comes later.
export default function CharacterPage() {
    const { characterID = '' } = useParams();
    const [character, setCharacter] = useState<characterSummary | null | undefined>(undefined)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const fileInput = useRef<HTMLInputElement>(null)

    useEffect(() => {
        getCharacter(characterID).then(setCharacter).catch(() => setCharacter(null))
    }, [characterID])

    function setVersion(portraitVersion: string | null) {
        setCharacter(c => c && { ...c, portraitVersion })
    }

    function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        e.target.value = ''  // so picking the same file again still fires
        if (!file) return
        setBusy(true)
        setError(null)
        makePortrait(file)
            .then(image => uploadPortrait(characterID, image))
            .then(setVersion)
            .catch(err => setError(errorMessage(err, 'Could not upload the portrait.')))
            .finally(() => setBusy(false))
    }

    function handleRemove() {
        setBusy(true)
        setError(null)
        deletePortrait(characterID)
            .then(() => setVersion(null))
            .catch(err => setError(errorMessage(err, 'Could not remove the portrait.')))
            .finally(() => setBusy(false))
    }

    if (character === undefined) return <div className="page" />

    if (character === null) {
        return (
            <div className="page">
                <BackButton/>
                <h1>Character not found</h1>
                <p className="muted">It may have been deleted, or it isn’t yours.</p>
            </div>
        )
    }

    return (
        <div className="page">
            <BackButton/>
            <div className="character-header">
                <CharacterPortrait characterId={character.id} name={character.name} version={character.portraitVersion} size={128} />
                <div className="character-header__text">
                    <h1>{character.name}</h1>
                    <span className="muted">
                        {character.campaignId
                            ? <Link to={`/campaign/${character.campaignId}`}>{character.campaignName}</Link>
                            : 'Character Sandbox'}
                        {character.isActive && ' · Active'}
                    </span>
                </div>
            </div>

            <div className="setting-section">
                <span className="setting-caption">Portrait</span>
                <p className="setting-hint">
                    The centre of the image is used, as a square. Large photos are shrunk before uploading.
                </p>
                <div className="character-portrait__actions">
                    <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleFile} />
                    <button type="button" className="setting-button" disabled={busy} onClick={() => fileInput.current?.click()}>
                        {busy ? 'Working…' : character.portraitVersion ? 'Replace Portrait' : 'Upload Portrait'}
                    </button>
                    {character.portraitVersion && (
                        <button type="button" className="setting-button setting-button--quiet" disabled={busy} onClick={handleRemove}>
                            Remove
                        </button>
                    )}
                </div>
                {error && <p className="setting-error">{error}</p>}
            </div>
        </div>
    )
}
