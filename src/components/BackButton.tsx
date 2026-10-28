import { useLocation, useNavigate } from 'react-router-dom'

// Goes back to whichever page led here. When there's nothing to go back to
// (the page was opened directly or in a new tab), goes home instead.
export default function BackButton({ disabled = false }: { disabled?: boolean }) {
  const navigate = useNavigate()
  const location = useLocation()
  // React Router gives the first page of a session the key "default".
  const hasHistory = location.key !== 'default'

  return (
    <button
      type="button"
      className="setting-button setting-button--quiet back-button"
      disabled={disabled}
      onClick={() => (hasHistory ? navigate(-1) : navigate('/'))}
    >
      ← Back
    </button>
  )
}
