import {Link, Outlet} from 'react-router-dom'
import { useState, useEffect } from 'react'
import type { user } from './datatypes/user'
import { LifeLine } from 'react-loading-indicators'

export default function App() {
  const [userData, setUserData] = useState<user | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [welcomeMessage, setWelcomeMessage] = useState('Welcome to Quill! Please make sure to set up your user profile to get the best experience.')

  // Fetch user data from the JSON file at startup
  useEffect(() => {
    fetch('/user.json')
      .then(response => response.json())
      .then(data => {
        setUserData(data)
        setIsLoading(false)
        setWelcomeMessage(`Welcome, ${data.name}!`)
      })
      .catch(error => console.error('Error fetching user data:', error))
  }
  , [])

  // Log user data to the console after it is first fetched
  useEffect(() => {
    if (userData) {
      console.log('User data loaded:', userData)
    }
  }, [userData])

  setTimeout(() => {
    setIsLoading(false);
  }, 2000);

  return (
    <>
      <h1>Quill</h1>
      {/* Wait to fetch  */}
      { isLoading ? 
        <LifeLine color="#5fb1dd" size="medium" text="" textColor="" /> :
        <p>{welcomeMessage}</p>
      }

      <nav>
        {/* <Link to="/rules">Rules</Link> */}
      </nav>
      <Outlet />
    </>
  )
}