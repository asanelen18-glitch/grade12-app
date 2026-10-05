export default async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    try {

        const {
            to,
            subject,
            message
        } = req.body || {};

        if (!to || !subject || !message) {
            return res.status(400).json({
                error:
                    "Email address, subject and message are required."
            });
        }

        if (!process.env.RESEND_API_KEY) {
            return res.status(500).json({
                error:
                    "RESEND_API_KEY is not configured in Vercel."
            });
        }

        const response = await fetch(
            "https://api.resend.com/emails",
            {
                method: "POST",

                headers: {
                    "Authorization":
                        `Bearer ${process.env.RESEND_API_KEY}`,

                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({

                    from:
                        "Grade 12 Hub <onboarding@resend.dev>",

                    to: [to],

                    subject:
                        subject,

                    text:
                        message
                })
            }
        );

        const data =
            await response.json();

        console.log(
            "Resend response:",
            data
        );

        if (!response.ok) {

            return res.status(response.status).json({

                error:
                    data.message ||
                    data.name ||
                    JSON.stringify(data) ||
                    "Resend rejected the email."
            });
        }

        return res.status(200).json({

            success: true,

            message:
                "Email sent successfully.",

            id:
                data.id
        });

    } catch (error) {

        console.error(
            "Email server error:",
            error
        );

        return res.status(500).json({

            error:
                error.message ||
                "Server error while sending email."
        });
    }
}
