
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALLOWED_ORIGINS = new Set([
  "https://grade12-app.vercel.app",
  "https://asanelen18-glitch.github.io"
]);

// Real deletion is enabled. Test with a separate learner account only.
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

  try {
    // Verify the actual signed-in Supabase user.
    const { data: authData, error: authError } =
      await supabase.auth.getUser(token);

    if (authError || !authData?.user?.id) {
      return sendError(
        res,
        401,
        "Your session is invalid or expired. Please sign in again."
      );
    }

    const userId = authData.user.id;

    // Never allow administrator accounts to be deleted here.
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

    // Safe test mode: no records are changed.
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

    if (!REAL_DELETION_ENABLED) {
      return sendError(
        res,
        409,
        "Account deletion is temporarily disabled. No records were changed."
      );
    }

    // Require an explicit confirmation from the client.
    if (body.confirmDelete !== "DELETE_MY_ACCOUNT") {
      return sendError(
        res,
        400,
        "Explicit account-deletion confirmation is required."
      );
    }

    /*
     * Delete only the authenticated user's Auth account.
     * The verified database trigger cleans up public.profiles.
     * Other dependent records rely on their configured foreign keys.
     */
    const { error: deleteError } =
      await supabase.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error(
        "Auth account deletion failed:",
        deleteError.message
      );

      return sendError(
        res,
        500,
        "Account deletion failed. Check the account status before retrying."
      );
    }

    return res.status(200).json({
      success: true,
      deletionPerformed: true,
      authAccountDeleted: true,
      profileCleanup: "handled_by_database_trigger",
      message:
        "The account deletion request succeeded."
    });
  } catch (error) {
    console.error(
      "Account deletion endpoint error:",
      error?.message || "Unknown error"
    );

    return sendError(
      res,
      500,
      "The request encountered an error. Check the account status before retrying."
    );
  }
}
