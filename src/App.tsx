import React, { useEffect, useMemo, useRef, useState } from "react";
import { generateSummaryFromPDF, generateQuizFromPDF, generateFlashcardsFromPDF, askQuestionAboutPDF, askQuestionWithMemory, type QuizQuestion, type Flashcard } from "./services/gemini";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: "text" | "summary" | "quiz" | "flashcards";
  quizQuestions?: QuizQuestion[];
  flashcards?: Flashcard[];
  quizAnswers?: Record<number, string>;
  quizResult?: { correct: number; total: number } | null;
  flashcardIndex?: number;
};

type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  pdfFile: File | null;
  pdfName: string;
  timestamp: string;
};

type QuizProgress = {
  completedQuizzes: number;
  totalCorrect: number;
  totalQuestions: number;
};

type StoredStudyState = {
  conversations: Conversation[];
  activeConversationId: string;
  quizProgressByConversation: Record<string, QuizProgress>;
};

const STORAGE_KEY = "ai-study-assistant-state-v1";

const starterConversations: Conversation[] = [
  {
    id: "study-1",
    title: "Biology Notes",
    pdfFile: null,
    pdfName: "biology_notes.pdf",
    timestamp: "Today",
    messages: [
      {
        id: "msg-1-1",
        role: "user",
        content: "Summarize biology notes"
      },
      {
        id: "msg-1-2",
        role: "assistant",
        type: "summary",
        content: `Here is a comprehensive summary of the Biology Notes document:

### 1. Main Topic and Purpose
This document covers cell structure, membrane transport, and cellular energy systems (cellular respiration and photosynthesis). It serves as a study guide for understanding fundamental eukaryotic cell biology.

### 2. Key Concepts & Definitions
- **Organelles**: Membrane-bound structures within eukaryotic cells that perform specific functions. The nucleus houses genetic material, while lysosomes clean waste.
- **Active vs. Passive Transport**: Passive transport (diffusion, osmosis) requires no energy and moves substances down their concentration gradient. Active transport requires ATP to move substances against their gradient.
- **Adenosine Triphosphate (ATP)**: The primary energy carrier in all living organisms, produced during cellular respiration inside mitochondria.

### 3. Key Conclusions
Understanding cellular biology forms the basis of all physiological studies and biotechnology applications. Clean structural division is key to understanding metabolic pathways.`
      }
    ]
  },
  {
    id: "study-2",
    title: "AI Revision",
    pdfFile: null,
    pdfName: "ai_midterm_prep.pdf",
    timestamp: "Yesterday",
    messages: [
      {
        id: "msg-2-1",
        role: "user",
        content: "Generate a quiz from the AI Revision notes"
      },
      {
        id: "msg-2-2",
        role: "assistant",
        content: "Here is a 3-question multiple choice quiz based on your AI Revision notes:",
        type: "quiz",
        quizQuestions: [
          {
            question: "Which neural network architecture is commonly used for processing sequential data and language tasks?",
            answer: "Transformer",
            choices: ["Transformer", "Convolutional Neural Network (CNN)", "Support Vector Machine (SVM)", "Decision Tree"]
          },
          {
            question: "What is the primary role of the weights in an artificial neural network?",
            answer: "To scale the input signals and determine the strength of connections",
            choices: [
              "To scale the input signals and determine the strength of connections",
              "To store the training datasets in memory",
              "To act as the activation function threshold",
              "To perform final classification outputs directly"
            ]
          },
          {
            question: "What does fine-tuning a model refer to?",
            answer: "Training a pre-trained model on a smaller, task-specific dataset",
            choices: [
              "Training a pre-trained model on a smaller, task-specific dataset",
              "Initializing all weights randomly and training from scratch",
              "Compressing a model to run faster on mobile devices",
              "Generating prompt templates for the model to use during inference"
            ]
          }
        ],
        quizAnswers: {},
        quizResult: null
      }
    ]
  }
];

function sanitizeConversationForStorage(conversation: Conversation): Conversation {
  return {
    ...conversation,
    pdfFile: null
  };
}

