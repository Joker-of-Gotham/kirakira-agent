from __future__ import annotations

from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "assets" / "readme"
FONT_PATH = Path(r"C:\Windows\Fonts\consola.ttf")
FONT_BOLD_PATH = Path(r"C:\Windows\Fonts\consolab.ttf")

BG = "#151312"
SURFACE = "#23201f"
SURFACE_2 = "#2d2928"
SURFACE_3 = "#35312f"
BORDER = "#4a423f"
TEXT = "#efe7e4"
TEXT_2 = "#cdbfba"
TEXT_3 = "#9d908b"
ROSE = "#d3aaa3"
SAGE = "#a9c2ad"
BLUE = "#9db8cb"
LAVENDER = "#b8add1"
GOLD = "#d7b991"
PEACH = "#d7b3a0"
MINT = "#a9c9c2"


def font(size: int, *, bold: bool = False) -> ImageFont.FreeTypeFont:
    path = FONT_BOLD_PATH if bold else FONT_PATH
    return ImageFont.truetype(str(path), size=size)


def rounded(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int, fill: str, outline: str | None = None, width: int = 1) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text(draw: ImageDraw.ImageDraw, xy: tuple[int, int], content: str, *, size: int = 28, fill: str = TEXT, bold: bool = False) -> None:
    draw.text(xy, content, font=font(size, bold=bold), fill=fill)


def chip(draw: ImageDraw.ImageDraw, x: int, y: int, label: str, fill: str, fg: str = BG) -> int:
    f = font(20, bold=True)
    bbox = draw.textbbox((0, 0), label, font=f)
    w = bbox[2] - bbox[0] + 28
    h = 38
    rounded(draw, (x, y, x + w, y + h), 18, fill)
    draw.text((x + 14, y + 8), label, font=f, fill=fg)
    return w


def terminal_window(size_xy: tuple[int, int], title: str) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGB", size_xy, BG)
    draw = ImageDraw.Draw(image)
    rounded(draw, (24, 24, size_xy[0] - 24, size_xy[1] - 24), 26, SURFACE, BORDER, 2)
    rounded(draw, (24, 24, size_xy[0] - 24, 86), 26, SURFACE_2)
    draw.rectangle((24, 60, size_xy[0] - 24, 86), fill=SURFACE_2)
    for index, color in enumerate((ROSE, GOLD, SAGE)):
        draw.ellipse((48 + index * 22, 48, 62 + index * 22, 62), fill=color)
    text(draw, (110, 42), title, size=30, bold=True)
    return image, draw


def card(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, accent: str, title_text: str, body_lines: Iterable[str], *, background: str = SURFACE_2) -> None:
    rounded(draw, (x, y, x + w, y + h), 22, background, BORDER, 2)
    draw.rectangle((x, y, x + 8, y + h), fill=accent)
    text(draw, (x + 28, y + 20), title_text, size=24, bold=True)
    cy = y + 62
    for line in body_lines:
      text(draw, (x + 28, cy), line, size=20, fill=TEXT_2)
      cy += 30


def hero() -> Image.Image:
    image, draw = terminal_window((1600, 940), "kirakira-agent")
    text(draw, (86, 130), "One command to boot the full agent stack.", size=54, bold=True)
    text(draw, (86, 196), "Pretty terminal. Real runtime. MCP, policy, memory, and Docker on the same path.", size=24, fill=TEXT_2)

    cx = 86
    for label, fill in [("pnpm start", ROSE), ("OpenAI-compatible", SAGE), ("MCP auto-wired", BLUE), ("Morandi TUI", LAVENDER)]:
        cx += chip(draw, cx, 246, label, fill, BG) + 14

    card(
        draw,
        86,
        324,
        660,
        466,
        ROSE,
        "ask / packages architecture",
        [
            "agent / qwen3.5-35b-a3b",
            "",
            "Thinking  inspecting monorepo boundaries, runtime, and tool surfaces",
            "",
            "+ Shell completed  mcp / filesystem-search",
            "target  /workspace/packages",
            "path: /workspace/packages/agent-runtime/src/index.ts",
            "",
            "Architecture",
            "+ agent-runtime  loop, tools, sessions",
            "+ policy-engine  approvals, transport, bundle fallback",
            "+ mcp-adapter  stdio bridge, gateway, server health",
            "",
            "Input is still visible at the bottom while the transcript scrolls line by line.",
        ],
        background=SURFACE_2,
    )
    card(
        draw,
        786,
        324,
        730,
        210,
        SAGE,
        "provider setup",
        [
            "Provider  Alibaba Bailian / DashScope",
            "Models    qwen3.6-plus  qwen3-coder-plus  qwq-plus",
            "Key       user supplied only",
            "URLs      auto-constructed by provider catalog",
        ],
        background=SURFACE_3,
    )
    card(
        draw,
        786,
        566,
        730,
        224,
        BLUE,
        "one runtime path",
        [
            "1  ensure .env and .mcp.json",
            "2  build runtime image only when sources changed",
            "3  start postgres / redis / qdrant / neo4j / minio / kirakirad",
            "4  enter the interactive CLI container",
            "5  keep MCP and policy transport aligned on every start",
        ],
        background=SURFACE_3,
    )
    text(draw, (86, 838), "README media is generated from scripts/generate_readme_media.py", size=18, fill=TEXT_3)
    return image


