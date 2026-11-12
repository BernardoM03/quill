import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import {
    activateCharacter, deleteCharacter, deletePortrait, getCharacter, patchCharacterState, submitCharacter, uploadPortrait,
    type characterSummary, type playState, type statePatch,
} from "../api/characters";
import { CharacterSheet } from "../components/sheet/CharacterSheet";
import BackButton from "../components/BackButton";
import ConfirmDialog from "../components/ConfirmDialog";
import TypeToConfirmDialog from "../components/TypeToConfirmDialog";
import { loadImage } from "../components/portrait/makePortrait";
import { PortraitCropper } from "../components/portrait/PortraitCropper";
import "../components/campaignSettings/CampaignSettings.css";
import "./CharacterPage.css";

function errorMessage(err: unknown, fallback: string): string {
    const response = (err as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
    return err instanceof Error && err.message ? err.message : fallback;
}

// /characters/:characterID: one character: its name, campaign, ability scores and portrait.
// The rest of the sheet comes later.
export default function CharacterPage() {
    const { characterID = '' } = useParams();
    const navigate = useNavigate();
    const [character, setCharacter] = useState<characterSummary | null | undefined>(undefined)
    const [error, setError] = useState<string | null>(null)
    // The picked image while the player frames it.
    const [picked, setPicked] = useState<ImageBitmap | null>(null)
    // True while the "Remove this portrait?" dialog is open.
    const [confirmingRemove, setConfirmingRemove] = useState(false)
    // True while the Delete Character dialog is open.
    const [confirmingDelete, setConfirmingDelete] = useState(false)
    const fileInput = useRef<HTMLInputElement>(null)

    useEffect(() => {
        getCharacter(characterID).then(setCharacter).catch(() => setCharacter(null))
    }, [characterID])

    // Why the last play-state change couldn't be saved; the change itself is already undone.
    const [stateError, setStateError] = useState<string | null>(null)
    // Saves can overlap; only the last one sent knows the final state.
    const latestStateSave = useRef(0)

    // Same pattern as handleAllowedChange (CampaignSettings): show the change now, send only
    // what changed, and if the save fails put back just the fields this change touched.
    // Uses the setter's function form so quick changes don't overwrite each other.
    function handleStateChange(next: Partial<playState>, patch: statePatch) {
        setStateError(null)
        const before = character?.state
        if (!before) return
        const previous = Object.fromEntries(Object.keys(next).map(key => [key, before[key as keyof playState]]))
        const setFields = (fields: Partial<playState>) => setCharacter(c => c && { ...c, state: { ...c.state, ...fields } })
        setFields(next)
        const request = ++latestStateSave.current
        patchCharacterState(characterID, patch)
            .then(state => {
                if (request === latestStateSave.current) setCharacter(c => c && { ...c, state })
            })
            .catch(err => {
                setFields(previous)
                setStateError(errorMessage(err, 'Could not save that change. Check your connection and try again.'))
            })
    }

    // Errors and busy state for the approval banner's buttons.
    const [statusError, setStatusError] = useState<string | null>(null)
    const [statusBusy, setStatusBusy] = useState(false)

    function handleSubmit() {
        setStatusBusy(true)
        setStatusError(null)
        submitCharacter(characterID)
            .then(({ status, isActive }) => setCharacter(c => c && { ...c, status, isActive, reviewReason: null }))
            .catch(err => setStatusError(errorMessage(err, 'Could not submit the character.')))
            .finally(() => setStatusBusy(false))
    }

    function handleActivate() {
        setStatusBusy(true)
        setStatusError(null)
        activateCharacter(characterID)
            .then(() => setCharacter(c => c && { ...c, isActive: true }))
            .catch(err => setStatusError(errorMessage(err, 'Could not make this character active.')))
            .finally(() => setStatusBusy(false))
    }

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

    // Called by the confirm dialog. A rejection keeps it open and shows the reason there.
    function handleRemove() {
        return deletePortrait(characterID).then(() => setVersion(null))
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

    // The owner (or the admin) does everything; the GM changes the play state; the party reads.
    const isOwner = character.access === 'owner'
    const canEdit = character.access !== 'party'

    return (
        <div className="page">
            <BackButton/>

            {isOwner && character.campaignId && character.status !== 'approved' && (
                <div className={`character-flag character-flag--${character.status}`} role="status">
                    {character.status === 'pending' && <>
                        <strong>Waiting for the GM’s approval.</strong>
                        <p>{character.campaignName} needs the GM to approve new characters before they can be played.</p>
                    </>}
                    {character.status === 'draft' && <>
                        <strong>Not submitted yet.</strong>
                        <p>Submit this character to finish creating it.</p>
                    </>}
                    {character.status === 'rejected' && <>
                        <strong>The GM sent this character back.</strong>
                        {character.reviewReason
                            ? <p className="character-flag__reason">{character.reviewReason}</p>
                            : <p>No reason was given.</p>}
                        <p>Edit it, then submit it again.</p>
                    </>}
                    {(character.status === 'draft' || character.status === 'rejected') && (
                        <button type="button" className="setting-button" onClick={handleSubmit}
                            disabled={statusBusy || character.problems.length > 0}>
                            {statusBusy ? 'Submitting…' : character.status === 'rejected' ? 'Resubmit' : 'Submit'}
                        </button>
                    )}
                    {statusError && <p className="setting-error">{statusError}</p>}
                </div>
            )}

            {isOwner && character.campaignId && character.status === 'approved' && !character.isActive && (
                <div className="character-portrait__actions character-activate">
                    <button type="button" className="setting-button setting-button--quiet" onClick={handleActivate} disabled={statusBusy}>
                        Make Active Character
                    </button>
                    {statusError && <p className="setting-error">{statusError}</p>}
                </div>
            )}

            {isOwner && character.problems.length > 0 && (
                <div className="character-flag" role="alert">
                    <strong>This character no longer matches {character.campaignName ?? 'the Character Sandbox'}.</strong>
                    <p>
                        The campaign’s settings have changed since it was made. Nothing has been changed or
                        removed. Edit the character to fix these:
                    </p>
                    <ul>
                        {[...new Set(character.problems.map(p => p.message))].map(m => <li key={m}>{m}</li>)}
                    </ul>
                    <Link to={`/characters/${character.id}/edit`} className="setting-button">Fix in Character Wizard</Link>
                </div>
            )}

            <CharacterSheet character={character} canEdit={canEdit} isOwner={isOwner}
                stateError={stateError} onStateChange={handleStateChange}
                onRested={state => setCharacter(c => c && { ...c, state })}
                portrait={isOwner ? {
                    error,
                    onPick: () => { setError(null); fileInput.current?.click() },
                    onRemove: () => { setError(null); setConfirmingRemove(true) },
                } : undefined} />

            {isOwner && <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleFile} />}
            {picked && <PortraitCropper image={picked} onConfirm={handleCropped} onClose={handleCropperClosed} />}
            {confirmingRemove && (
                <ConfirmDialog
                    title="Remove this portrait?"
                    confirmLabel="Remove"
                    busyLabel="Removing…"
                    danger
                    onConfirm={handleRemove}
                    onClose={() => setConfirmingRemove(false)}
                >
                    <p>{character.name} will show their initial instead. You can upload a new portrait any time.</p>
                </ConfirmDialog>
            )}

            {isOwner && (
                <div className="settings-danger">
                    <button type="button" className="setting-button setting-button--danger" onClick={() => setConfirmingDelete(true)}>
                        Delete Character
                    </button>
                </div>
            )}
            {confirmingDelete && (
                <TypeToConfirmDialog
                    title={`Delete ${character.name}?`}
                    phrase={character.name}
                    confirmLabel="Delete Character"
                    busyLabel="Deleting…"
                    onConfirm={() => deleteCharacter(character.id, character.name).then(() => navigate('/', { replace: true }))}
                    onClose={() => setConfirmingDelete(false)}
                >
                    <div className="delete-dialog__body">
                        <p>
                            {character.name}, their portrait and everything on their sheet will be permanently deleted.
                            This can’t be undone.
                        </p>
                        {character.isActive && (
                            <p>They’re your active character in {character.campaignName}; your newest other approved character there, if any, becomes active instead.</p>
                        )}
                    </div>
                </TypeToConfirmDialog>
            )}
        </div>
    )
}
