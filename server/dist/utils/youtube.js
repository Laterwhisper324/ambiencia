"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractYouTubePlaylistId = extractYouTubePlaylistId;
exports.isYouTubePlaylistUrl = isYouTubePlaylistUrl;
exports.extractYouTubeId = extractYouTubeId;
exports.fetchYouTubePlaylistMetadata = fetchYouTubePlaylistMetadata;
exports.fetchYouTubeMetadata = fetchYouTubeMetadata;
/**
 * Extracts a YouTube / YouTube Music playlist ID (`list=...`) from a URL if present.
 */
function extractYouTubePlaylistId(input) {
    const trimmed = input.trim();
    if (!trimmed)
        return null;
    try {
        const url = new URL(trimmed);
        const host = url.hostname.replace(/^www\./, '').toLowerCase();
        if (host === 'youtube.com' ||
            host === 'm.youtube.com' ||
            host === 'music.youtube.com' ||
            host === 'youtu.be' ||
            host === 'youtube-nocookie.com') {
            const listParam = url.searchParams.get('list');
            if (listParam && /^[a-zA-Z0-9_-]{10,}$/.test(listParam)) {
                return listParam;
            }
        }
    }
    catch {
        const match = trimmed.match(/[?&]list=([a-zA-Z0-9_-]{10,})/);
        if (match && match[1])
            return match[1];
    }
    return null;
}
/**
 * Checks whether the input URL specifically points to a playlist page
 * (e.g. music.youtube.com/playlist?list=... or youtube.com/playlist?list=...)
 * or has a `list=` parameter without a direct `v=` video ID.
 */
function isYouTubePlaylistUrl(input) {
    const listId = extractYouTubePlaylistId(input);
    if (!listId)
        return false;
    const videoId = extractYouTubeId(input);
    if (!videoId)
        return true;
    try {
        const url = new URL(input.trim());
        if (url.pathname.includes('/playlist'))
            return true;
    }
    catch {
        // ignore
    }
    return false;
}
/**
 * Extracts a valid 11-character YouTube video ID from various URL formats
 * (including youtube.com, music.youtube.com, youtu.be, embed, shorts).
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
        const match = trimmed.match(/(?:(?:music\.)?youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (match && match[1])
            return match[1];
    }
    return null;
}
function decodeXmlEntities(str) {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}
/**
 * Fetches metadata and video items from a YouTube or YouTube Music playlist URL.
 * Uses official YouTube XML feed, oEmbed, and playlist browse metadata without downloading any audio/video.
 */
