export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
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

        let task = "";

        if (mode === "hint") {
            task =
                "Give the learner a helpful hint without immediately giving the final answer.";
        } else if (mode === "check") {
            task =
                "Check the learner's answer and explain whether it is correct. If it is wrong, explain how to correct it.";
        } else {
            task =
                "Solve the question and explain the solution clearly, step by step.";
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

Help Grade 12 learners understand schoolwork.

${task}

Use simple language.
Show important calculations and reasoning.
Do not skip important steps.
Respond in ${language}.
If an uploaded image is unclear, tell the learner.`,

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
            console.error("OpenAI error:", data);

            return res.status(response.status).json({
                error:
                    data.error?.message ||
                    "OpenAI request failed."
            });
        }

        // First try OpenAI's convenience text field.
        let answer = data.output_text;

        // If output_text is not available, extract text
        // from the response output items.
        if (!answer && Array.isArray(data.output)) {
            const parts = [];

            for (const item of data.output) {
                if (Array.isArray(item.content)) {
                    for (const part of item.content) {
                        if (
                            part.type === "output_text" &&
                            typeof part.text === "string"
                        ) {
                            parts.push(part.text);
                        }
                    }
                }
            }

            answer = parts.join("\n\n");
        }

        if (!answer) {
            console.error(
                "No text found in OpenAI response:",
                JSON.stringify(data)
            );

            return res.status(502).json({
                error:
                    "The AI responded, but no text answer was returned."
            });
        }

        return res.status(200).json({
            answer: answer
        });

    } catch (error) {
        console.error("Server error:", error);

        return res.status(500).json({
            error:
                "Server error: " + error.message
        });
    }
                    }
