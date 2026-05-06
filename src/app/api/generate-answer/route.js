import { GoogleGenAI } from "@google/genai";

export async function POST(req) {
  try {
    const { prompt, filesData, answerLength } = await req.json();

    if (!prompt && (!filesData || filesData.length === 0)) {
      return Response.json(
        { error: "Prompt or file(s) are required" },
        { status: 400 }
      );
    }

    const keysStr = process.env.GEMINI_API_KEY || "";
    const apiKeys = keysStr.split(",").map(k => k.trim()).filter(k => k);
    
    if (apiKeys.length === 0) {
      return Response.json({ error: "No API keys configured" }, { status: 500 });
    }
    let systemPrompt = `You are an AI exam assistant designed to provide exam-ready, fully simplified answers for university-level questions.
Your primary goal is to help students with their assignments and exams.
Whenever a question is asked, provide a comprehensive but easy-to-understand answer formatted perfectly for an exam scenario.
Use a structured, highly readable format:
- Start with a clear, simplified summary.
- If the user asks for a comparison, difference between concepts, or tabular format, ALWAYS present your answer using a perfectly formatted Markdown table.
- Use bullet points for key facts, advantages, and disadvantages.
- Highlight or bold critical terms and concepts.
- Provide step-by-step explanations or real-world examples to clarify complex topics.
- Conclude with a brief 'Exam Takeaway' or summary.
Provide your response strictly in Markdown format.`;

    // Adjust prompt based on requested length/marks
    if (answerLength === "small") {
      systemPrompt += `\n\nCRITICAL REQUIREMENT: The user has requested a SMALL answer (approx. 2 marks). Keep your response extremely concise, focusing only on the core definitions, main facts, or direct answer. Do not provide long explanations or extensive examples. 1-2 brief paragraphs or a few bullet points is ideal.`;
    } else if (answerLength === "large") {
      systemPrompt += `\n\nCRITICAL REQUIREMENT: The user has requested a LARGE answer (approx. 10 marks). Provide a highly detailed, comprehensive response. Break down the topic into logical sections, provide in-depth explanations, use multiple examples or analogies, and ensure the answer is long enough to fetch maximum marks in a university exam. Include introductions, advantages, disadvantages, applications, and a strong conclusion where applicable.`;
    } else {
      // medium / default
      systemPrompt += `\n\nCRITICAL REQUIREMENT: The user has requested a MEDIUM answer (approx. 5 marks). Provide a standard, well-rounded answer with sufficient explanation, key points, and perhaps one solid example. Ensure it covers all necessary points without being overly verbose.`;
    }

    if (filesData && filesData.length > 0) {
      const hasImages = filesData.some(f => f.mimeType.startsWith('image/'));
      const hasDocs = filesData.some(f => !f.mimeType.startsWith('image/'));
      
      if (hasImages && !hasDocs) {
        systemPrompt += `\n\nIMPORTANT: The student has attached image(s) (e.g., screenshots of questions or diagrams). Please carefully analyze the image(s) and provide a highly accurate, exam-friendly answer or explanation for whatever is shown in the image(s).`;
      } else if (!hasImages && hasDocs) {
        systemPrompt += `\n\nIMPORTANT: The student has provided their official subject notes. You MUST base your answer STRICTLY on the concepts, definitions, and facts found in these provided notes. If the answer cannot be found in the notes, say so. Do not invent information outside the scope of the notes.`;
      } else {
         systemPrompt += `\n\nIMPORTANT: The student has attached both images and text notes. Please carefully analyze all provided materials to formulate your answer. Base your factual responses strictly on the provided notes where applicable.`;
      }
    }

    const fullPrompt = `${systemPrompt}\n\nStudent's Question: ${prompt}\n\nProfessor's Answer:`;

    let apiContents = [];
    
    if (filesData && filesData.length > 0) {
      // Add each file as an inline data object
      filesData.forEach(file => {
        if (file.extractedText) {
          apiContents.push(`\n--- Extracted Text from ${file.name} ---\n${file.extractedText}\n--- End of ${file.name} ---\n`);
        } else if (file.base64 && file.mimeType) {
          apiContents.push({
            inlineData: {
              data: file.base64,
              mimeType: file.mimeType
            }
          });
        }
      });
    }
    
    // Add the text prompt at the end
    apiContents.push(fullPrompt);

    // Shuffle keys to distribute load randomly
    const shuffledKeys = apiKeys.sort(() => Math.random() - 0.5);

    let response = null;
    let lastErrorString = "";

    for (const key of shuffledKeys) {
      try {
        const ai = new GoogleGenAI({ apiKey: key });
        response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: apiContents,
        });
        // Success, break out of loop
        break;
      } catch (error) {
        const errorString = error?.message || String(error);
        lastErrorString = errorString;
        console.warn(`API Key failed. Trying next key. Error: ${errorString.substring(0, 80)}...`);
        
        // If it's a quota error, continue to the next key. Otherwise, break and throw immediately
        if (errorString.includes("429") || errorString.includes("quota") || errorString.includes("RESOURCE_EXHAUSTED")) {
          continue;
        } else {
           throw error; 
        }
      }
    }

    if (!response) {
       // All keys were exhausted or failed with 429
       return Response.json(
         { error: "Google Gemini API Quota Exceeded across all provided keys. Please add more API keys to the environment variables separated by commas. [Last Error: " + lastErrorString + "]" },
         { status: 429 }
       );
    }

    return Response.json({ answer: response.text });
  } catch (error) {
    const errorString = error?.message || String(error);
    console.error("API Error:", errorString);
    
    return Response.json(
      { error: "Failed to generate answer. Please check your API key or try again later. [Debug: " + errorString + "]" },
      { status: 500 }
    );
  }
}
