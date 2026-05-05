import { GoogleGenAI } from "@google/genai";

export async function POST(req) {
  try {
    const { prompt, fileData, mimeType } = await req.json();

    if (!prompt) {
      return Response.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    // Initialize the Gemini client. It automatically picks up GEMINI_API_KEY from environment variables
    const ai = new GoogleGenAI({});

    let systemPrompt = `You are an AI exam assistant designed to provide exam-ready, fully simplified answers for university-level questions.
Your primary goal is to help students with their assignments and exams.
Whenever a question is asked, provide a comprehensive but easy-to-understand answer formatted perfectly for an exam scenario.
Use a structured, highly readable format:
- Start with a clear, simplified summary.
- Use bullet points for key facts, advantages, and disadvantages.
- Highlight or bold critical terms and concepts.
- Provide step-by-step explanations or real-world examples to clarify complex topics.
- Conclude with a brief 'Exam Takeaway' or summary.
Provide your response strictly in Markdown format.`;

    if (fileData) {
      if (mimeType.startsWith('image/')) {
        systemPrompt += `\n\nIMPORTANT: The student has attached an image (e.g., a screenshot of a question or diagram). Please carefully analyze the image and provide a highly accurate, exam-friendly answer or explanation for whatever is shown in the image.`;
      } else {
        systemPrompt += `\n\nIMPORTANT: The student has provided their official subject notes. You MUST base your answer STRICTLY on the concepts, definitions, and facts found in these provided notes. If the answer cannot be found in the notes, say so. Do not invent information outside the scope of the notes.`;
      }
    }

    const fullPrompt = `${systemPrompt}\n\nStudent's Question: ${prompt}\n\nProfessor's Answer:`;

    const apiContents = fileData && mimeType ? [
      { inlineData: { data: fileData, mimeType: mimeType } },
      fullPrompt
    ] : fullPrompt;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: apiContents,
    });

    return Response.json({ answer: response.text });
  } catch (error) {
    console.error("API Error:", error);
    return Response.json(
      { error: "Failed to generate answer. Please check your API key or try again later." },
      { status: 500 }
    );
  }
}
