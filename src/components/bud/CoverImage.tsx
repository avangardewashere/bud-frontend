"use client";

import { useCallback, useState, type ReactNode } from "react";

/**
 * A course's own cover, with the drawn one behind it.
 *
 * An `<img>` whose file does not arrive leaves a broken-image box — and a cover is the
 * most likely thing in Bud to not arrive: it is fetched from another origin, it is the
 * one field a package supplies as a URL rather than as text, and the API spent months
 * handing out a path that 404'd without anyone noticing. So a failure here is not an
 * error state, it is simply a course without a cover, which the catalog already knows
 * how to draw.
 *
 * Client-side because only the browser can know: whether an image decoded is not
 * something a server render can tell you.
 */
export function CoverImage({
  src,
  alt,
  fallback,
  className,
}: {
  src: string;
  alt: string;
  /** The drawn cover, rendered on the server and held here in case it is needed. */
  fallback: ReactNode;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  /**
   * The image is in the HTML before React runs, so it can have failed already by the
   * time this component hydrates — and an onError that was attached afterwards never
   * hears about it. That is the common case, not the rare one: the browser starts
   * fetching as it parses, and a 404 comes back in milliseconds. So the element is
   * also asked, the moment React takes hold of it, whether it is a picture at all:
   * a finished load with no intrinsic width is a load that failed.
   */
  const checkAlreadyLoaded = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) return <>{fallback}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={checkAlreadyLoaded}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      data-testid="course-cover-image"
      className={className}
      style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
    />
  );
}
