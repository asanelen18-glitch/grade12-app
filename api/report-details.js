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


        const serviceKey =
            process.env.SUPABASE_SERVICE_ROLE_KEY;


        if (!serviceKey) {

            return res.status(500).json({
                error:
                    "SUPABASE_SERVICE_ROLE_KEY is missing in Vercel."
            });

        }


        const supabaseUrl =
            "https://hdlhhbnawltisszzsbvw.supabase.co";


        const adminId =
            "a11226b7-7463-497f-9e90-837d6ec16d60";


        /* =================================
           VERIFY ADMIN LOGIN
        ================================= */

        const userResponse =
            await fetch(
                supabaseUrl + "/auth/v1/user",
                {
                    method: "GET",

                    headers: {

                        "apikey":
                            serviceKey,

                        "Authorization":
                            "Bearer " +
                            access_token

                    }
                }
            );


        if (!userResponse.ok) {

            const errorText =
                await userResponse.text();

            console.error(
                "User verification error:",
                errorText
            );

            return res.status(401).json({
                error:
                    "Could not verify your login session."
            });

        }


        const currentUser =
            await userResponse.json();


        if (!currentUser.id) {

            return res.status(401).json({
                error:
                    "Your login session is invalid."
            });

        }


        /* =================================
           CHECK ADMIN ID
        ================================= */

        if (
            currentUser.id !== adminId
        ) {

            return res.status(403).json({
                error:
                    "Administrator access required."
            });

        }


        /* =================================
           REPORTING STUDENT EMAIL
        ================================= */

        let reporterEmail =
            "Email not available";


        if (reporter_id) {

            const response =
                await fetch(
                    supabaseUrl +
                    "/auth/v1/admin/users/" +
                    encodeURIComponent(
                        reporter_id
                    ),
                    {
                        method: "GET",

                        headers: {

                            "apikey":
                                serviceKey,

                            "Authorization":
                                "Bearer " +
                                serviceKey

                        }
                    }
                );


            const user =
                await response.json();


            console.log(
                "Reporting student response:",
                user
            );


            if (
                response.ok &&
                user.email
            ) {

                reporterEmail =
                    user.email;

            }

        }


        /* =================================
           REPORTED STUDENT EMAIL
        ================================= */

        let reportedEmail =
            "Email not available";


        if (reported_user_id) {

            const response =
                await fetch(
                    supabaseUrl +
                    "/auth/v1/admin/users/" +
                    encodeURIComponent(
                        reported_user_id
                    ),
                    {
                        method: "GET",

                        headers: {

                            "apikey":
                                serviceKey,

                            "Authorization":
                                "Bearer " +
                                serviceKey

                        }
                    }
                );


            const user =
                await response.json();


            console.log(
                "Reported student response:",
                user
            );


            if (
                response.ok &&
                user.email
            ) {

                reportedEmail =
                    user.email;

            }

        }


        /* =================================
           REPORTED MESSAGE
        ================================= */

        let message = null;


        if (message_id) {

            const response =
                await fetch(

                    supabaseUrl +
                    "/rest/v1/study_messages" +
                    "?id=eq." +
                    encodeURIComponent(
                        message_id
                    ) +
                    "&select=*",

                    {
                        method: "GET",

                        headers: {

                            "apikey":
                                serviceKey,

                            "Authorization":
                                "Bearer " +
                                serviceKey,

                            "Content-Type":
                                "application/json"

                        }
                    }

                );


            const messages =
                await response.json();


            console.log(
                "Reported message response:",
                messages
            );


            if (
                response.ok &&
                Array.isArray(messages) &&
                messages.length > 0
            ) {

                message =
                    messages[0];

            }

        }


        /* =================================
           RETURN RESULTS
        ================================= */

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
