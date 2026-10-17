
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALLOWED_ORIGINS = new Set([
  "https://grade12-app.vercel.app",
  "https://asanelen18-glitch.github.io",
  "https://grade12-ibdm8h9qv-grade-12-hub.vercel.app
]);

// Keep false during testing. Do not enable until reviewed.
const REAL_DELETION_ENABLED = false;

export default async function handler(req, res) {
  let profileRemoved = false;
  let authAccountDeleted = false;

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

    return res.status(405).json({
      success: false,
      error: "Method not allowed.",
      deletionPerformed: false
    });
  }

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
    // Verify the signed-in learner.
    const { data, error } =
      await supabase.auth.getUser(token);

    if (error || !data?.user?.id) {
      return res.status(401).json({
        success: false,
        error: "Your session is invalid or expired. Please sign in again.",
        deletionPerformed: false
      });
    }

    // Only use the ID from the verified Supabase session.
    const userId = data.user.id;

    // Fail closed if administrator status cannot be checked.
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

      return res.status(500).json({
        success: false,
        error:
          "We could not verify account permissions. No deletion was attempted.",
        deletionPerformed: false
      });
    }

    if (admin) {
      return res.status(403).json({
        success: false,
        error:
          "Administrator accounts cannot be deleted through this feature.",
        deletionPerformed: false
      });
    }

    // Safe test: no database records are changed.
    if (req.body?.dryRun === true) {
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

    // Destructive operations remain blocked.
    if (!REAL_DELETION_ENABLED) {
      return res.status(409).json({
        success: false,
        deletionEnabled: false,
        deletionPerformed: false,
        error:
          "Account deletion is not enabled yet. No records were changed."
      });
    }

    // Require an explicit confirmation from the learner.
    if (req.body?.confirmDelete !== "DELETE_MY_ACCOUNT") {
      return res.status(400).json({
        success: false,
        deletionPerformed: false,
        error:
          "Explicit account-deletion confirmation is required."
      });
    }

    // Remove the standalone profile row first.
    // This table has no verified foreign key to auth.users.
    const { data: removedProfiles, error: profileError } =
      await supabase
        .from("profiles")
        .delete()
        .eq("id", userId)
        .select("id");

    if (profileError) {
      console.error(
        "Profile cleanup failed:",
        profileError.message
      );

      return res.status(500).json({
        success: false,
        deletionPerformed: false,
        profileRemoved: false,
        authAccountDeleted: false,
        error:
          "Profile cleanup failed. The account was not deleted."
      });
    }

    profileRemoved =
      Array.isArray(removedProfiles) &&
      removedProfiles.length > 0;

    // Delete the verified Auth account.
    // Verified foreign-key rules handle related database rows.
    const { error: deleteAuthError } =
      await supabase.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      console.error(
        "Auth account deletion failed:",
        deleteAuthError.message
      );

      return res.status(500).json({
        success: false,
        deletionPerformed: profileRemoved,
        profileRemoved,
        authAccountDeleted: false,
        error: profileRemoved
          ? "The profile record was removed, but the account was not deleted. Please contact support before trying again."
          : "The account was not deleted. Please try again later."
      });
    }

    authAccountDeleted = true;

    return res.status(200).json({
      success: true,
      deletionPerformed: true,
      profileRemoved,
      authAccountDeleted: true,
      message:
        "Your account was deleted. You can register again with a new account."
    });
  } catch (error) {
    console.error(
      "Account deletion endpoint error:",
      error?.message || "Unknown error"
    );

    return res.status(500).json({
      success: false,
      deletionPerformed:
        profileRemoved || authAccountDeleted,
      profileRemoved,
      authAccountDeleted,
      error:
        "The request encountered an error. Check the result before retrying."
    });
  }
}
