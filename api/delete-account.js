
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

// Only permanent website origins. Do not add deployment previews.
const ALLOWED_ORIGINS = new Set([
  "https://grade12-app.vercel.app",
  "https://asanelen18-glitch.github.io"
]);

// KEEP FALSE until database cleanup and deletion behavior
// have been fully verified.
const REAL_DELETION_ENABLED = true;

function sendError(res, status, error, extra = {}) {
  return res.status(status).json({
    success: false,
    deletionPerformed: false,
    error,
    ...extra
  });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Origin");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type"
  );

  const origin = req.headers.origin;

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return sendError(
      res,
      403,
      "This website is not allowed to use this endpoint."
    );
  }

  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

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

    return sendError(res, 405, "Method not allowed.");
  }

  // Require the server-side Supabase configuration.
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return sendError(
      res,
      500,
      "Account deletion is not configured on the server."
    );
  }

  const projectUrl = SUPABASE_URL.trim();

  if (!/^https:\/\/[^/]+\/?$/.test(projectUrl)) {
    return sendError(
      res,
      500,
      "SUPABASE_URL must be the project base URL without an API path."
    );
  }

  // Require a bearer token from the signed-in learner.
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (!token) {
    return sendError(
      res,
      401,
      "Please sign in again before continuing."
    );
  }

  // Only accept an ordinary JSON object as the request body.
  const body = req.body;

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return sendError(
      res,
      400,
      "A valid JSON request body is required."
    );
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

  let authAccountDeleted = false;
  let profileRemoved = false;

  try {
    // 1. Verify the session with Supabase.
    const { data: authData, error: authError } =
      await supabase.auth.getUser(token);

    if (authError || !authData?.user?.id) {
      return sendError(
        res,
        401,
        "Your session is invalid or expired. Please sign in again."
      );
    }

    // Never accept a user ID supplied by the browser.
    const userId = authData.user.id;

    // 2. Fail closed if administrator status cannot be checked.
    const { data: admin, error: adminError } =
      await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();

    if (adminError) {
      console.error(
        "Administrator protection check failed:",
        adminError.message
      );

      return sendError(
        res,
        500,
        "We could not verify account permissions. No deletion was attempted."
      );
    }

    if (admin) {
      return sendError(
        res,
        403,
        "Administrator accounts cannot be deleted through this feature."
      );
    }

    // 3. Safe test: nothing is deleted or updated.
    if (body.dryRun === true) {
      return res.status(200).json({
        success: true,
        dryRun: true,
        authenticated: true,
        administratorCheckPassed: true,
        deletionPerformed: false,
        message:
          "Authentication and administrator checks passed. No records were changed."
      });
    }

    // 4. Keep all destructive actions blocked for now.
    if (!REAL_DELETION_ENABLED) {
      return res.status(409).json({
        success: false,
        deletionEnabled: false,
        deletionPerformed: false,
        error:
          "Account deletion is not enabled yet. No records were changed."
      });
    }

    // 5. Require explicit confirmation.
    if (body.confirmDelete !== "DELETE_MY_ACCOUNT") {
      return sendError(
        res,
        400,
        "Explicit account-deletion confirmation is required."
      );
    }

    /*
     * IMPORTANT:
     * Real deletion must remain disabled until the database
     * relationships and cleanup procedure have been verified.
     *
     * Delete the verified Auth account first. This avoids removing
     * the standalone profile before discovering that Auth deletion
     * has failed.
     */
    const { error: deleteAuthError } =
      await supabase.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      console.error(
        "Auth account deletion failed:",
        deleteAuthError.message
      );

      return sendError(
        res,
        500,
        "The account was not confirmed as deleted. Check the account status before retrying."
      );
    }

    authAccountDeleted = true;

    /*
     * The profiles table has no verified foreign key to auth.users,
     * so it needs separate cleanup. Shared app content must not be
     * deleted as part of this process.
     */
    const { data: removedProfiles, error: profileError } =
      await supabase
        .from("profiles")
        .delete()
        .eq("id", userId)
        .select("id");

    if (profileError) {
      console.error(
        "Standalone profile cleanup failed:",
        profileError.message
      );

      return res.status(500).json({
        success: false,
        deletionPerformed: true,
        authAccountDeleted: true,
        profileRemoved: false,
        error:
          "The authentication account was deleted, but profile cleanup needs attention. Contact support before retrying."
      });
    }

    profileRemoved =
      Array.isArray(removedProfiles) &&
      removedProfiles.length > 0;

    return res.status(200).json({
      success: true,
      deletionPerformed: true,
      authAccountDeleted,
      profileRemoved,
      message: profileRemoved
        ? "The authentication account and standalone profile were deleted."
        : "The authentication account was deleted. No standalone profile row was found."
    });
  } catch (error) {
    console.error(
      "Account deletion endpoint error:",
      error?.message || "Unknown error"
    );

    return res.status(500).json({
      success: false,
      deletionPerformed: authAccountDeleted || profileRemoved,
      authAccountDeleted,
      profileRemoved,
      error: authAccountDeleted
        ? "The authentication account was deleted, but another cleanup step may need attention. Check the result before retrying."
        : "The request encountered an error. Check the account status before retrying."
    });
  }
}
