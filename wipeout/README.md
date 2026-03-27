# WipeOut 🌊

**WipeOut** is a high-speed, kitschy background removal tool powered by client-side AI. No credits, no cloud, just pure AI power running directly in your browser.

## 🚀 Features

- **Client-Side Processing**: Your images never leave your device. Privacy by design.
- **HD Quality**: High-resolution background removal using state-of-the-art AI models.
- **Zero Cost**: No subscriptions, no credits, no hidden fees.
- **Fast & Fluid**: Built with React and Framer Motion for a smooth, high-energy experience.

## 🛠️ Tech Stack

- **Frontend**: [React 19](https://react.dev/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **AI Engine**: [@huggingface/transformers](https://huggingface.co/docs/transformers.js) (running `briaai/RMBG-1.4`)
- **Animations**: [Motion](https://motion.dev/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Build Tool**: [Vite](https://vitejs.dev/)

## 📦 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [npm](https://www.npmjs.com/)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/wipeout.git
   cd wipeout
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📜 Available Scripts

- `npm run dev`: Starts the development server.
- `npm run build`: Builds the app for production.
- `npm run preview`: Previews the production build locally.
- `npm run lint`: Runs TypeScript type checking.
- `npm run clean`: Removes the `dist` directory.

## 🛡️ Security

- **Privacy First**: All image processing happens locally on your machine using WebAssembly and WebGPU (if available).
- **No Secrets**: This project does not store or leak any API keys or sensitive information.

## 🤝 Support

If you find this tool useful, consider supporting the project on [Ko-fi](https://ko-fi.com/wahzammo).

---

*Built with 🧡 and AI.*