function loadStoredStudyState(): StoredStudyState {
  const fallback: StoredStudyState = {
    conversations: starterConversations,
    activeConversationId: starterConversations[0].id,
    quizProgressByConversation: {}
  };

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return fallback;

    const parsed = JSON.parse(saved) as Partial<StoredStudyState>;
    const savedConversations = Array.isArray(parsed.conversations)
      ? parsed.conversations.map((conversation) => ({
        ...conversation,
        pdfFile: null
      }))
      : [];

    if (!savedConversations.length) return fallback;

    const activeConversationId =
      parsed.activeConversationId &&
        savedConversations.some((conversation) => conversation.id === parsed.activeConversationId)
        ? parsed.activeConversationId
        : savedConversations[0].id;

    return {
      conversations: savedConversations,
      activeConversationId,
      quizProgressByConversation: parsed.quizProgressByConversation || {}
    };
  } catch (error) {
    console.warn("Could not load saved study sessions.", error);
    return fallback;
  }
}

function formatMessageForMemory(message: Message): string {
  const extraQuizContent = message.quizQuestions
    ?.map((question, index) => `${index + 1}. ${question.question} Answer: ${question.answer}`)
    .join("\n");
  const extraFlashcardContent = message.flashcards
    ?.map((card, index) => `${index + 1}. ${card.front} - ${card.back}`)
    .join("\n");

  return [message.content, extraQuizContent, extraFlashcardContent]
    .filter(Boolean)
    .join("\n");
}

const samplePrompts = ["Summarize notes", "Create flashcards", "Generate quiz"];

function renderInlineMarkdown(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, index) => {
    const emphasisMatch = part.match(/^\*{1,2}([^*]+)\*{1,2}$/);
    if (emphasisMatch) {
      return <strong key={index}>{emphasisMatch[1]}</strong>;
    }
    return part;
  });
}

