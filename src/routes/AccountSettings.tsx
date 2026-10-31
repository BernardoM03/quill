import { useEffect, useState } from "react";

import { getSessionUser, type sessionUser } from "../api/auth";
import BackButton from "../components/BackButton";
import "../components/campaignSettings/CampaignSettings.css";

// The signed-in user's account. Shows only the name for now; settings come later.
export default function AccountSettings() {
    const [user, setUser] = useState<sessionUser | null>(null)

    useEffect(() => {
        // Not signed in: getSessionUser resolves null, so send them to sign in and back.
        getSessionUser()
            .then(found => {
                if (found) setUser(found)
                else window.location.assign(`/login?next=${encodeURIComponent('/account')}`)
            })
            .catch(error => console.error('Error loading account:', error))
    }, [])

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
        </div>
    )
}
