Fonts the WebAssembly engine cannot embed (its size cap), fetched by the app at start and
registered as the fallback for their script (`web/src/engine/client.ts`, `SCRIPT_FONTS`).

- `NotoSansThai-Regular.ttf`: Noto Sans Thai, SIL Open Font License 1.1 (`OFL-NotoSansThai.txt`),
  from the `@expo-google-fonts/noto-sans-thai` package. Without it Thai text shows as empty boxes.
