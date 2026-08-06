import { useNavigate } from "react-router";

import { createUser } from "../api/users";
import FormField from "../components/FormField";

export default function SetupUser() {
    const navigate = useNavigate();

    function handleUserSubmit(e: React.SubmitEvent<HTMLFormElement>) {
        e.preventDefault()

        const name = new FormData(e.currentTarget).get('userName') as string;

        createUser(name)
            .then(() => navigate('/'))
            .catch((error) => console.error('Error creating user:', error));
    }

    return (
        <div>
            <h1>Welcome to Quill</h1>
            <form method="post" onSubmit={handleUserSubmit}>
                <FormField label="Enter a Username:" name="userName" maxLength={20} />
                <button type="submit">Create User</button>
            </form>
        </div>
    )
}
