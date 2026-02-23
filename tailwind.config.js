/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/renderer/index.html", "./src/renderer/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#1a1a2e",
          50: "#f0f0f8",
          100: "#e1e1f1",
          200: "#c3c3e3",
          300: "#a5a5d5",
          400: "#8787c7",
          500: "#6969b9",
          600: "#4b4bab",
          700: "#2d2d9d",
          800: "#0f0f8f",
          900: "#000071",
        },
        accent: {
          DEFAULT: "#e94560",
          hover: "#c73d56",
        },
        panel: "#16213e",
        border: "#0f3460",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};
