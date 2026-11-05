/**
 * Derives which gateway `/data/*` routes the app reaches from the browser.
 *
 * The SDK method bodies are the source of truth for the path each call
 * builds (including helpers a method calls). App call sites are matched
 * through the client surface (`os.groups`, `os.scarces.tokens`, …). A call
 * counts as proxied when the client is one of the browser factories, a
 * `useAppOnSocialClient` bundle, or a parameter those pass along. Server
 * factories talk to the gateway directly and are not proxied.
 *
 * Direct `fetch` of the same-origin proxy (`/api/onapi/data/...`) counts
 * too — some reads pass the path string instead of calling the SDK.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export interface RouteEvidence {
  file: string;
  line: number;
  via: string;
}

export interface DataRouteUsage {
  http: 'GET' | 'POST' | 'DELETE';
  path: string;
  browser: RouteEvidence[];
  server: RouteEvidence[];
  /** Helper exists but nothing in the app calls it. */
  dormant: RouteEvidence[];
}

interface RouteRef {
  http: 'GET' | 'POST' | 'DELETE';
  path: string;
}

interface SdkMethodInfo {
  direct: RouteRef[];
  callees: Array<{ className: string; method: string }>;
}

interface SdkClassInfo {
  fields: Map<string, string>;
  methods: Map<string, SdkMethodInfo>;
}

type Surface =
  | { kind: 'client' }
  | { kind: 'class'; name: string }
  | { kind: 'object'; fields: Map<string, Surface> }
  | { kind: 'http' }
  | { kind: 'bundle' };

type Lane =
  | { kind: 'browser' }
  | { kind: 'server' }
  | { kind: 'param'; fnId: string; name: string };

interface Value {
  surface: Surface;
  lane: Lane;
}

type Bound =
  | { kind: 'value'; value: Value }
  | { kind: 'fn'; id: string }
  | { kind: 'factory'; lane: 'browser' | 'server' }
  | { kind: 'getter' }
  | { kind: 'hook' };

interface Scope {
  map: Map<string, Bound>;
  parent: Scope | null;
}

interface FnInfo {
  id: string;
  name: string;
  file: string;
  returns: Array<{ lane: 'browser' | 'server' } | { ref: string }>;
  returnLane: 'browser' | 'server' | null;
}

interface DataHit {
  route: RouteRef;
  file: string;
  line: number;
  via: string;
  lane: Lane;
  fnId: string | null;
}

interface CallEdge {
  calleeId: string;
  callerFile: string;
  args: Array<{ param: string; lane: Lane }>;
}

interface RouteConduit {
  fnId: string;
  paramIndex: number;
}

const HTTP_VERBS = new Set(['get', 'post', 'delete']);

function findAppPackage(start: string): string | null {
  let dir = start.split('?')[0] ?? start;
  if (dir.endsWith('.ts') || dir.endsWith('.tsx') || dir.endsWith('.js')) {
    dir = path.dirname(dir);
  }
  for (let i = 0; i < 14; i += 1) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
          name?: string;
        };
        if (pkg.name === '@onsocial/app') return dir;
      } catch {
        // keep walking
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function roots(): { appSrc: string; sdkSrc: string; repoRoot: string } {
  const here = fileURLToPath(import.meta.url);
  const appPkg =
    findAppPackage(process.cwd()) ??
    findAppPackage(here) ??
    path.resolve(path.dirname(here), '../../../../..');
  return {
    appSrc: path.join(appPkg, 'src'),
    sdkSrc: path.resolve(appPkg, '../onsocial-sdk/src'),
    repoRoot: path.resolve(appPkg, '../..'),
  };
}

function walkFiles(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, out);
      continue;
    }
    if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) continue;
    if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) {
      continue;
    }
    if (entry.name === 'browser-data-routes.ts') continue;
    out.push(full);
  }
}

function parseFile(file: string): ts.SourceFile {
  const text = fs.readFileSync(file, 'utf8');
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf, false)).line + 1;
}

function relFile(repoRoot: string, file: string): string {
  return path.relative(repoRoot, file).split(path.sep).join('/');
}

function entityName(name: ts.EntityName): string {
  return ts.isIdentifier(name) ? name.text : name.right.text;
}

function classNameFromType(typeNode: ts.TypeNode | undefined): string | null {
  if (!typeNode) return null;
  if (ts.isTypeReferenceNode(typeNode)) return entityName(typeNode.typeName);
  if (
    ts.isImportTypeNode(typeNode) &&
    typeNode.qualifier &&
    ts.isIdentifier(typeNode.qualifier)
  ) {
    return typeNode.qualifier.text;
  }
  if (ts.isParenthesizedTypeNode(typeNode)) {
    return classNameFromType(typeNode.type);
  }
  if (ts.isUnionTypeNode(typeNode)) {
    for (const part of typeNode.types) {
      if (part.kind === ts.SyntaxKind.UndefinedKeyword) continue;
      const name = classNameFromType(part);
      if (name) return name;
    }
  }
  return null;
}

function isParameterProperty(param: ts.ParameterDeclaration): boolean {
  return (ts.getModifiers(param) ?? []).some((mod) => {
    return (
      mod.kind === ts.SyntaxKind.PrivateKeyword ||
      mod.kind === ts.SyntaxKind.PublicKeyword ||
      mod.kind === ts.SyntaxKind.ProtectedKeyword ||
      mod.kind === ts.SyntaxKind.ReadonlyKeyword
    );
  });
}

function dataPathFromText(text: string): string | null {
  const match = text.match(/\/?data\/([a-z0-9][a-z0-9/-]*)/i);
  if (!match?.[1]) return null;
  const body = match[1].replace(/\/+$/, '');
  if (!body) return null;
  return `data/${body}`;
}

function httpVerbOf(node: ts.Node): RouteRef['http'] {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isCallExpression(current)) {
      const expr = current.expression;
      if (
        ts.isPropertyAccessExpression(expr) &&
        HTTP_VERBS.has(expr.name.text)
      ) {
        return expr.name.text.toUpperCase() as RouteRef['http'];
      }
    }
    current = current.parent;
  }
  return 'GET';
}

function stringBits(node: ts.Node): string[] {
  const bits: string[] = [];
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    bits.push(node.text);
  } else if (ts.isTemplateExpression(node)) {
    bits.push(node.head.text);
    for (const span of node.templateSpans) bits.push(span.literal.text);
  }
  return bits;
}

