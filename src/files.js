// Prepares photos and files for upload with a note.
// Photos are shrunk on the phone first (long side 1600 px, JPEG) so they upload quickly over marina Wi-Fi or satellite.
export const MAX_FILES = 6;
export const MAX_BYTES = 10 * 1024 * 1024;
export const ACCEPT = 'image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,video/mp4,video/quicktime';
const TYPES = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf|text\/plain|text\/csv|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|application\/msword|application\/vnd\.ms-excel|video\/(mp4|quicktime))$/;
const BY_EXT = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', txt: 'text/plain',
  heic: 'image/heic', heif: 'image/heif', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4', mov: 'video/quicktime' };

const readAsDataUrl = (blob) => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => bad(r.error); r.readAsDataURL(blob); });

async function shrink(file, maxSide, quality) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c.toDataURL('image/jpeg', quality);
}

/** Returns { name, mimeType, data (base64), thumb (data URL or ''), size } or throws a readable error. */
export async function prepareFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  let mimeType = file.type || BY_EXT[ext] || '';
  if (!TYPES.test(mimeType)) throw new Error(`"${file.name}" is not a supported file type. Use photos, PDF, Word, Excel, text or short videos.`);
  if (mimeType.startsWith('image/') && mimeType !== 'image/gif') {
    try {
      const full = await shrink(file, 1600, 0.82);
      const thumb = await shrink(file, 240, 0.7);
      const name = file.name.replace(/\.(heic|heif|png|webp|jpe?g)$/i, '') + '.jpg';
      const data = full.split(',')[1];
      return { name, mimeType: 'image/jpeg', data, thumb, size: Math.round(data.length * 0.75) };
    } catch { /* this browser cannot read the photo (e.g. HEIC on Windows): upload it as it is */ }
  }
  if (file.size > MAX_BYTES) throw new Error(`"${file.name}" is larger than 10 MB.`);
  const url = await readAsDataUrl(file);
  return { name: file.name, mimeType, data: url.split(',')[1], thumb: mimeType === 'image/gif' && file.size < 28000 ? url : '', size: file.size };
}

export const isImage = (m) => /^image\//.test(m);
export function fileSize(n) {
  if (!n) return '';
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}
export function fileKind(m, name) {
  if (isImage(m)) return 'Photo';
  if (/pdf/.test(m)) return 'PDF';
  if (/word/.test(m)) return 'Word';
  if (/sheet|excel|csv/.test(m)) return 'Spreadsheet';
  if (/^video/.test(m)) return 'Video';
  return (name.split('.').pop() || 'File').toUpperCase();
}
