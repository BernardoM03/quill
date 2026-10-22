import { Link } from 'react-router-dom'
import './LegalFooter.css'

// CC-BY-4.0 s. 3(a)(1) wants the attribution given "in any reasonable manner based
// on the medium". For a web app that means on screen, not just in the repo, so this
// sits in the root layout and links out to the full notices.
export default function LegalFooter() {
  return (
    <footer className="legal-footer">
      <p>
        Includes material from the SRD 5.2.1 by Wizards of the Coast LLC, licensed
        under{' '}
        <a href="https://creativecommons.org/licenses/by/4.0/legalcode" target="_blank" rel="noreferrer">
          CC BY 4.0
        </a>
        . Changes were made. Not affiliated with or endorsed by Wizards of the Coast.
      </p>
      <p>
        <Link to="/legal">Licenses and attribution</Link>
      </p>
    </footer>
  )
}
