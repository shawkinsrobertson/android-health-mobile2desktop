import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "media",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "var(--surface-1)",
        plane: "var(--page-plane)",
        accent: "var(--accent)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        info: "var(--info)",
        ink: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
        },
        line: {
          grid: "var(--gridline)",
          baseline: "var(--baseline)",
        },
      },
      fontFamily: {
        sans: ["var(--font-open-sans)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["var(--font-archivo)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      // Typography scale from the design system reference: Title/Header
      // use Archivo (font-display), everything else Open Sans (font-sans,
      // the default). Use as e.g. `text-title font-display font-extrabold`.
      //
      // xs/sm override Tailwind's own defaults (12px/14px) -- this app uses
      // text-xs/text-sm as its de facto label/button/body size nearly
      // everywhere, well past actual captions, so both are raised to the
      // 16px desktop floor. No fontWeight here on purpose: every call site
      // already pairs these with its own font-medium/font-semibold utility.
      fontSize: {
        xs: ["16px", { lineHeight: "1.5" }],
        sm: ["16px", { lineHeight: "1.5" }],
        title: ["60px", { lineHeight: "1.1", fontWeight: "800" }],
        h1: ["40px", { lineHeight: "1.15", fontWeight: "600" }],
        h2: ["32px", { lineHeight: "1.2", fontWeight: "600" }],
        h3: ["28px", { lineHeight: "1.25", fontWeight: "600" }],
        button: ["20px", { lineHeight: "1.3", fontWeight: "500" }],
        body: ["16px", { lineHeight: "1.5", fontWeight: "400" }],
        link: ["16px", { lineHeight: "1.5", fontWeight: "600" }],
      },
    },
  },
  plugins: [],
};

export default config;
