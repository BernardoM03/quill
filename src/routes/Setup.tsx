import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, USERNAME_PATTERN } from "../api/auth";
import { completeSetup, isSetupNeeded } from "../api/setup";
import "./Join.css";

function errorMessage(err: unknown, fallback: string): string {
    const response = (err as { response?: { data?: { error?: string } } }).response;
    return response?.data?.error ?? fallback;
}

// First-run page for creating the admin. Opened from the link the server prints, which carries a one-time token.
export default function Setup() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token') ?? ''
    const navigate = useNavigate();
    const [needed, setNeeded] = useState<boolean | undefined>(undefined)
    const [username, setUsername] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        isSetupNeeded().then(setNeeded).catch(() => setError('Could not reach the server.'))
    }, [])

    function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
        e.preventDefault()
        if (password !== confirm) {
            setError('Passwords do not match.')
            return
        }
        setBusy(true)
        setError(null)
        completeSetup(token, username, password, displayName.trim() || undefined)
            .then(() => navigate('/', { replace: true }))
            .catch(err => {
                setError(errorMessage(err, 'Could not create the admin account.'))
                setBusy(false)
            })
    }

    if (needed === undefined) {
        return <div className="page">{error && <p className="campaign-name__error">{error}</p>}</div>
    }

    if (!needed) {
        return (
            <div className="page">
                <h1>Quill is set up</h1>
                <p className="muted">An admin account already exists.</p>
                <Link to="/" className="setting-button">Go home</Link>
            </div>
        )
    }

    if (!token) {
        return (
            <div className="page">
                <h1>Set up Quill</h1>
                <p className="muted">
                    Open the setup link printed in the server’s output when it started. It includes a one-time code.
                </p>
            </div>
        )
    }

    return (
        <div className="page join">
            <span className="setting-caption">First-time setup</span>
            <h1>Create the admin account</h1>
            <p className="muted">The admin hosts this server and can create campaigns and invite players.</p>
            <form className="join__form" onSubmit={handleSubmit}>
                <label className="join__field">
                    <span className="join__label">Username</span>
                    <input value={username} onChange={e => setUsername(e.target.value)} required autoFocus
                        autoComplete="username" pattern={USERNAME_PATTERN}
                        title="3–32 letters, numbers, dots, dashes or underscores" />
                </label>
                <label className="join__field">
                    <span className="join__label">Display name <span className="muted">(optional)</span></span>
                    <input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={64}
                        autoComplete="nickname" />
                </label>
                <label className="join__field">
                    <span className="join__label">Password</span>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                        minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} autoComplete="new-password" />
                </label>
                <label className="join__field">
                    <span className="join__label">Confirm password</span>
                    <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required
                        maxLength={PASSWORD_MAX_LENGTH} autoComplete="new-password" />
                </label>
                <button type="submit" className="setting-button" disabled={busy}>Create admin account</button>
            </form>
            {error && <p className="campaign-name__error">{error}</p>}
        </div>
    )
}
