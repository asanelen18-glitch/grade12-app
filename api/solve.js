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

        let task;

        if (mode === "hint") {
            task = "Give a helpful hint without immediately giving the final answer.";
        } else if (mode === "check") {
            task = "Check the learner's answer and explain whether it is correct.";
        } else {
            task = "Solve the question and explain the answer step by step.";
        }

        const response = await fetch(
            "https://api.openai.com/v1/responses",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: "gpt-6-luna",
                    instructions: `You are the Grade 12 Hub AI Study Helper.

Help Grade 12 learners understand their schoolwork.

${task}

Use simple language.
Show important calculations and reasoning.
Respond in ${language}.
If an uploaded image is unclear, say so.`,
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
                error: data.error?.message || "OpenAI request failed."
            });
        }

        return res.status(200).json({
            answer: data.output_text || "No answer was returned."
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: "Server error: " + error.message
        });
    }
}
