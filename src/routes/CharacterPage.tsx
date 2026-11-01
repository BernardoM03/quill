import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";

import { deletePortrait, getCharacter, uploadPortrait, type characterSummary } from "../api/characters";
import BackButton from "../components/BackButton";
import { CharacterPortrait } from "../components/portrait/CharacterPortrait";
import { loadImage } from "../components/portrait/makePortrait";
import { PortraitCropper } from "../components/portrait/PortraitCropper";
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
    // The picked image while the player frames it.
    const [picked, setPicked] = useState<ImageBitmap | null>(null)
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
        setError(null)
        loadImage(file)
            .then(setPicked)
            .catch(err => setError(errorMessage(err, 'Could not open that image.')))
    }

    // Called by the cropper with the framed 256x256 portrait. A rejection keeps the cropper
    // open and shows the server's reason there.
    function handleCropped(portrait: Blob) {
        return uploadPortrait(characterID, portrait).then(setVersion)
    }

    function handleCropperClosed() {
        picked?.close()
        setPicked(null)
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
                    You’ll frame it as a square after choosing an image. Large photos are shrunk before uploading.
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
            {picked && <PortraitCropper image={picked} onConfirm={handleCropped} onClose={handleCropperClosed} />}
        </div>
    )
}