def provider_setup() -> Image.Image:
    image, draw = terminal_window((1480, 900), "kirakira-agent setup")
    text(draw, (80, 126), "Connect a provider in the terminal, not by editing URLs manually.", size=40, bold=True)
    text(draw, (80, 176), "Kirakira detects models live when the key works and falls back to curated lists when it does not.", size=22, fill=TEXT_2)
    card(
        draw,
        80,
        246,
        1320,
        560,
        SAGE,
        "provider configuration",
        [
            "Provider                  OpenAI Platform",
            "API key                   sk-********************************",
            "Base URL                  https://api.openai.com/v1",
            "Model discovery           live  /models",
            "",
            "Suggested models",
            "  gpt-5.2                 default",
            "  gpt-5.2-codex           coding optimized",
            "  gpt-5.1                 stable fallback",
            "",
            "Other built-ins",
            "  Alibaba Bailian / DashScope",
            "  ByteDance Volcano Ark",
            "  DeepSeek Official API",
            "",
            "The user only supplies the key. Provider URLs and model probing are handled by the catalog.",
        ],
    )
    return image


def transcript_view() -> Image.Image:
    image, draw = terminal_window((1480, 968), "kirakira-agent transcript")
    card(
        draw,
        76,
        122,
        1328,
        164,
        ROSE,
        "@packages  explain the architecture and how runtime startup works",
        [
            "agent / qwen3.5-35b-a3b",
            "/ commands",
            "scroll uses visual rows instead of item jumps",
        ],
    )
    card(
        draw,
        76,
        320,
        1328,
        248,
        LAVENDER,
        "thinking",
        [
            "Inspecting the runtime image bootstrap path, the provider catalog, and the MCP defaults.",
            "The output renderer now preserves headings, fenced code blocks, tables, and per-row scrolling.",
            "Tool previews stay structured instead of dumping escaped JSON into the timeline.",
        ],
        background=SURFACE_3,
    )
    card(
        draw,
        76,
        600,
        1328,
        222,
        BLUE,
        "shell completed  filesystem-search / rg",
        [
            "target  /workspace/packages/cli/src/tui",
            "$ rg \"renderMarkdownRows|scrollOffset|wheel-up\" packages/cli/src/tui",
            "Timeline.tsx: row-based selector",
            "md-render.tsx: fenced code, rules, tables, sliced rows",
            "App.tsx: one-row wheel scroll and row-count status",
        ],
        background=SURFACE_3,
    )
    card(
        draw,
        76,
        834,
        1328,
        72,
        PEACH,
        "$ Ask anything...",
        ["agent / qwen3.5-35b-a3b                                            / commands"],
        background=SURFACE_2,
    )
    return image


def tool_preview() -> Image.Image:
    image, draw = terminal_window((1480, 920), "kirakira-agent tool cards")
    text(draw, (80, 126), "Tool output is summarized as cards first and expanded on demand.", size=38, bold=True)
    card(
        draw,
        80,
        210,
        1320,
        170,
        GOLD,
        "running  shell call  mcp / filesystem-search",
        [
            "target  /workspace/packages/cli/src/tui",
            "$ Get-ChildItem packages/cli/src/tui -Recurse | Select-String -Pattern \"Timeline|md-render\"",
            "... +12 lines (ctrl+r expand)",
        ],
        background=SURFACE_3,
    )
    card(
        draw,
        80,
        420,
        1320,
        184,
        SAGE,
        "done  edit completed  filesystem-patch / apply",
        [
            "target  /workspace/packages/cli/src/tui/md-render.tsx",
            "+ added fenced-code block rendering",
            "+ added table row synthesis with ASCII borders",
            "- removed text-only final markdown fallback",
        ],
        background=SURFACE_3,
    )
    card(
        draw,
        80,
        642,
        1320,
        188,
        ROSE,
        "done  read completed  mcp / filesystem-core",
        [
            "target  /workspace/docs/change-records",
            "2026-05-11-tui-markdown-scroll-fix.md",
            "2026-05-11-tui-layout-stability-fix.md",
            "2026-05-10-terminal-ui-detail-polish.md",
        ],
        background=SURFACE_3,
    )
    return image


def save_png(image: Image.Image, name: str) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    image.save(OUT_DIR / name, format="PNG", optimize=True)


def build_demo_gif(images: list[Image.Image]) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    frames = [image.resize((1120, 700), Image.Resampling.LANCZOS) for image in images]
    frames[0].save(
        OUT_DIR / "kirakira-demo.gif",
        save_all=True,
        append_images=frames[1:],
        duration=[900, 900, 1100, 1100],
        loop=0,
        optimize=False,
    )


def main() -> None:
    hero_image = hero()
    provider_image = provider_setup()
    transcript_image = transcript_view()
    tool_image = tool_preview()

    save_png(hero_image, "kirakira-hero.png")
    save_png(provider_image, "kirakira-provider-setup.png")
    save_png(transcript_image, "kirakira-transcript.png")
    save_png(tool_image, "kirakira-tool-cards.png")
    build_demo_gif([hero_image, provider_image, transcript_image, tool_image])


if __name__ == "__main__":
    main()
