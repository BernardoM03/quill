import { useNavigate } from "react-router";
import axios from "axios";


export default function SetupUser() {
    const navigate = useNavigate();

    function handleUserSubmit(e: React.SubmitEvent<HTMLFormElement>) {
        e.preventDefault()

        const newUser = new FormData(e.currentTarget).get('userName') as string 

        // Create user.json file using quillDataLayer
        axios.post('http://localhost:5174/create/user', { name: newUser })
            .then(() => navigate('/'))
            .catch((error) => console.error('Error creating user:', error));
    }

    return (
        <div>
            <h1>Welcome to Quill</h1>
            <form method="post" onSubmit={handleUserSubmit}>
                <label>
                    Enter a Username:
                    <input type="text" maxLength={20} name="userName" />
                </label>
                <button type="submit">Create User</button>
            </form>
        </div>
    )
}