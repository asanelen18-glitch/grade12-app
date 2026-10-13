
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";

  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const now = new Date().toISOString();

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
      const { data: subscriptions, error: subError } = await supabase
        .from("push_subscriptions")
        .select("id,endpoint,p256dh,auth")
        .eq("user_id", item.user_id);

      if (subError) {
        failed++;
        console.error("Subscription lookup failed:", subError.message);
        continue;
      }

      const payload = JSON.stringify({
        title: `Grade 12 Hub: ${item.task_type}`,
        body: `${item.title}${item.subject ? " • " + item.subject : ""} is due soon or now.`,
        url: "/study-planner.html",
        itemId: item.id
      });

      let deliveredToAtLeastOne = false;

      for (const sub of subscriptions || []) {
        try {
          await webpush.sendNotification({
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
          }, payload);

          deliveredToAtLeastOne = true;
          sent++;
        } catch (error) {
          console.error("Push delivery failed:", error.statusCode || error.message);

          if (error.statusCode === 404 || error.statusCode === 410) {
            await supabase.from("push_subscriptions")
              .delete().eq("id", sub.id);
          }

          failed++;
        }
      }

      // Mark sent only if at least one subscription accepted the push.
      // If the learner has not enabled push yet, this item remains pending.
      if (deliveredToAtLeastOne) {
        const { error: updateError } = await supabase
          .from("study_planner_items")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", item.id)
          .is("reminder_sent_at", null);

        if (updateError) {
          console.error("Could not mark reminder sent:", updateError.message);
        }
      }
    }

    return res.status(200).json({
      ok: true,
      dueItems: dueItems?.length || 0,
      notificationsAccepted: sent,
      failures: failed
    });
  } catch (error) {
    console.error("Reminder job error:", error);
    return res.status(500).json({ error: "Reminder job failed." });
  }
}
