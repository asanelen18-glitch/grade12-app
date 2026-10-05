async function sendEmail(reportId) {

    const allowed = await checkAdmin();

    if (!allowed) return;


    /* =================================
       GET REPORT
    ================================= */

    const {
        data: report,
        error
    } = await supabaseClient
        .from("user_reports")
        .select("*")
        .eq("id", reportId)
        .single();


    if (error || !report) {

        alert(
            "❌ Could not find this report."
        );

        console.error(error);

        return;
    }


    /* =================================
       GET EMAIL
    ================================= */

    const details =
        await getReportDetails(report);


    if (!details) {

        alert(
            "❌ The student details could not be loaded."
        );

        return;
    }


    const reporterEmail =
        details.reporter_email;


    const reportedEmail =
        details.reported_email;


    /* =================================
       CHOOSE STUDENT
    ================================= */

    let choice = prompt(

        "Who do you want to email?\n\n" +

        "1 = Reported student\n" +

        "2 = Reporting student\n\n" +

        "Enter 1 or 2:",

        "1"

    );


    if (choice === null) {

        return;

    }


    choice =
        choice.trim();


    let email;


    if (choice === "1") {

        email =
            reportedEmail;

    } else if (choice === "2") {

        email =
            reporterEmail;

    } else {

        alert(
            "❌ Please enter 1 or 2."
        );

        return;
    }


    /* =================================
       CHECK EMAIL
    ================================= */

    if (
        !email ||
        email ===
        "Email not available"
    ) {

        alert(
            "❌ The selected student's email is not available."
        );

        return;
    }


    /* =================================
       SUBJECT
    ================================= */

    const subject =
        prompt(

            "Enter the email subject:",

            "Grade 12 Hub - Important Notice"

        );


    if (
        subject === null ||
        subject.trim() === ""
    ) {

        return;
    }


    /* =================================
       MESSAGE
    ================================= */

    const message =
        prompt(
            "Enter the message you want to send:"
        );


    if (
        message === null ||
        message.trim() === ""
    ) {

        return;
    }


    /* =================================
       CONFIRM
    ================================= */

    const confirmed =
        confirm(

            "Send this email?\n\n" +

            "To: " +
            email +

            "\n\n" +

            "Subject: " +
            subject +

            "\n\n" +

            "Message:\n" +
            message

        );


    if (!confirmed) {

        return;

    }


    /* =================================
       SEND THROUGH VERCEL
    ================================= */

    try {

        alert(
            "📧 Sending email..."
        );


        const response =
            await fetch(

                "https://grade12-app.vercel.app/api/send-email",

                {

                    method: "POST",

                    headers: {

                        "Content-Type":
                            "application/json"

                    },

                    body:
                        JSON.stringify({

                            to:
                                email,

                            subject:
                                subject.trim(),

                            message:
                                message.trim()

                        })

                }

            );


        const data =
            await response.json();


        console.log(
            "Email server response:",
            data
        );


        if (!response.ok) {

            alert(

                "❌ Email could not be sent.\n\n" +

                (
                    data.error ||
                    "Unknown email server error."
                )

            );

            return;
        }


        alert(

            "✅ Email sent successfully!\n\n" +

            "To: " +
            email

        );


    } catch (error) {

        console.error(
            "Email error:",
            error
        );


        alert(

            "❌ Could not connect to the email server.\n\n" +

            error.message

        );

    }

}
