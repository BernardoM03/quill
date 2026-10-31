import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { PASSWORD_MAX_LENGTH, getSessionUser, login } from "../api/auth";
import { isSetupNeeded } from "../api/setup";
import "./Join.css";

function errorMessage(err: unknown, fallback: string): string {
    const response = (err as { response?: { data?: { error?: string } } }).response;
    return response?.data?.error ?? fallback;
}

// Only same-site paths, so a crafted ?next= can't send someone to another website.
function safeNext(next: string | null): string {
    return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

// Sign-in for the admin and players alike. Before the admin exists, points to the setup link instead.
export default function Login() {
    const [searchParams] = useSearchParams();
    const next = safeNext(searchParams.get('next'))
    const navigate = useNavigate();
    const [setupNeeded, setSetupNeeded] = useState<boolean | undefined>(undefined)
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        isSetupNeeded().then(setSetupNeeded).catch(() => setSetupNeeded(false))
        // Already signed in (e.g. another tab): skip the form.
        getSessionUser().then(user => { if (user) navigate(next, { replace: true }) }).catch(() => {})
    }, [navigate, next])

    function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
        e.preventDefault()
        setBusy(true)
        setError(null)
        login(username, password)
            .then(() => navigate(next, { replace: true }))
            .catch(err => {
                setError(errorMessage(err, 'Could not sign in.'))
                setBusy(false)
            })
    }

    if (setupNeeded === undefined) return <div className="page" />

    if (setupNeeded) {
        return (
            <div className="page">
                <h1>Set up Quill</h1>
                <p className="muted">
                    Quill needs an admin account first. Open the setup link printed in the server’s output when it started.
                </p>
            </div>
        )
    }

    return (
        <div className="page join">
            <span className="setting-caption">Quill</span>
            <h1>Sign in</h1>
            <form className="join__form" onSubmit={handleSubmit}>
                <label className="join__field">
                    <span className="join__label">Username</span>
                    <input value={username} onChange={e => setUsername(e.target.value)} required autoFocus
                        autoComplete="username" />
                </label>
                <label className="join__field">
                    <span className="join__label">Password</span>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                        maxLength={PASSWORD_MAX_LENGTH} autoComplete="current-password" />
                </label>
                <button type="submit" className="setting-button" disabled={busy}>Sign in</button>
            </form>
            {error && <p className="campaign-name__error">{error}</p>}
            <p className="muted login__hint">New player? Use the invite link from your GM to create an account.</p>
        </div>
    )
}
