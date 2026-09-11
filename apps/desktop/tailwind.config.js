/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        serif: ["Newsreader", "Charter", "Georgia", "Cambria", "Times New Roman", "serif"],
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      colors: {
        paper: {
          bg: "#FBFBFA",
          text: "#2A2826",
          muted: "#736F6E",
          surface: "#F4F4F0",
          border: "#E6E4DD",
          accent: "#9A3412",
        },
        sepia: {
          bg: "#F4ECD8",
          text: "#3D3226",
          muted: "#857463",
          surface: "#EAE0C8",
          border: "#D8CCB0",
          accent: "#A2522B",
        },
        nord: {
          bg: "#2E3440",
          surface: "#3B4252",
          border: "#4C566A",
          text: "#ECEFF4",
          muted: "#949FB5",
          accent: "#88C0D0",
        },
      },
    },
  },
  plugins: [
    require("@tailwindcss/typography"),
  ],
};
