import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  // 1. Check the request method
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Use POST."
    });
  }

  // 2. Check server environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Push subscription configuration missing:", {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey)
    });

    return res.status(500).json({
      error:
        "Server configuration is incomplete. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel Production environment variables."
    });
  }

  // 3. Create the Supabase server client
  const supabase = createClient(
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

  // 4. Verify the learner's login token
  const authorization = req.headers.authorization || "";

  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!token) {
    return res.status(401).json({
      error: "Please sign in first."
    });
  }

  try {
    const {
      data: userResult,
      error: userError
    } = await supabase.auth.getUser(token);

    const user = userResult?.user;

    if (userError || !user) {
      console.error(
        "Authentication verification failed:",
        userError?.message || "No user found"
      );

      return res.status(401).json({
        error: "Your session is invalid. Sign in again."
      });
    }

    // 5. Validate the browser push subscription
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

    // 6. Save or update this learner's subscription
    const { error: saveError } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: user.id,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth
        },
        {
          onConflict: "endpoint"
        }
      );

    if (saveError) {
      console.error(
        "Subscription save failed:",
        saveError.message
      );

      return res.status(500).json({
        error: "Could not save the notification subscription."
      });
    }

    // 7. Confirm success
    return res.status(200).json({
      ok: true,
      message: "Push notifications enabled successfully."
    });

  } catch (error) {
    console.error(
      "Push subscribe error:",
      error?.message || "Unknown server error"
    );

    return res.status(500).json({
      error: "Unexpected server error while enabling notifications."
    });
  }
    }
