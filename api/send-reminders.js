
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
let setupError = null;

try {
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing Supabase server configuration.");
  }

  const parsedUrl = new URL(supabaseUrl);

  // Supabase URL must be the project base URL, not /rest/v1.
  if (
    !["https:", "http:"].includes(parsedUrl.protocol) ||
    parsedUrl.pathname !== "/" ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error(
      "SUPABASE_URL must be the project base URL without an API path."
    );
  }

  supabase = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
} catch (error) {
  setupError = error;
  console.error("Reminder setup failed:", error.message);
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const authorization = req.headers.authorization || "";

  if (!secret || authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (setupError || !supabase) {
    return res.status(500).json({
      error: "Reminder configuration failed. Check Vercel logs."
    });
  }

  let stage = "starting";

  try {
    const now = new Date().toISOString();

    stage = "querying study_planner_items";

    const { data: dueItems, error: queryError } = await supabase
      .from("study_planner_items")
      .select("id,user_id,title,subject,task_type,due_at,reminder_at")
      .eq("is_completed", false)
      .is("reminder_sent_at", null)
      .lte("reminder_at", now)
      .order("reminder_at", { ascending: true })
      .limit(100);

    if (queryError) throw queryError;

    let sent = 0;
    let failed = 0;

    for (const item of dueItems || []) {
      stage = "querying push_subscriptions";

      const { data: subscriptions, error: subError } = await supabase
        .from("push_subscriptions")
        .select("id,endpoint,p256dh,auth")
        .eq("user_id", item.user_id);

      if (subError) throw subError;

      const payload = JSON.stringify({
        title: `Grade 12 Hub: ${item.task_type}`,
        body: `${item.title}${item.subject ? " • " + item.subject : ""} is due soon or now.`,
        url: "/study-planner.html",
        itemId: item.id
      });

      let deliveredToAtLeastOne = false;

      for (const sub of subscriptions || []) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth }
            },
            payload
          );

          deliveredToAtLeastOne = true;
          sent++;
        } catch (error) {
          console.error(
            "Push delivery failed:",
            error.statusCode || error.message
          );

          if (error.statusCode === 404 || error.statusCode === 410) {
            stage = "deleting expired push subscription";

            const { error: deleteError } = await supabase
              .from("push_subscriptions")
              .delete()
              .eq("id", sub.id);

            if (deleteError) {
              console.error("Subscription cleanup failed:", deleteError.message);
            }
          }

          failed++;
        }
      }

      if (deliveredToAtLeastOne) {
        stage = "marking reminder sent";

        const { error: updateError } = await supabase
          .from("study_planner_items")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", item.id)
          .is("reminder_sent_at", null);

        if (updateError) throw updateError;
      }
    }

    return res.status(200).json({
      ok: true,
      dueItems: dueItems?.length || 0,
      notificationsAccepted: sent,
      failures: failed
    });
  } catch (error) {
    console.error("Reminder job failed at stage:", stage);
    console.error("Reminder job error:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    });

    return res.status(500).json({
      error: "Reminder job failed.",
      stage
    });
  }
}
