import axios from "axios";

export default function CampaignSettings() {

    function handleNameSubmit(e: React.SubmitEvent<HTMLFormElement>) {
        e.preventDefault()
        const newCampaignName = new FormData(e.currentTarget).get('campaignName') as string;
        console.log(newCampaignName)
    }

    return (
        <div>
            <h1>Campaign Settings</h1>
            <div className="campaign-basic-info">
                <h2>Change Campaign Name</h2>
                <form method="post" onSubmit={handleNameSubmit}> 
                    <label>
                        Campaign Name:
                        <input type="text" name="campaignName" />
                    </label>
                    <button type="submit">Modify Campaign</button>
                </form>
            </div>
        </div>
    )
}