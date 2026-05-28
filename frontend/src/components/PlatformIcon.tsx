import { ICONS } from "@/lib/platform-icons";
import type { Platform } from "@/lib/api";

const SLUG_MAP: Record<string, string> = {
  Amazon:       "amazon",
  Apple:        "apple",
  ChatGPT:      "chatgpt",
  Claude:       "anthropic",
  Copilot:      "githubcopilot",
  Cursor:       "cursor",
  Discord:      "discord",
  Facebook:     "facebook",
  Gemini:       "googlegemini",
  GitHub:       "github",
  LinkedIn:     "linkedin",
  Midjourney:   "midjourney",
  Microsoft:    "microsoft",
  Netflix:      "netflix",
  PayPal:       "paypal",
  Perplexity:   "perplexity",
  Poe:          "poe",
  Reddit:       "reddit",
  Spotify:      "spotify",
  Steam:        "steam",
  Telegram:     "telegram",
  TikTok:       "tiktok",
  "Twitter/X":  "x",
};

export function PlatformIcon({ platform, size = 18 }: { platform: Platform; size?: number }) {
  const slug = SLUG_MAP[platform.name];
  const icon = slug ? ICONS[slug] : null;

  if (icon) {
    return (
      <span
        title={platform.name}
        className="inline-flex items-center justify-center shrink-0"
        style={{ width: size, height: size }}
      >
        <svg
          role="img"
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill={`#${icon.hex}`}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d={icon.path} />
        </svg>
      </span>
    );
  }

  // Fallback for unknown platforms
  return (
    <span
      title={platform.name}
      className="inline-flex items-center justify-center rounded-full text-white font-bold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.5, backgroundColor: "#6B7280" }}
    >
      {platform.name[0]}
    </span>
  );
}
