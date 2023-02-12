import "@slidev/cli";
import ts from "typescript";
import { defineConfig } from "vite";

const tsCompileOption: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2015,
  strict: true,
  downlevelIteration: true,
};

export default defineConfig(async () => {
  const { markdownItShikiTwoslashSetup } = await import(
    "markdown-it-shiki-twoslash"
  );

  const shiki = await markdownItShikiTwoslashSetup({
    theme: "vitesse-dark",
    includeJSDocInHover: true,
    wrapFragments: true,
    defaultCompilerOptions: tsCompileOption,
  });

  return {
    slidev: {
      markdown: {
        markdownItSetup(md) {
          md.use(shiki);
        },
      },
    },
  };
});
