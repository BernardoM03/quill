import { Form } from "react-router";
import { v4 as uuidv4 } from "uuid";
import type { campaign } from "../datatypes/campaign";

function campaignHandler(data: FormData) {
    const campaignName = data.get('campaignName');

    const newCampaign: campaign = {
        name: campaignName as string,
        id: uuidv4()
    };

    console.log('Creating campaign:', newCampaign);
    // Send the campaign name to your backend to create a new campaign
}

export default function SetupCampaign() {
    return (
        <div>
            <h2>Setup Campaign</h2>
            <p>This is the setup campaign page.</p>
            <Form method="post" onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                campaignHandler(formData);
            }}> 
                <label>
                    Campaign Name:
                    <input type="text" name="campaignName" />
                </label>
                <button type="submit">Create Campaign</button>
            </Form>
        </div>
    )
}