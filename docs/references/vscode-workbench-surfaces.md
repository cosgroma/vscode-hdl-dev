# VS Code Workbench References

This note captures the VS Code API and UX references that shape this extension's
UI decisions.

## Official References

- [Tree View API](https://code.visualstudio.com/api/extension-guides/tree-view)
  describes how extensions contribute tree views, `TreeDataProvider`s, view
  containers, view actions, and item context menus.
- [Testing API](https://code.visualstudio.com/api/extension-guides/testing)
  describes `TestController`, `TestItem`, run profiles, output publishing, and
  context menu contributions for test items.
- [Task Provider](https://code.visualstudio.com/api/extension-guides/task-provider)
  describes automatic task discovery and the tradeoff between `ShellExecution`,
  `ProcessExecution`, and `CustomExecution`.
- [Workspace Trust Extension Guide](https://code.visualstudio.com/api/extension-guides/workspace-trust)
  describes restricted-mode support and how trust-sensitive functionality should
  be disabled until the workspace is trusted.
- [UX Guidelines Overview](https://code.visualstudio.com/api/ux-guidelines/overview)
  describes the major workbench containers: Activity Bar, primary sidebar,
  secondary sidebar, editor, panel, and status bar.
- [Activity Bar UX](https://code.visualstudio.com/api/ux-guidelines/activity-bar)
  covers when to add a custom Activity Bar view container.
- [Sidebars UX](https://code.visualstudio.com/api/ux-guidelines/sidebars)
  recommends grouping related views, avoiding excessive view containers, and
  keeping sidebar views focused.
- [Views UX](https://code.visualstudio.com/api/ux-guidelines/views) recommends
  using tree views for structured data, keeping the number of views small, and
  limiting custom webview views.
- [Panel UX](https://code.visualstudio.com/api/ux-guidelines/panel) recommends
  panel views for supporting functionality and content that benefits from
  horizontal space.
- [Status Bar UX](https://code.visualstudio.com/api/ux-guidelines/status-bar)
  recommends short labels, one item where possible, and workspace-scoped items on
  the left.
- [Webviews UX](https://code.visualstudio.com/api/ux-guidelines/webviews)
  recommends using webviews only when native VS Code APIs are insufficient.
- [Command Palette UX](https://code.visualstudio.com/api/ux-guidelines/command-palette)
  recommends clear command names grouped by category.

## Surface Decisions

| Surface | Use in this extension |
| --- | --- |
| Command Palette | Universal entry point for setup, discovery, run, generate, and open commands. |
| Testing API | Primary surface for GHDL testbench discovery and execution. |
| Tree View API | Project, spec, artifact, and dependency explorers. |
| Activity Bar / Primary Sidebar | One custom HDL view container once we have multiple persistent HDL views. |
| Secondary Sidebar | Supported by letting users move views there; not a direct dependency. |
| Panel | Terminals, Output channels, and optional wide artifact/session summaries. |
| Editor | Open source files, JSON specs, generated SVGs, and logs. |
| Webview Panel | Interactive SVG preview only when plain editor display is not enough. |
| Status Bar | One compact dependency/run-state indicator. |

## Design Constraints From The References

- Prefer native surfaces before webviews.
- Keep view counts low; three to five views is a comfortable maximum.
- Use tree views for structured project/spec/artifact data.
- Avoid tree items whose only behavior is acting like buttons; use context
  actions and toolbar actions instead.
- Use the Testing API for testbenches because it already supplies run state,
  output, and familiar UI.
- Gate command execution and dependency installation behind Workspace Trust.
- Use process-style command execution where practical so arguments are explicit.
- Keep long-running logs out of bespoke sidebars; use terminal/output surfaces.
