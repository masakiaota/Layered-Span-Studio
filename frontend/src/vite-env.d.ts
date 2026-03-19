/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AGENTATION_ENDPOINT?: string;
  readonly VITE_IMPORT_YOUR_DATA_GUIDE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
