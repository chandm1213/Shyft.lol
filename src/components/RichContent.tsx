"use client";

import { useState, useEffect, type ReactNode } from "react";
import { ExternalLink, Play, X } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   RichContent — renders text with embedded links, images, videos
   Like X/Twitter: detect URLs, show inline image previews,
   clickable links, YouTube embeds, etc.
   ═══════════════════════════════════════════════════════════════ */

/* ── URL regex ── */
const URL_REGEX = /https?:\/\/[^\s<]+[^\s<.,;:!?"')\]]/gi;

/* ── Image extensions ── */
const IMAGE_EXTS = /\.(jpg|jpeg|png|gif|webp|svg|bmp|avif)(\?.*)?$/i;

/* ── Video extensions ── */
const VIDEO_EXTS = /\.(mp4|webm|ogg|mov)(\?.*)?$/i;

/* ── YouTube regex ── */
const YOUTUBE_REGEX = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

/* ── GIF services ── */
const GIF_DOMAINS = /giphy\.com|tenor\.com|imgur\.com/i;

interface RichContentProps {
  content: string;
  className?: string;
}

export function RichContent({ content, className = "" }: RichContentProps) {
  const urls = content.match(URL_REGEX) || [];
  const imageUrls = urls.filter((u) => IMAGE_EXTS.test(u) || GIF_DOMAINS.test(u));
  const videoUrls = urls.filter((u) => VIDEO_EXTS.test(u));
  const youtubeUrls = urls.map((u) => ({ url: u, match: u.match(YOUTUBE_REGEX) })).filter((x) => x.match);
  const linkUrls = urls.filter(
    (u) => !IMAGE_EXTS.test(u) && !VIDEO_EXTS.test(u) && !YOUTUBE_REGEX.test(u)
  );

  /* ── Render text with inline links ── */
  const renderText = () => {
    const parts: (string | ReactNode)[] = [];
    let lastIndex = 0;
    const matches = [...content.matchAll(new RegExp(URL_REGEX.source, "gi"))];

    for (const match of matches) {
      const url = match[0];
      const idx = match.index!;

      // Text before the URL
      if (idx > lastIndex) {
        parts.push(content.slice(lastIndex, idx));
      }

      // If it's an image URL, don't show it inline as text (we'll show the image below)
      if (IMAGE_EXTS.test(url)) {
        lastIndex = idx + url.length;
        continue;
      }

      // Render the URL as a clickable link
      parts.push(
        <a
          key={idx}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#2563EB] hover:underline break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {formatUrlDisplay(url)}
        </a>
      );
      lastIndex = idx + url.length;
    }

    // Remaining text
    if (lastIndex < content.length) {
      parts.push(content.slice(lastIndex));
    }

    return parts;
  };

  return (
    <div className={className}>
      {/* Text content with inline links */}
      <p className="text-[15px] text-[#1A1A2E] leading-relaxed whitespace-pre-wrap break-words">
        {renderText()}
      </p>

      {/* Image previews */}
      {imageUrls.length > 0 && (
        <div className={`mt-3 rounded-2xl overflow-hidden border border-[#E2E8F0] ${
          imageUrls.length === 1 ? "" : "grid grid-cols-2 gap-0.5"
        }`}>
          {imageUrls.map((url, i) => (
            <ImagePreview key={i} url={url} single={imageUrls.length === 1} />
          ))}
        </div>
      )}

      {/* YouTube embeds */}
      {youtubeUrls.map(({ url, match }, i) => (
        match && <YouTubeEmbed key={i} videoId={match[1]} />
      ))}

      {/* Video previews */}
      {videoUrls.map((url, i) => (
        <div key={i} className="mt-3 rounded-2xl overflow-hidden border border-[#E2E8F0]">
          <video
            src={url}
            controls
            preload="metadata"
            className="w-full max-h-[400px] object-contain bg-black"
          />
        </div>
      ))}

      {/* Link previews (for non-image, non-video URLs) */}
      {linkUrls.slice(0, 1).map((url, i) => (
        <LinkPreview key={i} url={url} />
      ))}
    </div>
  );
}

/* ═══ Image Preview ═══ */
function ImagePreview({ url, single }: { url: string; single: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  if (error) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block relative bg-[#F1F5F9] cursor-pointer hover:opacity-95 transition-opacity"
      onClick={(e) => e.stopPropagation()}
    >
      {!loaded && (
        <div className={`${single ? "h-[300px]" : "h-[200px]"} animate-pulse bg-[#E2E8F0]`} />
      )}
      <img
        src={url}
        alt=""
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={`w-full object-cover ${
          single ? "max-h-[500px]" : "h-[200px]"
        } ${loaded ? "" : "hidden"}`}
      />
    </a>
  );
}

/* ═══ YouTube Embed ═══ */
function YouTubeEmbed({ videoId }: { videoId: string }) {
  const [showEmbed, setShowEmbed] = useState(false);
  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

  return (
    <div className="mt-3 rounded-2xl overflow-hidden border border-[#E2E8F0] relative">
      {showEmbed ? (
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
          className="w-full aspect-video"
          allow="autoplay; encrypted-media"
          allowFullScreen
        />
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); setShowEmbed(true); }}
          className="w-full relative group"
        >
          <img
            src={thumbnailUrl}
            alt="YouTube video"
            className="w-full aspect-video object-cover"
            onError={(e) => {
              // Fall back to hqdefault if maxresdefault doesn't exist
              (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
            <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <Play className="w-7 h-7 text-white ml-1" fill="white" />
            </div>
          </div>
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/70 text-white text-xs px-2.5 py-1 rounded-lg">
            <Play className="w-3 h-3" fill="white" />
            YouTube
          </div>
        </button>
      )}
    </div>
  );
}

/* ═══ Link Preview ═══ */
function LinkPreview({ url }: { url: string }) {
  const [favicon, setFavicon] = useState<string | null>(null);

  useEffect(() => {
    try {
      const domain = new URL(url).hostname;
      setFavicon(`https://www.google.com/s2/favicons?domain=${domain}&sz=32`);
    } catch {}
  }, [url]);

  let domain = "";
  try {
    domain = new URL(url).hostname.replace("www.", "");
  } catch {}

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 flex items-center gap-3 px-4 py-3 rounded-2xl border border-[#E2E8F0] hover:bg-[#F8FAFC] transition-colors group"
      onClick={(e) => e.stopPropagation()}
    >
      {favicon && (
        <img
          src={favicon}
          alt=""
          className="w-5 h-5 rounded flex-shrink-0"
          onError={(e) => (e.target as HTMLImageElement).style.display = "none"}
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#1A1A2E] truncate group-hover:text-[#2563EB] transition-colors">
          {domain}
        </p>
        <p className="text-xs text-[#94A3B8] truncate">{url}</p>
      </div>
      <ExternalLink className="w-4 h-4 text-[#94A3B8] flex-shrink-0" />
    </a>
  );
}

/* ═══ Image Upload (via imgbb free API) ═══ */
const IMGBB_API_KEY = ""; // Free tier — no key needed for anonymous uploads

export async function uploadImage(file: File): Promise<string> {
  // Use imgBB free API for image hosting
  const formData = new FormData();
  formData.append("image", file);

  // Use a lightweight approach: convert to base64 data URL for now
  // This works great for small-medium images and doesn't require external APIs
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // For on-chain storage, we need a URL. Since we can't store base64 on-chain,
      // we'll use a free image host. For now, return data URL for preview.
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ═══ Helper: shorten URL for display ═══ */
function formatUrlDisplay(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 20 ? u.pathname.slice(0, 20) + "…" : u.pathname;
    return u.hostname.replace("www.", "") + (path !== "/" ? path : "");
  } catch {
    return url.length > 40 ? url.slice(0, 40) + "…" : url;
  }
}

/* ═══ Compose Media Bar ═══ */
export function MediaBar({
  onImageSelected,
  disabled,
}: {
  onImageSelected: (url: string) => void;
  disabled?: boolean;
}) {
  const handleFileSelect = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      // Validate size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert("Image must be under 5MB");
        return;
      }

      // Convert to data URL for preview, user should paste hosted image URL in post
      const reader = new FileReader();
      reader.onloadend = () => {
        onImageSelected(reader.result as string);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleFileSelect}
        disabled={disabled}
        className="p-2 rounded-full hover:bg-[#EBF4FF] text-[#2563EB] transition-colors disabled:opacity-40"
        title="Add image"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 19.5V4.5a2.25 2.25 0 0 0-2.25-2.25H3.75A2.25 2.25 0 0 0 1.5 4.5v15a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
      </button>
      <button
        disabled={disabled}
        className="p-2 rounded-full hover:bg-[#EBF4FF] text-[#2563EB] transition-colors disabled:opacity-40"
        title="Add GIF"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12.75 8.25v7.5m6-7.5h-3V12m0 0h3m-3 0h-3m-2.25 0a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
        </svg>
      </button>
      <button
        disabled={disabled}
        className="p-2 rounded-full hover:bg-[#EBF4FF] text-[#2563EB] transition-colors disabled:opacity-40"
        title="Add emoji"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" />
        </svg>
      </button>
    </div>
  );
}
