export default async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    try {

        const {
            access_token,
            reporter_id,
            reported_user_id,
            message_id
        } = req.body || {};

        if (!access_token) {
            return res.status(401).json({
                error: "You must be logged in."
            });
        }

        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            return res.status(500).json({
                error: "SUPABASE_SERVICE_ROLE_KEY is not configured."
            });
        }

        /* =====================================
           CHECK LOGGED-IN USER
        ===================================== */

        const userResponse = await fetch(
            "https://hdlhhbnawltisszzsbvw.supabase.co/auth/v1/user",
            {
                headers: {
                    "apikey":
                        process.env.SUPABASE_SERVICE_ROLE_KEY,

                    "Authorization":
                        `Bearer ${access_token}`
                }
            }
        );

        const currentUser =
            await userResponse.json();

        if (
            !userResponse.ok ||
            !currentUser ||
            !currentUser.id
        ) {
            return res.status(401).json({
                error: "Invalid login session."
            });
        }

        /* =====================================
           ADMIN CHECK
        ===================================== */

        const ADMIN_ID =
            "a11226b7-7463-497f-9e90-837d6ec16d60";

        if (currentUser.id !== ADMIN_ID) {
            return res.status(403).json({
                error: "Administrator access required."
            });
        }

        /* =====================================
           GET REPORTING STUDENT EMAIL
        ===================================== */

        let reporterEmail =
            "Email not available";

        if (reporter_id) {

            const response =
                await fetch(
                    `https://hdlhhbnawltisszzsbvw.supabase.co/auth/v1/admin/users/${reporter_id}`,
                    {
                        headers: {
                            "apikey":
                                process.env.SUPABASE_SERVICE_ROLE_KEY,

                            "Authorization":
                                `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
                        }
                    }
                );

            const user =
                await response.json();

            if (response.ok && user.email) {
                reporterEmail =
                    user.email;
            }
        }

        /* =====================================
           GET REPORTED STUDENT EMAIL
        ===================================== */

        let reportedEmail =
            "Email not available";

        if (reported_user_id) {

            const response =
                await fetch(
                    `https://hdlhhbnawltisszzsbvw.supabase.co/auth/v1/admin/users/${reported_user_id}`,
                    {
                        headers: {
                            "apikey":
                                process.env.SUPABASE_SERVICE_ROLE_KEY,

                            "Authorization":
                                `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
                        }
                    }
                );

            const user =
                await response.json();

            if (response.ok && user.email) {
                reportedEmail =
                    user.email;
            }
        }

        /* =====================================
           GET REPORTED MESSAGE
        ===================================== */

        let message =
            null;

        if (message_id) {

            const encodedId =
                encodeURIComponent(message_id);

            const response =
                await fetch(
                    `https://hdlhhbnawltisszzsbvw.supabase.co/rest/v1/study_messages?id=eq.${encodedId}&select=*`,
                    {
                        headers: {
                            "apikey":
                                process.env.SUPABASE_SERVICE_ROLE_KEY,

                            "Authorization":
                                `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
                        }
                    }
                );

            const messages =
                await response.json();

            if (
                response.ok &&
                Array.isArray(messages) &&
                messages.length > 0
            ) {
                message =
                    messages[0];
            }
        }

        /* =====================================
           RETURN INFORMATION
        ===================================== */

        return res.status(200).json({

            success: true,

            reporter_email:
                reporterEmail,

            reported_email:
                reportedEmail,

            message:
                message

        });

    } catch (error) {

        console.error(
            "Report details error:",
            error
        );

        return res.status(500).json({
            error:
                error.message ||
                "Could not load report details."
        });
    }
          }