function collectDirectRoutes(body: ts.Node): RouteRef[] {
  const routes: RouteRef[] = [];
  const visit = (node: ts.Node): void => {
    for (const bit of stringBits(node)) {
      const found = dataPathFromText(bit.startsWith('/') ? bit : `/${bit}`);
      // Only paths written as `/data/...` (SDK request paths), not bare words.
      if (!found) continue;
      const raw = bit.includes('/data/') || bit.startsWith('data/');
      if (!raw) continue;
      if (!bit.includes('/data/') && !bit.startsWith('/data/')) continue;
      routes.push({ http: httpVerbOf(node), path: found });
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return routes;
}

function thisChain(expr: ts.Expression): string[] | null {
  const parts: string[] = [];
  let current: ts.Expression = expr;
  while (ts.isPropertyAccessExpression(current)) {
    parts.unshift(current.name.text);
    const parentExpr: ts.Expression = current.expression;
    if (parentExpr.kind === ts.SyntaxKind.ThisKeyword) return parts;
    if (!ts.isPropertyAccessExpression(parentExpr)) return null;
    current = parentExpr;
  }
  return null;
}

function indexSdk(files: string[]): {
  classes: Map<string, SdkClassInfo>;
  clientSurface: Map<string, Surface>;
} {
  const classes = new Map<string, SdkClassInfo>();
  const sources = files.map(parseFile);
  const pendingChains = new Map<
    string,
    Array<{ method: string; chain: string[] }>
  >();

  const ensure = (name: string): SdkClassInfo => {
    let info = classes.get(name);
    if (!info) {
      info = { fields: new Map(), methods: new Map() };
      classes.set(name, info);
    }
    return info;
  };

  for (const sf of sources) {
    const visit = (node: ts.Node): void => {
      if (!ts.isClassDeclaration(node) || !node.name) {
        ts.forEachChild(node, visit);
        return;
      }
      const info = ensure(node.name.text);
      const chains: Array<{ method: string; chain: string[] }> = [];
      for (const member of node.members) {
        if (ts.isPropertyDeclaration(member) && ts.isIdentifier(member.name)) {
          const typeName = classNameFromType(member.type);
          if (typeName) info.fields.set(member.name.text, typeName);
        }
        if (ts.isConstructorDeclaration(member)) {
          for (const param of member.parameters) {
            if (!isParameterProperty(param) || !ts.isIdentifier(param.name)) {
              continue;
            }
            const typeName = classNameFromType(param.type);
            if (typeName) info.fields.set(param.name.text, typeName);
          }
        }
        if (
          !ts.isMethodDeclaration(member) ||
          !member.body ||
          !ts.isIdentifier(member.name)
        ) {
          continue;
        }
        const methodName = member.name.text;
        info.methods.set(methodName, {
          direct: collectDirectRoutes(member.body),
          callees: [],
        });
        const visitCall = (inner: ts.Node): void => {
          if (
            ts.isCallExpression(inner) &&
            ts.isPropertyAccessExpression(inner.expression)
          ) {
            const chain = thisChain(inner.expression);
            if (chain) chains.push({ method: methodName, chain });
          }
          ts.forEachChild(inner, visitCall);
        };
        visitCall(member.body);
      }
      pendingChains.set(node.name.text, [
        ...(pendingChains.get(node.name.text) ?? []),
        ...chains,
      ]);
    };
    visit(sf);
  }

  for (const [className, chains] of pendingChains) {
    const info = classes.get(className);
    if (!info) continue;
    for (const { method, chain } of chains) {
      const methodInfo = info.methods.get(method);
      if (!methodInfo || chain.length === 0) continue;
      if (chain.length === 1) {
        if (info.methods.has(chain[0]!)) {
          methodInfo.callees.push({ className, method: chain[0]! });
        }
        continue;
      }
      let current = className;
      let resolved = true;
      for (const fieldName of chain.slice(0, -1)) {
        const fieldType = classes.get(current)?.fields.get(fieldName);
        if (!fieldType || fieldType === 'HttpClient') {
          resolved = false;
          break;
        }
        current = fieldType;
      }
      if (!resolved) continue;
      methodInfo.callees.push({
        className: current,
        method: chain[chain.length - 1]!,
      });
    }
  }

  const clientSurface = new Map<string, Surface>();
  const clientFile = sources.find((sf) =>
    sf.fileName.endsWith(`${path.sep}client.ts`)
  );
  if (clientFile) {
    const visit = (node: ts.Node): void => {
      if (ts.isClassDeclaration(node) && node.name?.text === 'OnSocial') {
        for (const member of node.members) {
          if (!ts.isConstructorDeclaration(member) || !member.body) continue;
          for (const stmt of member.body.statements) {
            if (!ts.isExpressionStatement(stmt)) continue;
            const expr = stmt.expression;
            if (!ts.isBinaryExpression(expr)) continue;
            if (expr.operatorToken.kind !== ts.SyntaxKind.EqualsToken) continue;
            if (
              !ts.isPropertyAccessExpression(expr.left) ||
              expr.left.expression.kind !== ts.SyntaxKind.ThisKeyword
            ) {
              continue;
            }
            const prop = expr.left.name.text;
            const surface = surfaceFromInit(expr.right, clientSurface);
            if (surface) clientSurface.set(prop, surface);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(clientFile);
  }

  return { classes, clientSurface };
}

function surfaceFromInit(
  expr: ts.Expression,
  known: Map<string, Surface>
): Surface | null {
  if (ts.isNewExpression(expr) && ts.isIdentifier(expr.expression)) {
    if (expr.expression.text === 'HttpClient') return { kind: 'http' };
    return { kind: 'class', name: expr.expression.text };
  }
  if (
    ts.isPropertyAccessExpression(expr) &&
    expr.expression.kind === ts.SyntaxKind.ThisKeyword
  ) {
    return known.get(expr.name.text) ?? null;
  }
  if (!ts.isObjectLiteralExpression(expr)) return null;
  const fields = new Map<string, Surface>();
  for (const prop of expr.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
    const surface = surfaceFromInit(prop.initializer, known);
    if (surface) fields.set(prop.name.text, surface);
  }
  return { kind: 'object', fields };
}

function routesReached(
  classes: Map<string, SdkClassInfo>,
  className: string,
  methodName: string,
  cache: Map<string, RouteRef[]>,
  stack: Set<string>
): RouteRef[] {
  const key = `${className}#${methodName}`;
  const cached = cache.get(key);
  if (cached) return cached;
  if (stack.has(key)) return [];
  const info = classes.get(className)?.methods.get(methodName);
  if (!info) {
    cache.set(key, []);
    return [];
  }
  stack.add(key);
  const out: RouteRef[] = [...info.direct];
  for (const callee of info.callees) {
    out.push(
      ...routesReached(classes, callee.className, callee.method, cache, stack)
    );
  }
  stack.delete(key);
  const deduped = dedupeRoutes(out);
  cache.set(key, deduped);
  return deduped;
}

function dedupeRoutes(routes: RouteRef[]): RouteRef[] {
  const seen = new Set<string>();
  const out: RouteRef[] = [];
  for (const route of routes) {
    const key = `${route.http} ${route.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(route);
  }
  return out;
}

function moduleSpecifier(spec: string): string {
  return spec.replace(/\\/g, '/');
}

function factoryLane(
  imported: string,
  spec: string
): 'browser' | 'server' | null {
  const normalized = moduleSpecifier(spec);
  if (
    imported === 'createReadOnlyOnSocialClient' &&
    normalized.endsWith('create-readonly-onsocial-client')
  ) {
    return 'browser';
  }
  if (
    imported === 'createAppOnSocialClient' &&
    normalized.endsWith('create-app-onsocial-client')
  ) {
    return 'browser';
  }
  if (
    imported === 'createServerOnSocialClient' &&
    normalized.endsWith('create-server-onsocial-client')
  ) {
    return 'server';
  }
  if (
    imported === 'createAppOnSocialClient' &&
    normalized.endsWith('profile-social-server')
  ) {
    return 'server';
  }
  return null;
}

function isHookModule(spec: string): boolean {
  return moduleSpecifier(spec).endsWith('hooks/use-app-onsocial-client');
}

function resolveModuleFile(
  fromFile: string,
  spec: string,
  appSrc: string
): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(appSrc, spec.slice(2));
  else if (spec.startsWith('.'))
    base = path.resolve(path.dirname(fromFile), spec);
  else return null;
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

function unwrapFunction(
  expr: ts.Expression
): ts.FunctionLikeDeclaration | null {
  if (ts.isFunctionExpression(expr) || ts.isArrowFunction(expr)) return expr;
  if (
    ts.isCallExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    (expr.expression.text === 'useCallback' ||
      expr.expression.text === 'useMemo') &&
    expr.arguments[0] &&
    (ts.isFunctionExpression(expr.arguments[0]) ||
      ts.isArrowFunction(expr.arguments[0]))
  ) {
    return expr.arguments[0];
  }
  return null;
}

function functionReturns(fn: ts.FunctionLikeDeclaration): ts.Expression[] {
  if (ts.isArrowFunction(fn) && fn.body && !ts.isBlock(fn.body)) {
    return [fn.body];
  }
  const body = fn.body;
  if (!body || !ts.isBlock(body)) return [];
  const out: ts.Expression[] = [];
  const visit = (node: ts.Node): void => {
    if (node !== fn && isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression)
      out.push(node.expression);
    ts.forEachChild(node, visit);
  };
  visit(body);
  return out;
}

function laneFromReturnExpr(
  expr: ts.Expression,
  imports: Map<string, { imported: string; spec: string }>,
  fnIds: Map<string, string>
): { lane: 'browser' | 'server' } | { ref: string } | null {
  let current = expr;
  while (
    ts.isAwaitExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  if (ts.isNewExpression(current) && ts.isIdentifier(current.expression)) {
    if (current.expression.text !== 'OnSocial' || !current.arguments?.[0]) {
      return null;
    }
    const arg = current.arguments[0];
    if (!ts.isObjectLiteralExpression(arg)) return null;
    for (const prop of arg.properties) {
      if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name))
        continue;
      if (prop.name.text !== 'gatewayUrl') continue;
      if (
        ts.isIdentifier(prop.initializer) &&
        prop.initializer.text === 'BROWSER_GATEWAY_PROXY'
      ) {
        return { lane: 'browser' };
      }
      if (
        ts.isStringLiteral(prop.initializer) &&
        prop.initializer.text.replace(/\/$/, '').endsWith('/api/onapi')
      ) {
        return { lane: 'browser' };
      }
      if (
        ts.isIdentifier(prop.initializer) &&
        prop.initializer.text === 'ACTIVE_API_URL'
      ) {
        return { lane: 'server' };
      }
    }
    return null;
  }
  if (!ts.isCallExpression(current) || !ts.isIdentifier(current.expression)) {
    return null;
  }
  const name = current.expression.text;
  const imported = imports.get(name);
  if (imported) {
    const lane = factoryLane(imported.imported, imported.spec);
    if (lane) return { lane };
    const id = fnIds.get(`${imported.spec}#${imported.imported}`);
    if (id) return { ref: id };
  }
  const local = fnIds.get(name);
  if (local) return { ref: local };
  return null;
}

interface FileIndex {
  sf: ts.SourceFile;
  file: string;
  imports: Map<
    string,
    { imported: string; spec: string; resolved: string | null }
  >;
  fnByName: Map<string, string>;
}

function indexApp(
  files: string[],
  appSrc: string
): {
  files: FileIndex[];
  fns: Map<string, FnInfo>;
} {
  const parsed = files.map((file) => ({ file, sf: parseFile(file) }));
  const exportIds = new Map<string, string>();
  const fns = new Map<string, FnInfo>();

  const claim = (
    file: string,
    name: string,
    node: ts.Node,
    exported: boolean
  ): string => {
    const id = `${file}#${name}:${lineOf(parsed.find((item) => item.file === file)!.sf, node)}`;
    if (!fns.has(id)) {
      fns.set(id, {
        id,
        name,
        file,
        returns: [],
        returnLane: null,
      });
    }
    if (exported) exportIds.set(`${file}#${name}`, id);
    return id;
  };

  for (const { file, sf } of parsed) {
    const visit = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name) {
        const exported = (ts.getModifiers(node) ?? []).some(
          (mod) => mod.kind === ts.SyntaxKind.ExportKeyword
        );
        claim(file, node.name.text, node, exported);
      }
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer
      ) {
        const fn = unwrapFunction(node.initializer);
        if (fn) {
          const statement = node.parent?.parent;
          const exported =
            !!statement &&
            ts.isVariableStatement(statement) &&
            (ts.getModifiers(statement) ?? []).some(
              (mod) => mod.kind === ts.SyntaxKind.ExportKeyword
            );
          claim(file, node.name.text, node, exported);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  const fileIndexes: FileIndex[] = [];
  for (const { file, sf } of parsed) {
    const imports = new Map<
      string,
      { imported: string; spec: string; resolved: string | null }
    >();
    const fnByName = new Map<string, string>();
    for (const stmt of sf.statements) {
      if (!ts.isImportDeclaration(stmt)) continue;
      if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
      if (stmt.importClause?.isTypeOnly) continue;
      const spec = stmt.moduleSpecifier.text;
      const resolved = resolveModuleFile(file, spec, appSrc);
      const clause = stmt.importClause;
      if (!clause) continue;
      const bind = (local: string, imported: string) => {
        imports.set(local, { imported, spec, resolved });
      };
      if (clause.name) bind(clause.name.text, 'default');
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const el of clause.namedBindings.elements) {
          if (el.isTypeOnly) continue;
          bind(el.name.text, (el.propertyName ?? el.name).text);
        }
      }
    }
    const visit = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name) {
        const id = [...fns.values()].find(
          (fn) =>
            fn.file === file &&
            fn.name === node.name!.text &&
            fn.id.endsWith(`:${lineOf(sf, node)}`)
        )?.id;
        if (id) fnByName.set(node.name.text, id);
      }
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        unwrapFunction(node.initializer)
      ) {
        const id = [...fns.values()].find(
          (fn) =>
            fn.file === file &&
            fn.name === (node.name as ts.Identifier).text &&
            fn.id.endsWith(`:${lineOf(sf, node)}`)
        )?.id;
        if (id) fnByName.set(node.name.text, id);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    fileIndexes.push({ sf, file, imports, fnByName });

    const localIds = new Map<string, string>();
    for (const [name, id] of fnByName) localIds.set(name, id);
    for (const [local, spec] of imports) {
      if (!spec.resolved) continue;
      const exported = exportIds.get(`${spec.resolved}#${spec.imported}`);
      if (exported) localIds.set(local, exported);
    }

    const visitReturns = (node: ts.Node): void => {
      let fnNode: ts.FunctionLikeDeclaration | null = null;
      let fnName: string | null = null;
      let idNode: ts.Node | null = null;
      if (ts.isFunctionDeclaration(node) && node.name && node.body) {
        fnNode = node;
        fnName = node.name.text;
        idNode = node;
      } else if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer
      ) {
        const fn = unwrapFunction(node.initializer);
        if (fn) {
          fnNode = fn;
          fnName = node.name.text;
          idNode = node;
        }
      }
      if (fnNode && fnName && idNode) {
        const id = [...fns.values()].find(
          (fn) =>
            fn.file === file &&
            fn.name === fnName &&
            fn.id.endsWith(`:${lineOf(sf, idNode!)}`)
        )?.id;
        const info = id ? fns.get(id) : undefined;
        if (info) {
          const importMap = new Map(
            [...imports.entries()].map(([local, spec]) => [
              local,
              { imported: spec.imported, spec: spec.spec },
            ])
          );
          for (const ret of functionReturns(fnNode)) {
            const lane = laneFromReturnExpr(ret, importMap, localIds);
            if (lane) info.returns.push(lane);
          }
        }
      }
      ts.forEachChild(node, visitReturns);
    };
    visitReturns(sf);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const fn of fns.values()) {
      if (fn.returnLane) continue;
      for (const item of fn.returns) {
        if ('lane' in item) {
          fn.returnLane = item.lane;
          changed = true;
          break;
        }
        const target = fns.get(item.ref);
        if (target?.returnLane) {
          fn.returnLane = target.returnLane;
          changed = true;
          break;
        }
      }
    }
  }

  return { files: fileIndexes, fns };
}

function lookup(scope: Scope | null, name: string): Bound | null {
  let current = scope;
  while (current) {
    const found = current.map.get(name);
    if (found) return found;
    current = current.parent;
  }
  return null;
}

function unwrapExpr(expr: ts.Expression): ts.Expression {
  let current = expr;
  while (
    ts.isAwaitExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function paramIsClient(
  typeNode: ts.TypeNode | undefined,
  imports: FileIndex['imports']
): Lane | 'client' | 'carrier' | null {
  if (!typeNode) return null;
  if (
    ts.isTypeReferenceNode(typeNode) &&
    entityName(typeNode.typeName) === 'OnSocial'
  ) {
    return 'client';
  }
  if (
    ts.isTypeReferenceNode(typeNode) &&
    entityName(typeNode.typeName) === 'ReturnType' &&
    typeNode.typeArguments?.[0] &&
    ts.isTypeQueryNode(typeNode.typeArguments[0]) &&
    ts.isIdentifier(typeNode.typeArguments[0].exprName)
  ) {
    const name = typeNode.typeArguments[0].exprName.text;
    const imported = imports.get(name);
    if (imported) {
      const lane = factoryLane(imported.imported, imported.spec);
      if (lane) return { kind: lane };
    }
    return null;
  }
  if (ts.isTypeLiteralNode(typeNode)) {
    for (const member of typeNode.members) {
      if (
        ts.isPropertySignature(member) &&
        ts.isIdentifier(member.name) &&
        member.name.text === 'client' &&
        member.type &&
        ts.isTypeReferenceNode(member.type) &&
        entityName(member.type.typeName) === 'OnSocial'
      ) {
        return 'carrier';
      }
    }
  }
  return null;
}

interface CollectState {
  classes: Map<string, SdkClassInfo>;
  clientSurface: Map<string, Surface>;
  routeCache: Map<string, RouteRef[]>;
  fns: Map<string, FnInfo>;
  filesByPath: Map<string, FileIndex>;
  hits: DataHit[];
  edges: CallEdge[];
  conduits: RouteConduit[];
  fetchRoutes: Array<RouteRef & { file: string; line: number; via: string }>;
  repoRoot: string;
}

function propSurface(
  surface: Surface,
  prop: string,
  state: CollectState
): Surface | null {
  if (surface.kind === 'client') return state.clientSurface.get(prop) ?? null;
  if (surface.kind === 'class') {
    const field = state.classes.get(surface.name)?.fields.get(prop);
    if (!field) return null;
    if (field === 'HttpClient') return { kind: 'http' };
    return { kind: 'class', name: field };
  }
  if (surface.kind === 'object') return surface.fields.get(prop) ?? null;
  if (surface.kind === 'bundle' && prop === 'client') return { kind: 'client' };
  return null;
}

function collectApp(
  index: { files: FileIndex[]; fns: Map<string, FnInfo> },
  state: CollectState,
  appSrc: string
): void {
  for (const file of index.files) {
    const fileScope: Scope = { map: new Map(), parent: null };
    for (const [local, spec] of file.imports) {
      const lane = factoryLane(spec.imported, spec.spec);
      if (lane) {
        fileScope.map.set(local, { kind: 'factory', lane });
        continue;
      }
      if (spec.imported === 'useAppOnSocialClient' && isHookModule(spec.spec)) {
        fileScope.map.set(local, { kind: 'hook' });
        continue;
      }
      if (spec.resolved) {
        const target = [...state.fns.values()].find(
          (fn) => fn.file === spec.resolved && fn.name === spec.imported
        );
        // Prefer the exported id. fns may contain several with the same name;
        // export registration stored the exported one last only if unique.
        const matches = [...state.fns.values()].filter(
          (fn) => fn.file === spec.resolved && fn.name === spec.imported
        );
        const picked = matches.length === 1 ? matches[0] : target;
        if (picked) fileScope.map.set(local, { kind: 'fn', id: picked.id });
      }
    }
    for (const [name, id] of file.fnByName) {
      if (!fileScope.map.has(name)) fileScope.map.set(name, { kind: 'fn', id });
    }

    const visit = (node: ts.Node, scope: Scope, fnId: string | null): void => {
      if (ts.isFunctionDeclaration(node) && node.name && node.body) {
        const id =
          [...state.fns.values()].find(
            (fn) =>
              fn.file === file.file &&
              fn.name === node.name!.text &&
              fn.id.endsWith(`:${lineOf(file.sf, node)}`)
          )?.id ?? null;
        const next: Scope = { map: new Map(), parent: scope };
        if (id) bindParams(node, id, next, file);
        visit(node.body, next, id);
        return;
      }
      if (ts.isVariableDeclaration(node) && node.initializer) {
        if (ts.isIdentifier(node.name)) {
          const fn = unwrapFunction(node.initializer);
          if (fn) {
            const id =
              [...state.fns.values()].find(
                (info) =>
                  info.file === file.file &&
                  info.name === node.name.text &&
                  info.id.endsWith(`:${lineOf(file.sf, node)}`)
              )?.id ?? null;
            if (id) scope.map.set(node.name.text, { kind: 'fn', id });
            const next: Scope = { map: new Map(), parent: scope };
            if (id && (ts.isFunctionExpression(fn) || ts.isArrowFunction(fn))) {
              bindParams(fn, id, next, file);
            }
            if (fn.body) visit(fn.body, next, id);
            return;
          }
        }
        bindInitializer(node.name, node.initializer, scope, file, state);
      }

      if (ts.isCallExpression(node)) {
        noteCall(node, scope, fnId, file, state, appSrc);
      }

      ts.forEachChild(node, (child) => visit(child, scope, fnId));
    };
    visit(file.sf, fileScope, null);
  }
}

function bindParams(
  fn: ts.FunctionLikeDeclaration,
  fnId: string,
  scope: Scope,
  file: FileIndex
): void {
  for (const param of fn.parameters) {
    if (!ts.isIdentifier(param.name)) continue;
    const hint = paramIsClient(param.type, file.imports);
    if (hint === 'client') {
      scope.map.set(param.name.text, {
        kind: 'value',
        value: {
          surface: { kind: 'client' },
          lane: { kind: 'param', fnId, name: param.name.text },
        },
      });
    } else if (hint && typeof hint === 'object') {
      scope.map.set(param.name.text, {
        kind: 'value',
        value: { surface: { kind: 'client' }, lane: hint },
      });
    } else if (hint === 'carrier') {
      scope.map.set(param.name.text, {
        kind: 'value',
        value: {
          surface: {
            kind: 'object',
            fields: new Map([['client', { kind: 'client' }]]),
          },
          lane: { kind: 'param', fnId, name: `${param.name.text}.client` },
        },
      });
    }
  }
}

type EvalResult =
  | { kind: 'value'; value: Value }
  | { kind: 'getter' }
  | { kind: 'factory'; lane: 'browser' | 'server' }
  | { kind: 'fn'; id: string }
  | { kind: 'spread-hook' }
  | { kind: 'hook-bindings'; bindings: Map<string, Bound> }
  | null;

function evalExpr(
  expr: ts.Expression,
  scope: Scope,
  file: FileIndex,
  state: CollectState
): EvalResult {
  const current = unwrapExpr(expr);
  if (ts.isIdentifier(current)) {
    const bound = lookup(scope, current.text);
    if (!bound) return null;
    if (bound.kind === 'factory') return bound;
    if (bound.kind === 'getter') return { kind: 'getter' };
    if (bound.kind === 'fn') {
      const lane = state.fns.get(bound.id)?.returnLane;
      if (lane) {
        return {
          kind: 'value',
          value: { surface: { kind: 'client' }, lane: { kind: lane } },
        };
      }
      return bound;
    }
    if (bound.kind === 'value') return { kind: 'value', value: bound.value };
    if (bound.kind === 'hook') return { kind: 'spread-hook' };
    return null;
  }
  if (ts.isCallExpression(current)) {
    return evalCall(current, scope, file, state);
  }
  if (ts.isPropertyAccessExpression(current)) {
    const obj = evalExpr(current.expression, scope, file, state);
    if (!obj || obj.kind !== 'value') {
      if (obj?.kind === 'spread-hook') {
        if (
          current.name.text === 'getClient' ||
          current.name.text === 'getAuthedClient' ||
          current.name.text === 'getSessionClient'
        ) {
          return { kind: 'getter' };
        }
      }
      return null;
    }
    const next = propSurface(obj.value.surface, current.name.text, state);
    if (!next) return null;
    let lane = obj.value.lane;
    if (
      obj.value.surface.kind === 'object' &&
      current.name.text === 'client' &&
      lane.kind === 'param' &&
      !lane.name.endsWith('.client')
    ) {
      lane = { kind: 'param', fnId: lane.fnId, name: `${lane.name}.client` };
    }
    if (obj.value.surface.kind === 'bundle' && current.name.text === 'client') {
      lane = { kind: 'browser' };
    }
    return { kind: 'value', value: { surface: next, lane } };
  }
  if (
    ts.isObjectLiteralExpression(current) &&
    current.properties.length === 0
  ) {
    return null;
  }
  return null;
}

function evalCall(
  call: ts.CallExpression,
  scope: Scope,
  file: FileIndex,
  state: CollectState
): EvalResult {
  const callee = unwrapExpr(call.expression);
  if (ts.isIdentifier(callee)) {
    const bound = lookup(scope, callee.text);
    if (bound?.kind === 'factory') {
      return {
        kind: 'value',
        value: {
          surface: { kind: 'client' },
          lane: { kind: bound.lane },
        },
      };
    }
    if (bound?.kind === 'getter' || callee.text === 'getClient') {
      if (bound?.kind === 'getter') {
        return {
          kind: 'value',
          value: { surface: { kind: 'bundle' }, lane: { kind: 'browser' } },
        };
      }
    }
    if (bound?.kind === 'hook') {
      return { kind: 'spread-hook' };
    }
    if (bound?.kind === 'fn') {
      const lane = state.fns.get(bound.id)?.returnLane;
      if (lane) {
        return {
          kind: 'value',
          value: { surface: { kind: 'client' }, lane: { kind: lane } },
        };
      }
    }
    if (!bound && callee.text === 'useAppOnSocialClient') {
      return { kind: 'spread-hook' };
    }
  }
  if (ts.isPropertyAccessExpression(callee)) {
    const obj = evalExpr(callee.expression, scope, file, state);
    if (
      obj?.kind === 'spread-hook' &&
      (callee.name.text === 'getClient' ||
        callee.name.text === 'getAuthedClient' ||
        callee.name.text === 'getSessionClient')
    ) {
      return {
        kind: 'value',
        value: { surface: { kind: 'bundle' }, lane: { kind: 'browser' } },
      };
    }
  }
  return null;
}

function destructureBindings(
  name: ts.BindingName,
  value: EvalResult
): Map<string, Bound> | null {
  if (!ts.isObjectBindingPattern(name) || !value) return null;
  const bindings = new Map<string, Bound>();
  if (value.kind === 'spread-hook') {
    for (const el of name.elements) {
      if (!ts.isIdentifier(el.name)) continue;
      if (
        el.name.text === 'getClient' ||
        el.name.text === 'getAuthedClient' ||
        el.name.text === 'getSessionClient'
      ) {
        bindings.set(el.name.text, { kind: 'getter' });
      }
    }
    return bindings;
  }
  if (value.kind === 'value' && value.value.surface.kind === 'bundle') {
    for (const el of name.elements) {
      if (!ts.isIdentifier(el.name)) continue;
      if (el.name.text === 'client') {
        bindings.set(el.name.text, {
          kind: 'value',
          value: { surface: { kind: 'client' }, lane: { kind: 'browser' } },
        });
      }
    }
    return bindings;
  }
  if (
    value.kind === 'value' &&
    value.value.surface.kind === 'object' &&
    value.value.surface.fields.get('client')?.kind === 'client'
  ) {
    for (const el of name.elements) {
      if (!ts.isIdentifier(el.name) || el.name.text !== 'client') continue;
      bindings.set(el.name.text, {
        kind: 'value',
        value: { surface: { kind: 'client' }, lane: value.value.lane },
      });
    }
    return bindings.size > 0 ? bindings : null;
  }
  return bindings.size > 0 ? bindings : null;
}

function bindInitializer(
  nameNode: ts.BindingName,
  initializer: ts.Expression,
  scope: Scope,
  file: FileIndex,
  state: CollectState
): void {
  if (ts.isIdentifier(nameNode)) {
    const dynamic = dynamicImportFactories(nameNode, initializer);
    if (dynamic) {
      for (const [local, lane] of dynamic) {
        if (local === nameNode.text) {
          scope.map.set(local, { kind: 'factory', lane });
        }
      }
    }
    const value = evalExpr(initializer, scope, file, state);
    if (value?.kind === 'value') {
      scope.map.set(nameNode.text, { kind: 'value', value: value.value });
    } else if (value?.kind === 'getter') {
      scope.map.set(nameNode.text, { kind: 'getter' });
    } else if (value?.kind === 'factory') {
      scope.map.set(nameNode.text, value);
    } else if (value?.kind === 'spread-hook') {
      scope.map.set(nameNode.text, { kind: 'hook' });
    }
    return;
  }
  const value = evalExpr(initializer, scope, file, state);
  const bindings = destructureBindings(nameNode, value);
  if (!bindings) {
    const dynamic = dynamicImportFactories(nameNode, initializer);
    if (dynamic) {
      for (const [local, lane] of dynamic) {
        scope.map.set(local, { kind: 'factory', lane });
      }
    }
    return;
  }
  for (const [key, bound] of bindings) scope.map.set(key, bound);
}

function dynamicImportFactories(
  name: ts.BindingName,
  expr: ts.Expression
): Map<string, 'browser' | 'server'> | null {
  if (!ts.isObjectBindingPattern(name)) return null;
  const current = unwrapExpr(expr);
  if (!ts.isCallExpression(current)) return null;
  const isImportCall =
    current.expression.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(current.expression) &&
      current.expression.text === 'import');
  if (!isImportCall || !current.arguments[0]) return null;
  const arg = current.arguments[0];
  if (!ts.isStringLiteral(arg)) return null;
  const out = new Map<string, 'browser' | 'server'>();
  for (const el of name.elements) {
    if (!ts.isIdentifier(el.name)) continue;
    const imported = (el.propertyName ?? el.name).text;
    const lane = factoryLane(imported, arg.text);
    if (lane) out.set(el.name.text, lane);
  }
  return out.size > 0 ? out : null;
}

function noteCall(
  call: ts.CallExpression,
  scope: Scope,
  fnId: string | null,
  file: FileIndex,
  state: CollectState,
  _appSrc: string
): void {
  noteFetch(call, scope, fnId, file, state);
  noteEdge(call, scope, file, state);
  const callee = unwrapExpr(call.expression);
  if (!ts.isPropertyAccessExpression(callee)) return;
  const obj = evalExpr(callee.expression, scope, file, state);
  if (!obj || obj.kind !== 'value') return;
  const method = callee.name.text;
  if (obj.value.surface.kind === 'http' && HTTP_VERBS.has(method)) {
    const arg = call.arguments[0];
    if (!arg) return;
    for (const bit of stringBits(arg)) {
      if (!bit.includes('/data/')) continue;
      const found = dataPathFromText(bit);
      if (!found) continue;
      state.hits.push({
        route: { http: method.toUpperCase() as RouteRef['http'], path: found },
        file: relFile(state.repoRoot, file.file),
        line: lineOf(file.sf, call),
        via: `http.${method}`,
        lane: obj.value.lane,
        fnId,
      });
    }
    return;
  }
  if (obj.value.surface.kind !== 'class') return;
  const routes = routesReached(
    state.classes,
    obj.value.surface.name,
    method,
    state.routeCache,
    new Set()
  );
  if (routes.length === 0) return;
  const via = `${surfaceLabel(obj.value.surface)}.${method}`;
  for (const route of routes) {
    state.hits.push({
      route,
      file: relFile(state.repoRoot, file.file),
      line: lineOf(file.sf, call),
      via,
      lane: obj.value.lane,
      fnId,
    });
  }
}

function surfaceLabel(surface: Surface): string {
  if (surface.kind === 'class') {
    return surface.name
      .replace(/Module$/, '')
      .replace(/Api$/, '')
      .replace(/^Scarces/, '')
      .replace(/^[A-Z]/, (char) => char.toLowerCase());
  }
  return 'client';
}

function noteEdge(
  call: ts.CallExpression,
  scope: Scope,
  file: FileIndex,
  state: CollectState
): void {
  const callee = unwrapExpr(call.expression);
  if (!ts.isIdentifier(callee)) return;
  const bound = lookup(scope, callee.text);
  if (bound?.kind !== 'fn') return;
  const info = state.fns.get(bound.id);
  if (!info) return;
  const calleeFile = state.filesByPath.get(info.file);
  if (!calleeFile) return;
  const fnNode = findFnNode(calleeFile.sf, info);
  if (!fnNode) return;
  const args: Array<{ param: string; lane: Lane }> = [];
  fnNode.parameters.forEach((param, index) => {
    if (!ts.isIdentifier(param.name)) return;
    const hint = paramIsClient(param.type, calleeFile.imports);
    const arg = call.arguments[index];
    if (!arg || !hint) return;
    if (hint === 'carrier') {
      const lane = objectClientLane(arg, scope, file, state);
      if (lane) args.push({ param: `${param.name.text}.client`, lane });
      return;
    }
    const lane = exprLane(arg, scope, file, state);
    if (lane) args.push({ param: param.name.text, lane });
  });
  if (args.length === 0) return;
  state.edges.push({
    calleeId: bound.id,
    callerFile: file.file,
    args,
  });
}

function findFnNode(
  sf: ts.SourceFile,
  info: FnInfo
): ts.FunctionLikeDeclaration | null {
  const suffix = info.id.slice(info.id.lastIndexOf(':') + 1);
  const line = Number(suffix);
  let found: ts.FunctionLikeDeclaration | null = null;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isFunctionDeclaration(node) && node.name?.text === info.name) {
      if (lineOf(sf, node) === line) found = node;
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === info.name &&
      node.initializer
    ) {
      const fn = unwrapFunction(node.initializer);
      if (fn && lineOf(sf, node) === line) found = fn;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

function exprLane(
  expr: ts.Expression,
  scope: Scope,
  file: FileIndex,
  state: CollectState
): Lane | null {
  const value = evalExpr(expr, scope, file, state);
  if (value?.kind === 'value' && value.value.surface.kind === 'client') {
    return value.value.lane;
  }
  return null;
}

function objectClientLane(
  expr: ts.Expression,
  scope: Scope,
  file: FileIndex,
  state: CollectState
): Lane | null {
  const current = unwrapExpr(expr);
  if (!ts.isObjectLiteralExpression(current)) return null;
  for (const prop of current.properties) {
    if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === 'client') {
      const bound = lookup(scope, prop.name.text);
      if (bound?.kind === 'value' && bound.value.surface.kind === 'client') {
        return bound.value.lane;
      }
    }
    if (
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === 'client'
    ) {
      return exprLane(prop.initializer, scope, file, state);
    }
  }
  return null;
}

function noteFetch(
  call: ts.CallExpression,
  scope: Scope,
  fnId: string | null,
  file: FileIndex,
  state: CollectState
): void {
  const callee = unwrapExpr(call.expression);
  if (!ts.isIdentifier(callee) || callee.text !== 'fetch') return;
  const arg = call.arguments[0];
  if (!arg) return;
  const proxy = templateUsesProxy(arg, scope, file);
  if (!proxy) return;
  if (proxy.staticPath) {
    state.fetchRoutes.push({
      http: 'GET',
      path: proxy.staticPath,
      file: relFile(state.repoRoot, file.file),
      line: lineOf(file.sf, call),
      via: 'fetch',
    });
  }
  if (proxy.dynamicIdent && fnId) {
    const fn = findFnNode(file.sf, state.fns.get(fnId)!);
    const index = fn?.parameters.findIndex(
      (param) =>
        ts.isIdentifier(param.name) && param.name.text === proxy.dynamicIdent
    );
    if (index !== undefined && index >= 0) {
      state.conduits.push({ fnId, paramIndex: index });
    }
  }
}

function templateUsesProxy(
  expr: ts.Expression,
  scope: Scope,
  file: FileIndex
): { staticPath: string | null; dynamicIdent: string | null } | null {
  const current = unwrapExpr(expr);
  if (
    ts.isStringLiteral(current) ||
    ts.isNoSubstitutionTemplateLiteral(current)
  ) {
    if (!current.text.includes('/api/onapi/')) return null;
    return { staticPath: dataPathFromText(current.text), dynamicIdent: null };
  }
  if (!ts.isTemplateExpression(current)) return null;
  let sawProxy = false;
  let staticPath: string | null = null;
  let dynamicIdent: string | null = null;
  const head = current.head.text;
  if (head.includes('/api/onapi/')) {
    sawProxy = true;
    staticPath = dataPathFromText(head);
  }
  for (const span of current.templateSpans) {
    const exprNode = unwrapExpr(span.expression);
    const ident = ts.isIdentifier(exprNode) ? exprNode.text : null;
    const isProxyIdent =
      ident === 'BROWSER_GATEWAY_PROXY' ||
      lookup(scope, ident ?? '')?.kind === 'value';
    const imported = ident ? file.imports.get(ident) : undefined;
    const isProxyImport =
      !!imported &&
      imported.imported === 'BROWSER_GATEWAY_PROXY' &&
      moduleSpecifier(imported.spec).endsWith('app-gateway-url');
    if (isProxyIdent && isProxyImport) sawProxy = true;
    if (ident === 'BROWSER_GATEWAY_PROXY') sawProxy = true;
    if (sawProxy && span.literal.text.includes('/data/')) {
      staticPath = dataPathFromText(span.literal.text);
    }
    if (
      sawProxy &&
      (span.literal.text === '' || current.head.text.endsWith('/')) &&
      ident &&
      ident !== 'BROWSER_GATEWAY_PROXY' &&
      !staticPath
    ) {
      // `${BROWSER_GATEWAY_PROXY}/${path}` — path is the next expression
      // when the text between proxy and path is `/`.
    }
    if (sawProxy && ident && ident !== 'BROWSER_GATEWAY_PROXY') {
      const before = span === current.templateSpans[0] ? current.head.text : '';
      if (before.endsWith('/') || before === '') {
        const previousSpan =
          current.templateSpans[current.templateSpans.indexOf(span) - 1];
        const glue = previousSpan
          ? previousSpan.literal.text
          : current.head.text;
        if (glue.endsWith('/')) dynamicIdent = ident;
      }
    }
    if (!sawProxy && span.literal.text.includes('/api/onapi/')) {
      sawProxy = true;
      staticPath = dataPathFromText(span.literal.text);
    }
  }
  // Explicit pattern: head empty, first expr proxy, literal '/', second expr ident.
  if (current.templateSpans.length >= 2) {
    const first = current.templateSpans[0]!;
    const second = current.templateSpans[1]!;
    const firstName = ts.isIdentifier(unwrapExpr(first.expression))
      ? unwrapExpr(first.expression).getText()
      : '';
    if (
      (firstName === 'BROWSER_GATEWAY_PROXY' ||
        (ts.isIdentifier(unwrapExpr(first.expression)) &&
          file.imports.get(unwrapExpr(first.expression).getText())?.imported ===
            'BROWSER_GATEWAY_PROXY')) &&
      first.literal.text.startsWith('/') &&
      ts.isIdentifier(unwrapExpr(second.expression))
    ) {
      sawProxy = true;
      if (!first.literal.text.includes('/data/')) {
        dynamicIdent = (unwrapExpr(second.expression) as ts.Identifier).text;
      } else {
        staticPath = dataPathFromText(first.literal.text);
      }
    }
  }
  if (!sawProxy) return null;
  return { staticPath, dynamicIdent };
}

function propagate(state: CollectState, clientFiles: Set<string>): DataHit[] {
  const browserParams = new Set<string>();
  const serverParams = new Set<string>();
  const resolve = (lane: Lane): 'browser' | 'server' | 'unknown' => {
    if (lane.kind === 'browser') return 'browser';
    if (lane.kind === 'server') return 'server';
    const key = `${lane.fnId}\0${lane.name}`;
    if (browserParams.has(key)) return 'browser';
    if (serverParams.has(key)) return 'server';
    return 'unknown';
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of state.edges) {
      for (const arg of edge.args) {
        const lane = resolve(arg.lane);
        const key = `${edge.calleeId}\0${arg.param}`;
        if (lane === 'browser' && !browserParams.has(key)) {
          browserParams.add(key);
          changed = true;
        }
        if (lane === 'server' && !serverParams.has(key)) {
          serverParams.add(key);
          changed = true;
        }
      }
    }
  }

  const incoming = new Map<string, string[]>();
  for (const edge of state.edges) {
    const list = incoming.get(edge.calleeId) ?? [];
    list.push(edge.callerFile);
    incoming.set(edge.calleeId, list);
  }

  const resolved: DataHit[] = [];
  for (const hit of state.hits) {
    let lane = resolve(hit.lane);
    if (lane === 'unknown' && hit.lane.kind === 'param') {
      const callers = incoming.get(hit.lane.fnId) ?? [];
      if (callers.length === 0) {
        resolved.push({
          ...hit,
          lane: { kind: 'param', fnId: hit.lane.fnId, name: '__dormant__' },
        });
        continue;
      }
      const anyClient = callers.some((caller) => clientFiles.has(caller));
      const anyServer = callers.some((caller) => !clientFiles.has(caller));
      if (anyClient) lane = 'browser';
      else if (anyServer) lane = 'server';
    }
    if (lane === 'browser') {
      resolved.push({ ...hit, lane: { kind: 'browser' } });
    } else if (lane === 'server') {
      resolved.push({ ...hit, lane: { kind: 'server' } });
    } else if (hit.lane.kind === 'param') {
      resolved.push(hit);
    }
  }
  return resolved;
}

function clientBundleFrom(files: FileIndex[], appSrc: string): Set<string> {
  const depsOf = new Map<string, string[]>();
  const seeds: string[] = [];
  const serverOnly = new Set<string>();
  for (const file of files) {
    const deps: string[] = [];
    const first = file.sf.statements[0];
    if (
      first &&
      ts.isExpressionStatement(first) &&
      ts.isStringLiteral(first.expression) &&
      first.expression.text === 'use client'
    ) {
      seeds.push(file.file);
    }
    for (const stmt of file.sf.statements) {
      if (
        !ts.isImportDeclaration(stmt) ||
        !ts.isStringLiteral(stmt.moduleSpecifier)
      ) {
        continue;
      }
      if (stmt.moduleSpecifier.text === 'server-only')
        serverOnly.add(file.file);
      if (stmt.importClause?.isTypeOnly) continue;
      const resolved = resolveModuleFile(
        file.file,
        stmt.moduleSpecifier.text,
        appSrc
      );
      if (resolved) deps.push(resolved);
    }
    depsOf.set(file.file, deps);
  }
  const seen = new Set<string>();
  const queue = [...seeds];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file) || serverOnly.has(file)) continue;
    seen.add(file);
    for (const dep of depsOf.get(file) ?? []) queue.push(dep);
  }
  return seen;
}

