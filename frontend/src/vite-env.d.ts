/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AGENTATION_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
