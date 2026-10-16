// The official CJM Marine logo (public/cjm-marine-logo.png, transparent background).
// It is navy and gold, so always place it on a white or light surface.
export const LOGO_SRC = '/cjm-marine-logo.png';

export default function Logo({ size = 'md', className = '' }) {
  return <img className={`logo logo-${size} ${className}`} src={LOGO_SRC} alt="CJM Marine" width="900" height="367" />;
}
