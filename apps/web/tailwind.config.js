/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./apps/web/app/**/*.{ts,tsx}",
    "./apps/web/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#171717",
        paper: "#f5f5f2",
        cf: {
          ink: "#171717",
          muted: "rgba(38,35,35,0.62)",
          faint: "rgba(38,35,35,0.42)",
          line: "#e8e7e6",
          blue: "#1a6fd1",
          lime: "#c8e86b",
          green: "#4c9f38",
          dark: "#202020",
        },
      },
      fontFamily: {
        sans: [
          "Instrument Sans",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        display: [
          "Instrument Sans",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        serif: ["Instrument Serif", "Newsreader", "Georgia", "serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      maxWidth: {
        cf: "1440px",
      },
      borderRadius: {
        cf: "8px",
      },
    },
  },
  plugins: [],
};
