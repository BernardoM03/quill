import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { getMap, type CampaignMap, type GmMap } from "../api/maps";
import BackButton from "../components/BackButton";
import { MapSetup } from "../components/maps/MapSetup";
import { MapViewer } from "../components/maps/MapViewer";
import "../components/campaignSettings/CampaignSettings.css";
import "../components/maps/Maps.css";

// How often players refetch the map so newly revealed hexes appear, which costs an empty 304 when unchanged.
const REFRESH_MS = 20_000;

// One map page, where the GM sets up a draft then edits hexes, and players see what has been revealed.
export default function MapPage() {
    const { campaignID = '', mapID = '' } = useParams();
    const navigate = useNavigate();
    const [map, setMap] = useState<CampaignMap | null | undefined>(undefined)

    useEffect(() => {
        let current = true
        getMap(campaignID, mapID).then(loaded => current && setMap(loaded)).catch(() => current && setMap(null))
        return () => { current = false }
    }, [campaignID, mapID])

    const isPlayer = map ? !map.canEdit : false
    useEffect(() => {
        if (!isPlayer) return
        // A failed refresh keeps the current map until the next attempt.
        const timer = window.setInterval(() => {
            getMap(campaignID, mapID).then(setMap).catch(() => undefined)
        }, REFRESH_MS)
        return () => window.clearInterval(timer)
    }, [isPlayer, campaignID, mapID])

    // Changes the GM's copy from the copy held at that moment.
    const update = useCallback((change: (map: GmMap) => GmMap) => {
        setMap(current => (current && current.canEdit ? change(current) : current))
    }, [])

    if (map === undefined) return <div className="page" />

    if (map === null) {
        return (
            <div className="page">
                <BackButton/>
                <h1>Map not found</h1>
                <p className="muted">It may have been deleted, or it isn’t open to players.</p>
            </div>
        )
    }

    const toCampaign = () => navigate(`/campaign/${campaignID}`, { replace: true })

    return (
        <div className="page">
            <BackButton/>
            <h1 className="map-page__title">{map.name}</h1>
            {map.canEdit && map.status === 'draft'
                ? <MapSetup campaignId={campaignID} map={map} update={update} onDeleted={toCampaign} />
                : <MapViewer campaignId={campaignID} map={map} update={update} onDeleted={toCampaign} />}
        </div>
    )
}
