/**
 * How large a course archive the shell can carry to the API.
 *
 * Imported by next.config.ts, so plain TypeScript only.
 *
 * Uploads go through the /api rewrite, and Next's router copies every request body
 * before routing it, cut off at experimental.proxyClientMaxBodySize — 10MB unless
 * set. Past that the copy just ends: the API waits for bytes that never come, the
 * proxy times out, and the admin is told Bud is unreachable about a package that
 * was fine. So the proxy limit is sized from the archive ceiling, and the upload
 * panel refuses anything above the ceiling before sending it.
 *
 * This covers Next's own router (next start, the standalone server, the Docker
 * image). Vercel's edge router applies its own limit to rewrites, which is not
 * configurable here.
 */

/** The backend's archive cap (DEFAULT_ARCHIVE_LIMITS.maxArchiveBytes), 50MB. */
export const UPLOAD_ARCHIVE_CEILING_BYTES = 50 * 1024 * 1024;

/** The ceiling plus room for the multipart envelope around the file. */
export const PROXY_BODY_LIMIT_BYTES = UPLOAD_ARCHIVE_CEILING_BYTES + 5 * 1024 * 1024;
