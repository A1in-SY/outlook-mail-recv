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

// Brands like GitHub (#181717), Claude (#191919) and Cursor (#000000) ship near-black
// logos that disappear against the dark background, so those are recoloured to the
// theme foreground. A CSS class beats the `fill` presentation attribute, so every
// other brand keeps its own hex untouched.
const DARK_LOGO_LUMINANCE = 0.18;

function relativeLuminance(hex: string) {
  const value = parseInt(hex, 16);
  const channel = (bits: number) => {
    const srgb = ((value >> bits) & 0xff) / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

export function PlatformIcon({ platform, size = 18 }: { platform: Platform; size?: number }) {
  const slug = SLUG_MAP[platform.name];
  const icon = slug ? ICONS[slug] : null;

  if (icon) {
    const dimInDark = relativeLuminance(icon.hex) < DARK_LOGO_LUMINANCE;
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
          className={dimInDark ? "dark:fill-foreground" : undefined}
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
