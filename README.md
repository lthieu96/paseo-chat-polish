# Chat Polish

A [Paseo](https://paseo.sh) plugin that redraws the agent chat as one quiet column, adds the One Dark Darker Mariana theme, and gives you a dashboard to tune it all with a live preview.

![The dashboard's Theme page](images/theme.png)

## What it does

- **Tool calls as single rows.** An icon, a verb that shows the state (Running, Ran), the command or file, and a short detail. Open a row for its diff, output or raw input and output. Failed calls keep their red status and follow the same row strength as other calls; hover or open a row to brighten it.
- **Diff wrapping.** Long diff lines scroll horizontally by default. Enable **Wrap diff lines** under **Tool calls** in the dashboard to wrap them to the available width.
- **Steps merged between replies.** The thoughts and tool calls before an answer fold into one row, such as "Edited 1 file and ran 1 command", which opens to each step.
- **Themes.** Pick one of Paseo's built-in themes or a Chat Polish one (Mariana, Paper, Dusk), or edit the colors with contrast checks. Fonts and sizes are set from the same page.
- **Rich text styles.** Three or four looks each for quotes, tables, code blocks, inline code, headings, lists, callouts and rules.
- **Diagrams.** Mermaid diagrams drawn by [Pele](https://pele.run) in the theme's colors, or by Paseo's mermaid with the same chart colors. Switch on the Rich text page, which previews both. A diagram left showing its source (Paseo's safety check rejects labels like `<id>`, or a render got stuck) has a redraw button that has Pele draw it as Paseo's own diagram, with zoom and full screen.
- **HTML pages (experimental).** Ask an agent to chart, visualize, simulate or mock up something and it draws an interactive page right in the chat, in the theme's colors, with local images (screenshots, generated images) inlined. With the optional headless browser installed, each page is laid out at desktop and phone widths before it shows, and the agent fixes overlapping or cut-off text, script errors or overflow it finds; an agent can also preview a page (canvas drawings, dense SVG) and see a screenshot before publishing it. Hover a page to open it full screen, in your browser, or copy its HTML. Off by default: turn it on in the dashboard's **HTML pages** tab, and download the headless browser there too if you want pages checked; agents created from then on get the tools.
- **Working indicator.** Paseo's dots, or a sparkle, spokes, dot ring, orb, matrix or snake loader.
- **Icon sets.** Paseo's Lucide icons, or Untitled UI or Hugeicons ones across the app (desktop and web). Icons without a twin stay Lucide.
- **Extras.** Turn recaps, ⌥⌘↑/↓ to jump between your prompts, and Command Center (⌘K) toggles.

![Merged steps, a diff and a shell run in the chat](images/chat.png)

## Dashboard

Open **Chat Polish** in the sidebar. Every page has a live preview, and changes save as you pick.

| Messages | Rich text |
| --- | --- |
| ![Messages page with loader tiles](images/messages.png) | ![Rich text page with style tiles](images/rich-text.png) |

The Theme page previews code too. The Code tab draws the same rows the chat uses:

<img src="images/code-preview.png" alt="Code preview" width="520">

## Install

Requires Paseo 0.12.0 or later (on Paseo 0.11, install v0.2.5), with Node.js 20.9+ and npm available on the **daemon host**. For a remote host, install prerequisites there. Paseo prepares the locked dependencies and image thumbnail support automatically.

### From the Paseo app

1. Open **Settings → Plugins** on the host where you want to install Chat Polish.
2. Turn on **Enable plugins** if it is off.
3. Paste the GitHub repository URL into **Plugin source**:

   ```text
   https://github.com/lthieu96/paseo-chat-polish
   ```

4. Select **Install plugin** and wait for its status to become **running**.
5. Open **Chat Polish** in the sidebar.

To install the reviewed Paseo Registry revision instead, use `lthieu96/chat-polish` in **Plugin source**. A registry revision can be older than the latest GitHub release.

### From the command line

Install directly from GitHub:

```sh
paseo plugin add git:lthieu96/paseo-chat-polish
```

Or install a specific GitHub release:

```sh
paseo plugin add git:lthieu96/paseo-chat-polish --ref v0.7.0
```

For the reviewed Paseo Registry revision:

```sh
paseo plugin add lthieu96/chat-polish
```

Check the installation with `paseo plugin ls`. Open **Chat Polish** in Paseo's sidebar once it is running. For individual tool rows, set **Settings → Appearance → Tool call display → Detailed**.

## Update

The dashboard sidebar shows **Update available** when a newer revision is available. Press **Update** to install it and restart the plugin. You can also update from **Settings → Plugins**, or from a terminal:

```sh
paseo plugin update paseo-chat-polish
```

Registry installs use the revision approved for the listing. Direct GitHub installs update from the repository's default branch.

## Release

Releases are published on GitHub and submitted to Paseo Registry using their GitHub tag. To prepare a release, update the version in `package.json` and `package-lock.json` in your PR:

```sh
# Example: bump 0.2.0 to 0.2.1 before merging
npm version patch --no-git-tag-version
```

Commit all source, manifest and lockfile changes. The PR checks must pass before merging into `main`; after the merge, the workflow typechecks and tests the plugin again, then creates a GitHub Release tagged `v<version>` with generated notes. Each version is released once.

To update the Paseo Registry listing, submit the new GitHub tag as a revision through the [plugin submission form](https://github.com/getpaseo/plugins/issues/new?template=submit-plugin.yml). Registry updates are reviewed before users receive the new revision. Keep `package-lock.json` committed: GitHub and registry installs use it to prepare production dependencies on the daemon.

## Limitations

- Restyling Paseo's own items, the font settings and the app theme picker work on desktop and web only.
- Fonts, theme picks and the restyle write Paseo's own settings and DOM, which aren't a public API and may change.
- Previews of Paseo's built-in themes and font stacks are copied from Paseo 0.11.2 and can drift in later versions.
- Plain tool rows need Settings → Appearance → Tool call display set to Detailed; Summary keeps Paseo's grouped calls.
- Icon sets swap Paseo's icons by their `lucide-*` class; icons Paseo adds later fall back to Lucide until they are mapped.
- Picking an icon set the first time needs internet (about a second); until it arrives, and offline, icons stay Lucide.
- Pele lays diagrams out its own way and labels them in Helvetica/Arial. Mermaid's user journey keeps its own actor colors.
- HTML pages show on desktop and web; the mobile apps name the page instead. Only agents created after the switch is on get the tools, and Open in browser needs the daemon on the same computer. The layout check runs in Chrome for Testing's headless shell, never in your own browser, and adds two to three seconds per page. Download it from the dashboard's **HTML pages** tab (about 100 MB, 210 MB unpacked, with its progress shown there) and remove it from the same place; without it pages show unchecked and agents can't preview them. An update that pins a new version downloads that one when the plugin starts. A preview that passes the checks shows its screenshot in the chat.

## Develop

```sh
npm install
npm run typecheck
npm test
paseo plugin install .              # once, from this directory
paseo plugin reload paseo-chat-polish
```

Designs live in `design/dashboard.pen` (open it with [pen.dev](https://pen.dev)).

## License

MIT. The icon sets aren't part of this repository or the install: the first time you pick one, the daemon downloads that set's official npm package, checks it against a pinned hash and keeps only the icons it maps (`server/icons.ts`).

- [Hugeicons](https://hugeicons.com) free icons (`@iconify-json/hugeicons`), MIT.
- [Untitled UI](https://www.untitledui.com/icons) icons (`@untitledui/icons`), under the [Untitled UI license](https://www.untitledui.com/license).
