# IIS Configuration Language Server Design

## Overview

This document describes the design for restoring XML syntax highlighting and building an IIS configuration-aware language server for VSCode. The language server will provide IntelliSense, validation, and hover documentation based on IIS schema files.

## Problem Statement

1. **Lost XML Syntax Highlighting**: When the extension is installed, `.config` files are mapped to the `iis-config` language, which has no grammar definition. This causes loss of XML syntax highlighting.
2. **No Configuration IntelliSense**: The extension currently provides no IntelliSense, validation, or hover documentation for IIS configuration files.

## Design Goals

- Restore XML syntax highlighting for `.config` files
- Provide context-aware completions for IIS configuration elements and attributes
- Validate configuration files against IIS schema
- Display hover documentation with attribute descriptions and type information
- Support both IIS Express (primary) and full IIS (fallback) schema files

## Architecture

### 1. Client-Side (VSCode Extension)

**File**: `src/extension.ts`, `package.json`

- Register `iis-config` language with XML grammar
- Start the C# language server executable when extension activates
- Send document open/change events to server via LSP over stdio

### 2. Language Server (C# .NET)

**Directory**: `JexusManager/IIS.LanguageServer/`

The server is a self-contained .NET 9.0 console application implementing the Language Server Protocol:

```
JexusManager/IIS.LanguageServer/
├── Program.cs                          # Entry point, LSP server initialization
├── Handlers/
│   ├── CompletionHandler.cs           # Completion provider (IISCompletionHandler)
│   ├── HoverHandler.cs                # Hover provider (IISHoverHandler)
│   ├── DefinitionHandler.cs           # Go-to-definition provider (IISDefinitionHandler)
│   ├── DiagnosticsHandler.cs          # Validation provider (stub — not yet wired to LSP)
│   └── TextDocumentSyncHandler.cs     # Document sync (open/change/close)
├── Schema/
│   ├── SchemaLoader.cs                # Finds IIS schema files on disk
│   └── SchemaCache.cs                 # Facade over LanguageServerSchemaService
└── Language/
    ├── XmlPositionAnalyzer.cs         # Cursor position analysis (element path, context type)
    └── XmlCursorContext.cs            # XmlCursorLocator + XmlCursorContext record + XmlTokenKind
```

