import { useEffect, useState } from "react";

import { getMembers, removeMember, type campaignMember } from "../../api/campaigns";
import TypeToConfirmDialog from "../TypeToConfirmDialog";
import "./CampaignSettings.css";

function plural(n: number, word: string): string {
    return `${n} ${word}${n === 1 ? '' : 's'}`
}

// Everyone in the campaign. Players can be removed, which also deletes their characters here.
export function CampaignMemberSettings({ campaignId }: { campaignId: string }) {
    const [members, setMembers] = useState<campaignMember[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [removing, setRemoving] = useState<campaignMember | null>(null)

    useEffect(() => {
        getMembers(campaignId).then(setMembers).catch(() => setError('Could not load members.'))
    }, [campaignId])

    function handleRemoved(member: campaignMember) {
        setMembers(list => list && list.filter(m => m.userId !== member.userId))
        setRemoving(null)
    }

    const players = members?.filter(m => m.role === 'player').length ?? 0

    return (
        <div className="setting-section">
            <span className="setting-caption">Members{members && ` · ${plural(players, 'player')}`}</span>
            {error && <p className="setting-error">{error}</p>}
            {members && players === 0 && (
                <p className="muted">No players yet. Create an invite link above to bring some in.</p>
            )}
            {members && members.length > 0 && (
                <ul className="member-list">
                    {members.map(member => (
                        <li key={member.userId} className="member">
                            <div className="member__info">
                                <span className="member__name">
                                    {member.displayName} <span className="muted">({member.username})</span>
                                </span>
                                <span className="setting-hint">
                                    {member.role === 'gm' ? 'GM' : 'Player'}
                                    {' · '}joined {new Date(member.joinedAt).toLocaleDateString()}
                                    {' · '}{plural(member.characterCount, 'character')}
                                </span>
                            </div>
                            {member.role === 'player' && (
                                <button type="button" className="setting-button setting-button--quiet member__remove"
                                    onClick={() => setRemoving(member)}>
                                    Remove
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {removing && (
                <TypeToConfirmDialog
                    title={`Remove ${removing.displayName}?`}
                    phrase={removing.username}
                    confirmLabel="Remove Player"
                    busyLabel="Removing…"
                    onConfirm={() => removeMember(campaignId, removing.userId).then(() => handleRemoved(removing))}
                    onClose={() => setRemoving(null)}
                >
                    <div className="delete-dialog__body">
                        <p>
                            They’ll leave this campaign, and {removing.characterCount === 0
                                ? 'they have no characters here.'
                                : <>their {plural(removing.characterCount, 'character')} in it will be permanently deleted.</>}
                        </p>
                        <p>Their account isn’t affected. They can rejoin with a new invite link, starting fresh.</p>
                    </div>
                </TypeToConfirmDialog>
            )}
        </div>
    )
}
