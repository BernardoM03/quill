import BackButton from '../components/BackButton'
import { usePackManifests } from '../packs/usePacks'
import './Legal.css'

// The notices every shipped content pack requires, rendered from the manifests
// themselves so a newly installed pack cannot go un-attributed.
export default function Legal() {
  const { data: packs, error } = usePackManifests()

  return (
    <div className="page legal">
      <BackButton />
      <h1>Licenses and Attribution</h1>

      <section className="legal__section">
        <span className="setting-caption">Quill</span>
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
        <span className="setting-caption">Content packs</span>
        {error && <p className="muted">Couldn't load the installed packs: {error.message}</p>}
        {packs?.map(installed => (
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
        <span className="setting-caption">Trademarks</span>
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
