# Chat Polish

A [Paseo](https://paseo.sh) plugin that redraws the agent chat as one quiet column, adds the One Dark Darker Mariana theme, and gives you a dashboard to tune it all with a live preview.

![The dashboard's Theme page](images/theme.png)

## What it does

- **Tool calls as single rows.** An icon, a verb that shows the state (Running, Ran), the command or file, and a short detail. Open a row for its diff, output or raw input and output. Failed calls keep their red status and follow the same row strength as other calls; hover or open a row to brighten it.
- **Diff wrapping.** Long diff lines scroll horizontally by default. Enable **Wrap diff lines** under **Tool calls** in the dashboard to wrap them to the available width.
- **Steps merged between replies.** The thoughts and tool calls before an answer fold into one row, such as "Edited 1 file and ran 1 command", which opens to each step.
- **Themes.** Pick one of Paseo's built-in themes or a Chat Polish one (Mariana, Paper, Dusk), or edit the colors with contrast checks. Fonts and sizes are set from the same page.
- **Rich text styles.** Three or four looks each for quotes, tables, code blocks, inline code, headings, lists, callouts and rules.
- **Diagrams.** Mermaid diagrams drawn by [Pele](https://pele.run) in the theme's colors, or by Paseo's mermaid with the same chart colors. Switch on the Rich text page, which previews both.
- **Working indicator.** Paseo's dots, or a sparkle, spokes, dot ring, orb, matrix or snake loader.
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
paseo plugin add git:lthieu96/paseo-chat-polish --ref v0.4.0
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
- Pele lays diagrams out its own way and labels them in Helvetica/Arial. Mermaid's user journey keeps its own actor colors.

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

MIT
