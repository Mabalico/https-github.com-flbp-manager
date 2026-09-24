import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { defineConfig, type Plugin } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));
const dashboardPath = path.join(root, 'components/AdminDashboard.tsx').replace(/\\/g, '/');

// SSR deliberately does not run effects. Model the state AFTER the auth
// effect succeeds only in this test build, retaining the real render tree.
// This plugin is absent from vite.config.ts and never changes source files.
const authenticatedRenderFixture = (): Plugin => ({
  name: 'ssr-admin-authenticated-render-fixture',
  enforce: 'pre',
  transform(source, id) {
    if (id.split('?')[0].replace(/\\/g, '/') !== dashboardPath) return;
    const ast = ts.createSourceFile(id, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const replacements: { start: number; end: number; text: string }[] = [];
    const seen = new Set<string>();
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name)) {
        const first = node.name.elements[0];
        const name = first && ts.isBindingElement(first) && ts.isIdentifier(first.name) ? first.name.text : '';
        if (name === 'authed' || name === 'adminAuthMode') {
          const setter = node.name.elements[1];
          if (node.name.elements.length !== 2 || !setter || !ts.isBindingElement(setter) || !ts.isIdentifier(setter.name)
            || setter.name.text !== (name === 'authed' ? 'setAuthed' : 'setAdminAuthMode')
            || seen.has(name) || !node.initializer || !ts.isCallExpression(node.initializer)
            || node.initializer.expression.getText(ast) !== 'useState' || node.initializer.arguments.length !== 1) {
            throw new Error(`SSR fixture: unexpected ${name} declaration; review the auth render boundary.`);
          }
          const argument = node.initializer.arguments[0];
          if (name === 'authed' && argument.kind !== ts.SyntaxKind.FalseKeyword) {
            throw new Error('SSR fixture: production authed initializer must remain false.');
          }
          if (name === 'adminAuthMode' && !ts.isArrowFunction(argument)) {
            throw new Error('SSR fixture: review the production auth mode initializer before updating this fixture.');
          }
          seen.add(name);
          replacements.push({
            start: argument.getStart(ast), end: argument.end,
            text: name === 'authed'
              ? 'globalThis.__FLBP_SSR_ADMIN_FIXTURE?.authenticated === true'
              : "() => (globalThis.__FLBP_SSR_ADMIN_FIXTURE?.authenticated === true ? 'supabase' : 'none')",
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
    if (seen.size !== 2) throw new Error('SSR fixture: expected exactly the two Admin auth state initializers.');
    let code = source;
    for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
      code = code.slice(0, replacement.start) + replacement.text + code.slice(replacement.end);
    }
    return { code, map: null };
  },
});

export default defineConfig({
  root,
  // Never embed deployment .env files in a test artifact.
  envDir: path.join(root, '.tmp-ssr-admin/no-env'),
  plugins: [authenticatedRenderFixture()],
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://ssr-fixture.invalid'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('ssr-fixture-public-key'),
    'import.meta.env.VITE_SUPABASE_ADMIN_EMAIL': JSON.stringify('admin@ssr-fixture.invalid'),
    'import.meta.env.VITE_WORKSPACE_ID': JSON.stringify('ssr-fixture'),
    'import.meta.env.VITE_APP_MODE': JSON.stringify('official'),
    'import.meta.env.VITE_REMOTE_REPO': JSON.stringify('1'),
    'import.meta.env.VITE_ALLOW_LOCAL_ONLY': JSON.stringify('0'),
    'import.meta.env.VITE_AUTO_STRUCTURED_SYNC': JSON.stringify('0'),
  },
  build: {
    ssr: path.join(root, '_ssr_admin_check.tsx'),
    outDir: '.tmp-ssr-admin',
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    target: 'node20',
    rollupOptions: {
      output: { entryFileNames: 'admin-ssr.mjs', chunkFileNames: 'chunks/[name]-[hash].mjs' },
    },
  },
});