function propagateConduits(
  state: CollectState,
  index: { files: FileIndex[] }
): Array<RouteRef & { file: string; line: number; via: string }> {
  const byFn = new Map<string, RouteConduit[]>();
  for (const conduit of state.conduits) {
    const list = byFn.get(conduit.fnId) ?? [];
    list.push(conduit);
    byFn.set(conduit.fnId, list);
  }
  const routes: Array<RouteRef & { file: string; line: number; via: string }> =
    [...state.fetchRoutes];
  const extra = new Map<string, number[]>();
  let changed = true;
  const seenLiteral = new Set<string>();
  while (changed) {
    changed = false;
    for (const file of index.files) {
      const visit = (node: ts.Node, fnId: string | null): void => {
        let nextFn = fnId;
        if (ts.isFunctionDeclaration(node) && node.name) {
          nextFn =
            [...state.fns.values()].find(
              (fn) =>
                fn.file === file.file &&
                fn.name === node.name!.text &&
                fn.id.endsWith(`:${lineOf(file.sf, node)}`)
            )?.id ?? fnId;
        }
        if (
          !ts.isCallExpression(node) ||
          !ts.isIdentifier(unwrapExpr(node.expression))
        ) {
          ts.forEachChild(node, (child) => visit(child, nextFn));
          return;
        }
        const name = (unwrapExpr(node.expression) as ts.Identifier).text;
        const targetId = file.fnByName.get(name);
        const imported = file.imports.get(name);
        const resolvedId =
          targetId ??
          (imported?.resolved
            ? [...state.fns.values()].find(
                (fn) =>
                  fn.file === imported.resolved && fn.name === imported.imported
              )?.id
            : undefined);
        const conduits = resolvedId ? (byFn.get(resolvedId) ?? []) : [];
        for (const conduit of conduits) {
          const arg = node.arguments[conduit.paramIndex];
          if (!arg) continue;
          const literal = ts.isStringLiteral(arg) ? arg.text : null;
          if (literal) {
            const found = dataPathFromText(
              literal.startsWith('data/') ? `/${literal}` : literal
            );
            if (found) {
              const key = `${found}:${lineOf(file.sf, node)}`;
              if (!seenLiteral.has(key)) {
                seenLiteral.add(key);
                routes.push({
                  http: 'GET',
                  path: found,
                  file: relFile(state.repoRoot, file.file),
                  line: lineOf(file.sf, node),
                  via: 'fetch',
                });
                changed = true;
              }
            }
            continue;
          }
          if (ts.isIdentifier(arg) && nextFn) {
            const owner = findFnNode(file.sf, state.fns.get(nextFn)!);
            const indexOf = owner?.parameters.findIndex(
              (param) =>
                ts.isIdentifier(param.name) && param.name.text === arg.text
            );
            if (indexOf !== undefined && indexOf >= 0) {
              const key = `${nextFn}:${indexOf}`;
              const already = (extra.get(nextFn) ?? []).includes(indexOf);
              if (
                !already &&
                !byFn.get(nextFn)?.some((item) => item.paramIndex === indexOf)
              ) {
                const created = { fnId: nextFn, paramIndex: indexOf };
                const list = byFn.get(nextFn) ?? [];
                list.push(created);
                byFn.set(nextFn, list);
                extra.set(nextFn, [...(extra.get(nextFn) ?? []), indexOf]);
                changed = true;
              }
              void key;
            }
          }
        }
        ts.forEachChild(node, (child) => visit(child, nextFn));
      };
      visit(file.sf, null);
    }
  }
  return routes;
}

