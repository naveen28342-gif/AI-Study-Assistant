const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_MODEL = import.meta.env.VITE_GEMINI_MODEL || "gemini-2.5-flash";
const FALLBACK_MODELS = Array.from(new Set([DEFAULT_MODEL, "gemini-2.5-flash-lite"]));
const fileBase64Cache = new WeakMap<File, string>();

// LLM memory: max characters of history to send (approx 8k chars ~ 2k tokens)
const MEMORY_CHAR_BUDGET = 8000;

const CLEAN_MARKDOWN_STYLE = `Format the answer in clean, polished Markdown.
- Use clear headings and short paragraphs.
- Keep spacing balanced and easy to read.
- Use bullets only when helpful.
- Align lists neatly with consistent indentation.
- Avoid cluttered or overly long paragraphs.
- Keep the answer concise unless the user asks for deep detail.
- Keep the tone natural, friendly, and professional.
- Make the output readable on both mobile and desktop.`;

export interface QuizQuestion {
  question: string;
  answer: string;
  choices: string[];
}

export interface Flashcard {
  front: string;
  back: string;
}

function fileToBase64(file: File): Promise<string> {
  const cached = fileBase64Cache.get(file);
  if (cached) {
    return Promise.resolve(cached);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      fileBase64Cache.set(file, base64);
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function postInteraction(payload: Record<string, unknown>): Promise<any> {
  if (!API_KEY) {
    throw new Error("Gemini API key is not configured. Set VITE_GEMINI_API_KEY in .env.local.");
  }

  const response = await fetch(INTERACTIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": API_KEY
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Gemini interactions API error", data);
    const message = (data && (data.error?.message || data.error?.status)) || response.statusText;
    throw new Error(`Gemini interactions API failed: ${message}`);
  }

  return data;
}

function getOutputText(response: any): string {
  if (!response) return "";
  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  const steps = response.steps as any[] | undefined;
  if (Array.isArray(steps)) {
    for (let i = steps.length - 1; i >= 0; i -= 1) {
      const content = steps[i]?.content as any[] | undefined;
      if (Array.isArray(content)) {
        const textPart = content.find((part) => typeof part?.text === "string");
        if (textPart) {
          return textPart.text;
        }
      }
    }
  }

  return "";
}

function shouldTryFallbackModel(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("model") ||
    message.includes("not found") ||
    message.includes("not supported") ||
    message.includes("unavailable") ||
    message.includes("overloaded")
  );
}

async function runDocumentInteraction(pdfFile: File | null, prompt: string): Promise<string> {
  const promptInput = {
    type: "text",
    text: prompt
  };

  const input: any[] = [];
  if (pdfFile) {
    const base64Data = await fileToBase64(pdfFile);
    input.push({
      type: "document",
      data: base64Data,
      mime_type: "application/pdf"
    });
  }
  input.push(promptInput);

  let lastError: unknown;
  for (const model of FALLBACK_MODELS) {
    try {
      const payload = {
        model,
        input
      };
      const result = await postInteraction(payload);
      const text = getOutputText(result);
      if (!text) {
        throw new Error("Gemini returned no output text.");
      }
      return text;
    } catch (error) {
      lastError = error;
      const isLastModel = model === FALLBACK_MODELS[FALLBACK_MODELS.length - 1];
      if (isLastModel || !shouldTryFallbackModel(error)) {
        console.error("All Gemini models failed.", error);
        throw error;
      }
      console.warn(`Gemini model ${model} failed, trying next fallback.`, error);
    }
  }

  throw new Error(`All Gemini models failed: ${lastError}`);
}

export async function generateSummaryFromPDF(pdfFile: File): Promise<string> {
  const prompt = `Please provide a comprehensive summary of this PDF document. Include:
1. Main topic and purpose
2. Key concepts and ideas
3. Important findings or conclusions
4. Any relevant data, statistics, or examples

${CLEAN_MARKDOWN_STYLE}

Format the summary as a calm study note with clear Markdown headings and concise sections. Keep it focused and avoid unnecessary detail.`;

  try {
    return await runDocumentInteraction(pdfFile, prompt);
  } catch (error) {
    throw new Error("Failed to generate summary from PDF: " + (error instanceof Error ? error.message : "unknown error"));
  }
}

export async function generateQuizFromPDF(pdfFile: File): Promise<QuizQuestion[]> {
  const prompt = `Create the maximum useful set of multiple-choice quiz questions based on this PDF document.
Generate one distinct question for each important concept, fact, definition, process, comparison, and example that is clearly present in the document.
Do not pad with duplicate, trivial, or overly similar questions.
If the document is long, cap the output at 50 high-quality questions.

For each question:
1. Ask about key concepts, facts, or ideas from the document
2. Provide one correct answer
3. Provide three plausible but incorrect alternatives
4. Vary difficulty levels across questions

Return ONLY a valid JSON array with this exact structure, no markdown or other text:
[
  {
    "question": "Question text here?",
    "answer": "Correct answer",
    "choices": ["Correct answer", "Wrong option 1", "Wrong option 2", "Wrong option 3"]
  }
]`;

  try {
    const responseText = await runDocumentInteraction(pdfFile, prompt);
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("Could not parse quiz response from Gemini: " + responseText);
    }

    const questions = JSON.parse(jsonMatch[0]);
    return questions.map((q: any) => ({
      question: q.question,
      answer: q.answer,
      choices: (q.choices as string[]).sort(() => Math.random() - 0.5)
    }));
  } catch (error) {
    console.error("Error generating quiz from PDF:", error);
    throw new Error("Failed to generate quiz questions: " + (error instanceof Error ? error.message : "unknown error"));
  }
}

