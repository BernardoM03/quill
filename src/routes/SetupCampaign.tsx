import { Form, useNavigate } from "react-router";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";

import type { campaign } from "../datatypes/campaign";


export default function SetupCampaign() {
    const navigate = useNavigate();

    function campaignHandler(data: FormData) {
        const campaignName = data.get('campaignName');

        const newCampaign: campaign = {
            name: campaignName as string,
            id: uuidv4()
        };

        console.log('Creating campaign:', newCampaign);

        axios.post('http://localhost:5174/createcampaign', newCampaign)
            .then((response) => {
                console.log('Campaign created:', response.data);
                navigate(`/campaignsettings/${newCampaign.id}`);
            })
            .catch((error) => {
                console.error('Error creating campaign:', error);
            });
    }

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