function allSdkRoutes(classes: Map<string, SdkClassInfo>): RouteRef[] {
  const cache = new Map<string, RouteRef[]>();
  const out: RouteRef[] = [];
  for (const [className, info] of classes) {
    for (const method of info.methods.keys()) {
      out.push(...routesReached(classes, className, method, cache, new Set()));
    }
  }
  return dedupeRoutes(out);
}

function pushEvidence(list: RouteEvidence[], evidence: RouteEvidence): void {
  const key = `${evidence.file}:${evidence.line}:${evidence.via}`;
  if (list.some((item) => `${item.file}:${item.line}:${item.via}` === key))
    return;
  list.push(evidence);
}

export function collectSdkDataRouteUsage(): DataRouteUsage[] {
  const { appSrc, sdkSrc, repoRoot } = roots();
  const sdkFiles: string[] = [];
  const appFiles: string[] = [];
  walkFiles(sdkSrc, sdkFiles);
  walkFiles(appSrc, appFiles);
  const { classes, clientSurface } = indexSdk(sdkFiles);
  const appIndex = indexApp(appFiles, appSrc);
  const state: CollectState = {
    classes,
    clientSurface,
    routeCache: new Map(),
    fns: appIndex.fns,
    filesByPath: new Map(appIndex.files.map((file) => [file.file, file])),
    hits: [],
    edges: [],
    conduits: [],
    fetchRoutes: [],
    repoRoot,
  };
  collectApp(appIndex, state, appSrc);
  const bundle = clientBundleFrom(appIndex.files, appSrc);
  const hits = propagate(state, bundle);
  const fetched = propagateConduits(state, appIndex);

  const usage = new Map<string, DataRouteUsage>();
  const ensure = (route: RouteRef): DataRouteUsage => {
    const key = `${route.http} ${route.path}`;
    let row = usage.get(key);
    if (!row) {
      row = {
        http: route.http,
        path: route.path,
        browser: [],
        server: [],
        dormant: [],
      };
      usage.set(key, row);
    }
    return row;
  };
  for (const route of allSdkRoutes(classes)) ensure(route);
  for (const hit of hits) {
    const row = ensure(hit.route);
    const evidence = { file: hit.file, line: hit.line, via: hit.via };
    if (hit.lane.kind === 'browser') pushEvidence(row.browser, evidence);
    else if (hit.lane.kind === 'server') pushEvidence(row.server, evidence);
    else if (hit.lane.kind === 'param' && hit.lane.name === '__dormant__') {
      pushEvidence(row.dormant, evidence);
    }
  }
  for (const route of fetched) {
    const row = ensure(route);
    pushEvidence(row.browser, {
      file: route.file,
      line: route.line,
      via: route.via,
    });
  }
  return [...usage.values()].sort((a, b) => a.path.localeCompare(b.path));
}
