import { useState, useEffect } from 'react'
import { fetchPackManifests } from '../datatypes/pack'
import type { pack } from '../datatypes/pack'
import './Legal.css'

// The notices every shipped content pack requires, rendered from the manifests
// themselves so a newly installed pack cannot go un-attributed.
export default function Legal() {
  const [packs, setPacks] = useState<pack[]>([])

  useEffect(() => {
    fetchPackManifests()
      .then(setPacks)
      .catch(error => console.error('Error fetching pack manifests:', error))
  }, [])

  return (
    <div className="legal">
      <h2>Licenses and Attribution</h2>

      <section className="legal__section">
        <h3>Quill</h3>
        <p>
          Quill is free software, licensed under the{' '}
          <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noreferrer">
            GNU Affero General Public License, version 3
          </a>
          . The AGPL covers Quill's own source code. It does not cover the game
          content packs below, which carry their own terms.
        </p>
      </section>

      <section className="legal__section">
        <h3>Content packs</h3>
        {packs.map(installed => (
          <article key={installed.id} className="legal__pack">
            <h4>
              {installed.name} <span className="legal__license">{installed.license}</span>
            </h4>
            {installed.attribution && <p>{installed.attribution}</p>}
            {installed.modifications && <p>{installed.modifications}</p>}
          </article>
        ))}
      </section>

      <section className="legal__section">
        <h3>Trademarks</h3>
        <p>
          The Creative Commons license on the SRD grants copyright permissions only.
          It grants no rights in any trademark.
        </p>
        <p>
          Dungeons &amp; Dragons, D&amp;D, and Wizards of the Coast are trademarks of
          Wizards of the Coast LLC. Quill is not affiliated with, endorsed by, or
          sponsored by Wizards of the Coast.
        </p>
      </section>
    </div>
  )
}