async function fetchYouTubePlaylistMetadata(rawUrl, customTitle) {
    const playlistId = extractYouTubePlaylistId(rawUrl);
    if (!playlistId) {
        throw new Error('ID de playlist do YouTube / YouTube Music não encontrado na URL.');
    }
    let playlistTitle = customTitle?.trim() || '';
    const tracksMap = new Map();
    // 1. Try YouTube official oEmbed for playlist title & lead thumbnail
    let oembedLeadVideoId = null;
    try {
        const canonicalPlaylistUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalPlaylistUrl)}&format=json`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(oembedUrl, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Ambiencia-RPG-Player/1.0' },
        });
        clearTimeout(timeout);
        if (res.ok) {
            const data = (await res.json());
            if (!playlistTitle && data.title) {
                playlistTitle = data.title;
            }
            if (data.thumbnail_url) {
                const thumbMatch = data.thumbnail_url.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
                if (thumbMatch && thumbMatch[1]) {
                    oembedLeadVideoId = thumbMatch[1];
                }
            }
        }
    }
    catch {
        // ignore oembed failure and continue with feed / page
    }
    // 2. Try YouTube Official XML Feed (fast, clean titles and videoIds)
    try {
        const feedUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(playlistId)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(feedUrl, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        });
        clearTimeout(timeout);
        if (res.ok) {
            const xml = await res.text();
            if (!playlistTitle) {
                const feedTitleMatch = xml.match(/<feed[\s\S]*?<title>(.*?)<\/title>/);
                if (feedTitleMatch && feedTitleMatch[1]) {
                    playlistTitle = decodeXmlEntities(feedTitleMatch[1].trim());
                }
            }
            const entryRegex = /<entry>[\s\S]*?<yt:videoId>([a-zA-Z0-9_-]{11})<\/yt:videoId>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<\/entry>/g;
            let match;
            while ((match = entryRegex.exec(xml)) !== null) {
                const vid = match[1];
                const title = decodeXmlEntities(match[2].trim()) || `YouTube (${vid})`;
                if (!tracksMap.has(vid)) {
                    tracksMap.set(vid, {
                        videoId: vid,
                        canonicalUrl: `https://www.youtube.com/watch?v=${vid}`,
                        title,
                        thumbnailUrl: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
                    });
                }
            }
        }
    }
    catch (err) {
        console.warn(`[YouTube] Aviso ao ler feed XML da playlist ${playlistId}:`, err);
    }
    // 3. Try parsing YouTube playlist page ytInitialData for larger playlists or OLAK5uy_ albums
    if (tracksMap.size === 0) {
        try {
            const pageUrl = `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}&hl=pt`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 6500);
            const res = await fetch(pageUrl, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                    Cookie: 'CONSENT=YES+cb.20210328-17-p0.en+FX+471',
                },
            });
            clearTimeout(timeout);
            if (res.ok) {
                const html = await res.text();
                const jsonMatch = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
                if (jsonMatch && jsonMatch[1]) {
                    const data = JSON.parse(jsonMatch[1]);
                    if (!playlistTitle) {
                        const metaTitle = data?.metadata?.playlistMetadataRenderer?.title ||
                            data?.header?.playlistHeaderRenderer?.title?.simpleText;
                        if (metaTitle)
                            playlistTitle = String(metaTitle);
                    }
                    const walk = (node) => {
                        if (!node || typeof node !== 'object')
                            return;
                        const obj = node;
                        const renderer = obj.playlistVideoRenderer ||
                            obj.playlistPanelVideoRenderer;
                        if (renderer && typeof renderer.videoId === 'string') {
                            const vid = renderer.videoId;
                            const title = renderer.title?.runs?.[0]?.text ||
                                renderer.title?.simpleText ||
                                `YouTube (${vid})`;
                            if (/^[a-zA-Z0-9_-]{11}$/.test(vid) && !tracksMap.has(vid)) {
                                tracksMap.set(vid, {
                                    videoId: vid,
                                    canonicalUrl: `https://www.youtube.com/watch?v=${vid}`,
                                    title: String(title),
                                    thumbnailUrl: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
                                });
                            }
                        }
                        for (const key of Object.keys(obj)) {
                            walk(obj[key]);
                        }
                    };
                    walk(data);
                }
            }
        }
        catch (err) {
            console.warn(`[YouTube] Aviso ao ler página da playlist ${playlistId}:`, err);
        }
    }
    // 4. Fallback: if url also contained a v= videoId or oEmbed returned a lead videoId
    const directVideoId = extractYouTubeId(rawUrl) || oembedLeadVideoId;
    if (tracksMap.size === 0 && directVideoId) {
        const singleMeta = await fetchYouTubeMetadata(directVideoId, customTitle);
        tracksMap.set(singleMeta.videoId, singleMeta);
    }
    if (tracksMap.size === 0) {
        throw new Error('Não foi possível encontrar faixas públicas nesta playlist do YouTube / YouTube Music. Verifique se a playlist está definida como Pública ou Não Listada.');
    }
    return {
        playlistId,
        playlistTitle: playlistTitle || `Playlist YouTube (${playlistId.slice(0, 8)})`,
        tracks: Array.from(tracksMap.values()),
    };
}
/**
 * Queries the official YouTube oEmbed endpoint for title and thumbnail metadata.
 * Does NOT download or extract any media streams.
 */
async function fetchYouTubeMetadata(rawUrlOrId, customTitle) {
    const videoId = extractYouTubeId(rawUrlOrId);
    if (!videoId) {
        throw new Error('URL do YouTube / YouTube Music inválida. Use um link de vídeo ou de playlist pública.');
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
