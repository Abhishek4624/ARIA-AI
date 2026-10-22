# Aria — AI English Voice Partner & Conversation Coach

Aria is an interactive AI English voice assistant designed to help you practice spoken English naturally on **any topic** at your own pace. She speaks with a natural female voice, listens hands-free, and gives you real-time phrasing upgrades and vocabulary tips.

---

## ✨ Features

- **Natural Female Voice (`Aoede`, `Kore`, `Leda`)**: Powered by Gemini 2.5 Flash TTS with automatic fallback to browser female Web Speech voices so it works out of the box.
- **Hands-Free Voice Call Mode**: Speak naturally into your microphone; when you pause, Aria replies out loud and automatically listens for your next thought.
- **Talk About Anything**: Choose quick topics (*Casual Chat, Tech & Coding, Markets & Finance, Cars & Road Trips, Job Interviews*) or type any custom topic.
- **3 Personal Learning Modes**:
  - **Just Chat (Flow Mode)**: Pure conversation with zero interruptions.
  - **Gentle Partner**: Warm conversation + subtle native phrasing upgrades.
  - **Active Coach**: Detailed grammar and vocabulary polish on every turn.
- **Phrasing & Vocabulary Log**: Review natural native alternatives for your sentences and replay their pronunciation anytime.

---

## 🚀 Quick Start (Local Development)

### 1. Clone the repository
```bash
git clone https://github.com/YOUR-USERNAME/aria-english-voice-assistant.git
cd aria-english-voice-assistant
```

### 2. Install dependencies
```bash
npm install
```

### 3. Add your Gemini API Key (Optional — can also be set in the UI)
Create a `.env` file in the root folder (copy from `.env.example`):
```bash
cp .env.example .env
```
Add your key inside `.env`:
```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

### 4. Start the development server
```bash
npm run dev
```
Open the local URL shown in your terminal (usually `http://localhost:5173`) in **Google Chrome** or **Microsoft Edge** for best Web Speech microphone support.

---

## 📦 How to Upload Directly to GitHub

### Option A: Upload via GitHub Web Interface (No Git CLI needed)
1. Unzip `aria-english-voice-assistant.zip` on your computer.
2. Go to [github.com/new](https://github.com/new) and create a new repository named `aria-english-voice-assistant`.
3. Click **uploading an existing file**, drag and drop all files and folders inside `aria-english-voice-assistant` (`package.json`, `vite.config.js`, `index.html`, `src/`, etc.), and click **Commit changes**.

### Option B: Push via Git Terminal
```bash
cd aria-english-voice-assistant
git init
git add .
git commit -m "Initial commit: Aria AI English Voice Partner"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/aria-english-voice-assistant.git
git push -u origin main
```

---

## 🌐 Deploy for Free (Vercel / Netlify)
- Import your GitHub repository into **Vercel** or **Netlify**.
- Build command: `npm run build`
- Output directory: `dist`
- Environment Variable: `VITE_GEMINI_API_KEY` (optional, or enter it directly inside the app's top bar).
