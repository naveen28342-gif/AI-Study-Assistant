AI Study Assistant 🎓

An AI-powered study companion that turns any PDF into an interactive personal tutor. Upload a document and chat with it, generate summaries, take auto-generated quizzes, and study with smart flashcards — all powered by the Gemini API.

✨ Features


📄 PDF Contextual Chat — Upload any PDF and ask questions directly about its content. The assistant remembers conversation history, so follow-up questions stay in context.
📝 Auto-Summarization — Generate a clean, structured markdown summary of the document's main topics, key concepts, and findings in one click.
🎯 Smart Quizzes — Automatically generates up to 50 multiple-choice questions based on the document's unique facts and concepts, with progress tracking and accuracy stats.
🗂️ Dynamic Flashcards — Creates flashcard decks from the text while tracking previously covered topics, so new decks always explore fresh material instead of repeating itself.
🔒 Local-First & Private — No backend database. Chat history is saved in localStorage, and PDFs are cached locally using IndexedDB.
🎨 Polished UX — Word-by-word streaming animations for AI responses and a clean markdown renderer for readable study notes.


🛠️ Tech Stack

LayerTechnologyFrontendReact (TypeScript) + ViteStylingTailwind CSSAI EngineGemini API (gemini-2.5-flash, with flash-lite fallback)AI Endpointv1beta/interactions for contextual prompts & strict JSON generationStoragelocalStorage (chat history) + IndexedDB (PDF caching)

🚀 Getting Started

Prerequisites


Node.js (v18 or higher)
A Gemini API key (Get one here)


Installation

bash# Clone the repository
git clone https://github.com/<your-username>/ai-study-assistant.git
cd ai-study-assistant

# Install dependencies
npm install

# Create a .env file and add your Gemini API key
echo "VITE_GEMINI_API_KEY=your_api_key_here" > .env

# Run the development server
npm run dev

The app will be available at http://localhost:5173 (or the port shown in your terminal).

📖 How It Works


Upload a PDF — The document is parsed and cached locally in IndexedDB.
Chat, Summarize, Quiz, or Flashcard — Choose how you want to study the material.
Context-Aware AI — Every request sends relevant document context and prior conversation history to Gemini for accurate, grounded responses.
Strict JSON for Quizzes/Flashcards — Structured prompts ensure quiz and flashcard data returns in a predictable format for rendering.


🎯 Roadmap


 Support for multiple simultaneous documents
 Export quiz results and flashcard decks
 Dark/light theme toggle
 Multi-language support


🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the issues page or open a pull request.

📄 License

This project is open source and available under the MIT License.

👨‍💻 Author

Naveen Kumar D


GitHub: @naveen28342-gif
LinkedIn: naveen28342
Portfolio: naveen28342-gif.github.io/my-portfolio-website
<img width="2879" height="1799" alt="Screenshot 2026-07-05 190358" src="https://github.com/user-attachments/assets/27cbc749-1037-4cb4-a15e-87eb0e4c4228" />
<img width="2879" height="1799" alt="Screenshot 2026-07-05 190519" src="https://github.com/user-attachments/assets/36b3211e-55e6-4bf5-b2c1-79c1f9a74133" />
<img width="2879" height="1799" alt="Screenshot 2026-07-05 190546" src="https://github.com/user-attachments/assets/61840b48-74cc-4d4b-ae92-934ac0903c65" />
<img width="2879" height="1799" alt="Screenshot 2026-07-05 190607" src="https://github.com/user-attachments/assets/f916135b-5c00-4a9c-bd00-1900f184fb7f" />
<img width="2879" height="1799" alt="Screenshot 2026-07-05 190659" src="https://github.com/user-attachments/assets/d7e4ab8b-3a0a-4e21-8f29-41cb511aca3f" />
<img width="2879" height="1799" alt="Screenshot 2026-07-05 190748" src="https://github.com/user-attachments/assets/c73e44d9-c95d-4e6c-8038-3aae38a77840" />
<img width="2879" height="1799" alt="Screenshot 2026-07-05 190758" src="https://github.com/user-attachments/assets/c2b457cf-b98b-4ad5-854a-e6f9b6d53b43" />
<img width="2879" height="1799" alt="Screenshot 2026-07-05 190819" src="https://github.com/user-attachments/assets/9762c3e0-4b75-4f54-85f8-fc13130d82be" />
<img width="2879" height="1799" alt="Screenshot 2026-07-05 190835" src="https://github.com/user-attachments/assets/3e2e25ca-5a47-40e7-852b-f2e8cd2f6d5c" />
<img width="2879" height="1799" alt="Screenshot 2026-07-05 190938" src="https://github.com/user-attachments/assets/989cbe88-dfe2-4c92-84d7-0299e404868b" />
<img width="2879" height="1799" alt="Screenshot 2026-07-05 191000" src="https://github.com/user-attachments/assets/7eaaa3ba-d20a-4fe4-9d05-08c4c765a173" />
<img width="2879" height="1799" alt="Screenshot 2026-07-05 191023" src="https://github.com/user-attachments/assets/877f420d-69bf-49d7-bd1d-c01ac301dab3" />













