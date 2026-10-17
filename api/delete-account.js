
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const allowedOrigins = new Set([
  "https://grade12-app.vercel.app",
  "https://grade12-izk22y0ov-grade-12-hub.vercel.app",
  "https://asanelen18-glitch.github.io"
]);

export default async function handler(req, res) {
  const origin = req.headers.origin;

  // Check the request origin before processing anything.
  if (origin && !allowedOrigins.has(origin)) {
    return res.status(403).json({
      success: false,
      error: "This website is not allowed to use this endpoint.",
      deletionPerformed: false
    });
  }

  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type"
  );
  res.setHeader("Cache-Control", "no-store");

  // CORS preflight: no data is changed.
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Safe endpoint health check.
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      endpoint: "delete-account",
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

  // Verify server configuration.
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({
      success: false,
      error: "Account deletion is not configured on the server.",
      deletionPerformed: false
    });
  }

  const projectUrl = supabaseUrl.trim();

  if (!/^https:\/\/[^/]+\/?$/.test(projectUrl)) {
    return res.status(500).json({
      success: false,
      error: "SUPABASE_URL must be the project base URL without an API path.",
      deletionPerformed: false
    });
  }

  // Require the signed-in user's access token.
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
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );

  try {
    // Verify the token with Supabase.
    const { data: userData, error: userError } =
      await supabase.auth.getUser(token);

    if (userError || !userData?.user?.id) {
      return res.status(401).json({
        success: false,
        error: "Your session has expired. Please sign in again.",
        deletionPerformed: false
      });
    }

    const userId = userData.user.id;

    // SAFE TEST:
    // POST {"dryRun":true} validates the authenticated session.
    // It does not delete, update, or insert any database records.
    if (req.body?.dryRun === true) {
      return res.status(200).json({
        success: true,
        dryRun: true,
        authenticated: true,
        deletionPerformed: false,
        message: "API connection and authentication test passed. No data was changed."
      });
    }

    // Require explicit confirmation for real deletion.
    if (req.body?.confirmation !== "DELETE") {
      return res.status(400).json({
        success: false,
        error: "Explicit account deletion confirmation is required.",
        deletionPerformed: false
      });
    }

    async function deleteOwnRows(table, column = "user_id") {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq(column, userId);

      if (error) {
        console.error(
          `Account cleanup failed for ${table}:`,
          error.message
        );
        throw new Error(`Could not clean up ${table}.`);
      }
    }

    async function anonymiseRows(table, column) {
      const { error } = await supabase
        .from(table)
        .update({ [column]: null })
        .eq(column, userId);

      if (error) {
        console.error(
          `Anonymisation failed for ${table}.${column}:`,
          error.message
        );
        throw new Error(`Could not anonymise ${table}.${column}.`);
      }
    }

    // Preserve reports but remove links to this account.
    await anonymiseRows("user_reports", "reporter_id");
    await anonymiseRows("user_reports", "reported_user_id");

    // Preserve moderation history without this account link.
    await anonymiseRows("moderation_actions", "user_id");

    // Remove this user's personal records and activity.
    await deleteOwnRows("study_messages");
    await deleteOwnRows("study_group_members");
    await deleteOwnRows("quiz_attempts");
    await deleteOwnRows("study_planner_items");
    await deleteOwnRows("study_plans");
    await deleteOwnRows("study_sessions");
    await deleteOwnRows("push_subscriptions");
    await deleteOwnRows("terms_acceptance");
    await deleteOwnRows("user_moderation_status");
    await deleteOwnRows("admin_users");

    // Tables using different account ID columns.
    await deleteOwnRows("profiles", "id");
    await deleteOwnRows("learner_profiles", "user_id");

    // Delete the login account last.
    const { error: deleteError } =
      await supabase.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error(
        "Auth account deletion failed:",
        deleteError.message
      );

      return res.status(500).json({
        success: false,
        deletionPerformed: "partial",
        error:
          "Some personal records may already have been changed, but the login account could not be deleted. Do not retry immediately; review the account and database first."
      });
    }

    return res.status(200).json({
      success: true,
      deletionPerformed: true,
      message: "Your account and personal records have been deleted."
    });
  } catch (error) {
    console.error("Account deletion failed:", error.message);

    return res.status(500).json({
      success: false,
      deletionPerformed: "unknown",
      error:
        "Account cleanup did not finish. Some records may already have been changed. Review the database before retrying."
    });
  }
}
