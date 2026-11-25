import { useNavigate } from 'react-router-dom'

// Goes back to the previous page in this app, or home when there isn't one (a direct link or new tab).
export default function BackButton({ disabled = false }: { disabled?: boolean }) {
  const navigate = useNavigate()
  // React Router stores a 0-based entry index in history.state.idx, so anything above 0 has an earlier in-app page.
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
  const hasHistory = idx > 0

  return (
    <button
      type="button"
      className="setting-button setting-button--quiet back-button"
      disabled={disabled}
      onClick={() => (hasHistory ? navigate(-1) : navigate('/'))}
    >
      <span aria-hidden="true">←</span>Back
    </button>
  )
}