export async function generateFlashcardsFromPDF(
  pdfFile: File,
  numCards: number = 10,
  previousPrompts: string[] = []
): Promise<Flashcard[]> {
  const priorPromptList = previousPrompts
    .map((prompt) => prompt.trim())
    .filter(Boolean)
    .slice(0, 80);
  const avoidSection = priorPromptList.length
    ? `\n\nDo NOT repeat or closely rephrase these existing flashcard fronts from this same PDF:\n${priorPromptList
        .map((prompt, index) => `${index + 1}. ${prompt}`)
        .join("\n")}`
    : "";

  const prompt = `Create ${numCards} new educational flashcards from this PDF document.\n\nFor each flashcard:\n- Front: A question, key term, or definition prompt (keep it brief, under 15 words)\n- Back: The detailed answer or explanation (2-3 sentences, under 100 words)\n\nFocus on important concepts and facts from the document that have not already been covered.${avoidSection}\n\nReturn ONLY a valid JSON array with this exact structure, no markdown or other text:\n[\n  {\n    "front": "What is [concept]?",\n    "back": "Detailed explanation here..."\n  }\n]`;

  try {
    const responseText = await runDocumentInteraction(pdfFile, prompt);
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("Could not parse flashcard response from Gemini: " + responseText);
    }

    const existing = new Set(priorPromptList.map((item) => item.toLowerCase()));
    const seen = new Set(existing);
    const cards = JSON.parse(jsonMatch[0]) as Flashcard[];
    return cards.filter((card) => {
      const normalizedFront = card.front?.trim().toLowerCase();
      if (!normalizedFront || seen.has(normalizedFront)) {
        return false;
      }
      seen.add(normalizedFront);
      return true;
    });
  } catch (error) {
    console.error("Error generating flashcards from PDF:", error);
    throw new Error("Failed to generate flashcards: " + (error instanceof Error ? error.message : "unknown error"));
  }
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Builds a sliding-window memory string from chat history.
 * Trims oldest messages first to stay within MEMORY_CHAR_BUDGET.
 */
function buildMemoryContext(history: ChatMessage[]): string {
  if (!history.length) return "";

  const lines = history.map(
    (msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`
  );

  // Sliding window: include as many recent messages as fit in budget
  let budget = MEMORY_CHAR_BUDGET;
  const included: string[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (budget - line.length < 0) break;
    budget -= line.length;
    included.unshift(line);
  }

  return included.join("\n\n");
}

export async function askQuestionAboutPDF(
  pdfFile: File,
  question: string,
  history: ChatMessage[] = []
): Promise<string> {
  const memoryContext = buildMemoryContext(history);

  const prompt = `You are a knowledgeable and context-aware PDF study assistant with persistent memory of this conversation.
The user has uploaded a PDF document for study.

${memoryContext ? `--- CONVERSATION HISTORY ---
${memoryContext}
--- END OF HISTORY ---

` : ""}User (current question): ${question}

INSTRUCTIONS:
1. Always read the CONVERSATION HISTORY above first. If the user refers to something mentioned earlier (e.g., "that topic", "what you just said", "explain more"), use the history to understand context.
2. Base your answer primarily on the uploaded PDF document.
3. You may reference or build upon your previous answers in the history to provide continuity.
4. Treat paraphrases and semantic matches as present. The user's wording does not need to exactly match the PDF wording.
5. You may connect related points that are present in different parts of the PDF.
6. If the PDF gives partial information, answer with what is available and note any gaps.
7. Only if the document truly does not contain relevant information, reply: "I am sorry, but the answer to this question is not present in the uploaded document."
8. Keep the response direct, focused, and conversational — referencing prior context naturally when helpful.

${CLEAN_MARKDOWN_STYLE}`;

  try {
    return await runDocumentInteraction(pdfFile, prompt);
  } catch (error) {
    console.error("Error answering question:", error);
    throw new Error("Failed to answer question: " + (error instanceof Error ? error.message : "unknown error"));
  }
}

/**
 * Chat without a PDF — uses only conversation history as context.
 * Useful for general study questions referencing prior summaries/quizzes.
 */
export async function askQuestionWithMemory(
  question: string,
  history: ChatMessage[] = []
): Promise<string> {
  const memoryContext = buildMemoryContext(history);

  const prompt = `You are a helpful and context-aware AI study assistant with persistent memory of this conversation.

${memoryContext ? `--- CONVERSATION HISTORY ---
${memoryContext}
--- END OF HISTORY ---

` : ""}User (current question): ${question}

INSTRUCTIONS:
1. Always read the CONVERSATION HISTORY above. Reference prior answers, summaries, quiz results, or flashcard content if the user refers to them.
2. If no PDF is available, answer based on your general knowledge while staying focused on the study topic.
3. Be conversational and maintain continuity — if the user says "explain more" or "about that", refer to the history.
4. Keep responses concise and educational.

${CLEAN_MARKDOWN_STYLE}`;

  try {
    return await runDocumentInteraction(null, prompt);
  } catch (error) {
    console.error("Error answering question with memory:", error);
    throw new Error("Failed to answer question: " + (error instanceof Error ? error.message : "unknown error"));
  }
}
