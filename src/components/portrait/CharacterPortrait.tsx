import { portraitUrl } from '../../api/characters';
import './CharacterPortrait.css';

// A character's portrait in a square frame, or their initial when they have none.
// size: the frame's width and height in pixels.
export function CharacterPortrait({ characterId, name, version, size = 40 }: {
  characterId: string;
  name: string;
  version: string | null;
  size?: number;
}) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.45) };
  if (!version) {
    return (
      <span className="portrait portrait--empty" style={style} aria-hidden="true">
        {name.trim().charAt(0).toUpperCase() || '?'}
      </span>
    );
  }
  return <img className="portrait" style={style} src={portraitUrl(characterId, version)} alt={`Portrait of ${name}`} />;
}
