
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALLOWED_ORIGINS = new Set([
  "https://grade12-app.vercel.app",
  "https://asanelen18-glitch.github.io"
]);

const REAL_DELETION_ENABLED = true;

function sendError(res, status, error) {
  return res.status(status).json({
    success: false,
    deletionPerformed: false,
    error
  });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Origin");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
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

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return sendError(res, 405, "Method not allowed.");
  }

  if (!REAL_DELETION_ENABLED) {
    return sendError(
      res,
      503,
      "Account deletion is currently unavailable."
    );
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
      "Please sign in again before deleting your account."
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

  // Require deliberate confirmation from the signed-in user.
  if (body.confirmDelete !== "DELETE_MY_ACCOUNT") {
    return sendError(
      res,
      400,
      "Explicit account-deletion confirmation is required."
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
    // Verify the user's actual Supabase access token.
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

    // Protect administrator accounts.
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
        "Account permissions could not be verified. No deletion was attempted."
      );
    }

    if (admin) {
      return sendError(
        res,
        403,
        "Administrator accounts cannot be deleted through this feature."
      );
    }

    /*
     * Delete only the user verified by the access token.
     * The database trigger cleans up public.profiles.
     * Related records depend on configured foreign keys
     * and any additional database cleanup triggers.
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
        "Supabase did not confirm account deletion. Check the account status before retrying."
      );
    }

    return res.status(200).json({
      success: true,
      deletionPerformed: true,
      authAccountDeleted: true,
      profileCleanup: "handled_by_database_trigger",
      message:
        "Supabase confirmed deletion of the account. Related data cleanup depends on the database configuration."
    });
  } catch (error) {
    console.error(
      "Account deletion endpoint error:",
      error?.message || "Unknown error"
    );

    return sendError(
      res,
      500,
      "The request failed. Check the account status before retrying."
    );
  }
}
