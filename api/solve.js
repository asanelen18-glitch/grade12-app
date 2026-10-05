export default async function handler(req, res) {
    const allowedOrigin = "https://asanelen18-glitch.github.io";

    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    try {
        const {
            question,
            image,
            language = "English",
            mode = "solve"
        } = req.body || {};

        if (!question && !image) {
            return res.status(400).json({
                error: "Please provide a question or image."
            });
        }

        const content = [];

        if (question) {
            content.push({
                type: "input_text",
                text: question
            });
        }

        if (image) {
            content.push({
                type: "input_image",
                image_url: image
            });
        }

        let task;

        if (mode === "hint") {
            task =
                "Give the learner a useful hint. Do not immediately give the final answer.";
        } else if (mode === "check") {
            task =
                "Check the learner's answer. Explain whether it is correct and show how to correct it if necessary.";
        } else {
            task =
                "Solve the question and explain the answer step by step. Show important calculations and reasoning.";
        }

        const response = await fetch(
            "https://api.openai.com/v1/responses",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "Authorization":
                        `Bearer ${process.env.OPENAI_API_KEY}`
                },

                body: JSON.stringify({
                    model: "gpt-6-luna",

                    instructions:
                        `You are the Grade 12 Hub AI Study Helper.

Help Grade 12 learners understand their schoolwork.

${task}

Use simple and clear language.
Explain difficult ideas in a way a Grade 12 learner can understand.
Do not skip important steps.
For mathematics and science, show calculations clearly.
If the uploaded image is unclear, tell the learner.

Respond in ${language}.`,

                    input: [
                        {
                            role: "user",
                            content: content
                        }
                    ]
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                error:
                    data.error?.message ||
                    "The OpenAI request failed."
            });
        }

        return res.status(200).json({
            answer:
                data.output_text ||
                "The AI did not return an answer."
        });

    } catch (error) {
        console.error("Server error:", error);

        return res.status(500).json({
            error: "Something went wrong on the server."
        });
    }
}
