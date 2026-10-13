
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST." });
  }

  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!token) {
    return res.status(401).json({ error: "Please sign in first." });
  }

  try {
    const { data: userResult, error: userError } =
      await supabase.auth.getUser(token);

    const user = userResult?.user;

    if (userError || !user) {
      return res.status(401).json({ error: "Your session is invalid. Sign in again." });
    }

    const subscription = req.body?.subscription;

    if (
      !subscription?.endpoint ||
      !subscription?.keys?.p256dh ||
      !subscription?.keys?.auth
    ) {
      return res.status(400).json({ error: "Invalid push subscription." });
    }

    const { error } = await supabase
      .from("push_subscriptions")
      .upsert({
        user_id: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth
      }, { onConflict: "endpoint" });

    if (error) {
      console.error("Subscription save failed:", error.message);
      return res.status(500).json({ error: "Could not save the subscription." });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Push subscribe error:", error);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}
