import { initials } from '../util.js';

export default function Avatar({ name, photo, size = 44 }) {
  const style = { width: size, height: size, fontSize: size * 0.38 };
  return photo
    ? <img className="avatar" src={photo} alt="" style={style} />
    : <span className="avatar initials" style={style} aria-hidden="true">{initials(name)}</span>;
}