function renderMarkdownContent(content: string, className = "markdown-content") {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let orderedItems: string[] = [];

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    const paragraph = paragraphLines.join(" ").trim();
    const labelMatch = paragraph.match(/^([^:]{2,48}):\s+(.+)$/);

    blocks.push(
      <p key={`p-${blocks.length}`}>
        {labelMatch ? (
          <>
            <strong>{labelMatch[1]}:</strong> {renderInlineMarkdown(labelMatch[2])}
          </>
        ) : (
          renderInlineMarkdown(paragraph)
        )}
      </p>
    );
    paragraphLines = [];
  };

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`}>
        {listItems.map((item, index) => (
          <li key={index}>{renderInlineMarkdown(item)}</li>
        ))}
      </ul>
    );
    listItems = [];
  };

  const flushOrderedList = () => {
    if (!orderedItems.length) return;
    blocks.push(
      <ol key={`ol-${blocks.length}`}>
        {orderedItems.map((item, index) => (
          <li key={index}>{renderInlineMarkdown(item)}</li>
        ))}
      </ol>
    );
    orderedItems = [];
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      flushOrderedList();
      return;
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      flushOrderedList();
      blocks.push(
        <h4 key={`h-${blocks.length}`}>
          {renderInlineMarkdown(headingMatch[2].trim())}
        </h4>
      );
      return;
    }

    const numberedHeadingMatch = line.match(/^\d+\.\s+(.{3,80})$/);
    const looksLikeSentence = /[.!?]$/.test(numberedHeadingMatch?.[1] || "");
    if (numberedHeadingMatch && !looksLikeSentence) {
      flushParagraph();
      flushList();
      flushOrderedList();
      blocks.push(
        <h4 key={`nh-${blocks.length}`}>
          {renderInlineMarkdown(numberedHeadingMatch[1].trim())}
        </h4>
      );
      return;
    }

    const listMatch = line.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      flushParagraph();
      flushOrderedList();
      listItems.push(listMatch[1].trim());
      return;
    }

    const orderedListMatch = line.match(/^\d+\.\s+(.+)$/);
    if (orderedListMatch) {
      flushParagraph();
      flushList();
      orderedItems.push(orderedListMatch[1].trim());
      return;
    }

    flushList();
    flushOrderedList();
    paragraphLines.push(line);
  });

  flushParagraph();
  flushList();
  flushOrderedList();

  return <div className={className}>{blocks}</div>;
}

function wrapWordsWithAnimation(node: React.ReactNode, wordIndexRef: { current: number }): React.ReactNode {
  if (typeof node === "string") {
    const words = node.split(/(\s+)/);
    return words.map((word, i) => {
      if (word.trim().length > 0) {
        const idx = wordIndexRef.current++;
        return (
          <span
            key={i}
            className="word-fade-in"
            style={{ animationDelay: `${idx * 0.04}s`, display: "inline-block", whiteSpace: "pre-wrap" }}
          >
            {word}
          </span>
        );
      }
      return <span key={i} style={{ whiteSpace: "pre-wrap" }}>{word}</span>;
    });
  }

  if (React.isValidElement(node)) {
    const children = React.Children.toArray(node.props.children).map((child) =>
      wrapWordsWithAnimation(child, wordIndexRef)
    );
    return React.cloneElement(node as React.ReactElement, {}, children);
  }

  if (Array.isArray(node)) {
    return node.map((child, i) => (
      <React.Fragment key={i}>
        {wrapWordsWithAnimation(child, wordIndexRef)}
      </React.Fragment>
    ));
  }

  return node;
}

function AnimatedTextMessage({ content, animate, className = "markdown-content" }: { content: string; animate: boolean; className?: string }) {
  const wordIndexRef = React.useRef({ current: 0 });
  wordIndexRef.current = { current: 0 }; // reset on each render

  const rendered = renderMarkdownContent(content, className);

  if (!animate) {
    return rendered;
  }

  return <>{wrapWordsWithAnimation(rendered, wordIndexRef.current)}</>;
}


function App() {
  const [initialStudyState] = useState<StoredStudyState>(loadStoredStudyState);
  const [conversations, setConversations] = useState<Conversation[]>(initialStudyState.conversations);
  const [activeConversationId, setActiveConversationId] = useState<string>(initialStudyState.activeConversationId);
  const [conversationStatuses, setConversationStatuses] = useState<Record<string, string>>({});
  const [inputMessage, setInputMessage] = useState("");
  const [loadingConversationIds, setLoadingConversationIds] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [quizProgressByConversation, setQuizProgressByConversation] = useState<Record<string, QuizProgress>>(
    initialStudyState.quizProgressByConversation
  );
  const [openConversationMenuId, setOpenConversationMenuId] = useState<string | null>(null);
  const [animatedMessageId, setAnimatedMessageId] = useState<string | null>(null);
  const chatContainerRef = useRef<HTMLElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const activeConversation = useMemo(() => {
    return conversations.find((item) => item.id === activeConversationId);
  }, [conversations, activeConversationId]);

  const activeQuizProgress = quizProgressByConversation[activeConversationId] || {
    completedQuizzes: 0,
    totalCorrect: 0,
    totalQuestions: 0
  };

  const progressRate = useMemo(() => {
    if (!activeQuizProgress.totalQuestions) return 0;
    return Math.round((activeQuizProgress.totalCorrect / activeQuizProgress.totalQuestions) * 100);
  }, [activeQuizProgress]);

  const activeStatus = conversationStatuses[activeConversationId] || "Ready";
  const isActiveConversationLoading = Boolean(loadingConversationIds[activeConversationId]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const chatContainer = chatContainerRef.current;
      if (chatContainer) {
        chatContainer.scrollTo({
          top: chatContainer.scrollHeight,
          behavior: "smooth"
        });
      } else {
        chatBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeConversationId, activeConversation?.messages.length, isActiveConversationLoading]);

  const setConversationStatus = (conversationId: string, nextStatus: string) => {
    setConversationStatuses((prev) => ({
      ...prev,
      [conversationId]: nextStatus
    }));
  };

  const setConversationLoading = (conversationId: string, isLoading: boolean) => {
    setLoadingConversationIds((prev) => ({
      ...prev,
      [conversationId]: isLoading
    }));
  };

  const addMessage = (conversationId: string, message: Omit<Message, "id">) => {
    const newMessage: Message = {
      ...message,
      id: Math.random().toString(36).substring(7)
    };
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? { ...c, messages: [...c.messages, newMessage] }
          : c
      )
    );
    // Trigger word-by-word animation for new assistant text/summary messages
    if (message.role === "assistant") {
      setAnimatedMessageId(newMessage.id);
    }
    return newMessage;
  };

  const updateMessage = (
    conversationId: string,
    messageId: string,
    updater: (msg: Message) => Partial<Message>
  ) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? {
            ...c,
            messages: c.messages.map((m) =>
              m.id === messageId ? { ...m, ...updater(m) } : m
            )
          }
          : c
      )
    );
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversationId
          ? { ...c, pdfFile: file, pdfName: file.name }
          : c
      )
    );
    setConversationStatus(activeConversationId, `Attached PDF: ${file.name}`);
  };

  const handleRemovePDF = () => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversationId
          ? { ...c, pdfFile: null, pdfName: "No PDF selected" }
          : c
      )
    );
    setConversationStatus(activeConversationId, "PDF detached");
  };

  const handleClearConversation = (conversationId: string) => {
    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, messages: [] }
          : conversation
      )
    );
    setQuizProgressByConversation((prev) => {
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
    setConversationStatus(conversationId, "Chat cleared");
    setOpenConversationMenuId(null);
  };

  const handleDeleteConversation = (conversationId: string) => {
    setConversations((prev) => {
      if (prev.length === 1) {
        const resetChat: Conversation = {
          id: `chat-${Date.now()}`,
          title: "Study Session 1",
          messages: [],
          pdfFile: null,
          pdfName: "No PDF selected",
          timestamp: "Just now"
        };
        setActiveConversationId(resetChat.id);
        setConversationStatus(resetChat.id, "New chat session started");
        return [resetChat];
      }

      const remaining = prev.filter((conversation) => conversation.id !== conversationId);
      if (conversationId === activeConversationId) {
        setActiveConversationId(remaining[0].id);
      }
      return remaining;
    });
    setQuizProgressByConversation((prev) => {
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
    setConversationStatuses((prev) => {
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
    setLoadingConversationIds((prev) => {
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
    setError(null);
    setOpenConversationMenuId(null);
  };

  const handleGenerateSummary = async () => {
    if (!activeConversation || !activeConversation.pdfFile) {
      setError("Please upload a PDF first");
      return;
    }

    const conversationId = activeConversation.id;
    const pdfFile = activeConversation.pdfFile;
    setConversationLoading(conversationId, true);
    setError(null);
    setConversationStatus(conversationId, "Generating summary with AI...");

    addMessage(conversationId, {
      role: "user",
      content: "Please summarize this document for me."
    });

    try {
      const generatedSummary = await generateSummaryFromPDF(pdfFile);
      addMessage(conversationId, {
        role: "assistant",
        content: generatedSummary,
        type: "summary"
      });
      setConversationStatus(conversationId, "Summary generated");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to generate summary: ${message}`);
      setConversationStatus(conversationId, "Error generating summary");
      console.error(err);
    } finally {
      setConversationLoading(conversationId, false);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!activeConversation || !activeConversation.pdfFile) {
      setError("Please upload a PDF first");
      return;
    }

    const conversationId = activeConversation.id;
    const pdfFile = activeConversation.pdfFile;
    setConversationLoading(conversationId, true);
    setError(null);
    setConversationStatus(conversationId, "Generating quiz with AI...");

    addMessage(conversationId, {
      role: "user",
      content: "Generate a quiz from this document."
    });

    try {
      const questions = await generateQuizFromPDF(pdfFile);
      addMessage(conversationId, {
        role: "assistant",
        content: `Here is a ${questions.length}-question multiple choice quiz based on the document:`,
        type: "quiz",
        quizQuestions: questions,
        quizAnswers: {},
        quizResult: null
      });
      setConversationStatus(conversationId, "Quiz created");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to generate quiz: ${message}`);
      setConversationStatus(conversationId, "Error generating quiz");
      console.error(err);
    } finally {
      setConversationLoading(conversationId, false);
    }
  };

  const handleGenerateFlashcards = async () => {
    if (!activeConversation || !activeConversation.pdfFile) {
      setError("Please upload a PDF first");
      return;
    }

    const conversationId = activeConversation.id;
    const pdfFile = activeConversation.pdfFile;
    setConversationLoading(conversationId, true);
    setError(null);
    setConversationStatus(conversationId, "Generating flashcards with AI...");

    addMessage(conversationId, {
      role: "user",
      content: "Create flashcards from this document."
    });

    try {
      const previousFlashcardPrompts = activeConversation.messages.flatMap((message) =>
        message.flashcards?.map((card) => card.front) || []
      );
      const cards = await generateFlashcardsFromPDF(pdfFile, 10, previousFlashcardPrompts);
      addMessage(conversationId, {
        role: "assistant",
        content: `Here is a deck of ${cards.length} new flashcards created from the key concepts of the document:`,
        type: "flashcards",
        flashcards: cards,
        flashcardIndex: 0
      });
      setConversationStatus(conversationId, "Flashcards ready");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to generate flashcards: ${message}`);
      setConversationStatus(conversationId, "Error generating flashcards");
      console.error(err);
    } finally {
      setConversationLoading(conversationId, false);
    }
  };

  const handleSendMessage = async () => {
    if (isActiveConversationLoading) return;
    const query = inputMessage.trim();
    if (!query) return;

    const conversationId = activeConversation!.id;
    const pdfFile = activeConversation?.pdfFile ?? null;
    setInputMessage("");
    setError(null);
    setConversationStatus(conversationId, "Thinking...");

    // Build full LLM memory from ALL message types (text, summary, quiz, flashcards)
    const history = (activeConversation?.messages ?? [])
      .map((message) => ({
        role: message.role,
        content: formatMessageForMemory(message)
      }))
      // Exclude the very last user message we're about to add (not yet in state)
      .filter((m) => m.content.trim().length > 0);

    addMessage(conversationId, {
      role: "user",
      content: query
    });

    setConversationLoading(conversationId, true);

    try {
      let response: string;
      if (pdfFile) {
        // PDF is available — use PDF + conversation memory
        response = await askQuestionAboutPDF(pdfFile, query, history);
      } else {
        // No PDF — use conversation memory only (LLM recall mode)
        response = await askQuestionWithMemory(query, history);
      }
      addMessage(conversationId, {
        role: "assistant",
        content: response,
        type: "text"
      });
      setConversationStatus(conversationId, "Ready");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to get response: ${message}`);
      setConversationStatus(conversationId, "Error getting response");
      console.error(err);
    } finally {
      setConversationLoading(conversationId, false);
    }
  };

  const handleNewChat = () => {
    const newId = `chat-${Date.now()}`;
    const newChat: Conversation = {
      id: newId,
      title: `Study Session ${conversations.length + 1}`,
      messages: [],
      pdfFile: null,
      pdfName: "No PDF selected",
      timestamp: "Just now"
    };
    setConversations((prev) => [newChat, ...prev]);
    setActiveConversationId(newId);
    setError(null);
    setConversationStatus(newId, "New chat session started");
  };

  const handleQuickPrompt = (prompt: string) => {
    if (prompt === "Summarize notes") {
      handleGenerateSummary();
    } else if (prompt === "Generate quiz") {
      handleGenerateQuiz();
    } else if (prompt === "Create flashcards") {
      handleGenerateFlashcards();
    } else {
      setInputMessage(prompt);
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <button className="button-primary" onClick={handleNewChat}>
            + New Chat
          </button>
          <div className="sidebar-heading">CONVERSATIONS</div>
          <div className="conversation-list">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`conversation-card ${conversation.id === activeConversationId ? "active" : ""
                  }`}
              >
                <button
                  className="conversation-main"
                  onClick={() => {
                    setActiveConversationId(conversation.id);
                    setError(null);
                    setOpenConversationMenuId(null);
                  }}
                >
                  <div className="conv-card-meta">
                    <span className="conv-title">{conversation.title}</span>
                    {conversation.pdfFile && (
                      <span className="conv-pdf-indicator">PDF</span>
                    )}
                  </div>
                </button>
                <button
                  className="conversation-actions"
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpenConversationMenuId((currentId) =>
                      currentId === conversation.id ? null : conversation.id
                    );
                  }}
                  aria-label={`Actions for ${conversation.title}`}
                >
                  ...
                </button>
                {openConversationMenuId === conversation.id && (
                  <div className="conversation-menu">
                    <button onClick={() => handleClearConversation(conversation.id)}>
                      Clear chat
                    </button>
                    <button
                      className="danger"
                      onClick={() => handleDeleteConversation(conversation.id)}
                    >
                      Delete session
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="sidebar-middle">
          <div className="sidebar-heading">LEARNING STATS</div>
          <div className="stats-box">
            <div className="stat-row">
              <span>Quizzes Done:</span>
              <strong>{activeQuizProgress.completedQuizzes}</strong>
            </div>
            <div className="stat-row">
              <span>Correct Answers:</span>
              <strong>{activeQuizProgress.totalCorrect} / {activeQuizProgress.totalQuestions}</strong>
            </div>
            <div className="progress-bar-container">
              <div
                className="progress-bar-fill"
                style={{ width: `${progressRate}%` }}
              />
            </div>
            <div className="stat-percent">{progressRate}% accuracy</div>
          </div>
        </div>

        <div className="quick-prompts">
          <div className="sidebar-heading">QUICK ACTIONS</div>
          <div className="prompt-grid">
            {samplePrompts.map((prompt) => (
              <button
                key={prompt}
                className="prompt-chip"
                onClick={() => handleQuickPrompt(prompt)}
                disabled={!activeConversation?.pdfFile}
                style={{
                  opacity: activeConversation?.pdfFile ? 1 : 0.5,
                  cursor: activeConversation?.pdfFile ? "pointer" : "not-allowed"
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="main-header">
          <div className="brand-block">
            <div className="avatar">AI</div>
            <div>
              <h1>AI Study Assistant</h1>
              <p>Gemini API Integrated</p>
            </div>
          </div>
          <div className="status-pill">
            <span className="status-dot" />
            {activeStatus}
          </div>
        </header>

        <section className="chat-container" ref={chatContainerRef}>
          {error && (
            <div className="error-banner">
              ⚠️ {error}
              <button className="close-error" onClick={() => setError(null)}>✕</button>
            </div>
          )}

          {activeConversation && activeConversation.messages.length > 0 ? (
            <div className="chat-history">
              {activeConversation.messages.map((message) => {
                const isUser = message.role === "user";
                return (
                  <div
                    key={message.id}
                    className={`chat-message ${isUser ? "user" : "assistant"}`}
                  >
                    <div className="message-avatar-container">
                      <div className={`message-avatar ${isUser ? "user-av" : "ai-av"}`}>
                        {isUser ? "U" : "AI"}
                      </div>
                    </div>
                    <div className="message-bubble-wrapper">
                      <div className="message-sender">
                        {isUser ? "You" : "Study Assistant"}
                      </div>

                      {isUser ? (
                        <div className="message-bubble">
                          {message.content}
                        </div>
                      ) : (
                        <>
                          {message.type === "summary" && (
                            <div className="summary-widget">
                              <div className="widget-header">
                                <span className="icon">📑</span>
                                <h3>Document Summary</h3>
                              </div>
                              <div className="widget-content">
                                <AnimatedTextMessage
                                  content={message.content}
                                  animate={message.id === animatedMessageId}
                                />
                              </div>
                            </div>
                          )}

                          {message.type === "quiz" && message.quizQuestions && (
                            <div className="quiz-widget">
                              <div className="widget-header">
                                <span className="icon">📝</span>
                                <h3>Practice Quiz</h3>
                              </div>
                              <div className="quiz-questions-list">
                                {message.quizQuestions.map((q, qIndex) => {
                                  const selectedAnswer = message.quizAnswers?.[qIndex];
                                  const isSubmitted = message.quizResult !== null;

                                  return (
                                    <div key={qIndex} className="quiz-question-item">
                                      <p className="question-text">
                                        {qIndex + 1}. {q.question}
                                      </p>
                                      <div className="quiz-choices-grid">
                                        {q.choices.map((choice) => {
                                          let btnClass = "";
                                          if (selectedAnswer === choice) {
                                            btnClass = "selected";
                                          }
                                          if (isSubmitted) {
                                            const isCorrect =
                                              choice.trim().toLowerCase() ===
                                              q.answer.trim().toLowerCase();
                                            if (isCorrect) {
                                              btnClass = "correct";
                                            } else if (selectedAnswer === choice) {
                                              btnClass = "incorrect";
                                            } else {
                                              btnClass = "disabled";
                                            }
                                          }
                                          return (
                                            <button
                                              key={choice}
                                              disabled={isSubmitted}
                                              className={`quiz-choice-btn ${btnClass}`}
                                              onClick={() => {
                                                const currentAnswers =
                                                  message.quizAnswers || {};
                                                updateMessage(
                                                  activeConversation.id,
                                                  message.id,
                                                  () => ({
                                                    quizAnswers: {
                                                      ...currentAnswers,
                                                      [qIndex]: choice
                                                    }
                                                  })
                                                );
                                              }}
                                            >
                                              {choice}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {!message.quizResult ? (
                                <button
                                  className="button-primary submit-quiz-btn"
                                  onClick={() => {
                                    const correct = message.quizQuestions!.reduce(
                                      (score, q, idx) => {
                                        const ans =
                                          message.quizAnswers?.[idx]
                                            ?.trim()
                                            .toLowerCase();
                                        return ans === q.answer.trim().toLowerCase()
                                          ? score + 1
                                          : score;
                                      },
                                      0
                                    );
                                    const total = message.quizQuestions!.length;
                                    updateMessage(
                                      activeConversation.id,
                                      message.id,
                                      () => ({
                                        quizResult: { correct, total }
                                      })
                                    );
                                    setQuizProgressByConversation((prev) => {
                                      const current = prev[activeConversation.id] || {
                                        completedQuizzes: 0,
                                        totalCorrect: 0,
                                        totalQuestions: 0
                                      };
                                      return {
                                        ...prev,
                                        [activeConversation.id]: {
                                          completedQuizzes: current.completedQuizzes + 1,
                                          totalCorrect: current.totalCorrect + correct,
                                          totalQuestions: current.totalQuestions + total
                                        }
                                      };
                                    });
                                  }}
                                >
                                  Submit Answers
                                </button>
                              ) : (
                                <div className="quiz-result-banner">
                                  <span className="quiz-result-score">
                                    Quiz Score: {message.quizResult.correct} /{" "}
                                    {message.quizResult.total}
                                  </span>
                                  <span className="quiz-result-percent">
                                    (
                                    {Math.round(
                                      (message.quizResult.correct /
                                        message.quizResult.total) *
                                      100
                                    )}
                                    % accuracy)
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          {message.type === "flashcards" && message.flashcards && (
                            <div className="flashcards-widget">
                              <div className="widget-header">
                                <span className="icon">🗂️</span>
                                <h3>Flashcards</h3>
                                <span className="progress-badge">
                                  {(message.flashcardIndex || 0) + 1} /{" "}
                                  {message.flashcards.length}
                                </span>
                              </div>

                              {message.flashcards.length > 0 && (
                                <div className="flashcard-interactive-wrapper">
                                  <div
                                    className="flashcard-scene"
                                    onClick={() => {
                                      const el = document.getElementById(
                                        `card-${message.id}`
                                      );
                                      if (el) el.classList.toggle("is-flipped");
                                    }}
                                  >
                                    <div className="flashcard-3d" id={`card-${message.id}`}>
                                      <div className="flashcard-face flashcard-front">
                                        <div className="card-tag">CONCEPT</div>
                                        <p>
                                          {
                                            message.flashcards[
                                              message.flashcardIndex || 0
                                            ].front
                                          }
                                        </p>
                                        <div className="card-tip">Click to flip</div>
                                      </div>
                                      <div className="flashcard-face flashcard-back">
                                        <div className="card-tag">EXPLANATION</div>
                                        <p>
                                          {
                                            message.flashcards[
                                              message.flashcardIndex || 0
                                            ].back
                                          }
                                        </p>
                                        <div className="card-tip">Click to flip</div>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flashcard-controls">
                                    <button
                                      className="secondary-button"
                                      disabled={(message.flashcardIndex || 0) === 0}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const el = document.getElementById(
                                          `card-${message.id}`
                                        );
                                        if (el) el.classList.remove("is-flipped");
                                        updateMessage(
                                          activeConversation.id,
                                          message.id,
                                          (m) => ({
                                            flashcardIndex: Math.max(
                                              (m.flashcardIndex || 0) - 1,
                                              0
                                            )
                                          })
                                        );
                                      }}
                                    >
                                      ← Previous
                                    </button>
                                    <button
                                      className="secondary-button"
                                      disabled={
                                        (message.flashcardIndex || 0) ===
                                        message.flashcards.length - 1
                                      }
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const el = document.getElementById(
                                          `card-${message.id}`
                                        );
                                        if (el) el.classList.remove("is-flipped");
                                        updateMessage(
                                          activeConversation.id,
                                          message.id,
                                          (m) => ({
                                            flashcardIndex: Math.min(
                                              (m.flashcardIndex || 0) + 1,
                                              message.flashcards!.length - 1
                                            )
                                          })
                                        );
                                      }}
                                    >
                                      Next →
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {(!message.type || message.type === "text") && (
                            <div className="message-bubble">
                              <AnimatedTextMessage
                                content={message.content}
                                animate={message.id === animatedMessageId}
                                className="markdown-content"
                              />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              {isActiveConversationLoading && (
                <div className="chat-message assistant thinking">
                  <div className="message-avatar-container">
                    <div className="message-avatar ai-av">AI</div>
                  </div>
                  <div className="message-bubble-wrapper">
                    <div className="message-sender">Study Assistant</div>
                    <div className="message-bubble">
                      <div className="typing-indicator">
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>
          ) : (
            <div className="welcome-container">
              <div className="welcome-hero">
                <div className="welcome-logo">🎓</div>
                <h2>What would you like to study today?</h2>
                <p className="welcome-subtitle">
                  Upload a PDF document to generate an overview summary, interactive practice quiz, flashcards, or ask custom questions.
                </p>
              </div>

              <div className="dropzone-area">
                <label className="dropzone-label">
                  <div className="dropzone-content">
                    <span className="dropzone-icon">📁</span>
                    <span className="dropzone-text-primary">Click to upload a PDF</span>
                    <span className="dropzone-text-secondary">or drag and drop your file here</span>
                  </div>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden-file-input"
                    onChange={handleFileUpload}
                  />
                </label>
              </div>

              {activeConversation?.pdfFile ? (
                <div className="active-pdf-card animate-pulse">
                  <div className="pdf-info">
                    <span className="pdf-icon">📄</span>
                    <div className="pdf-details">
                      <span className="pdf-name">{activeConversation.pdfName}</span>
                      <span className="pdf-size">Ready for study actions</span>
                    </div>
                  </div>
                  <button
                    className="remove-pdf-btn"
                    onClick={handleRemovePDF}
                    title="Remove PDF"
                  >
                    ✕
                  </button>
                </div>
              ) : null}

              {activeConversation?.pdfFile && (
                <div className="suggestion-chips-container">
                  <h3>Choose a study mode to begin:</h3>
                  <div className="suggestion-grid">
                    <button
                      className="suggestion-chip-btn"
                      onClick={handleGenerateSummary}
                      disabled={isActiveConversationLoading}
                    >
                      <span className="chip-icon">📑</span>
                      <div className="chip-details">
                        <span className="chip-title">Summarize Notes</span>
                        <span className="chip-desc">Generate a concise overview</span>
                      </div>
                    </button>
                    <button
                      className="suggestion-chip-btn"
                      onClick={handleGenerateQuiz}
                      disabled={isActiveConversationLoading}
                    >
                      <span className="chip-icon">📝</span>
                      <div className="chip-details">
                        <span className="chip-title">Generate Quiz</span>
                        <span className="chip-desc">Create the full question set</span>
                      </div>
                    </button>
                    <button
                      className="suggestion-chip-btn"
                      onClick={handleGenerateFlashcards}
                      disabled={isActiveConversationLoading}
                    >
                      <span className="chip-icon">🗂️</span>
                      <div className="chip-details">
                        <span className="chip-title">Create Flashcards</span>
                        <span className="chip-desc">Review key terms interactively</span>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <footer className="chat-footer-pane">
          <div className="chat-input-wrapper">
            {activeConversation?.pdfFile && (
              <div className="attached-pdf-bar">
                <div className="attached-chip">
                  <span className="chip-pdf-icon">📄</span>
                  <span className="chip-pdf-name">{activeConversation.pdfName}</span>
                  <button className="chip-pdf-remove" onClick={handleRemovePDF}>
                    ✕
                  </button>
                </div>
              </div>
            )}
            <div className="chat-input-row">
              <label className="attach-button" title="Attach PDF">
                📎
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden-file-input"
                  onChange={handleFileUpload}
                />
              </label>
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={
                  activeConversation?.pdfFile
                    ? "Ask a question about this document... (I remember our full conversation)"
                    : "Ask a question or continue our conversation..."
                }
                disabled={isActiveConversationLoading}
                rows={1}
              />
              <button
                className="send-message-btn"
                onClick={handleSendMessage}
                disabled={
                  isActiveConversationLoading ||
                  !inputMessage.trim()
                }
              >
                ➔
              </button>
            </div>
            <div className="helper-row">
              <span>Shift + Enter for new line • Enter to send</span>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

export default App;
