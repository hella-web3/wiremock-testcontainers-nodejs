/**
 * The library's public API and where the examples use it – resolved with the TypeScript compiler,
 * not by text search: `wiremock.reset()` counts as a use of `StartedWiremockContainer.reset`
 * because the checker resolves it there, whatever the variable is called.
 */
import { dirname } from "node:path";
import ts from "typescript";

/** An export of the library, or a public member of an exported class. */
export interface ApiItem {
  /** `WiremockContainer`, or `WiremockContainer.withMappings`; constructors are `Class.constructor`. */
  readonly id: string;
  readonly kind: "class" | "function" | "variable" | "interface" | "type" | "member";
  /** Its declaration, for JSDoc. */
  readonly declaration: ts.Declaration;
}

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowJs: true,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  types: [],
};

/** TypeScript's own declaration files, parsed once: they never change, and parsing them dominates. */
const LIBRARY_FILES = new Map<string, ts.SourceFile | undefined>();

/** A program over `files`, with JSDoc parsed – TypeScript skips it by default. */
function createProgram(files: readonly string[], options: ts.CompilerOptions = COMPILER_OPTIONS): ts.Program {
  const host = ts.createCompilerHost(options, true);
  host.jsDocParsingMode = ts.JSDocParsingMode.ParseAll;
  const getSourceFile = host.getSourceFile.bind(host);
  const libraryDir = dirname(ts.getDefaultLibFilePath(options));
  host.getSourceFile = (fileName, languageVersion, ...rest) => {
    if (!fileName.startsWith(libraryDir)) return getSourceFile(fileName, languageVersion, ...rest);
    const key = `${fileName}\0${JSON.stringify(languageVersion)}`;
    if (!LIBRARY_FILES.has(key)) LIBRARY_FILES.set(key, getSourceFile(fileName, languageVersion, ...rest));
    return LIBRARY_FILES.get(key);
  };
  return ts.createProgram({ rootNames: files, options, host });
}

const KINDS: readonly [(node: ts.Node) => boolean, ApiItem["kind"]][] = [
  [ts.isClassDeclaration, "class"],
  [ts.isFunctionDeclaration, "function"],
  [ts.isVariableDeclaration, "variable"],
  [ts.isInterfaceDeclaration, "interface"],
  [ts.isTypeAliasDeclaration, "type"],
];

const isPublicMember = (member: ts.ClassElement): boolean =>
  (ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isConstructorDeclaration(member) || ts.isPropertyDeclaration(member)) &&
  !(member.name && ts.isPrivateIdentifier(member.name)) &&
  !(ts.getCombinedModifierFlags(member) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected));

/** `Class.member` of a class member declaration. */
const memberId = (className: string, member: ts.ClassElement): string =>
  `${className}.${ts.isConstructorDeclaration(member) ? "constructor" : (member.name as ts.PropertyName).getText()}`;

/** The declarations a symbol stands for, following import aliases. */
function declarationsOf(checker: ts.TypeChecker, symbol: ts.Symbol | undefined): readonly ts.Declaration[] {
  if (!symbol) return [];
  const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  return target.declarations ?? [];
}

/** The public API of the library whose entry point is `entry`, e.g. `src/index.ts`. */
export function publicApi(entry: string): ApiItem[] {
  const program = createProgram([entry]);
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entry);
  const module = source && checker.getSymbolAtLocation(source);
  if (!module) throw new Error(`${entry} is not a module`);
  return checker.getExportsOfModule(module).flatMap((symbol) => {
    const [declaration] = declarationsOf(checker, symbol);
    const kind = KINDS.find(([is]) => declaration && is(declaration))?.[1];
    if (!declaration || !kind) throw new Error(`unsupported export ${symbol.name}`);
    const items: ApiItem[] = [{ id: symbol.name, kind, declaration }];
    if (ts.isClassDeclaration(declaration)) {
      for (const member of declaration.members.filter(isPublicMember)) items.push({ id: memberId(symbol.name, member), kind: "member", declaration: member });
    }
    return items;
  });
}

/**
 * Which `api` items the `files` use: API id → files. `packages` maps the library's import
 * specifiers – its package name and subpaths – to its entry point, so the examples' imports
 * resolve to the source whatever is installed.
 */
export function apiUsage(files: readonly string[], api: readonly ApiItem[], packages: Readonly<Record<string, string>>): Map<string, string[]> {
  const ids = new Set(api.map(({ id }) => id));
  const sourceDir = dirname(api[0]?.declaration.getSourceFile().fileName ?? "");
  const paths = Object.fromEntries(Object.entries(packages).map(([name, entry]) => [name, [entry]]));
  const program = createProgram(files, { ...COMPILER_OPTIONS, paths });
  const checker = program.getTypeChecker();
  const usage = new Map<string, Set<string>>();
  const use = (id: string, file: string): void => {
    if (ids.has(id)) usage.set(id, (usage.get(id) ?? new Set()).add(file));
  };

  /** The API ids `declaration` stands for, if it is the library's. */
  const idsOf = (declaration: ts.Declaration): string[] => {
    if (!declaration.getSourceFile().fileName.startsWith(sourceDir)) return [];
    // A namespace import resolves to the source file itself, which has no parent.
    const parent = declaration.parent as ts.Node | undefined;
    if (parent && ts.isClassDeclaration(parent) && parent.name && ts.isClassElement(declaration)) return [memberId(parent.name.text, declaration)];
    const name = ts.getNameOfDeclaration(declaration);
    return name && ts.isIdentifier(name) ? [name.text] : [];
  };

  for (const file of files) {
    const source = program.getSourceFile(file);
    if (!source) throw new Error(`${file} could not be read`);
    const visit = (node: ts.Node): void => {
      // Imports and exports only name things; what counts is using them.
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
      if (ts.isIdentifier(node)) {
        for (const declaration of declarationsOf(checker, checker.getSymbolAtLocation(node))) {
          for (const id of idsOf(declaration)) use(id, file);
        }
      }
      if (ts.isNewExpression(node)) {
        for (const declaration of declarationsOf(checker, checker.getSymbolAtLocation(node.expression))) {
          for (const id of idsOf(declaration)) use(`${id}.constructor`, file);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return new Map([...usage].map(([id, users]) => [id, [...users].toSorted()]));
}

/** The text of every JSDoc `@example` in `files`, with the ` * ` margins removed. */
export function jsDocExamples(files: readonly string[]): { readonly file: string; readonly code: string }[] {
  const program = createProgram(files);
  return files.flatMap((file) => {
    const source = program.getSourceFile(file);
    if (!source) throw new Error(`${file} could not be read`);
    const examples: { file: string; code: string }[] = [];
    const visit = (node: ts.Node): void => {
      for (const tag of ts.getJSDocTags(node)) {
        if (tag.tagName.text === "example" && tag.parent.parent === node) {
          examples.push({ file, code: ts.getTextOfJSDocComment(tag.comment)?.trim() ?? "" });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return examples;
  });
}
