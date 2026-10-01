import vike from "vike/plugin";
import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [vike(), react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
});
