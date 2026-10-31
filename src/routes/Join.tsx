import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";

import {
    PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, USERNAME_PATTERN,
    getSessionUser, login, logout, signup, type sessionUser,
} from "../api/auth";
import { acceptInvite, checkInvite, type inviteCheck } from "../api/invites";
import "../components/campaignSettings/CampaignSettings.css";
import "./Join.css";

const STATUS_MESSAGES = {
    expired: 'This invite has expired.',
    used: 'This invite has already been used.',
    revoked: 'This invite has been withdrawn.',
} as const;

function errorMessage(err: unknown, fallback: string): string {
    const response = (err as { response?: { data?: { error?: string } } }).response;
    return response?.data?.error ?? fallback;
}

// Landing page for an invite link: create an account or sign in, then join the campaign.
export default function Join() {
    const { token = '' } = useParams();
    const navigate = useNavigate();
    const [invite, setInvite] = useState<inviteCheck | null | undefined>(undefined)
    const [user, setUser] = useState<sessionUser | null | undefined>(undefined)
    const [mode, setMode] = useState<'signup' | 'login'>('signup')
    const [username, setUsername] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        checkInvite(token).then(setInvite).catch(err => setError(errorMessage(err, 'Could not check this invite.')))
        getSessionUser().then(setUser).catch(() => setUser(null))
    }, [token])

    function join() {
        return acceptInvite(token).then(campaignId => navigate(`/campaign/${campaignId}`, { replace: true }))
    }

    function run(action: () => Promise<unknown>, fallback: string) {
        setBusy(true)
        setError(null)
        action().catch(err => {
            setError(errorMessage(err, fallback))
            setBusy(false)
        })
    }

    function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
        e.preventDefault()
        if (mode === 'signup') {
            run(() => signup(token, username, password, displayName.trim() || undefined)
                .then(campaignId => navigate(`/campaign/${campaignId}`, { replace: true })), 'Could not create your account.')
        } else {
            run(() => login(username, password).then(join), 'Could not sign in.')
        }
    }

    function handleSignOut() {
        logout().then(() => setUser(null))
    }

    if (invite === undefined || user === undefined) {
        return <div className="page">{error && <p className="campaign-name__error">{error}</p>}</div>
    }

    if (invite === null || !invite.valid) {
        return (
            <div className="page">
                <h1>Invite not valid</h1>
                <p className="muted">
                    {invite ? STATUS_MESSAGES[invite.status as keyof typeof STATUS_MESSAGES] : 'This invite link doesn’t exist.'}
                    {' '}Ask your GM for a new one.
                </p>
            </div>
        )
    }

    return (
        <div className="page join">
            <span className="setting-caption">You’re invited to</span>
            <h1>{invite.campaignName}</h1>

            {user ? (
                <div className="join__signed-in">
                    <p>Signed in as <strong>{user.displayName}</strong>.</p>
                    <div className="join__actions">
                        <button type="button" className="setting-button" disabled={busy}
                            onClick={() => run(join, 'Could not join the campaign.')}>
                            Join campaign
                        </button>
                        <button type="button" className="setting-button setting-button--quiet" disabled={busy}
                            onClick={handleSignOut}>
                            Not you? Sign out
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <div className="tabs" role="tablist">
                        <button type="button" role="tab" aria-selected={mode === 'signup'}
                            onClick={() => { setMode('signup'); setError(null) }}>Create account</button>
                        <button type="button" role="tab" aria-selected={mode === 'login'}
                            onClick={() => { setMode('login'); setError(null) }}>Sign in</button>
                    </div>
                    <form className="join__form" onSubmit={handleSubmit}>
                        <label className="join__field">
                            <span className="join__label">Username</span>
                            <input value={username} onChange={e => setUsername(e.target.value)} required autoFocus
                                autoComplete="username"
                                {...(mode === 'signup' ? { pattern: USERNAME_PATTERN, title: '3–32 letters, numbers, dots, dashes or underscores' } : {})} />
                        </label>
                        {mode === 'signup' && (
                            <label className="join__field">
                                <span className="join__label">Display name <span className="muted">(optional)</span></span>
                                <input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={64}
                                    autoComplete="nickname" />
                            </label>
                        )}
                        <label className="join__field">
                            <span className="join__label">Password</span>
                            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                                maxLength={PASSWORD_MAX_LENGTH}
                                minLength={mode === 'signup' ? PASSWORD_MIN_LENGTH : undefined}
                                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
                        </label>
                        <button type="submit" className="setting-button" disabled={busy}>
                            {mode === 'signup' ? 'Create account and join' : 'Sign in and join'}
                        </button>
                    </form>
                </>
            )}
            {error && <p className="campaign-name__error">{error}</p>}
        </div>
    )
}