**Framework**: Uses [EmmyLua/LanguageServer.Framework](https://github.com/CppCXY/EmmyLuaAnalyzer) for LSP protocol handling (namespace `EmmyLua.LanguageServer.Framework`).

### 3. Foundation: JexusManager

The JexusManager submodule (`Microsoft.Web.Administration`) provides the complete IIS schema system. The language server must be a **consumer** of this library — it must not duplicate schema parsing logic.

**Key classes and their roles:**

| Class | Location | Role |
|-------|----------|------|
| `FileContext` | `FileContext.cs` | Internal: loads schema files, owns `_sectionSchemas` dictionary |
| `SectionSchema` | `SectionSchema.cs` | Internal: parses `<sectionSchema>` elements into a root `ConfigurationElementSchema` |
| `ConfigurationElementSchema` | `ConfigurationElementSchema.cs` | Public: schema for one XML element — holds `AttributeSchemas`, `ChildElementSchemas`, `CollectionSchema` |
| `ConfigurationAttributeSchema` | `ConfigurationAttributeSchema.cs` | Public: schema for one attribute — type, required, default, enum values, validator |
| `ConfigurationCollectionSchema` | `ConfigurationCollectionSchema.cs` | Public: schema for add/remove/clear collections |
| `SectionGroup` / `SectionDefinition` | `SectionGroup.cs` / `SectionDefinition.cs` | Public: section catalog with `AllowDefinition`, `OverrideModeDefault` |
| `ValidatorRegistry` | `ValidatorRegistry.cs` | Internal: discovers validator types by reflection |
| `ConfigurationValidatorBase` | subclasses | Internal: per-attribute validation (range, name, path, non-empty, etc.) |

**Embedded schema resources** (fallback when IIS Express/IIS is not installed):

```
Microsoft.Web.Administration/Resources/
├── IIS_schema.xml          # Core IIS sections
├── FX_schema.xml           # ASP.NET / .NET Framework sections
└── rewrite_schema.xml      # URL Rewrite module sections
```

### 4. The Missing Bridge: `LanguageServerSchemaService` + `LanguageServerSymbol`

`SchemaCache` references `LanguageServerSchemaService` and `LanguageServerSymbol` / `LanguageServerSymbolKind` — these **do not yet exist** and are the primary implementation gap.

**`LanguageServerSymbol`** is a plain data record carrying everything needed to render hover text or jump to definition:

```csharp
public record LanguageServerSymbol(
    LanguageServerSymbolKind Kind,
    string Name,
    string Path,
    string? ParentPath,
    string? Type,
    string? DefaultValue,
    bool Required,
    IReadOnlyList<string> EnumValues,
    string? FilePath,
    int LineNumber
);

public enum LanguageServerSymbolKind
{
    Unknown,
    SectionGroup,
    Section,
    Element,
    CollectionItem,
    Attribute,
    EnumValue
}
```

**`LanguageServerSchemaService`** wraps `Microsoft.Web.Administration` schema classes to answer LSP queries. It **must not replicate** `FileContext`'s schema parsing logic. `SectionSchema` and related classes are `internal` — expose them to `IIS.LanguageServer` via `[InternalsVisibleTo]` in `Microsoft.Web.Administration` rather than reflection or API surface changes:

```csharp
// In Microsoft.Web.Administration/AssemblyInfo.cs (or Properties/AssemblyInfo.cs)
[assembly: InternalsVisibleTo("IIS.LanguageServer")]
```

This gives `IIS.LanguageServer` direct compiled access to all `internal` types and members without touching the public API.

```csharp
// Lives in IIS.LanguageServer/Schema/LanguageServerSchemaService.cs
public class LanguageServerSchemaService
{
    // Directly calls internal SectionSchema.ParseSectionSchema() — no reflection needed
    public LanguageServerSchemaService(IEnumerable<string> schemaFiles) { ... }

    public IEnumerable<string> GetChildElementNames(string elementPath) { ... }
    public IEnumerable<string> GetAttributeNames(string elementPath) { ... }
    public string? GetAttributeType(string elementPath, string attributeName) { ... }
    public IEnumerable<string> GetAttributeValues(string elementPath, string attributeName) { ... }

    public LanguageServerSymbol? ResolveElement(string elementPath) { ... }
    public LanguageServerSymbol? ResolveAttribute(string elementPath, string attributeName) { ... }
    public LanguageServerSymbol? ResolveAttributeValue(string elementPath, string attributeName, string? value) { ... }
}
```

**Bootstrap sequence** using internal access:

```csharp
// 1. Load each schema XDocument with line info
var doc = XDocument.Load(filePath, LoadOptions.SetLineInfo);

// 2. For each <sectionSchema> element call internal SectionSchema.ParseSectionSchema()
//    (accessible because of [InternalsVisibleTo("IIS.LanguageServer")])
foreach (var sectionElement in doc.Descendants("sectionSchema"))
{
    var sectionSchema = SectionSchema.ParseSectionSchema(sectionElement, filePath);
    // sectionSchema.Root is ConfigurationElementSchema (public type)
    _schemas[sectionSchema.Name] = sectionSchema;
}

// 3. Walk public ConfigurationElementSchema / ConfigurationAttributeSchema APIs
//    (AttributeSchemas, ChildElementSchemas, CollectionSchema, GetEnumValues(), etc.)
```

`ConfigurationElementSchema` and `ConfigurationAttributeSchema` are **public** classes, so schema traversal after bootstrap uses normal compiled code.

**`LanguageServerSymbol`** and **`LanguageServerSymbolKind`** live in `IIS.LanguageServer` (the only change to `Microsoft.Web.Administration` is adding `[InternalsVisibleTo]`).

## Implementation Plan

### Phase 1: Fix Syntax Highlighting ✅

**Files to Modify**:
- `package.json` - Add grammar contribution
- Create `syntaxes/iis-config.tmLanguage.json`

**Solution**: Map `iis-config` language to XML grammar scope.

### Phase 2: Schema File Discovery ✅

**File**: `JexusManager/IIS.LanguageServer/Schema/SchemaLoader.cs`

`SchemaLoader.FindSchemaFiles()` already locates `*_schema.xml` files from:
1. `%ProgramFiles%\IIS Express\config\schema` (primary)
2. `%ProgramFiles(x86)%\IIS Express\config\schema`
3. `%SystemRoot%\System32\inetsrv\config\schema`

**Gap**: Does not fall back to embedded resources (`Microsoft.Web.Administration/Resources/*.xml`) when no IIS install is present. This is important for environments that only have the extension installed.

### Phase 3: Schema Bridge — `LanguageServerSchemaService` ⏳

**Files to Create**: Add to `Microsoft.Web.Administration` project (not to `IIS.LanguageServer`):
- `LanguageServerSchemaService.cs`
- `LanguageServerSymbol.cs`

**How schema loading must work**:

```
SchemaLoader.FindSchemaFiles()
    → list of *.xml file paths
    → SchemaCache(files)
    → LanguageServerSchemaService(files)
    → for each file: parse <sectionSchema> elements via SectionSchema.ParseSectionSchema()
    → store Dictionary<string, SectionSchema> keyed by section path
    → element lookups walk: sectionSchemas[sectionPath].Root.FindSchema(subPath)
```

**Key `ConfigurationElementSchema` traversal**:
- `element.AttributeSchemas` — attribute names and their `ConfigurationAttributeSchema`
- `element.ChildElementSchemas` — child element names and their `ConfigurationElementSchema`
- `element.CollectionSchema` — if non-null, add/remove/clear element names + the add-element's attribute schemas
- `attribute.GetEnumValues()` — for enum/flags types, returns `ConfigurationEnumValueCollection`
- `attribute.Type` — `"bool"`, `"enum"`, `"flags"`, `"uint"`, `"int"`, `"int64"`, `"string"`, `"timeSpan"`
- `attribute.IsRequired`, `attribute.DefaultValue`

**`LanguageServerSymbol` source locations**: `SectionSchema` (and each element/attribute node within it) should carry `FilePath` + `LineNumber` so the Definition handler can jump to the exact line in the schema XML file.

### Phase 4: Schema Cache Facade ✅ (scaffolded)

**File**: `JexusManager/IIS.LanguageServer/Schema/SchemaCache.cs`

`SchemaCache` is already scaffolded as a thin facade. Once `LanguageServerSchemaService` exists in `Microsoft.Web.Administration`, `SchemaCache` will compile and work.

### Phase 5: XML Position Analysis ✅

**Files**: `JexusManager/IIS.LanguageServer/Language/XmlPositionAnalyzer.cs` + `XmlCursorContext.cs`

Two complementary classes:

- **`XmlPositionAnalyzer.GetContext(text, offset)`** — returns `XmlContext` with:
  - `ElementPath`: `/`-joined stack of open tags (e.g. `configuration/system.webServer/security`)
  - `CurrentElementName`, `CurrentAttributeName`, `CurrentAttributeValue`
  - `ContextType`: `ElementTag | AttributeName | AttributeValue | ElementContent | Unknown`

- **`XmlCursorLocator.Locate(text, line, character)`** — returns `XmlCursorContext` with:
  - The `XmlContext` above
  - `TokenKind`: `ElementName | AttributeName | AttributeValue | None`
  - `TokenText`: the exact token under the cursor
  - `StartCharacter` / `EndCharacter`: for range-based `TextEdit` in completions

**Known limitation**: uses regex-based parsing. Malformed XML (unclosed tags, mismatched nesting) can produce incorrect element paths. This is acceptable for the current scope.

### Phase 6: LSP Handlers

#### TextDocumentSyncHandler ✅ (scaffolded)

Handles `didOpen`, `didChange`, `didClose`. Maintains an in-memory `Dictionary<string, string>` of URI → document text. Exposes `GetDocumentContent(uri)`.

#### CompletionHandler ✅ (scaffolded)

`IISCompletionHandler` — already wired to `SchemaCache` and `XmlCursorLocator`. Logic:
1. If `ContextType == AttributeValue` → `SchemaCache.GetAttributeValues(path, attrName)` → `CompletionItemKind.Value`
2. Otherwise → `SchemaCache.GetChildElementNames(path)` → `CompletionItemKind.Struct`
3. Otherwise → `SchemaCache.GetAttributeNames(path)` → `CompletionItemKind.Property` with `attr=""`

**Gap**: Steps 2 and 3 are not mutually exclusive — both run even when inside a tag. Should check `ContextType` / `TokenKind` to avoid mixing element and attribute completions.

#### HoverHandler ✅ (scaffolded)

`IISHoverHandler` — resolves a `LanguageServerSymbol` from `SchemaCache` and formats it as Markdown:
- Section/element: path
- Attribute: type, default, required, allowed enum values
- Attribute value: which enum value it is
- All: schema file link + line number (Go-to-Definition hint)

#### DefinitionHandler ✅ (scaffolded)

`IISDefinitionHandler` — jumps to the exact line in the schema XML file. Requires `LanguageServerSymbol.FilePath` and `LanguageServerSymbol.LineNumber` to be populated by `LanguageServerSchemaService`.

#### DiagnosticsHandler ⏳ (stub)

`DiagnosticsHandler.ValidateDocument()` is an empty stub. It is **not yet registered** with the LSP server (not added in `Program.cs`). To implement:
- Parse document XML with `XDocument.Load()`
- Walk elements and validate against `SchemaCache`
- Use `ConfigurationValidatorBase` subclasses (via `ConfigurationAttributeSchema.CreateValidator()`) for per-attribute validation
- Push `PublishDiagnosticsParams` via the LSP server's notification mechanism

### Phase 7: Wire Extension Client to Server ⏳

**File**: `src/extension.ts`, `package.json`

- Create `LanguageClient` (from `vscode-languageclient`) that spawns the compiled C# executable
- Pass `--stdio` flag
- Register for `iis-config` language documents
- Handle server lifecycle (start on activate, stop on deactivate)

## File Structure

```
vscode-iis/
├── docs/DESIGN.md (this file)
├── src/
│   ├── extension.ts              # VSCode extension client, LSP client initialization
│   ├── iis/
│   │   ├── jexusManager.ts
│   │   ├── configFinder.ts
│   │   └── selector.ts
│   └── util/
│       ├── configuration.ts
│       ├── constants.ts
│       ├── logger.ts
│       └── messages.ts
├── syntaxes/iis-config.tmLanguage.json
├── package.json
├── JexusManager/ (submodule)
│   ├── IIS.LanguageServer/
│   │   ├── Program.cs                      # Entry point; wires all handlers
│   │   ├── Handlers/
│   │   │   ├── CompletionHandler.cs        # IISCompletionHandler
│   │   │   ├── HoverHandler.cs             # IISHoverHandler
│   │   │   ├── DefinitionHandler.cs        # IISDefinitionHandler
│   │   │   ├── DiagnosticsHandler.cs       # stub, not wired to LSP yet
│   │   │   └── TextDocumentSyncHandler.cs
│   │   ├── Schema/
│   │   │   ├── SchemaLoader.cs             # FindSchemaFiles() — disk discovery
│   │   │   ├── SchemaCache.cs              # Facade over LanguageServerSchemaService
│   │   │   ├── LanguageServerSchemaService.cs  # TO CREATE — schema query (uses internal MWA types)
│   │   │   ├── LanguageServerSymbol.cs         # TO CREATE — hover/definition data record
│   │   │   └── LanguageServerSymbolKind.cs     # TO CREATE — enum
│   │   └── Language/
│   │       ├── XmlPositionAnalyzer.cs      # GetContext() — element path + ContextType
│   │       └── XmlCursorContext.cs         # XmlCursorLocator.Locate() + XmlTokenKind
│   ├── Microsoft.Web.Administration/
│   │   ├── Properties/AssemblyInfo.cs      # ADD [InternalsVisibleTo("IIS.LanguageServer")]
│   │   ├── FileContext.cs                  # internal schema loading
│   │   ├── SectionSchema.cs                # internal schema parsing
│   │   ├── ConfigurationElementSchema.cs
│   │   ├── ConfigurationAttributeSchema.cs
│   │   ├── ConfigurationCollectionSchema.cs
│   │   └── Resources/
│   │       ├── IIS_schema.xml
│   │       ├── FX_schema.xml
│   │       └── rewrite_schema.xml
│   └── Microsoft.Web.Configuration.AppHostFileProvider/
└── LanguageServer.Framework/ (submodule)    # EmmyLua.LanguageServer.Framework
```

## Key JexusManager APIs for Schema Queries

### Element traversal

```csharp
// Get the root element schema for a section (e.g., "system.webServer/defaultDocument")
ConfigurationElementSchema? root = sectionSchema.Root;

// Walk to a sub-element (e.g., "files")
ConfigurationElementSchema? child = root.ChildElementSchemas["files"];

// Collection items (add/remove/clear)
ConfigurationCollectionSchema? coll = root.CollectionSchema;
ConfigurationElementSchema? addSchema = coll?.GetAddElementSchema("add");

// Attributes on an element
foreach (ConfigurationAttributeSchema attr in element.AttributeSchemas)
{
    string name = attr.Name;
    string type = attr.Type;          // bool|enum|flags|uint|int|int64|string|timeSpan
    string? def = attr.DefaultValue;
    bool req  = attr.IsRequired;
    // enum/flags values:
    foreach (ConfigurationEnumValue v in attr.GetEnumValues())
        Console.WriteLine(v.Name);
}
```

### `LanguageServerSchemaService` responsibilities

| Method | JexusManager API used |
|--------|----------------------|
| `GetChildElementNames(path)` | `element.ChildElementSchemas` names + collection add-element names |
| `GetAttributeNames(path)` | `element.AttributeSchemas` names (+ add-element schemas for collection paths) |
| `GetAttributeType(path, attr)` | `ConfigurationAttributeSchema.Type` |
| `GetAttributeValues(path, attr)` | `ConfigurationAttributeSchema.GetEnumValues()` |
| `ResolveElement(path)` | Builds `LanguageServerSymbol` from `ConfigurationElementSchema` |
| `ResolveAttribute(path, attr)` | Builds `LanguageServerSymbol` from `ConfigurationAttributeSchema` |
| `ResolveAttributeValue(path, attr, value)` | Finds `ConfigurationEnumValue` by name |

### Source location tracking

`SectionSchema` is parsed from XML via `XDocument`. Nodes have `IXmlLineInfo` when loaded with `LoadOptions.SetLineInfo`. Both `LanguageServerSchemaService` and `SectionSchema.ParseSectionSchema()` should capture `FilePath` and `LineNumber` from `IXmlLineInfo` so `LanguageServerSymbol` can carry them for Definition navigation.

## Dependencies

**C# (.NET 9.0)**:
- `EmmyLua.LanguageServer.Framework` (submodule at `LanguageServer.Framework/`) — LSP protocol
- `Microsoft.Web.Administration` (from JexusManager submodule) — IIS schema parsing
- `Microsoft.Web.Configuration.AppHostFileProvider` (from JexusManager) — IIS config file access

**NPM (VSCode Extension Client)**:
- `vscode-languageclient@^9.0.1` — LSP client for VSCode

## Implementation Status

| Phase | Component | Status |
|-------|-----------|--------|
| 1 | XML syntax highlighting | ✅ Done |
| 2 | Schema file discovery (`SchemaLoader`) | ✅ Done (missing embedded-resource fallback) |
| 3 | `LanguageServerSchemaService` + `LanguageServerSymbol` | ⏳ **Not started — primary gap** |
| 4 | `SchemaCache` facade | ✅ Scaffolded (blocked by Phase 3) |
| 5 | XML position analysis (`XmlPositionAnalyzer`, `XmlCursorLocator`) | ✅ Done |
| 6a | `TextDocumentSyncHandler` | ✅ Scaffolded |
| 6b | `CompletionHandler` | ✅ Scaffolded (blocked by Phase 3) |
| 6c | `HoverHandler` | ✅ Scaffolded (blocked by Phase 3) |
| 6d | `DefinitionHandler` | ✅ Scaffolded (blocked by Phase 3) |
| 6e | `DiagnosticsHandler` | ⏳ Stub, not wired to LSP |
| 7 | Extension client → server wiring | ⏳ Not started |

## Next Steps (priority order)

1. **Add `[InternalsVisibleTo("IIS.LanguageServer")]` to `Microsoft.Web.Administration`**
   - Minimal change: one attribute in `AssemblyInfo.cs`; no API surface change; existing unit tests unaffected

2. **Implement `LanguageServerSchemaService` + `LanguageServerSymbol` in `IIS.LanguageServer`**
   - Call internal `SectionSchema.ParseSectionSchema()` directly
   - Capture `FilePath` + `LineNumber` from `IXmlLineInfo` on schema XML nodes
   - Wire through `SchemaCache`

2. **Add embedded-resource fallback to `SchemaLoader`**
   - If no IIS Express / IIS schema folder found, extract `IIS_schema.xml`, `FX_schema.xml`, `rewrite_schema.xml` from assembly resources

3. **Fix `CompletionHandler` context discrimination**
   - Only suggest child elements when `ContextType == ElementContent`
   - Only suggest attributes when `ContextType == AttributeName` (inside a tag, past element name)

4. **Implement `DiagnosticsHandler` and wire to LSP**
   - Parse document with `XDocument`; validate each element/attribute against `SchemaCache`
   - Push `PublishDiagnosticsParams` after `didOpen` / `didChange`

5. **Wire `extension.ts` to launch C# server**
   - Create `LanguageClient`, spawn server executable, register for `iis-config` documents

6. **End-to-end test with real IIS config files**
   - Completions, hover, go-to-definition, diagnostics
