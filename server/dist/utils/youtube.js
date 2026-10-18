"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractYouTubeId = extractYouTubeId;
exports.fetchYouTubeMetadata = fetchYouTubeMetadata;
/**
 * Extracts a valid 11-character YouTube video ID from various URL formats.
 */
function extractYouTubeId(input) {
    const trimmed = input.trim();
    if (!trimmed)
        return null;
    // Direct 11-char ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
        return trimmed;
    }
    try {
        const url = new URL(trimmed);
        const host = url.hostname.replace(/^www\./, '').toLowerCase();
        if (host === 'youtu.be') {
            const id = url.pathname.split('/').filter(Boolean)[0];
            if (id && /^[a-zA-Z0-9_-]{11}$/.test(id))
                return id;
        }
        if (host === 'youtube.com' ||
            host === 'm.youtube.com' ||
            host === 'music.youtube.com' ||
            host === 'youtube-nocookie.com') {
            const vParam = url.searchParams.get('v');
            if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) {
                return vParam;
            }
            const pathParts = url.pathname.split('/').filter(Boolean);
            if (pathParts.length >= 2 &&
                ['embed', 'shorts', 'v', 'live'].includes(pathParts[0]) &&
                /^[a-zA-Z0-9_-]{11}$/.test(pathParts[1])) {
                return pathParts[1];
            }
        }
    }
    catch {
        // Fallback regex if URL constructor fails
        const match = trimmed.match(/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (match && match[1])
            return match[1];
    }
    return null;
}
/**
 * Queries the official YouTube oEmbed endpoint for title and thumbnail metadata.
 * Does NOT download or extract any media streams.
 */
async function fetchYouTubeMetadata(rawUrlOrId, customTitle) {
    const videoId = extractYouTubeId(rawUrlOrId);
    if (!videoId) {
        throw new Error('URL do YouTube inválida. Use um link como https://www.youtube.com/watch?v=... ou https://youtu.be/...');
    }
    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const fallbackThumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(oembedUrl, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Ambiencia-RPG-Player/1.0' },
        });
        clearTimeout(timeout);
        if (response.ok) {
            const data = (await response.json());
            return {
                videoId,
                canonicalUrl,
                title: customTitle?.trim() || data.title || `YouTube (${videoId})`,
                thumbnailUrl: data.thumbnail_url || fallbackThumbnail,
                authorName: data.author_name,
            };
        }
    }
    catch (err) {
        console.warn(`[YouTube] Falha ao consultar oEmbed para ${videoId}, usando fallback:`, err);
    }
    return {
        videoId,
        canonicalUrl,
        title: customTitle?.trim() || `Faixa do YouTube (${videoId})`,
        thumbnailUrl: fallbackThumbnail,
    };
}
