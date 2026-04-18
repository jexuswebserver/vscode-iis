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
│   ├── CompletionHandler.cs           # Completion provider
│   ├── HoverHandler.cs                # Hover provider
│   ├── DiagnosticsHandler.cs          # Validation provider
│   └── TextDocumentSyncHandler.cs     # Document sync (open/change/close)
├── Schema/
│   ├── SchemaLoader.cs                # Loads IIS schema files
│   └── SchemaCache.cs                 # In-memory schema cache
└── Language/
    └── XmlPositionAnalyzer.cs         # Cursor position analysis
```

**Framework**: Uses CppCXY's LanguageServer.Framework for LSP protocol handling.

### 3. Foundation: JexusManager

The JexusManager submodule provides:
- **Microsoft.Web.Administration**: Proven C# library for IIS schema parsing and validation
- **ConfigurationElementSchema**: Element schema model
- **ConfigurationAttributeSchema**: Attribute schema model with type information
- **Type Validators**: Built-in parsers for bool, enum, int, string, timeSpan types

**Approach**: Directly use JexusManager's C# classes to load and parse IIS schema files at runtime.

## Implementation Plan

### Phase 1: Fix Syntax Highlighting

**Files to Modify**:
- `package.json` - Add grammar contribution
- Create `syntaxes/iis-config.tmLanguage.json`

**Solution**: Map `iis-config` language to XML grammar scope.

### Phase 2: Schema Loading

**Files to Create**:
- `JexusManager/IIS.LanguageServer/Schema/SchemaLoader.cs` - Use Microsoft.Web.Administration to load schema files from:
  1. `C:\Program Files\IIS Express\config\schema` (primary)
  2. `C:\Program Files (x86)\IIS Express\config\schema`
  3. `C:\Windows\System32\inetsrv\config\schema` (fallback)

**Approach**: Leverage JexusManager's existing `FileContext.LoadSchemasFromMode()` and `LoadSchema()` patterns.

### Phase 3: Schema Cache

**Files to Create**:
- `JexusManager/IIS.LanguageServer/Schema/SchemaCache.cs` - In-memory cache of parsed IIS schemas

**Core Usage**:
- Use JexusManager's `ConfigurationElementSchema`, `ConfigurationAttributeSchema` directly
- Cache parsed `SectionSchema` objects (element hierarchies with attribute definitions)
- Provide lookup methods: GetElement(path), GetAttribute(elementPath, attrName)

### Phase 4: XML Position Analysis

**Files to Create**:
- `JexusManager/IIS.LanguageServer/Language/XmlPositionAnalyzer.cs`

Given a cursor position in a document, determine:
- Current element path (e.g., `configuration/system.webServer/security`)
- Context (element tag, attribute name, attribute value)

### Phase 5: LSP Handlers

**Files to Create**:
- `JexusManager/IIS.LanguageServer/Handlers/CompletionHandler.cs`
  - Suggest child elements based on schema
  - Suggest attribute names
  - Suggest enum values for enum attributes

- `JexusManager/IIS.LanguageServer/Handlers/HoverHandler.cs`
  - Show attribute type, required status, default value, description

- `JexusManager/IIS.LanguageServer/Handlers/DiagnosticsHandler.cs`
  - Validate required attributes
  - Validate attribute types/enums
  - Report unknown attributes/elements

- `JexusManager/IIS.LanguageServer/Handlers/TextDocumentSyncHandler.cs`
  - Handle didOpen, didChange, didClose notifications

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
│   │   ├── Program.cs            # Entry point
│   │   ├── Handlers/
│   │   │   ├── CompletionHandler.cs
│   │   │   ├── HoverHandler.cs
│   │   │   ├── DiagnosticsHandler.cs
│   │   │   └── TextDocumentSyncHandler.cs
│   │   ├── Schema/
│   │   │   ├── SchemaLoader.cs
│   │   │   └── SchemaCache.cs
│   │   └── Language/
│   │       └── XmlPositionAnalyzer.cs
│   ├── Microsoft.Web.Administration/
│   └── Microsoft.Web.Configuration.AppHostFileProvider/
└── LanguageServer.Framework/ (submodule)
```

## Key References from JexusManager

C# classes to leverage for schema loading and parsing:
- `FileContext.cs`: `LoadSchemasFromMode()`, `LoadSchema()` - schema file discovery and loading
- `SectionSchema.cs`: `ParseSectionSchema()` - recursive schema parsing and building element hierarchies
- `ConfigurationElementSchema.cs` - element schema model with attributes and child elements
- `ConfigurationAttributeSchema.cs` - attribute schema model with type information, validation, default values

## Dependencies

**C# (.NET 9.0)**:
- LanguageServer.Framework (submodule) - LSP protocol implementation
- Microsoft.Web.Administration (from JexusManager) - IIS schema parsing
- Microsoft.Web.Configuration.AppHostFileProvider (from JexusManager) - IIS config file access

**NPM (VSCode Extension Client)**:
- `vscode-languageclient@^9.0.1` - LSP client for VSCode

## Implementation Status

- ✅ **Phase 1**: XML syntax highlighting fixed (TextMate grammar added)
- ✅ **Program.cs**: Minimal LSP server skeleton in place using LanguageServer.Framework
- ⏳ **Phase 2-3**: Schema loader and cache implementation (C#)
- ⏳ **Phase 4**: XML position analyzer implementation (C#)
- ⏳ **Phase 5**: LSP handlers (Completion, Hover, Diagnostics, TextSync) implementation (C#)
- ⏳ **Phase 5b**: Wire VSCode extension client to launch C# server executable

## Next Steps

1. Implement IIS schema loader (Phase 2) - Use JexusManager's FileContext and schema loading patterns
2. Implement schema cache (Phase 3) - Cache parsed SectionSchema objects
3. Implement XML position analyzer (Phase 4) - Determine cursor context in documents
4. Implement LSP handlers (Phase 5) - Completions, hover, diagnostics, text sync
5. Wire extension.ts to launch C# server - Create LanguageClient, spawn server executable
6. Test completions, hover, and validation with real IIS config files
