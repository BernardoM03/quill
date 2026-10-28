import { useState } from "react";
import { useNavigate } from "react-router";

import { createUser } from "../api/users";
import BackButton from "../components/BackButton";
import "../components/campaignSettings/CampaignSettings.css";

const USER_NAME_MAX_LENGTH = 20

// Laid out like the New Campaign page: a caption over a title-sized input.
export default function SetupUser() {
    const navigate = useNavigate();
    const [draft, setDraft] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    function handleUserSubmit(e: React.SubmitEvent<HTMLFormElement>) {
        e.preventDefault()

        const name = draft.trim().replace(/\s+/g, " ")
        if (!name) {
            setError(`Username must be 1–${USER_NAME_MAX_LENGTH} characters.`)
            return
        }

        setSaving(true)
        createUser(name)
            .then(() => navigate('/'))
            .catch((err) => {
                setError(err.response?.data?.error ?? 'Could not create user.')
                setSaving(false)
            });
    }

    return (
        <div className="page">
            <BackButton/>
            <h1>Welcome to Quill</h1>
            <div className="campaign-name">
                <span className="setting-caption">Username</span>
                <form className="campaign-name__form" onSubmit={handleUserSubmit}>
                    <input
                        className="campaign-name__input"
                        aria-label="Username"
                        value={draft}
                        maxLength={USER_NAME_MAX_LENGTH}
                        autoFocus
                        onChange={e => setDraft(e.target.value)}
                    />
                    <button type="submit" className="setting-button" disabled={saving}>Create User</button>
                </form>
                {error && <p className="campaign-name__error">{error}</p>}
            </div>
        </div>
    )
}
