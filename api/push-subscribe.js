import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST." });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !serviceRoleKey || !publishableKey) {
    console.error("Push API configuration check:", {
      hasUrl: Boolean(supabaseUrl),
      hasServiceKey: Boolean(serviceRoleKey),
      hasPublishableKey: Boolean(publishableKey)
    });

    return res.status(500).json({
      error: "Server configuration is incomplete. Check the three Supabase environment variables in Vercel."
    });
  }

  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (!token) {
    return res.status(401).json({
      error: "No login token was received. Sign in again."
    });
  }

  // Use the public key to verify the learner's access token.
  const authClient = createClient(
    supabaseUrl,
    publishableKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    }
  );

  // Use the service-role key only for the protected database operation.
  const adminClient = createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    }
  );

  try {
    const {
      data: userData,
      error: authError
    } = await authClient.auth.getUser(token);

    if (authError || !userData?.user) {
      console.error("Push API token verification failed:", {
        status: authError?.status || null,
        message: authError?.message || "No user returned"
      });

      return res.status(401).json({
        error: "Supabase rejected the login token. Check that the website and Vercel use the same Supabase project, then sign in again."
      });
    }

    const subscription = req.body?.subscription;

    if (
      !subscription?.endpoint ||
      !subscription?.keys?.p256dh ||
      !subscription?.keys?.auth
    ) {
      return res.status(400).json({
        error: "Invalid push subscription."
      });
    }

    const { error: saveError } = await adminClient
      .from("push_subscriptions")
      .upsert(
        {
          user_id: userData.user.id,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth
        },
        { onConflict: "endpoint" }
      );

    if (saveError) {
      console.error("Push subscription save failed:", saveError.message);

      return res.status(500).json({
        error: "Login verified, but the notification subscription could not be saved. Check the database configuration and permissions."
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Push notifications enabled successfully."
    });
  } catch (error) {
    console.error("Push API unexpected error:", error?.message);

    return res.status(500).json({
      error: "Unexpected server error while enabling notifications."
    });
  }
    }
