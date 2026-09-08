/**
 * Rewrites a Cloudinary delivery URL so the CDN responds with
 * `Content-Disposition: attachment` instead of rendering the file inline.
 *
 * Community materials live on Cloudinary, a different origin from the app, so
 * the browser ignores an HTML `download` attribute and a plain link just opens
 * the file in a tab. Cloudinary's `fl_attachment` delivery flag is what
 * actually forces a save; `fl_attachment:<name>` additionally controls the
 * saved filename (without it every download is named "file.<ext>").
 *
 * Mirrors the frontend helper in
 * Mentora.lk/frontend1/src/utils/cloudinaryDownload.ts — keep the two in sync.
 *
 * Non-Cloudinary or unrecognised URLs are returned unchanged, so callers can
 * apply this unconditionally.
 */

const sanitizeFileName = (name) =>
    String(name)
        .replace(/\.[^/.]+$/, '')
        .replace(/[^a-zA-Z0-9-_]+/g, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 80);

const toDownloadUrl = (url, fileName = null) => {
    if (!url || typeof url !== 'string') return url;
    if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url;

    // Already flagged — don't stack a second transformation.
    if (/\/upload\/[^/]*fl_attachment/.test(url)) return url;

    let rawName = fileName;
    if (!rawName) {
        const last = url.split('/').pop() || '';
        try {
            rawName = decodeURIComponent(last);
        } catch {
            rawName = last;
        }
    }

    const safeName = sanitizeFileName(rawName);
    const flag = safeName ? `fl_attachment:${safeName}` : 'fl_attachment';

    return url.replace('/upload/', `/upload/${flag}/`);
};

module.exports = { toDownloadUrl };
