import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeTags } from "../shared/diagram.ts";

test("escapeTags keeps mermaid syntax and turns tag-like labels into text", () => {
  assert.equal(escapeTags("S->>FS: lưu <threadId>-html"), "S->>FS: lưu #lt;threadId#gt;-html");
  assert.equal(escapeTags('W->>W: <iframe sandbox="a b">'), 'W->>W: #lt;iframe sandbox="a b"#gt;');
  assert.equal(escapeTags("A -->|x<br/>y| B\nC <--> D\nE <|-- F\nclass G {\n<<interface>>\n}\nH[<i>it</i>]"), "A -->|x<br/>y| B\nC <--> D\nE <|-- F\nclass G {\n<<interface>>\n}\nH[<i>it</i>]");
});
