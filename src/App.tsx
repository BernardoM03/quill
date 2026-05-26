import {Link, Outlet} from 'react-router-dom'


export default function App() {
  return (
    <>
      <h1>Quill</h1>
      <nav>
        <Link to="/rules">Rules</Link>
      </nav>
      <Outlet />
    </>
  )
}