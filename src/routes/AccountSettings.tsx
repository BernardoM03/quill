import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { ACCOUNT_EXPORT_URL, ERASE_PHRASE, deleteAccount } from "../api/account";
import { getSessionUser, type sessionUser } from "../api/auth";
import BackButton from "../components/BackButton";
import TypeToConfirmDialog from "../components/TypeToConfirmDialog";
import "../components/campaignSettings/CampaignSettings.css";
import "./AccountSettings.css";

// The signed-in user's account: the name, and deleting the account.
export default function AccountSettings() {
    const navigate = useNavigate()
    const [user, setUser] = useState<sessionUser | null>(null)
    const [deleting, setDeleting] = useState<'snapshot' | 'erase' | null>(null)

    useEffect(() => {
        // Not signed in: getSessionUser resolves null, so send them to sign in and back.
        getSessionUser()
            .then(found => {
                if (found) setUser(found)
                else window.location.assign(`/login?next=${encodeURIComponent('/account')}`)
            })
            .catch(error => console.error('Error loading account:', error))
    }, [])

    // The server has signed them out; nothing is left to show here.
    function handleDeleted() {
        navigate('/login', { replace: true })
    }

    return (
        <div className="page">
            <BackButton/>
            <h1>Account Settings</h1>
            {user && (
                <div className="campaign-name">
                    <span className="setting-caption">Account Name</span>
                    <h2>{user.displayName}</h2>
                </div>
            )}

            {user && (
                <div className="settings-danger account-delete">
                    <span className="setting-caption">Delete Account</span>
                    {user.isAdmin ? (
                        <p className="muted">
                            The admin account hosts this server and can’t be deleted from the web app.
                        </p>
                    ) : (
                        <>
                            <p className="muted">
                                Removes your account, your campaign memberships and your characters, including their notes.
                            </p>
                            <div className="account-delete__actions">
                                <button type="button" className="setting-button setting-button--danger"
                                    onClick={() => setDeleting('snapshot')}>
                                    Delete Account
                                </button>
                                <button type="button" className="setting-button setting-button--danger"
                                    onClick={() => setDeleting('erase')}>
                                    Delete All Data Permanently
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {user && deleting === 'snapshot' && (
                <TypeToConfirmDialog
                    title="Delete your account?"
                    phrase={user.username}
                    confirmLabel="Delete Account"
                    busyLabel="Deleting…"
                    onConfirm={() => deleteAccount('snapshot', user.username).then(handleDeleted)}
                    onClose={() => setDeleting(null)}
                >
                    <div className="delete-dialog__body">
                        <p>
                            Your account, campaign memberships and characters (notes included) will be removed from Quill.
                            The admin keeps a copy for 30 days and can restore your account in that time.
                        </p>
                        <p>
                            First, you can <a href={ACCOUNT_EXPORT_URL} download>download a copy of your data</a> as a JSON file.
                        </p>
                    </div>
                </TypeToConfirmDialog>
            )}

            {user && deleting === 'erase' && (
                <TypeToConfirmDialog
                    title="Permanently delete all your data?"
                    phrase={ERASE_PHRASE}
                    confirmLabel="Delete Everything"
                    busyLabel="Deleting…"
                    onConfirm={() => deleteAccount('erase', ERASE_PHRASE).then(handleDeleted)}
                    onClose={() => setDeleting(null)}
                >
                    <div className="delete-dialog__body">
                        <p>
                            Your account, campaign memberships and characters (notes included) will be permanently
                            deleted. No copy is kept, and the admin can’t restore it.
                        </p>
                        <p>Copies in the server’s backups are cleared within 30 days.</p>
                        <p>
                            You may want to <a href={ACCOUNT_EXPORT_URL} download>download a copy of your data</a> first.
                        </p>
                    </div>
                </TypeToConfirmDialog>
            )}
        </div>
    )
}
