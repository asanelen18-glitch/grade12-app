
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALLOWED_ORIGINS = new Set([
  "https://grade12-app.vercel.app",
  "https://asanelen18-glitch.github.io"
]);

// Keep actual account deletion disabled until the database
// cleanup has been verified against the real schema.
const REAL_DELETION_ENABLED = false;

export default async function handler(req, res) {
  const origin = req.headers.origin;

  res.setHeader("Cache-Control", "no-store");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type"
  );
  res.setHeader("Vary", "Origin");

  // Reject browser requests from unapproved origins.
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return res.status(403).json({
      success: false,
      error: "This website is not allowed to use this endpoint.",
      deletionPerformed: false
    });
  }

  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  // CORS preflight does not access or change account data.
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Safe deployment health check only.
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      endpoint: "delete-account",
      realDeletionEnabled: REAL_DELETION_ENABLED,
      deletionPerformed: false
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");

    return res.status(405).json({
      success: false,
      error: "Method not allowed.",
      deletionPerformed: false
    });
  }

  // Validate server configuration.
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      success: false,
      error: "Account deletion is not configured on the server.",
      deletionPerformed: false
    });
  }

  const projectUrl = SUPABASE_URL.trim();

  if (!/^https:\/\/[^/]+\/?$/.test(projectUrl)) {
    return res.status(500).json({
      success: false,
      error:
        "SUPABASE_URL must be the project base URL without an API path.",
      deletionPerformed: false
    });
  }

  // Require the signed-in learner's access token.
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Please sign in again before continuing.",
      deletionPerformed: false
    });
  }

  const supabase = createClient(
    projectUrl.replace(/\/$/, ""),
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );

  try {
    // Verify the access token with Supabase Auth.
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user?.id) {
      return res.status(401).json({
        success: false,
        error: "Your session is invalid or expired. Please sign in again.",
        deletionPerformed: false
      });
    }

    // Do not accept a user ID supplied by the browser.
    // The account ID always comes from the verified token.
    const userId = data.user.id;

    // Safe test: validates authentication without changing data.
    if (req.body?.dryRun === true) {
      return res.status(200).json({
        success: true,
        dryRun: true,
        authenticated: true,
        deletionPerformed: false,
        message:
          "Authentication test passed. No account or database records were changed."
      });
    }

    // Keep destructive actions blocked until every table,
    // column, relationship and cleanup rule has been verified.
    if (!REAL_DELETION_ENABLED) {
      return res.status(409).json({
        success: false,
        deletionEnabled: false,
        deletionPerformed: false,
        error:
          "Account deletion is temporarily unavailable while the database cleanup is being verified. No records were changed."
      });
    }

    // Intentionally no destructive operations here yet.
    // Do not enable REAL_DELETION_ENABLED until a verified,
    // safe cleanup implementation has been added.

    return res.status(409).json({
      success: false,
      deletionPerformed: false,
      error:
        "The account deletion procedure has not been configured."
    });
  } catch (error) {
    // Do not send secrets, tokens or internal error details to the browser.
    console.error(
      "Account deletion endpoint error:",
      error?.message || "Unknown error"
    );

    return res.status(500).json({
      success: false,
      error: "The request could not be completed. No deletion was attempted.",
      deletionPerformed: false
    });
  }
}
