# vscode-iis Developer Guide

## Repository Structure

- `src/` — VS Code extension (TypeScript)
- `JexusManager/` — Git submodule containing C# projects:
  - `Microsoft.Web.Administration/` — IIS schema parser and config model
  - `IIS.LanguageServer/` — Language server binary (LSP, .NET 9.0, win-x64)
  - `IIS.LanguageServer.Tests/` — xUnit test project for the language server
  - `LanguageServer.Framework/` — EmmyLua LSP framework (forked)

## Language Server Architecture

### Schema Layer (`Microsoft.Web.Administration`)

The schema system is built on top of existing JexusManager types. The key internal class is `LanguageServerSchemaService` (`Microsoft.Web.Administration/LanguageServerSchemaService.cs`), which bridges raw `SectionSchema`/`ConfigurationElementSchema`/`ConfigurationAttributeSchema` objects to language server queries.

**Schema resolution flow:**
1. `SchemaLoader.FindSchemaFiles()` discovers `*_schema.xml` from IIS Express x64/x86 or full IIS (`System32/inetsrv/config/schema`)
2. If none found, `SchemaLoader.GetEmbeddedSchemaFiles()` writes embedded resources (`IIS_schema.xml`, `FX_schema.xml`, `rewrite_schema.xml`) to `%TEMP%/iis-language-server-schemas/`
3. `LanguageServerSchemaService` loads all files, plus an inline `configBuilders` schema
4. `SchemaCache` wraps `LanguageServerSchemaService` and is injected into all handlers

**Path normalization:** Element paths always strip the leading `configuration/` prefix. So `configuration/system.webServer/handlers` becomes `system.webServer/handlers` internally.

**`allowUnrecognizedAttributes`:** The schema XML attribute `allowUnrecognizedAttributes="true"` on collection elements (e.g. `configProtectedData/providers/add`) means extra attributes are valid. `SchemaCache.GetAllowUnrecognizedAttributes(elementPath)` returns `true` for unknown paths (lenient) and `true` when the schema declares it. The diagnostics handler must check this before reporting unknown attribute warnings.

**InternalsVisibleTo:** `Microsoft.Web.Administration` exposes its internals to `IIS.LanguageServer` via `[InternalsVisibleTo("IIS.LanguageServer", PublicKey=...")]` in `Microsoft.Web.Administration/Properties/AssemblyInfo.cs`. Do not change the public API surface — use this mechanism instead.

### Cursor / Position Layer

Two classes work together to map LSP positions to XML context:

- `XmlPositionAnalyzer` — parses the raw XML text into a position-indexed token tree
- `XmlCursorLocator` — given a `(line, character)` position, determines:
  - `ElementPath` — e.g. `configuration/system.webServer/handlers/add`
  - `ContextType` — `ElementTag`, `AttributeName`, `AttributeValue`, `ElementContent`
  - `TokenKind` — `ElementName`, `AttributeName`, `AttributeValue`, etc.
  - `CurrentToken` — the token string under the cursor

### LSP Handlers

All handlers are in `IIS.LanguageServer/Handlers/`. They receive `SchemaCache` and `TextDocumentSyncHandler` via constructor injection.

| Handler | LSP Feature | Key method |
|---|---|---|
| `IISCompletionHandler` | `textDocument/completion` | `GetCompletionResponse(text, line, char)` |
| `IISHoverHandler` | `textDocument/hover` | `GetHoverResponse(text, line, char)` |
| `IISDefinitionHandler` | `textDocument/definition` | `GetDefinitionResponse(text, line, char)` |
| `DiagnosticsHandler` | Push diagnostics | `ValidateDocument(text, uri)` / `CollectDiagnostics(text)` |

### Namespace Collision

The project name `IIS.LanguageServer` creates a namespace that shadows `EmmyLua.LanguageServer.Framework.Server.LanguageServer`. Always use the type alias in files that reference the server type:

```csharp
using LspServer = EmmyLua.LanguageServer.Framework.Server.LanguageServer;
```

This is required in `DiagnosticsHandler.cs`, `TextDocumentSyncHandler.cs`, and `Program.cs`.

### Diagnostics Handler

