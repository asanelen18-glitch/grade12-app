
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const allowedOrigins = new Set([
  "https://grade12-app.vercel.app",
  "https://asanelen18-glitch.github.io"
]);

export default async function handler(req, res) {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({
      error: "Account deletion is not configured on the server."
    });
  }

  // Require the project base URL, not /rest/v1 or another API path.
  if (
    !/^https:\/\/[^/]+\/?$/.test(supabaseUrl.trim())
  ) {
    return res.status(500).json({
      error: "SUPABASE_URL must be the project base URL."
    });
  }

  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!token) {
    return res.status(401).json({
      error: "Please sign in again before deleting your account."
    });
  }

  const supabase = createClient(
    supabaseUrl.trim(),
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );

  try {
    // Verify the user's access token before touching any records.
    const { data: userData, error: userError } =
      await supabase.auth.getUser(token);

    if (userError || !userData?.user?.id) {
      return res.status(401).json({
        error: "Your session has expired. Please sign in again."
      });
    }

    const userId = userData.user.id;

    // Every database operation must succeed before Auth deletion.
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
        throw new Error(`Could not anonymise ${table}.`);
      }
    }

    // Preserve reports, but remove references to this account.
    await anonymiseRows("user_reports", "reporter_id");
    await anonymiseRows("user_reports", "reported_user_id");

    // Preserve moderation history without retaining this user link.
    await anonymiseRows("moderation_actions", "user_id");

    // Remove account-specific records.
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

    // Finally delete the verified Supabase Auth account.
    const { error: deleteError } =
      await supabase.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error(
        "Auth account deletion failed:",
        deleteError.message
      );

      return res.status(500).json({
        error:
          "Personal records were cleaned up, but the login account could not be deleted. Please contact support."
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
        "Account cleanup could not be completed. Your login account has not been intentionally deleted. Please contact support before retrying."
    });
  }
}
