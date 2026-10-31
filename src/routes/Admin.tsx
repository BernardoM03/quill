import { useEffect, useState } from "react";

import { getDeletedAccounts, restoreAccount, type deletedAccount, type restoreResult } from "../api/admin";
import BackButton from "../components/BackButton";
import "../components/campaignSettings/CampaignSettings.css";
import "./Admin.css";

function errorMessage(err: unknown, fallback: string): string {
    const response = (err as { response?: { data?: { error?: string } } }).response;
    return response?.data?.error ?? fallback;
}

function describeRestore(result: restoreResult): string {
    const parts = [`Restored ${result.username}.`]
    if (result.skippedCampaigns.length > 0) {
        parts.push(`Not rejoined (campaign deleted since): ${result.skippedCampaigns.join(', ')}.`)
    }
    if (result.skippedCharacters > 0) {
        parts.push(`${result.skippedCharacters} character${result.skippedCharacters === 1 ? '' : 's'} in those campaigns could not be restored.`)
    }
    return parts.join(' ')
}

// Admin-only. Lists deleted accounts still inside their 30 days, with a Restore button each.
export default function Admin() {
    const [accounts, setAccounts] = useState<deletedAccount[] | null>(null)
    // Not signed in as the admin: the server answers 404 and this stays set.
    const [loadError, setLoadError] = useState<string | null>(null)
    const [message, setMessage] = useState<{ text: string, failed: boolean } | null>(null)
    const [restoring, setRestoring] = useState<string | null>(null)

    useEffect(() => {
        getDeletedAccounts()
            .then(setAccounts)
            .catch(err => setLoadError(err.response?.status === 404
                ? 'Only the admin can see this page.'
                : 'Could not load deleted accounts.'))
    }, [])

    function handleRestore(account: deletedAccount) {
        if (!confirm(`Restore ${account.displayName} (${account.username})?`)) return
        setRestoring(account.id)
        setMessage(null)
        restoreAccount(account.id)
            .then(result => {
                setAccounts(list => list && list.filter(a => a.id !== account.id))
                setMessage({ text: describeRestore(result), failed: false })
            })
            .catch(err => setMessage({ text: errorMessage(err, 'Could not restore the account.'), failed: true }))
            .finally(() => setRestoring(null))
    }

    return (
        <div className="page">
            <BackButton/>
            <h1>Admin</h1>
            {loadError && <p className="muted">{loadError}</p>}
            {accounts && (
                <div className="setting-section">
                    <span className="setting-caption">Deleted Accounts</span>
                    <p className="setting-hint">
                        Accounts deleted with the default option can be restored for 30 days, then they’re permanently deleted.
                    </p>
                    {message && (
                        <p className={message.failed ? 'setting-error' : 'admin-notice'} role="status">{message.text}</p>
                    )}
                    {accounts.length === 0 ? (
                        <p className="muted">No deleted accounts to restore.</p>
                    ) : (
                        <ul className="deleted-accounts">
                            {accounts.map(account => (
                                <li key={account.id} className="deleted-account">
                                    <div className="deleted-account__info">
                                        <span className="deleted-account__name">
                                            {account.displayName} <span className="muted">({account.username})</span>
                                        </span>
                                        <span className="setting-hint">
                                            Deleted {new Date(account.deletedAt).toLocaleDateString()}
                                            {' · '}{account.characterCount} character{account.characterCount === 1 ? '' : 's'}
                                            {account.campaigns.length > 0 && <> · {account.campaigns.join(', ')}</>}
                                        </span>
                                    </div>
                                    <span className={`deleted-account__days${account.daysLeft <= 3 ? ' deleted-account__days--soon' : ''}`}>
                                        {account.daysLeft} day{account.daysLeft === 1 ? '' : 's'} left
                                    </span>
                                    <button type="button" className="setting-button" disabled={restoring !== null}
                                        onClick={() => handleRestore(account)}>
                                        {restoring === account.id ? 'Restoring…' : 'Restore'}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    )
}