`DiagnosticsHandler` is push-based: it is called by `TextDocumentSyncHandler` on open/change, and pushes results via `_server.Client.PublishDiagnostics(...)`. The server reference is injected after construction via `SetServer(LspServer)`.

Validation checks (in order):
1. XML parse error → `DiagnosticSeverity.Error`, source `"xml"`
2. Root element must be `<configuration>` → skip if not
3. For each element: unknown attributes → `DiagnosticSeverity.Warning`, source `"iis-schema"` (skipped if `allowUnrecognizedAttributes`, or if it's a lock attribute)
4. Invalid enum values → `DiagnosticSeverity.Error`, source `"iis-schema"`
5. Missing required attributes → `DiagnosticSeverity.Error`, source `"iis-schema"`

**Lock attributes are always skipped** — `lockAttributes`, `lockAllAttributesExcept`, `lockElements`, `lockAllElementsExcept`, `lockItem` are valid on any IIS configuration element but never appear in schema files (they are handled by IIS infrastructure). `IsLockAttribute()` in `DiagnosticsHandler` gates this.

## Unit Testing

### Test Project

`IIS.LanguageServer.Tests/IIS.LanguageServer.Tests.csproj` — xUnit 2.9.3 + FluentAssertions 6.12.1, signed with `Jexus.snk`.

Run all tests:
```
dotnet test JexusManager/IIS.LanguageServer.Tests/IIS.LanguageServer.Tests.csproj
```

### Test Fixtures

**`SchemaCacheFixture.Create()`** — creates a `SchemaCache` from `Fixtures/IIS_schema.xml` only. Use this for all handler tests.

**`TestFixtureDocument.LoadWithCursor(filePath, needle, offset)`** — finds `needle` in the fixture file and returns `(Text, Line, Character)` where the cursor is at `needle position + offset`. Use this to position a cursor at a known token in `Fixtures/applicationhost.config`.

**`Fixtures/applicationhost.config`** — a real IIS Express applicationhost.config used as the primary test document. Key locations:
- `managedPipelineMode="Integrated"` — enum attribute for completion/hover tests
- `configProtectedData/providers/add` with `description` attribute — tests `allowUnrecognizedAttributes`

### Handler Test Patterns

All handlers expose `internal` methods for direct testing (no LSP server needed):

```csharp
// Completion
var handler = new IISCompletionHandler(schemaCache, syncHandler);
var result = handler.GetCompletionResponse(documentText, line, character);
result.Items.Should().Contain(item => item.Label == "Integrated");

// Hover
var handler = new IISHoverHandler(schemaCache, syncHandler);
var result = handler.GetHoverResponse(documentText, line, character);
result.Contents.Value.Should().Contain("system.webServer/defaultDocument");

// Diagnostics (no server needed — CollectDiagnostics is testable directly)
var handler = new DiagnosticsHandler(schemaCache);
var result = handler.CollectDiagnostics(documentText);
result.Should().Contain(d => d.Severity == DiagnosticSeverity.Error);
```

### LSP Type Notes

- `Diagnostic.Message` is `StringOrMarkupContent` — use `.StringValue` to get the string: `d.Message.StringValue.Should().Contain("...")`
- `HoverResponse.Contents` is also `StringOrMarkupContent` — use `.Value`: `result.Contents.Value.Should().Contain("...")`
- `Diagnostic.Source` is a plain `string?`

### Diagnostics Testing

`DiagnosticsHandler.CollectDiagnostics(string documentText)` is an `internal` method that returns `List<Diagnostic>` without requiring a live LSP server. Use it directly in tests — do not call `ValidateDocument` (which requires a server reference).

Example covering the `allowUnrecognizedAttributes` regression:
```csharp
var handler = new DiagnosticsHandler(SchemaCacheFixture.Create());
var text = File.ReadAllText("Fixtures/applicationhost.config");
var result = handler.CollectDiagnostics(text);

// configProtectedData/providers/add has allowUnrecognizedAttributes="true"
result.Where(d =>
    d.Severity == DiagnosticSeverity.Warning &&
    d.Message.StringValue != null &&
    d.Message.StringValue.Contains("description") &&
    d.Message.StringValue.Contains("'add'"))
  .Should().BeEmpty();
```
