import { useEffect, useState } from "react";

import { createInvite, getInvites, joinLink, revokeInvite, type invite } from "../../api/invites";
import "./CampaignSettings.css";

const EXPIRY_OPTIONS = [
    { label: '1 day', days: 1 },
    { label: '7 days', days: 7 },
    { label: '30 days', days: 30 },
    { label: 'Never', days: null },
] as const

const USES_OPTIONS = [
    { label: '1 use', uses: 1 },
    { label: '5 uses', uses: 5 },
    { label: '10 uses', uses: 10 },
    { label: 'Unlimited', uses: null },
] as const

const STATUS_LABELS = { active: 'Active', expired: 'Expired', used: 'Used up', revoked: 'Revoked' } as const

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

function describeExpiry(expiresAt: string | null): string {
    if (!expiresAt) return 'Never expires'
    const ms = new Date(expiresAt).getTime() - Date.now()
    if (ms <= 0) return `Expired ${new Date(expiresAt).toLocaleDateString()}`
    const hours = ms / 3_600_000
    return hours < 24
        ? `Expires ${relative.format(Math.ceil(hours), 'hour')}`
        : `Expires ${relative.format(Math.round(hours / 24), 'day')}`
}

function describeUses(item: invite): string {
    if (item.maxUses === null) return `${item.useCount} used · unlimited`
    const left = Math.max(0, item.maxUses - item.useCount)
    return `${left} of ${item.maxUses} ${item.maxUses === 1 ? 'use' : 'uses'} left`
}

// Copies text, falling back to selecting it when the clipboard API isn't available
// (it needs a secure context: localhost or HTTPS).
function copyText(text: string, input: HTMLInputElement | null): Promise<void> {
    if (navigator.clipboard) return navigator.clipboard.writeText(text)
    input?.select()
    return Promise.reject(new Error('clipboard unavailable'))
}

// Invite links for a campaign. A link can only be copied right after it's made: the
// server keeps just a hash of the token, so older invites can be revoked but not re-shown.
export function CampaignInviteSettings({ campaignId }: { campaignId: string }) {
    const [invites, setInvites] = useState<invite[] | null>(null)
    const [days, setDays] = useState<number | null>(7)
    const [uses, setUses] = useState<number | null>(null)
    // Raw tokens of links made on this visit, by invite id.
    const [tokens, setTokens] = useState<Record<string, string>>({})
    const [copied, setCopied] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [showInactive, setShowInactive] = useState(false)

    useEffect(() => {
        getInvites(campaignId).then(setInvites).catch(() => setError('Could not load invites.'))
    }, [campaignId])

    function handleCreate() {
        setBusy(true)
        setError(null)
        createInvite(campaignId, days, uses)
            .then(({ token, ...created }) => {
                setTokens(t => ({ ...t, [created.id]: token }))
                setInvites(list => [created, ...(list ?? [])])
            })
            .catch(err => setError(err.response?.data?.error ?? 'Could not create invite.'))
            .finally(() => setBusy(false))
    }

    function handleCopy(id: string, input: HTMLInputElement | null) {
        copyText(joinLink(tokens[id]), input)
            .then(() => {
                setCopied(id)
                setTimeout(() => setCopied(current => (current === id ? null : current)), 2000)
            })
            .catch(() => setError('Couldn’t copy automatically. The link is selected; copy it with Ctrl+C.'))
    }

    function handleRevoke(item: invite) {
        if (!confirm('Revoke this invite? Anyone with the link will no longer be able to join.')) return
        revokeInvite(item.id)
            .then(() => setInvites(list => list && list.map(i => (i.id === item.id ? { ...i, status: 'revoked' } : i))))
            .catch(err => setError(err.response?.data?.error ?? 'Could not revoke invite.'))
    }

    const active = invites?.filter(i => i.status === 'active') ?? []
    const inactive = invites?.filter(i => i.status !== 'active') ?? []

    function renderInvite(item: invite) {
        const token = tokens[item.id]
        let input: HTMLInputElement | null = null
        return (
            <li key={item.id} className={`invite${item.status === 'active' ? '' : ' invite--inactive'}`}>
                <div className="invite__info">
                    <span className="invite__status">{STATUS_LABELS[item.status]}</span>
                    <span className="setting-hint">
                        {describeUses(item)} · {item.status === 'revoked' ? 'Revoked' : describeExpiry(item.expiresAt)}
                    </span>
                </div>
                {item.status === 'active' && token && (
                    <div className="invite__link">
                        <input readOnly value={joinLink(token)} aria-label="Invite link"
                            ref={el => { input = el }} onFocus={e => e.target.select()} />
                        <button type="button" className="setting-button" onClick={() => handleCopy(item.id, input)}>
                            {copied === item.id ? 'Copied' : 'Copy link'}
                        </button>
                    </div>
                )}
                {item.status === 'active' && !token && (
                    <span className="setting-hint">Link shown only when created</span>
                )}
                {item.status === 'active' && (
                    <button type="button" className="setting-button setting-button--quiet invite__revoke"
                        onClick={() => handleRevoke(item)}>
                        Revoke
                    </button>
                )}
            </li>
        )
    }

    return (
        <div className="setting-section">
            <span className="setting-caption">Invites</span>
            <div className="invite-create">
                <select className="rules-select" aria-label="Expires after" value={String(days)}
                    onChange={e => setDays(e.target.value === 'null' ? null : Number(e.target.value))}>
                    {EXPIRY_OPTIONS.map(o => <option key={o.label} value={String(o.days)}>Expires: {o.label}</option>)}
                </select>
                <select className="rules-select" aria-label="Number of uses" value={String(uses)}
                    onChange={e => setUses(e.target.value === 'null' ? null : Number(e.target.value))}>
                    {USES_OPTIONS.map(o => <option key={o.label} value={String(o.uses)}>{o.label}</option>)}
                </select>
                <button type="button" className="setting-button" disabled={busy} onClick={handleCreate}>
                    Create invite link
                </button>
            </div>
            {error && <p className="setting-error">{error}</p>}
            {invites && active.length === 0 && <p className="muted">No active invites.</p>}
            {active.length > 0 && <ul className="invite-list">{active.map(renderInvite)}</ul>}
            {inactive.length > 0 && (
                <>
                    <button type="button" className="setting-button setting-button--quiet invite-list__toggle"
                        onClick={() => setShowInactive(s => !s)}>
                        {showInactive ? 'Hide' : 'Show'} {inactive.length} inactive
                    </button>
                    {showInactive && <ul className="invite-list">{inactive.map(renderInvite)}</ul>}
                </>
            )}
        </div>
    )
}
