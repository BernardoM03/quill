import { useNavigate } from 'react-router-dom'

// Goes back to whichever page led here. When there's no earlier page in this app
// (the page was opened directly, in a new tab, or reached by replacing the entry
// it was opened on, like an invite link), goes home instead.
export default function BackButton({ disabled = false }: { disabled?: boolean }) {
  const navigate = useNavigate()
  // React Router numbers its history entries from 0 (the first page it loaded) in
  // history.state.idx; replacing an entry keeps its number. Anything above 0 means
  // there's an earlier page of ours to go back to.
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
