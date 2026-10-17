
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const allowedOrigins = new Set([
  "https://grade12-app.vercel.app",
  "https://asanelen18-glitch.github.io"
]);

export default async function handler(req, res) {
  const origin = req.headers.origin;

  // Only allow requests from the approved website origins.
  if (origin && !allowedOrigins.has(origin)) {
    return res.status(403).json({
      error: "This website is not allowed to use this endpoint."
    });
  }

  // CORS headers for the approved website.
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

  // Browser CORS preflight. This never deletes an account.
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Safe health check. GET must never delete or modify user data.
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      endpoint: "delete-account",
      deletionPerformed: false
    });
  }

  // Only POST can enter the deletion process.
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");

    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  // Confirm server environment variables exist.
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({
      error: "Account deletion is not configured on the server."
    });
  }

  const projectUrl = supabaseUrl.trim();

  // Require the Supabase project base URL, without API paths.
  if (!/^https:\/\/[^/]+\/?$/.test(projectUrl)) {
    return res.status(500).json({
      error: "SUPABASE_URL must be the project base URL."
    });
  }

  // Require a signed-in user's access token.
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (!token) {
    return res.status(401).json({
      error: "Please sign in again before deleting your account."
    });
  }

  const supabase = createClient(
    projectUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );

  try {
    // Verify the token with Supabase before touching user data.
    const { data: userData, error: userError } =
      await supabase.auth.getUser(token);

    if (userError || !userData?.user?.id) {
      return res.status(401).json({
        error: "Your session has expired. Please sign in again."
      });
    }

    const userId = userData.user.id;

    // Delete only records belonging to this verified user.
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

    // Preserve reports and moderation history, but remove
    // references identifying this account.
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

    // Preserve user reports involving other people.
    await anonymiseRows("user_reports", "reporter_id");
    await anonymiseRows("user_reports", "reported_user_id");

    // Preserve moderation history without this account's user link.
    await anonymiseRows("moderation_actions", "user_id");

    // Remove the user's personal and activity records.
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

    // These tables use different account-ID column names.
    await deleteOwnRows("profiles", "id");
    await deleteOwnRows("learner_profiles", "user_id");

    // Delete the Supabase Auth account only after the cleanup
    // steps above have succeeded.
    const { error: deleteError } =
      await supabase.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error(
        "Auth account deletion failed:",
        deleteError.message
      );

      return res.status(500).json({
        error:
          "Personal records may have been cleaned up, but the login account could not be deleted. Do not retry immediately; contact support to review the account."
      });
    }

    return res.status(200).json({
      success: true,
      message: "Your account and personal records have been deleted."
    });
  } catch (error) {
    console.error("Account deletion failed:", error.message);

    return res.status(500).json({
      error:
        "Account cleanup did not finish. Some records may already have been changed. The login account was not intentionally deleted by this error handler. Contact support before retrying."
    });
  }
}
