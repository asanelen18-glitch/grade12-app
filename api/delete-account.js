
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
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({
      error: "Account deletion is not configured on the server."
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

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  try {
    // Verify the signed-in learner using their access token.
    const { data: userData, error: userError } =
      await supabase.auth.getUser(token);

    if (userError || !userData?.user) {
      return res.status(401).json({
        error: "Your session has expired. Please sign in again."
      });
    }

    // Delete only the account belonging to this verified user.
    const { error: deleteError } =
      await supabase.auth.admin.deleteUser(userData.user.id);

    if (deleteError) {
      console.error("Account deletion failed:", deleteError.message);

      return res.status(500).json({
        error: "The account could not be deleted. Please try again."
      });
    }

    return res.status(200).json({
      success: true,
      message: "Your account has been deleted."
    });
  } catch (error) {
    console.error("Unexpected account deletion error:", error);

    return res.status(500).json({
      error: "Something went wrong while deleting the account."
    });
  }
}
