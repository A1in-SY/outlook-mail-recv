import DOMPurify from "dompurify";

/**
 * Strips remote resources out of email HTML so that opening a message cannot phone home.
 *
 * Marketing mail is full of 1x1 beacons: of 273 remote images across the 505 stored
 * messages, 95 are 3px or smaller and every host serving them is an open-tracking
 * endpoint. Loading one leaks the open time and the client IP, and for a tool that
 * manages throwaway accounts in bulk it also confirms the address is live and watched --
 * exactly the signal that gets those accounts flagged.
 *
 * Blocking is all-or-nothing on purpose. A beacon can be any size at any path, and the
 * production data shows the same ESP host serving both beacons and legitimate logos, so
 * neither a size heuristic nor a host allowlist can separate them. Mail clients that take
 * privacy seriously (Gmail, Thunderbird, Proton) all block everything by default and let
 * the reader opt in per message.
 */

/** Attribute-based vectors. Each entry is a CSS selector paired with the attributes to strip. */
const URL_ATTRIBUTES: { selector: string; attributes: string[] }[] = [
  // srcset before src: both live on <img>, and stripping only src would leave the
  // browser free to load a candidate from srcset instead.
  { selector: "img, source", attributes: ["src", "srcset", "lowsrc", "dynsrc"] },
  { selector: "video", attributes: ["src", "poster"] },
  { selector: "audio, embed, track", attributes: ["src"] },
  { selector: "iframe, frame", attributes: ["src", "srcdoc"] },
  { selector: "object", attributes: ["data"] },
  // Deprecated but still honoured; old marketing templates lean on them heavily.
  { selector: "[background]", attributes: ["background"] },
  // A stylesheet or preload fetches as soon as it is parsed.
  { selector: "link", attributes: ["href"] },
  // SVG's own image/use, which are easy to overlook because they are not <img>.
  { selector: "image, use", attributes: ["href", "xlink:href"] },
];

/** Local content: these resolve without a network request, so they stay. */
function isLocalUrl(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return (
    trimmed.startsWith("data:") ||
    trimmed.startsWith("cid:") ||
    // A bare fragment points inside the document itself (e.g. <use href="#icon">).
    trimmed.startsWith("#")
  );
}

/**
 * `url(...)` inside CSS, covering both inline style attributes and <style> blocks.
 * `@import` is handled by the same pass because it is the other way a stylesheet can
 * pull in a remote file.
 */
const CSS_URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
const CSS_IMPORT_RE = /@import\s+(?:url\(\s*)?(['"]?)([^'");]+)\1\s*\)?\s*;?/gi;

function neutraliseCss(css: string): { css: string; blocked: number } {
  let blocked = 0;
  // @import first: it is usually written as `@import url(...)`, which would otherwise
  // also match the url() pass below and count one resource twice in the notice.
  let out = css.replace(CSS_IMPORT_RE, (match, _quote, url: string) => {
    if (isLocalUrl(url)) return match;
    blocked++;
    return "";
  });
  out = out.replace(CSS_URL_RE, (match, _quote, url: string) => {
    if (isLocalUrl(url)) return match;
    blocked++;
    return "url()";
  });
  return { css: out, blocked };
}

export interface SanitiseResult {
  html: string;
  /** How many remote resources were neutralised, for the "已屏蔽 N 个" notice. */
  blocked: number;
}

/**
 * Marks a stripped image so it can be styled as an intentional placeholder. An <img>
 * with no src renders as a broken-image icon, which reads as a bug rather than as a
 * deliberate block.
 */
const BLOCKED_MARKER = "data-blocked-remote";

/**
 * Transparent 1x1 GIF. Substituting it for the removed src gives the element a source
 * the browser can actually resolve, so no broken-image glyph is painted -- clearing the
 * src alone still draws one whenever the image carries an `alt`. It is a data: URI, so
 * nothing is fetched.
 */
const BLANK_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * Sanitises email HTML, optionally stripping every remote resource.
 *
 * The blocking runs inside a DOMPurify hook rather than as a pass over the output
 * string. That timing is the whole point: DOMPurify parses into a detached template that
 * the browser does not fetch resources for, so attributes are gone before the markup ever
 * reaches the live DOM. Post-processing the rendered nodes would be too late -- the
 * request fires the moment `dangerouslySetInnerHTML` commits.
 */
export function sanitiseEmailHtml(html: string, blockRemote: boolean): SanitiseResult {
  let blocked = 0;

  const hook = (node: Element) => {
    for (const { selector, attributes } of URL_ATTRIBUTES) {
      if (!node.matches?.(selector)) continue;
      for (const attribute of attributes) {
        const value = node.getAttribute(attribute);
        if (value === null || isLocalUrl(value)) continue;
        node.removeAttribute(attribute);
        blocked++;
        if (node.tagName === "IMG") {
          node.setAttribute(BLOCKED_MARKER, "");
          // The mail's own width/height would otherwise stretch the placeholder to the
          // original image's dimensions, leaving a large empty gap.
          node.removeAttribute("width");
          node.removeAttribute("height");
          if (attribute === "src") {
            node.setAttribute("src", BLANK_PIXEL);
          }
        }
      }
    }

    const style = node.getAttribute?.("style");
    if (style) {
      const result = neutraliseCss(style);
      if (result.blocked > 0) {
        node.setAttribute("style", result.css);
        blocked += result.blocked;
      }
    }

    // <style> blocks are allowed through by the caller's ADD_TAGS, so their url() and
    // @import rules need the same treatment as inline styles.
    if (node.tagName === "STYLE" && node.textContent) {
      const result = neutraliseCss(node.textContent);
      if (result.blocked > 0) {
        node.textContent = result.css;
        blocked += result.blocked;
      }
    }
  };

  if (blockRemote) {
    DOMPurify.addHook("afterSanitizeAttributes", hook);
  }

  try {
    const clean = DOMPurify.sanitize(html, {
      ADD_TAGS: ["style"],
      ADD_ATTR: ["target", BLOCKED_MARKER],
    });
    return { html: clean, blocked };
  } finally {
    // Hooks are global to the DOMPurify instance, so leaving this registered would make
    // every later sanitise -- including one with blocking switched off -- strip resources.
    // Removing by identity rather than popping the stack keeps this correct even if
    // something else registers a hook at the same entry point.
    if (blockRemote) {
      DOMPurify.removeHook("afterSanitizeAttributes", hook);
    }
  }
}
