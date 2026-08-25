import {
  drawAnimatedPreviewFrame,
  fontBaselineOffset,
  makeAnimatedPreviewPlan,
} from "../create/animated-preview.mjs";

(() => {
  const MANIFEST_URL = "/create/grug-hand-manifest.json";
  const PROJECT_URL = "/create/grug-hand-project.json";
  const WISDOMS_URL = "/grug/wisdoms.json";
  const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
  const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";
  const root = document.querySelector("[data-font-page]");
  const grid = document.querySelector("[data-compiled-grid]");
  const summary = document.querySelector("[data-compiled-summary]");
  const dailyWisdom = document.querySelector("[data-daily-wisdom]");
  const wisdomDate = document.querySelector("[data-wisdom-date]");
  const wisdomGrid = document.querySelector("[data-wisdom-grid]");
  const wisdomTheme = document.querySelector("[data-wisdom-theme]");
  const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);
  const finePointer = window.matchMedia(FINE_POINTER_QUERY);
  let manifest;
  let project;
  let filter = "characters";
  let activeReplay = null;

  function renderedWisdomLines(element) {
    const textNode = element.firstChild;
    const text = textNode?.textContent ?? "";
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return text.trim();

    const lines = [];
    const range = document.createRange();
    const matcher = /\S+/g;
    let match;
    let lineTop = null;

    while ((match = matcher.exec(text))) {
      range.setStart(textNode, match.index);
      range.setEnd(textNode, match.index + match[0].length);
      const rect = range.getBoundingClientRect();
      if (lineTop === null || Math.abs(rect.top - lineTop) > 2) {
        lines.push([]);
        lineTop = rect.top;
      }
      lines.at(-1).push(match[0]);
    }

    range.detach();
    return lines.map((line) => line.join(" ")).join("\n");
  }

  function prepareWisdomCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { context, height, width };
  }

  function finishWisdomReplay(controller) {
    if (!controller) return;
    window.cancelAnimationFrame(controller.animationFrame);
    controller.animationFrame = 0;
    controller.context?.clearRect(0, 0, controller.width, controller.height);
    controller.card.classList.remove("is-replaying");
    controller.card.dataset.wisdomReplayState = "idle";
    if (activeReplay === controller) activeReplay = null;
  }

  function replayWisdom(controller) {
    if (!project || !manifest || reducedMotion.matches) return;
    if (activeReplay) finishWisdomReplay(activeReplay);

    const style = getComputedStyle(controller.staticText);
    const fontSize = Number.parseFloat(style.fontSize) || 34;
    const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.06;
    const { context, height, width } = prepareWisdomCanvas(controller.canvas);
    const plan = makeAnimatedPreviewPlan(
      project,
      renderedWisdomLines(controller.staticText),
      {
        baselineOffset: fontBaselineOffset({
          ascent: manifest.ascent,
          descent: manifest.descent,
          fontSize,
          lineHeight,
          unitsPerEm: manifest.unitsPerEm,
        }),
        fontSize,
        lineHeight,
        width,
      },
    );

    controller.context = context;
    controller.height = height;
    controller.width = width;
    context.lineCap = manifest.strokeLinecap === "butt" ? "butt" : "round";
    context.lineJoin = "round";
    context.lineWidth = Math.max(
      1,
      ((Number(project.fontForge?.strokeWidth) || 60) / 1000) * fontSize,
    );
    context.strokeStyle = style.color;
    context.clearRect(0, 0, width, height);
    controller.card.classList.add("is-replaying");
    controller.card.dataset.wisdomReplayState = "playing";
    activeReplay = controller;

    const startedAt = performance.now();
    function drawFrame(now) {
      if (reducedMotion.matches || activeReplay !== controller) {
        finishWisdomReplay(controller);
        return;
      }

      const elapsed = Math.min(now - startedAt, plan.totalDuration);
      context.clearRect(0, 0, width, height);
      drawAnimatedPreviewFrame(context, plan, elapsed);
      if (elapsed < plan.totalDuration) {
        controller.animationFrame = window.requestAnimationFrame(drawFrame);
      } else {
        controller.animationFrame = window.requestAnimationFrame(() =>
          finishWisdomReplay(controller),
        );
      }
    }

    controller.animationFrame = window.requestAnimationFrame(drawFrame);
  }

  function installWisdomReplay(card) {
    if (card.dataset.wisdomReplayReady === "true") return;
    const quote = card.querySelector("blockquote");
    if (!quote) return;

    const staticText = document.createElement("span");
    staticText.className = "wisdom-replay-static";
    staticText.textContent = quote.textContent.trim();

    const canvas = document.createElement("canvas");
    canvas.className = "wisdom-replay-canvas";
    canvas.setAttribute("aria-hidden", "true");
    quote.replaceChildren(staticText, canvas);

    const controller = {
      animationFrame: 0,
      canvas,
      card,
      context: null,
      height: 0,
      staticText,
      width: 0,
    };
    card.classList.add("wisdom-replay");
    card.dataset.wisdomReplayReady = "true";
    card.dataset.wisdomReplayState = "idle";
    card.tabIndex = reducedMotion.matches ? -1 : 0;
    card.setAttribute("aria-label", `Replay wisdom animation: ${staticText.textContent}`);
    card.addEventListener("click", () => replayWisdom(controller));
    card.addEventListener("pointerenter", () => {
      if (finePointer.matches) replayWisdom(controller);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      replayWisdom(controller);
    });
  }

  function installWisdomReplays() {
    for (const card of document.querySelectorAll(".wisdom-today, .wisdom-card")) {
      installWisdomReplay(card);
    }
  }

  function dayKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function hash(value) {
    let result = 2166136261;
    for (const character of value) {
      result ^= character.codePointAt(0);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  }

  function renderWisdoms(payload) {
    if (!Array.isArray(payload.wisdoms) || payload.wisdoms.length === 0) {
      throw new Error("wisdom bag empty");
    }

    const today = new Date();
    const start = hash(dayKey(today)) % payload.wisdoms.length;
    const selected = payload.wisdoms[start];
    wisdomDate.textContent = new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "long",
    }).format(today);
    wisdomTheme.textContent = selected.theme;
    dailyWisdom.textContent = selected.content;

    const fragment = document.createDocumentFragment();
    for (let offset = 1; offset < 12; offset += 1) {
      const wisdom = payload.wisdoms[(start + offset * 37) % payload.wisdoms.length];
      const card = document.createElement("article");
      card.className = "wisdom-card";

      const meta = document.createElement("p");
      meta.className = "wisdom-meta";
      meta.textContent = `${wisdom.theme} · wisdom ${wisdom.id}`;

      const quote = document.createElement("blockquote");
      quote.textContent = wisdom.content;
      card.append(meta, quote);
      fragment.append(card);
    }
    wisdomGrid.replaceChildren(fragment);
    installWisdomReplays();
  }

  function visibleGlyphs() {
    if (filter === "icons") {
      return manifest.glyphs
        .filter((glyph) => glyph.primary && Array.from(glyph.character).length > 1)
        .map((glyph) => ({
          codepoint: Number.parseInt(glyph.codepoint.slice(2), 16),
          label: glyph.character.replace(/^\./, ""),
        }));
    }

    const direct = manifest.glyphs
      .filter((glyph) => glyph.primary && Array.from(glyph.character).length === 1)
      .map((glyph) => ({
        codepoint: glyph.character.codePointAt(0),
        label: glyph.character === " " ? "space" : glyph.character,
      }));
    const uppercase = manifest.uppercaseMappings.map((mapping) => ({
      codepoint: Number.parseInt(mapping.codepoint.slice(2), 16),
      label: mapping.character,
    }));
    return [...direct, ...uppercase];
  }

  function renderGrid() {
    const fragment = document.createDocumentFragment();
    for (const glyph of visibleGlyphs()) {
      const tile = document.createElement("div");
      tile.className = "compiled-glyph";
      tile.setAttribute("aria-label", glyph.label);

      const mark = document.createElement("span");
      mark.className = "compiled-glyph__mark";
      mark.textContent = glyph.label === "space" ? "·" : String.fromCodePoint(glyph.codepoint);
      mark.setAttribute("aria-hidden", "true");

      const label = document.createElement("span");
      label.className = "compiled-glyph__label";
      label.textContent = glyph.label;
      tile.append(mark, label);
      fragment.append(tile);
    }
    grid.replaceChildren(fragment);
  }

  function selectFilter(button) {
    filter = button.dataset.coverageFilter;
    for (const candidate of document.querySelectorAll("[data-coverage-filter]")) {
      candidate.setAttribute(
        "aria-pressed",
        String(candidate.dataset.coverageFilter === filter),
      );
    }
    renderGrid();
  }

  async function load() {
    try {
      const [manifestResponse, projectResponse, wisdomsResponse] = await Promise.all([
        fetch(MANIFEST_URL),
        fetch(PROJECT_URL),
        fetch(WISDOMS_URL),
      ]);
      if (!manifestResponse.ok) throw new Error("font cave no open");
      if (!projectResponse.ok) throw new Error("stroke cave no open");
      if (!wisdomsResponse.ok) throw new Error("wisdom bag no open");
      [manifest, project] = await Promise.all([
        manifestResponse.json(),
        projectResponse.json(),
      ]);
      const wisdoms = await wisdomsResponse.json();
      await (document.fonts?.load('400 72px "Grug Hand"') ?? Promise.resolve());
      summary.textContent = `${manifest.glyphCount} compiled drawings · ${manifest.features.length} OpenType features`;
      for (const button of document.querySelectorAll("[data-coverage-filter]")) {
        button.addEventListener("click", () => selectFilter(button));
      }
      renderGrid();
      renderWisdoms(wisdoms);
    } catch (error) {
      console.error(error);
      summary.textContent = "font cave no open. refresh after small breath.";
    } finally {
      root.setAttribute("aria-busy", "false");
    }
  }

  reducedMotion.addEventListener("change", ({ matches }) => {
    if (matches) finishWisdomReplay(activeReplay);
    for (const card of document.querySelectorAll(".wisdom-replay")) {
      card.tabIndex = matches ? -1 : 0;
    }
  });
  window.addEventListener("handdrawn:themechange", () => finishWisdomReplay(activeReplay));

  load();
})();
