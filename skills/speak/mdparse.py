"""Split Markdown into display blocks, each with the part of it that gets spoken."""
from dataclasses import dataclass, field

from markdown_it import MarkdownIt

INLINE_STYLES = {"strong": "bold", "em": "italic", "link": "link"}


@dataclass
class Block:
    text: str  # as displayed, on a single line unless it is a code block
    kind: str  # paragraph, h1..h6, list, quote, codeblock, hr
    spoken_from: int | None  # index in text where speech starts; None = not spoken
    spans: list[tuple[int, int, str]] = field(default_factory=list)  # (start, end, style)

    @property
    def speech(self) -> str:
        return "" if self.spoken_from is None else self.text[self.spoken_from :].strip()


def _inline(children, prefix: str, kind: str) -> Block:
    text = prefix
    spans: list[tuple[int, int, str]] = []
    open_spans: list[tuple[int, str]] = []
    for c in children:
        if c.type == "text":
            text += c.content.replace("\n", " ")
        elif c.type in ("softbreak", "hardbreak"):
            text += " "
        elif c.type == "code_inline":
            start = len(text)
            text += c.content.replace("\n", " ")
            spans.append((start, len(text), "code"))
        elif c.type == "image":
            text += c.content  # alt text
        elif c.type.endswith("_open") and c.type[:-5] in INLINE_STYLES:
            open_spans.append((len(text), INLINE_STYLES[c.type[:-5]]))
        elif c.type.endswith("_close") and c.type[:-6] in INLINE_STYLES:
            if open_spans:
                start, style = open_spans.pop()
                spans.append((start, len(text), style))
        # html_inline and anything else is dropped
    if kind != "paragraph":
        spans.append((0, len(text), kind))
    return Block(text, kind, len(prefix), spans)


def parse(markdown: str) -> list[Block]:
    blocks: list[Block] = []
    quote_depth = 0
    lists: list[int | None] = []  # None = bullet list, int = next number
    item_prefix = ""  # applies to the first block of a list item
    heading: str | None = None

    for tok in MarkdownIt().parse(markdown):
        if tok.type == "blockquote_open":
            quote_depth += 1
        elif tok.type == "blockquote_close":
            quote_depth -= 1
        elif tok.type in ("bullet_list_open", "ordered_list_open"):
            lists.append(int(tok.attrGet("start") or 1) if tok.type[0] == "o" else None)
        elif tok.type in ("bullet_list_close", "ordered_list_close"):
            if lists:
                lists.pop()
        elif tok.type == "list_item_open":
            n = lists[-1]
            marker = "• " if n is None else f"{n}. "
            if n is not None:
                lists[-1] = n + 1
            item_prefix = "    " * (len(lists) - 1) + marker
        elif tok.type == "heading_open":
            heading = tok.tag  # h1..h6
        elif tok.type == "heading_close":
            heading = None
        elif tok.type == "inline":
            kind = heading or ("list" if item_prefix else "quote" if quote_depth else "paragraph")
            block = _inline(tok.children or [], item_prefix, kind)
            item_prefix = ""
            if block.speech:
                blocks.append(block)
            else:
                block.spoken_from = None
                if block.text.strip():
                    blocks.append(block)
        elif tok.type in ("fence", "code_block"):
            code = tok.content.rstrip("\n")
            blocks.append(Block(code, "codeblock", None, [(0, len(code), "codeblock")]))
        elif tok.type == "hr":
            blocks.append(Block("─" * 12, "hr", None))
    return blocks
